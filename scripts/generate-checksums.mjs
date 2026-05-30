import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'data');
fs.mkdirSync(OUT, { recursive: true });
const files = [
  'config.json',
  'README.md',
  'r3tards-transparency.docx',
  'r3tards-transparency.pdf',
  'collection-info/collection-info.json',
  'collection-info/official_wallets.csv',
  'collection-info/burn_proofs.csv',
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
  'r3tards-locked-supply-audit/locked-supply-output/locked_tokens.csv',
  'r3tards-locked-supply-audit/locked-supply-output/burn_proofs.csv',
  'r3tards-locked-supply-audit/locked-supply-output/locked_supply_summary.json'
];
function sha256(buf){return crypto.createHash('sha256').update(buf).digest('hex');}
function rowCount(file, text) {
  if (file.endsWith('.csv')) return Math.max(0, text.trim().split(/\r?\n/).filter(Boolean).length - 1);
  if (file.endsWith('.jsonl')) return text.trim().split(/\r?\n/).filter(Boolean).length;
  if (file.endsWith('.json')) {
    try { const j = JSON.parse(text); return Array.isArray(j) ? j.length : null; } catch { return null; }
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
const manifest = { generatedAt: new Date().toISOString(), generator: 'scripts/generate-checksums.mjs', entries };
fs.writeFileSync(path.join(OUT, 'checksums.json'), JSON.stringify(manifest, null, 2));
console.log(`Wrote ${path.join(OUT, 'checksums.json')} with ${entries.length} entries.`);
