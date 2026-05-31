import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const ROOT = process.cwd();
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const OUT = path.join(ROOT, 'data');
fs.mkdirSync(OUT, { recursive: true });

const deterministicGeneratedAt = process.env.AUDIT_GENERATED_AT || CFG.reproducibleBuild?.generatedAt || 'snapshot-77822541';

// Keep this list explicit. REPORT_HASHES.txt is intentionally excluded because it
// includes the hash of data/checksums.json and would create a circular checksum.
const files = [
  '.gitattributes',
  '.github/workflows/audit.yml',
  '.env.example',
  'package.json',
  'package-lock.json',
  'config.json',
  'README.md',
  'CLAIM_STATUS.md',
  'DATA_DICTIONARY.md',
  'SECURITY.md',
  'AUDIT_FIXES.md',
  'scripts/generate-checksums.mjs',
  'scripts/generate-report-hashes.mjs',
  'scripts/validate-audit.mjs',
  'r3tards-mint-proceeds-audit/package.json',
  'r3tards-royalty-audit/package.json',
  'r3tards-locked-supply-audit/package.json',
  'r3tards-validator-stake-audit/package.json',
  'r3tards-transparency.docx',
  'r3tards-transparency.pdf',
  'collection-info/collection-info.json',
  'collection-info/official_wallets.csv',
  'collection-info/burn_proofs.csv',
  'collection-info/supply-wallets-and-burns.md',
  'r3tards-mint-proceeds-audit/mint-proceeds-output/raw_erc721_transfers_for_collection.json',
  'r3tards-mint-proceeds-audit/mint-proceeds-output/raw_internal_txs_for_nft_contract.json',
  'r3tards-mint-proceeds-audit/mint-proceeds-output/mint_events_from_zero.csv',
  'r3tards-mint-proceeds-audit/mint-proceeds-output/mint_txs_with_native_value.csv',
  'r3tards-mint-proceeds-audit/mint-proceeds-output/mint_classification.csv',
  'r3tards-mint-proceeds-audit/mint-proceeds-output/mint_classification_summary.json',
  'r3tards-mint-proceeds-audit/mint-proceeds-output/summary.json',
  'r3tards-mint-proceeds-audit/mint-proceeds-output/withdrawals_from_nft_contract.csv',
  'r3tards-royalty-audit/royalty-audit-v4-output/all_indexed_inbound_payments.csv',
  'r3tards-royalty-audit/royalty-audit-v4-output/checked_payment_txs.jsonl',
  'r3tards-royalty-audit/royalty-audit-v4-output/likely_royalties.csv',
  'r3tards-royalty-audit/royalty-audit-v4-output/likely_royalties_evidence.csv',
  'r3tards-royalty-audit/royalty-audit-v4-output/summary.json',
  'r3tards-validator-stake-audit/validator-stake-output/summary.json',
  'r3tards-validator-stake-audit/validator-stake-output/validator_state.json',
  'r3tards-validator-stake-audit/validator-stake-output/specific_delegator_state.json',
  'r3tards-validator-stake-audit/validator-stake-output/specific_delegator_delegation_events.csv',
  'r3tards-validator-stake-audit/validator-stake-output/specific_delegator_undelegation_events.csv',
  'r3tards-locked-supply-audit/contracts/NFTTimeLock.sol',
  'r3tards-locked-supply-audit/test/NFTTimeLockTest.t.sol',
  'r3tards-locked-supply-audit/test-results/foundry-test-output.txt',
  'r3tards-locked-supply-audit/locked-supply-output/locked_tokens.csv',
  'r3tards-locked-supply-audit/locked-supply-output/burn_proofs.csv',
  'r3tards-locked-supply-audit/locked-supply-output/locked_supply_summary.json',
  'r3tards-locked-supply-audit/locked-supply-output/lock_contract_source_analysis.json',
  'r3tards-locked-supply-audit/locked-supply-output/lock_contract_state_read.json',
  'r3tards-locked-supply-audit/locked-supply-output/lock_bytecode_verification.json'
];

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function rowCount(file, text) {
  if (file.endsWith('.csv')) return Math.max(0, text.trim().split(/\r?\n/).filter(Boolean).length - 1);
  if (file.endsWith('.jsonl')) return text.trim().split(/\r?\n/).filter(Boolean).length;
  if (file.endsWith('.json')) {
    try {
      const j = JSON.parse(text);
      if (Array.isArray(j)) return j.length;
      if (Array.isArray(j.entries)) return j.entries.length;
      return null;
    } catch {
      return null;
    }
  }
  return null;
}

const entries = [];
for (const file of files) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) continue;
  const buf = fs.readFileSync(full);
  const text = buf.toString('utf8');
  entries.push({ file, sha256: sha256(buf), bytes: buf.length, rowCount: rowCount(file, text) });
}
entries.sort((a, b) => a.file.localeCompare(b.file));

const manifest = {
  generatedAt: deterministicGeneratedAt,
  generator: 'scripts/generate-checksums.mjs',
  deterministic: true,
  note: 'Hashes are recomputed from committed files. REPORT_HASHES.txt is excluded to avoid circular hashing.',
  entries
};
fs.writeFileSync(path.join(OUT, 'checksums.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote ${path.join(OUT, 'checksums.json')} with ${entries.length} entries.`);
