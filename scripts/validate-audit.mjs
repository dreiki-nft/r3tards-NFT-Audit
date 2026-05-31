import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

let verifyMessage;
let getAddress;
try {
  ({ verifyMessage, getAddress } = await import('ethers'));
} catch (error) {
  console.error('FAIL: ethers dependency missing. Run npm install --ignore-scripts first — ethers is required for signature verification.');
  if (error?.code && error.code !== 'ERR_MODULE_NOT_FOUND') console.error(`Underlying error code: ${error.code}`);
  process.exit(1);
}

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
function normAddr(a){ try { return getAddress(a); } catch { return null; } }
function sameAddr(a,b){ const na=normAddr(a), nb=normAddr(b); return Boolean(na && nb && na.toLowerCase() === nb.toLowerCase()); }
function sha256(buf){return crypto.createHash('sha256').update(buf).digest('hex');}
function relPath(p){return path.join(ROOT,p);}
function toPosix(p){return p.split(path.sep).join('/');}
const EXCLUDED_CHECKSUM_DIRS = new Set(['.git','node_modules']);
const EXCLUDED_CHECKSUM_FILES = new Set(['data/checksums.json','REPORT_HASHES.txt']);
function listAuditedFiles(dir = ROOT){
  const out=[];
  for (const dirent of fs.readdirSync(dir,{withFileTypes:true})) {
    const full=path.join(dir,dirent.name);
    const rel=toPosix(path.relative(ROOT,full));
    if (dirent.isDirectory()) {
      if (EXCLUDED_CHECKSUM_DIRS.has(dirent.name)) continue;
      out.push(...listAuditedFiles(full));
    } else if (dirent.isFile()) {
      if (EXCLUDED_CHECKSUM_FILES.has(rel)) continue;
      out.push(rel);
    }
  }
  return out.sort((a,b)=>a.localeCompare(b));
}

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
  'r3tards-mint-proceeds-audit/audit-mint-proceeds.mjs',
  'r3tards-mint-proceeds-audit/classify-mints.mjs',
  'r3tards-royalty-audit/audit-monad-royalties-indexed-api.mjs',
  'r3tards-royalty-audit/build-royalty-evidence.mjs',
  'r3tards-validator-stake-audit/audit-validator-stake.mjs',
  'r3tards-validator-stake-audit/rebuild-validator-summary.mjs',
  'r3tards-locked-supply-audit/verify-locked-supply.mjs',
  'r3tards-locked-supply-audit/verify-lock-contract-state.mjs',
  'r3tards-locked-supply-audit/verify-lock-bytecode.mjs',
  'r3tards-locked-supply-audit/foundry.toml',
  'r3tards-locked-supply-audit/test-results/foundry-test-output.txt',
  'collection-info/official_wallets.csv',
  'collection-info/burn_proofs.csv',
  'collection-info/verify-wallet-attestations.mjs',
  'collection-info/wallet_attestation_evidence.json',
  'reviews/REVIEWER_ATTESTATION_TEMPLATE.md',
  'reviews/verify-reviewer-attestation.mjs',
  'reviews/reviewer_attestation_evidence.json',
  'REVIEW.md',
  'data/checksums.json','CLAIM_STATUS.md','DATA_DICTIONARY.md','REPORT_HASHES.txt','RELEASE_INTEGRITY.md'
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
  for (const must of ['README.md','CLAIM_STATUS.md','DATA_DICTIONARY.md','RELEASE_INTEGRITY.md','REVIEW.md','r3tards-transparency.pdf','r3tards-transparency.docx']) {
    if (!seen.has(must)) fail(`important file missing from checksum manifest: ${must}`);
  }
  const auditedFiles = listAuditedFiles();
  for (const file of auditedFiles) if (!seen.has(file)) fail(`working-tree file missing from checksum manifest: ${file}`);
  for (const file of seen) if (!auditedFiles.includes(file)) fail(`checksum manifest contains non-audited or excluded file: ${file}`);
  ok('checksum manifest covers every non-excluded committed file');
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

const canonicalTag = CFG.reproducibleBuild?.canonicalReleaseTag || '';
const canonicalUrl = CFG.reproducibleBuild?.canonicalReleaseUrl || '';
if (!canonicalTag) fail('config missing reproducibleBuild.canonicalReleaseTag');
else ok(`canonical release tag configured: ${canonicalTag}`);
if (canonicalUrl && !canonicalUrl.endsWith(canonicalTag)) fail('canonicalReleaseUrl does not end with canonicalReleaseTag');
else ok('canonical release URL matches canonical release tag');
for (const f of ['README.md','RELEASE_INTEGRITY.md','REVIEW.md']) {
  const t = fs.readFileSync(path.join(ROOT,f),'utf8');
  if (canonicalTag && !t.includes(canonicalTag)) fail(`${f} missing canonical release tag ${canonicalTag}`);
  else ok(`${f} references canonical release tag`);
  const staleTags = [...t.matchAll(/snapshot-77822541-v(\d+)/g)].map(m => m[0]).filter(tag => tag !== canonicalTag);
  if (staleTags.length) fail(`${f} contains stale canonical release tag references: ${[...new Set(staleTags)].join(', ')}`);
}
const expectedAttestationMessage = `r3tards NFT audit wallet attestation | chainId ${CFG.chainId} | NFT ${CFG.nftContract} | lock ${CFG.wallets.lockedTeamSupplyContract} | snapshot ${CFG.snapshotBlock} | release ${canonicalTag}`;
if (CFG.walletControlAttestations?.canonicalMessage !== expectedAttestationMessage) fail('wallet attestation canonical message does not match config release/chain/contracts/snapshot');
else ok('wallet attestation canonical message matches release parameters');
const expectedReviewerMessage = `r3tards NFT audit independent reproduction attestation | chainId ${CFG.chainId} | NFT ${CFG.nftContract} | lock ${CFG.wallets.lockedTeamSupplyContract} | snapshot ${CFG.snapshotBlock} | release ${canonicalTag}`;
if (CFG.reviewerAttestations?.canonicalMessage !== expectedReviewerMessage) fail('reviewer attestation canonical message does not match config release/chain/contracts/snapshot');
else ok('reviewer attestation canonical message matches release parameters');

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
if (validator.generatedAt !== EXPECTED_GENERATED_AT) fail('validator summary generatedAt is not deterministic'); else ok('validator summary generatedAt is deterministic');
if (String(validator.eventEndBlock) !== String(SNAP)) fail(`validator eventEndBlock ${validator.eventEndBlock} != canonical snapshot block ${SNAP}`); else ok('validator eventEndBlock matches canonical snapshot block');
if (validator.eventWindowCanonicalToSnapshot !== true) fail('validator event window is not marked canonical to snapshot'); else ok('validator event window marked canonical to snapshot');
if (String(validator.validatorStateBlockTag || validator.blockTag) !== String(SNAP)) warn(`validator state read blockTag=${validator.validatorStateBlockTag || validator.blockTag}; state values should be described as recorded/current unless refetched at canonical snapshot`);
else {
  const notes = Array.isArray(validator.notes) ? validator.notes.join('\n') : '';
  if (/blockTag=latest/i.test(notes)) fail('validator summary notes contain stale blockTag=latest wording even though snapshot state read is present');
  else ok('validator summary notes match snapshot block state read');
}
const gross = Number(validator.specificDelegatorGrossDelegatedMONByEvents);
const undelegated = Number(validator.specificDelegatorGrossUndelegatedMONByEvents);
const net = Number(validator.specificDelegatorNetDelegatedMONByEvents);
if (Math.abs((gross-undelegated)-net) > 1e-6) fail('validator event formula mismatch'); else ok('validator gross - undelegated = net');
if (String(validator.eventEndBlock).toLowerCase()==='latest') warn('validator summary still records eventEndBlock=latest; report should prefer canonical snapshot or rerun with END_BLOCK=77822541');

const lock = readJson('r3tards-locked-supply-audit/locked-supply-output/locked_supply_summary.json');
if (lock.generatedAt !== EXPECTED_GENERATED_AT) fail('locked supply summary generatedAt is not deterministic'); else ok('locked supply summary generatedAt is deterministic');
const lockSource = readJson('r3tards-locked-supply-audit/locked-supply-output/lock_contract_source_analysis.json');
if (lockSource.generatedAt !== EXPECTED_GENERATED_AT) fail('lock source analysis generatedAt is not deterministic'); else ok('lock source analysis generatedAt is deterministic');
const foundryConfigText = fs.readFileSync(relPath('r3tards-locked-supply-audit/foundry.toml'), 'utf8');
const foundryOutputText = fs.readFileSync(relPath('r3tards-locked-supply-audit/test-results/foundry-test-output.txt'), 'utf8');
if (!/solc_version\s*=\s*["']0\.8\.28["']/.test(foundryConfigText)) fail('Foundry solc_version is not pinned to 0.8.28'); else ok('Foundry solc_version pinned to 0.8.28');
if (!/Solc\s+0\.8\.28/i.test(foundryOutputText)) fail('Foundry test output does not record Solc 0.8.28'); else ok('Foundry test output records Solc 0.8.28');
if (/Solc\s+0\.8\.33/i.test(foundryOutputText)) fail('Foundry test output still records stale Solc 0.8.33');
if (lockSource.foundryTests?.compilerVersion !== '0.8.28') fail(`lock source analysis compilerVersion ${lockSource.foundryTests?.compilerVersion} != 0.8.28`); else ok('lock source analysis records Solc 0.8.28 test compiler');
if (lockSource.foundryTests?.configuredCompilerVersion !== '0.8.28') fail(`lock source analysis configuredCompilerVersion ${lockSource.foundryTests?.configuredCompilerVersion} != 0.8.28`); else ok('lock source analysis records Foundry config Solc 0.8.28');
if (lockSource.foundryTests?.compilerVersionAlignedWithDeployedBytecodeCompiler !== true) fail('lock source analysis does not mark test compiler aligned with deployed bytecode compiler'); else ok('lock test compiler aligns with deployed bytecode compiler');
const lockBytecode = readJson('r3tards-locked-supply-audit/locked-supply-output/lock_bytecode_verification.json');
if (lockBytecode.generatedAt !== EXPECTED_GENERATED_AT) fail('lock bytecode verification generatedAt is not deterministic'); else ok('lock bytecode verification generatedAt is deterministic');
if (lockBytecode.sourceEquivalenceStatus === 'verified_match') {
  ok('lock deployed bytecode/source equivalence is verified');
  if (lockBytecode.deployedBytecodeCompared !== true) fail('lock bytecode verified_match but deployedBytecodeCompared is not true');
  const evFile = 'r3tards-locked-supply-audit/locked-supply-output/lock_bytecode_match_evidence.json';
  if (!fs.existsSync(relPath(evFile))) fail('lock bytecode verified_match but match evidence file is missing');
  else {
    const ev = readJson(evFile);
    if (ev.generatedAt !== EXPECTED_GENERATED_AT) fail('lock bytecode match evidence generatedAt is not deterministic'); else ok('lock bytecode match evidence generatedAt is deterministic');
    if (String(ev.lockContract || '').toLowerCase() !== CFG.wallets.lockedTeamSupplyContract.toLowerCase()) fail('lock bytecode match evidence contract mismatch'); else ok('lock bytecode match evidence contract matches config');
    if (ev.sourceSha256 !== lockBytecode.sourceSha256) fail('lock bytecode match evidence source hash mismatch'); else ok('lock bytecode match evidence source hash matches');
    if (Number(ev.chainId) !== Number(CFG.chainId)) fail('lock bytecode match evidence chainId mismatch'); else ok('lock bytecode match evidence chainId matches');
    if (ev.metadataStrippedRuntimeMatch !== true) fail('lock bytecode verified_match requires metadataStrippedRuntimeMatch=true'); else ok('lock bytecode metadata-stripped runtime matches');
    if (!ev.deployedRuntimeBytecodeHash || !ev.compiledRuntimeBytecodeHash) fail('lock bytecode match evidence missing runtime hashes'); else ok('lock bytecode match evidence has runtime hashes');
  }
} else {
  ok('lock bytecode/source equivalence is explicitly not claimed as verified');
}
if (lockBytecode.sourceEquivalenceStatus === 'verified_match') {
  for (const f of ['README.md','CLAIM_STATUS.md','DATA_DICTIONARY.md','AUDIT_FIXES.md','RELEASE_INTEGRITY.md']) {
    const t = fs.readFileSync(path.join(ROOT,f),'utf8');
    if (/not_verified_by_repo|Exact deployed bytecode\/source equivalence is not proven by this repo/i.test(t)) fail(`${f} contains stale lock bytecode proof-boundary wording`);
  }
  ok('documentation does not contain stale lock bytecode proof-boundary wording');
}
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

const expectedOwnerAddresses = (CFG.walletControlAttestations?.expectedOwnerAddresses || CFG.ownersFromProvidedSource || []).map(a => normAddr(a)).filter(Boolean);
if (expectedOwnerAddresses.length !== 4) fail(`expected 4 owner addresses for wallet attestations, got ${expectedOwnerAddresses.length}`); else ok('wallet attestation owner set has 4 addresses');
const walletEvidence = readJson('collection-info/wallet_attestation_evidence.json');
if (walletEvidence.generatedAt !== EXPECTED_GENERATED_AT) fail('wallet attestation evidence generatedAt is not deterministic'); else ok('wallet attestation evidence generatedAt is deterministic');
if (walletEvidence.canonicalMessage !== CFG.walletControlAttestations?.canonicalMessage) fail('wallet attestation evidence canonical message mismatch'); else ok('wallet attestation evidence uses canonical message');
if (Number(walletEvidence.expectedOwnerCount) !== expectedOwnerAddresses.length) fail('wallet attestation evidence owner count mismatch');
const ownerRows = Array.isArray(walletEvidence.attestations) ? walletEvidence.attestations.filter(a => a.address) : [];
for (const expected of expectedOwnerAddresses) {
  const row = ownerRows.find(a => sameAddr(a.address, expected));
  if (!row) { fail(`wallet attestation evidence missing owner ${expected}`); continue; }
  if (!['verified','pending_signature','invalid'].includes(row.status)) fail(`wallet attestation ${expected} has unknown status ${row.status}`);
  if (row.status === 'verified') {
    if (!row.file) { fail(`verified wallet attestation ${expected} missing source file`); continue; }
    const att = readJson(row.file);
    if (att.signedMessage !== CFG.walletControlAttestations?.canonicalMessage) fail(`verified wallet attestation ${expected} source message mismatch`);
    let recovered = null;
    try { recovered = getAddress(verifyMessage(att.signedMessage || '', att.signature || '')); } catch {}
    if (!sameAddr(recovered, expected)) fail(`verified wallet attestation ${expected} does not recover to expected owner`);
    if (row.signatureValid !== true || !sameAddr(row.recovered, expected) || row.messageMatches !== true || row.addressMatches !== true) fail(`verified wallet attestation ${expected} evidence flags are not valid`);
  }
  if (row.status === 'pending_signature' && row.signatureValid === true) fail(`pending wallet attestation ${expected} is marked pending but signatureValid=true`);
}
if (Number(walletEvidence.invalidCount || 0) !== 0) fail(`wallet attestation evidence has ${walletEvidence.invalidCount} invalid attestation(s)`);
const walletVerified = Number(walletEvidence.verifiedCount || 0);
const walletPending = Number(walletEvidence.pendingCount || 0);
if (walletVerified + walletPending !== expectedOwnerAddresses.length) fail('wallet attestation verified+pending count does not match expected owner count');
else ok(`wallet attestations verified ${walletVerified}/${expectedOwnerAddresses.length}; pending ${walletPending}/${expectedOwnerAddresses.length}`);

const walletTotal = expectedOwnerAddresses.length;
const expectedWalletStatusRe = new RegExp(`${walletVerified}\/${walletTotal}[^\n]{0,160}cryptographically attested by owner signature[^\n]{0,160}${walletPending}\/${walletTotal}[^\n]{0,160}pending`, 'i');
for (const f of ['README.md','CLAIM_STATUS.md']) {
  const text = fs.readFileSync(relPath(f), 'utf8');
  if (!expectedWalletStatusRe.test(text)) {
    fail(`${f} wallet-control status does not match evidence counts ${walletVerified}/${walletTotal} verified and ${walletPending}/${walletTotal} pending`);
  }

  const walletLines = text.split(/\r?\n/).filter(line => /wallet-control|owner-wallet key control|owner wallets cryptographically|pending attestation|attestation templates|pending_signature/i.test(line));
  for (const line of walletLines) {
    const segments = line.split(/[;|]/);
    for (const segment of segments) {
      const countMatches = [...segment.matchAll(/(\d+)\/(\d+)/g)];
      for (const m of countMatches) {
        const count = Number(m[1]);
        const total = Number(m[2]);
        if (total !== walletTotal) continue;
        if (/attested|cryptographically/i.test(segment) && count !== walletVerified) {
          fail(`${f} wallet-control attested count ${count}/${total} disagrees with evidence ${walletVerified}/${walletTotal}: ${line.trim()}`);
        }
        if (/pending/i.test(segment) && count !== walletPending) {
          fail(`${f} wallet-control pending count ${count}/${total} disagrees with evidence ${walletPending}/${walletTotal}: ${line.trim()}`);
        }
      }
    }
    if (walletVerified === walletTotal && walletPending === 0) {
      if (/pending_signature/i.test(line)) fail(`${f} contains stale pending_signature wallet wording while all wallet attestations are verified: ${line.trim()}`);
      if (/attestation templates?/i.test(line)) fail(`${f} contains stale wallet attestation-template wording while all wallet attestations are verified: ${line.trim()}`);
      if (/0\/4.{0,120}attested/i.test(line)) fail(`${f} contains stale 0/4 attested wallet wording while all wallet attestations are verified: ${line.trim()}`);
    }
  }
  if (!/does not prove personal identity or beneficial ownership/i.test(text)) fail(`${f} missing wallet key-control-only caveat`);
}
if (walletVerified === walletTotal && walletPending === 0) ok(`wallet-control prose matches evidence: ${walletVerified}/${walletTotal} verified; ${walletPending}/${walletTotal} pending`);
else ok(`wallet-control prose matches evidence: ${walletVerified}/${walletTotal} verified; ${walletPending}/${walletTotal} pending`);

const reviewerEvidence = readJson('reviews/reviewer_attestation_evidence.json');
if (reviewerEvidence.generatedAt !== EXPECTED_GENERATED_AT) fail('reviewer attestation evidence generatedAt is not deterministic'); else ok('reviewer attestation evidence generatedAt is deterministic');
if (reviewerEvidence.canonicalMessage !== CFG.reviewerAttestations?.canonicalMessage) fail('reviewer attestation evidence canonical message mismatch'); else ok('reviewer attestation evidence uses canonical message');
if (Number(reviewerEvidence.invalidReviewerCount || 0) !== 0) fail(`reviewer attestation evidence has ${reviewerEvidence.invalidReviewerCount} invalid reviewer attestation(s)`);
const ownerLower = new Set(expectedOwnerAddresses.map(a => a.toLowerCase()));
for (const row of reviewerEvidence.attestations || []) {
  if (row.status === 'verified_external_reviewer') {
    if (!row.file) { fail('verified reviewer attestation missing source file'); continue; }
    const att = readJson(row.file);
    let recovered = null;
    try { recovered = getAddress(verifyMessage(att.signedMessage || '', att.signature || '')); } catch {}
    if (!recovered) fail(`verified reviewer attestation ${row.file} did not recover`);
    else if (ownerLower.has(recovered.toLowerCase())) fail(`verified reviewer attestation ${row.file} recovers to owner address`);
    if (att.signedMessage !== CFG.reviewerAttestations?.canonicalMessage) fail(`verified reviewer attestation ${row.file} source message mismatch`);
    if (row.signatureValid !== true || row.nonOwnerReviewer !== true || row.messageMatches !== true || row.referencesRelease !== true) fail(`verified reviewer attestation ${row.file} evidence flags are not valid`);
  }
}
const reviewerVerified = Number(reviewerEvidence.verifiedReviewerCount || 0);
if (reviewerVerified === 0) {
  const claimStatusText = fs.readFileSync(relPath('CLAIM_STATUS.md'), 'utf8');
  if (/independently reproduced by/i.test(claimStatusText)) fail('CLAIM_STATUS claims independent reproduction without signed reviewer evidence');
  if (!/Independent third-party review \| Not present/i.test(claimStatusText)) fail('CLAIM_STATUS does not plainly state independent review is not present');
  ok('independent review boundary remains explicit without reviewer signature');
} else {
  ok(`independent reviewer attestations verified: ${reviewerVerified}`);
}

const repoTextFiles = ['README.md','SECURITY.md','AUDIT_FIXES.md','CLAIM_STATUS.md','DATA_DICTIONARY.md','RELEASE_INTEGRITY.md','REVIEW.md'];
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
