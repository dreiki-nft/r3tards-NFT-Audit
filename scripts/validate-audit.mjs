import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const ROOT = process.cwd();
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const SNAP = Number(CFG.snapshotBlock);
const EXPECTED_GENERATED_AT = process.env.AUDIT_GENERATED_AT || CFG.reproducibleBuild?.generatedAt || 'snapshot-77822541';
let failures = 0;
const warnings = [];
function fail(msg){ console.error(`FAIL: ${msg}`); failures++; }
function warn(msg){ console.warn(`WARN: ${msg}`); warnings.push(msg); }
function ok(msg){ console.log(`OK: ${msg}`); }
function exists(p){ if(!fs.existsSync(path.join(ROOT,p))) fail(`Missing ${p}`); else ok(`exists ${p}`); }
function parseCsvLine(line){const out=[];let cur='';let q=false;for(let i=0;i<line.length;i++){const c=line[i],n=line[i+1];if(c==='"'&&q&&n==='"'){cur+='"';i++;}else if(c==='"')q=!q;else if(c===','&&!q){out.push(cur);cur='';}else cur+=c;}out.push(cur);return out;}
function parseCsv(file){const full=path.join(ROOT,file); const text=fs.readFileSync(full,'utf8').trim(); if(!text)return[];const lines=text.split(/\r?\n/).filter(Boolean);const h=parseCsvLine(lines.shift()).map(x=>x.trim());return lines.map(line=>{const c=parseCsvLine(line);const r={};h.forEach((k,i)=>r[k]=(c[i]||'').trim());return r;});}
function readJson(file){return JSON.parse(fs.readFileSync(path.join(ROOT,file),'utf8'));}
function sum(rows, key){return rows.reduce((a,r)=>a+Number(r[key]||0),0)}
function validAddr(a){return /^0x[a-fA-F0-9]{40}$/.test(String(a||''));}
function sha256(buf){return crypto.createHash('sha256').update(buf).digest('hex');}
function relPath(p){return path.join(ROOT,p);}

const required = [
  'README.md','SECURITY.md','AUDIT_FIXES.md','config.json',
  'r3tards-mint-proceeds-audit/mint-proceeds-output/mint_classification.csv',
  'r3tards-mint-proceeds-audit/mint-proceeds-output/mint_classification_summary.json',
  'r3tards-royalty-audit/royalty-audit-v4-output/likely_royalties_evidence.csv',
  'r3tards-locked-supply-audit/locked-supply-output/locked_supply_summary.json',
  'r3tards-locked-supply-audit/locked-supply-output/lock_contract_source_analysis.json',
  'r3tards-locked-supply-audit/locked-supply-output/lock_bytecode_verification.json',
  'r3tards-locked-supply-audit/contracts/NFTTimeLock.sol',
  'r3tards-locked-supply-audit/test/NFTTimeLockTest.t.sol',
  'r3tards-locked-supply-audit/test-results/foundry-test-output.txt',
  'collection-info/official_wallets.csv','collection-info/burn_proofs.csv','data/checksums.json','CLAIM_STATUS.md','DATA_DICTIONARY.md','REPORT_HASHES.txt'
];
required.forEach(exists);

// Checksum integrity: data/checksums.json must match the current working tree.
const checksums = readJson('data/checksums.json');
if (checksums.generatedAt !== EXPECTED_GENERATED_AT) fail(`checksums generatedAt ${checksums.generatedAt} != ${EXPECTED_GENERATED_AT}`); else ok('checksums generatedAt is deterministic');
if (!Array.isArray(checksums.entries)) fail('checksums entries missing or not an array');
else {
  const seen = new Set();
  for (const entry of checksums.entries) {
    if (!entry.file || !entry.sha256) { fail('checksum entry missing file or sha256'); continue; }
    if (seen.has(entry.file)) fail(`duplicate checksum entry: ${entry.file}`);
    seen.add(entry.file);
    const full = relPath(entry.file);
    if (!fs.existsSync(full)) { fail(`checksum file missing from working tree: ${entry.file}`); continue; }
    const buf = fs.readFileSync(full);
    const actual = sha256(buf);
    if (actual !== entry.sha256) fail(`checksum mismatch for ${entry.file}: expected ${entry.sha256}, got ${actual}`);
  }
  for (const must of ['README.md','CLAIM_STATUS.md','DATA_DICTIONARY.md','r3tards-transparency.pdf','r3tards-transparency.docx']) {
    if (!seen.has(must)) fail(`important file missing from checksum manifest: ${must}`);
  }
  ok('checksum manifest matches current files');
}

// REPORT_HASHES.txt is intentionally outside checksums.json to avoid circular hashing.
if (fs.existsSync(relPath('REPORT_HASHES.txt'))) {
  const lines = fs.readFileSync(relPath('REPORT_HASHES.txt'),'utf8').trim().split(/\r?\n/).filter(Boolean);
  const expectedFiles = new Set(['r3tards-transparency.docx','r3tards-transparency.pdf','data/checksums.json']);
  for (const line of lines) {
    const m = line.match(/^([a-f0-9]{64})\s+[* ](.+)$/i);
    if (!m) { fail(`malformed REPORT_HASHES line: ${line}`); continue; }
    const [, expectedHash, file] = m;
    if (!expectedFiles.has(file)) fail(`unexpected file in REPORT_HASHES: ${file}`);
    if (!fs.existsSync(relPath(file))) { fail(`REPORT_HASHES target missing: ${file}`); continue; }
    const actual = sha256(fs.readFileSync(relPath(file)));
    if (actual !== expectedHash.toLowerCase()) fail(`REPORT_HASHES mismatch for ${file}`);
  }
  for (const f of expectedFiles) if (!lines.some(line => line.endsWith(f))) fail(`REPORT_HASHES missing ${f}`);
  ok('REPORT_HASHES.txt matches current report/checksum files');
}


const mintClass = parseCsv('r3tards-mint-proceeds-audit/mint-proceeds-output/mint_classification.csv');
const mintSummary = readJson('r3tards-mint-proceeds-audit/mint-proceeds-output/mint_classification_summary.json');
if (mintSummary.generatedAt !== EXPECTED_GENERATED_AT) fail('mint classification summary generatedAt is not deterministic'); else ok('mint classification summary generatedAt is deterministic');
const tokenIds = new Set(mintClass.map(r=>r.token_id));
if (mintClass.length !== 1033) fail(`mint classification row count ${mintClass.length} != 1033`); else ok('mint classification has 1033 rows');
if (tokenIds.size !== mintClass.length) fail('duplicate token IDs in mint classification'); else ok('no duplicate token IDs in mint classification');
const counts = Object.fromEntries(['direct_paid_mint','router_paid_mint','free_mint','team_or_reserve_mint','unknown_unproven'].map(k=>[k, mintClass.filter(r=>r.classification===k).length]));
if (counts.direct_paid_mint !== mintSummary.summary.directPaidMintCount) fail('direct paid count mismatch'); else ok('direct paid count matches summary');
if (counts.router_paid_mint !== mintSummary.summary.routerPaidMintCount) fail('router paid count mismatch'); else ok('router paid count matches summary');
if (counts.free_mint !== mintSummary.summary.freeMintCount) fail('free mint count mismatch'); else ok('free mint count matches summary');
const paidMon = sum(mintClass.filter(r=>r.classification==='direct_paid_mint' || r.classification==='router_paid_mint'), 'amount_mon_attributed');
if (Math.abs(paidMon - 288045) > 1e-9) fail(`proven paid mint proceeds ${paidMon} != 288045`); else ok('proven mint proceeds equal 288,045 MON');
for (const r of mintClass) if (Number(r.mint_block) > SNAP) fail(`mint classification row exceeds snapshot block: ${r.mint_tx_hash}`);

const royaltyEvidence = parseCsv('r3tards-royalty-audit/royalty-audit-v4-output/likely_royalties_evidence.csv');
const royaltySummary = readJson('r3tards-royalty-audit/royalty-audit-v4-output/summary.json');
const royaltyTotal = sum(royaltyEvidence, 'amount_mon_normalized');
if (royaltyEvidence.length !== Number(royaltySummary.counts.likelyRoyaltyTxs)) fail('royalty evidence row count mismatch'); else ok('royalty evidence row count matches summary');
if (Math.abs(royaltyTotal - Number(royaltySummary.totals.likelyTotalMONEquivalent)) > 1e-6) fail(`royalty total mismatch: ${royaltyTotal}`); else ok('royalty evidence total matches summary');
for (const r of royaltyEvidence) if (Number(r.block) > SNAP) fail(`royalty evidence row exceeds snapshot block: ${r.tx_hash}`);

const validator = readJson('r3tards-validator-stake-audit/validator-stake-output/summary.json');
const gross = Number(validator.specificDelegatorGrossDelegatedMONByEvents);
const undelegated = Number(validator.specificDelegatorGrossUndelegatedMONByEvents);
const net = Number(validator.specificDelegatorNetDelegatedMONByEvents);
if (Math.abs((gross-undelegated)-net) > 1e-6) fail('validator event formula mismatch'); else ok('validator gross - undelegated = net');
if (String(validator.eventEndBlock).toLowerCase()==='latest') warn('validator summary still records eventEndBlock=latest; report should prefer canonical snapshot or rerun with END_BLOCK=77822541');

const lock = readJson('r3tards-locked-supply-audit/locked-supply-output/locked_supply_summary.json');
if (lock.generatedAt !== EXPECTED_GENERATED_AT) fail('locked supply summary generatedAt is not deterministic'); else ok('locked supply summary generatedAt is deterministic');
const lockSource = readJson('r3tards-locked-supply-audit/locked-supply-output/lock_contract_source_analysis.json');
if (lockSource.generatedAt !== EXPECTED_GENERATED_AT) fail('lock source analysis generatedAt is not deterministic'); else ok('lock source analysis generatedAt is deterministic');
const lockBytecode = readJson('r3tards-locked-supply-audit/locked-supply-output/lock_bytecode_verification.json');
if (lockBytecode.generatedAt !== EXPECTED_GENERATED_AT) fail('lock bytecode verification generatedAt is not deterministic'); else ok('lock bytecode verification generatedAt is deterministic');
if (lockBytecode.sourceEquivalenceStatus === 'verified_match') ok('lock deployed bytecode/source equivalence is verified'); else ok('lock bytecode/source equivalence is explicitly not claimed as verified');
if (fs.existsSync(relPath('r3tards-locked-supply-audit/locked-supply-output/lock_contract_state_read.json'))) {
  const lockStateRead = readJson('r3tards-locked-supply-audit/locked-supply-output/lock_contract_state_read.json');
  if (lockStateRead.generatedAt !== EXPECTED_GENERATED_AT) fail('lock contract state read generatedAt is not deterministic'); else ok('lock contract state read generatedAt is deterministic');
}
const lockedRows = parseCsv('r3tards-locked-supply-audit/locked-supply-output/locked_tokens.csv');
if (lockedRows.length !== lock.lockedTokenCountVerifiedByOwnership) fail('locked token count mismatch'); else ok('locked token count matches proof');
if (!lock.withdrawalRulesVerifiedFromProvidedSource) fail('lock withdrawal rules not verified from provided source'); else ok('lock withdrawal rules verified from provided source');
if (!lock.foundryTestsPassedAgainstProvidedSource) fail('lock Foundry tests not marked passed'); else ok('lock Foundry tests marked passed');
if (!lockSource.sourceLevelFindings?.unlockDurationExpressionFound) fail('lock source analysis did not find unlock duration expression'); else ok('lock source analysis found unlock duration expression');
if (lockSource.foundryTests?.passed !== true) fail('lock source analysis did not record Foundry tests passed'); else ok('lock source analysis records Foundry tests passed');
const burns = parseCsv('collection-info/burn_proofs.csv');
if (burns.length !== 2) fail('burn proof count != 2'); else ok('burn proof count is 2');
for (const r of burns) if ((r.to||'').toLowerCase() !== CFG.wallets.burnAddress.toLowerCase()) fail(`burn proof not to burn address: ${r.tx_hash}`);

const official = parseCsv('collection-info/official_wallets.csv');
for (const r of official) if (!validAddr(r.address)) fail(`invalid official wallet address: ${r.label} ${r.address}`);
ok('official wallet addresses checked');

const repoTextFiles = ['README.md','SECURITY.md','AUDIT_FIXES.md','CLAIM_STATUS.md','DATA_DICTIONARY.md'];
for (const f of repoTextFiles) {
  const t = fs.readFileSync(path.join(ROOT,f),'utf8');
  for (const bad of ['100% verified','irrefutable','trustless proof','fully audited']) if (t.toLowerCase().includes(bad.toLowerCase())) fail(`overstated phrase in ${f}: ${bad}`);
}

for (const secret of ['7CSHHE6AJBNTMMK8NKY93PATEPCAPQ15MK','PRIVATE_KEY=','SEED_PHRASE=']) {
  const hay = repoTextFiles.map(f=>fs.readFileSync(path.join(ROOT,f),'utf8')).join('\n');
  if (hay.includes(secret)) fail(`secret-looking string found: ${secret}`);
}

console.log(`\nValidation complete: ${failures} failure(s), ${warnings.length} warning(s).`);
if (failures) process.exit(1);
