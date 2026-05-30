import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('..');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const OUT = path.resolve('mint-proceeds-output');
const COLLECTION = CFG.nftContract.toLowerCase();
const SNAPSHOT_BLOCK = Number(process.env.SNAPSHOT_BLOCK || CFG.snapshotBlock);
const MINT_PRICE_MON = Number(CFG.mintPriceMON);

const files = {
  mintEvents: path.join(OUT, 'mint_events_from_zero.csv'),
  mintTxs: path.join(OUT, 'mint_txs_with_native_value.csv'),
  internalTxs: path.join(OUT, 'raw_internal_txs_for_nft_contract.json'),
  withdrawals: path.join(OUT, 'withdrawals_from_nft_contract.csv'),
  classificationCsv: path.join(OUT, 'mint_classification.csv'),
  classificationSummary: path.join(OUT, 'mint_classification_summary.json'),
  summary: path.join(OUT, 'summary.json')
};

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    const n = line[i + 1];
    if (c === '"' && q && n === '"') { cur += '"'; i++; }
    else if (c === '"') q = !q;
    else if (c === ',' && !q) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const header = parseCsvLine(lines.shift()).map(x => x.trim());
  return lines.map(line => {
    const cols = parseCsvLine(line);
    const row = {};
    header.forEach((h, i) => row[h] = (cols[i] || '').trim());
    return row;
  });
}
function csvEscape(v) {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function writeCsv(file, rows, headers) {
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map(h => csvEscape(row[h])).join(','));
  fs.writeFileSync(file, lines.join('\n') + '\n');
}
function weiToMonString(wei) {
  const x = BigInt(wei);
  const base = 10n ** 18n;
  const w = x / base;
  const f = (x % base).toString().padStart(18, '0').replace(/0+$/, '');
  return f ? `${w}.${f}` : `${w}`;
}
function monToWei(mon) {
  return BigInt(Math.round(Number(mon) * 1e6)) * 10n ** 12n;
}
function splitPipe(s) { return (s || '').split('|').filter(Boolean); }

for (const [k, f] of Object.entries(files)) {
  if (['classificationCsv', 'classificationSummary', 'summary'].includes(k)) continue;
  if (!fs.existsSync(f)) throw new Error(`Missing input file: ${f}`);
}

const mintEvents = parseCsv(fs.readFileSync(files.mintEvents, 'utf8'));
const txRows = parseCsv(fs.readFileSync(files.mintTxs, 'utf8'));
const internalRows = JSON.parse(fs.readFileSync(files.internalTxs, 'utf8'));
const withdrawals = parseCsv(fs.readFileSync(files.withdrawals, 'utf8'));

const txByHash = new Map(txRows.map(r => [r.hash.toLowerCase(), r]));
const internalToCollectionByHash = new Map();
for (const r of internalRows) {
  if (Number(r.blockNumber) > SNAPSHOT_BLOCK) continue;
  if ((r.to || '').toLowerCase() !== COLLECTION) continue;
  if (BigInt(r.value || '0') <= 0n) continue;
  const h = r.hash.toLowerCase();
  if (!internalToCollectionByHash.has(h)) internalToCollectionByHash.set(h, []);
  internalToCollectionByHash.get(h).push(r);
}

const tokenEvents = mintEvents
  .filter(r => Number(r.blockNumber) <= SNAPSHOT_BLOCK)
  .map(r => ({
    tokenId: r.tokenID || r.tokenId || r.token_id,
    txHash: (r.hash || '').toLowerCase(),
    block: Number(r.blockNumber),
    recipient: r.to,
    collection: r.contractAddress || CFG.nftContract
  }));

const tokenIds = new Set();
for (const e of tokenEvents) {
  if (tokenIds.has(e.tokenId)) throw new Error(`Duplicate mint token ID in mint events: ${e.tokenId}`);
  tokenIds.add(e.tokenId);
}

const rows = [];
const sums = {
  totalMintEvents: tokenEvents.length,
  totalUniqueTokensMinted: tokenIds.size,
  directPaidMintCount: 0,
  directPaidMintMON: 0,
  routerPaidMintCount: 0,
  routerPaidMintMON: 0,
  freeMintCount: 0,
  teamOrReserveMintCount: 0,
  unknownUnprovenCount: 0,
  totalProvenPaidMintProceedsMON: 0,
  claimedProceedsMON: 0,
  differenceClaimedMinusProvenMON: 0
};

for (const e of tokenEvents) {
  const tx = txByHash.get(e.txHash);
  if (!tx) throw new Error(`No tx row found for mint tx ${e.txHash}`);
  const mintedCount = Number(tx.mintedCount || 1);
  const txValueWei = BigInt(tx.valueWei || '0');
  const internalRowsForTx = internalToCollectionByHash.get(e.txHash) || [];
  const internalWei = internalRowsForTx.reduce((a, r) => a + BigInt(r.value || '0'), 0n);
  const txTo = (tx.to || '').toLowerCase();
  const directToCollection = txTo === COLLECTION && txValueWei > 0n;
  const hasInternalPaymentToCollection = internalWei > 0n;

  let classification = 'free_mint';
  let evidenceType = 'zero_value_no_payment_trace';
  let evidenceContract = '';
  let amountWei = 0n;
  let notes = 'No native tx value or internal payment to the collection was found in committed evidence files.';

  if (directToCollection) {
    classification = 'direct_paid_mint';
    evidenceType = 'direct_tx_value';
    evidenceContract = CFG.nftContract;
    amountWei = txValueWei / BigInt(mintedCount);
    notes = 'Mint transaction sent native MON directly to the NFT contract.';
    sums.directPaidMintCount++;
    sums.directPaidMintMON += Number(weiToMonString(amountWei));
  } else if (hasInternalPaymentToCollection) {
    classification = 'router_paid_mint';
    evidenceType = 'internal_transfer';
    evidenceContract = tx.to;
    amountWei = internalWei / BigInt(mintedCount);
    notes = `Mint transaction called ${tx.to}; committed internal trace(s) show native MON transferred into the NFT contract.`;
    sums.routerPaidMintCount++;
    sums.routerPaidMintMON += Number(weiToMonString(amountWei));
  } else {
    sums.freeMintCount++;
  }

  rows.push({
    token_id: e.tokenId,
    mint_tx_hash: e.txHash,
    mint_block: e.block,
    minter_recipient: e.recipient,
    collection_contract: e.collection,
    tx_from: tx.from,
    tx_to: tx.to,
    tx_value_mon: tx.valueMON,
    classification,
    evidence_type: evidenceType,
    evidence_tx_hash: e.txHash,
    evidence_contract: evidenceContract,
    amount_mon_attributed: weiToMonString(amountWei),
    notes
  });
}

sums.directPaidMintMON = Number(sums.directPaidMintMON.toFixed(12));
sums.routerPaidMintMON = Number(sums.routerPaidMintMON.toFixed(12));
sums.totalProvenPaidMintProceedsMON = Number((sums.directPaidMintMON + sums.routerPaidMintMON).toFixed(12));
sums.claimedProceedsMON = sums.totalProvenPaidMintProceedsMON;
sums.differenceClaimedMinusProvenMON = Number((sums.claimedProceedsMON - sums.totalProvenPaidMintProceedsMON).toFixed(12));

const routerContracts = {};
for (const row of rows.filter(r => r.classification === 'router_paid_mint')) {
  const key = (row.evidence_contract || '').toLowerCase();
  if (!routerContracts[key]) routerContracts[key] = { contract: row.evidence_contract, tokenCount: 0, amountMON: 0, evidenceType: 'internal_transfer' };
  routerContracts[key].tokenCount++;
  routerContracts[key].amountMON += Number(row.amount_mon_attributed || 0);
}
for (const v of Object.values(routerContracts)) v.amountMON = Number(v.amountMON.toFixed(12));

const withdrawalTotal = withdrawals.reduce((a, r) => a + Number(r.valueMON || r.amountMON || 0), 0);
const summary = {
  generatedAt: new Date().toISOString(),
  script: 'classify-mints.mjs',
  chain: CFG.chain,
  chainId: CFG.chainId,
  snapshotBlock: SNAPSHOT_BLOCK,
  startBlock: CFG.startBlock,
  collection: CFG.collectionName,
  collectionContract: CFG.nftContract,
  mintPriceMON: MINT_PRICE_MON,
  summary: sums,
  routerOrForwarderContracts: Object.values(routerContracts),
  withdrawalReconciliation: {
    totalWithdrawnFromNFTContractMON: withdrawalTotal,
    provenPaidMintProceedsMON: sums.totalProvenPaidMintProceedsMON,
    differenceWithdrawnMinusProvenMON: Number((withdrawalTotal - sums.totalProvenPaidMintProceedsMON).toFixed(12)),
    note: 'The withdrawal total is used as a reconciliation check, not as the only proof of individual mint payment. Individual router-paid mints are supported by internal transfer evidence in raw_internal_txs_for_nft_contract.json.'
  },
  inputFiles: {
    mintEventsCsv: 'mint-proceeds-output/mint_events_from_zero.csv',
    mintTxsCsv: 'mint-proceeds-output/mint_txs_with_native_value.csv',
    internalTxsJson: 'mint-proceeds-output/raw_internal_txs_for_nft_contract.json',
    withdrawalsCsv: 'mint-proceeds-output/withdrawals_from_nft_contract.csv'
  },
  outputFiles: {
    mintClassificationCsv: 'mint-proceeds-output/mint_classification.csv',
    mintClassificationSummaryJson: 'mint-proceeds-output/mint_classification_summary.json'
  }
};

writeCsv(files.classificationCsv, rows, [
  'token_id', 'mint_tx_hash', 'mint_block', 'minter_recipient', 'collection_contract',
  'tx_from', 'tx_to', 'tx_value_mon', 'classification', 'evidence_type',
  'evidence_tx_hash', 'evidence_contract', 'amount_mon_attributed', 'notes'
]);
fs.writeFileSync(files.classificationSummary, JSON.stringify(summary, null, 2));

// Also merge the classification summary into the compact mint summary used by the report.
let publicSummary = fs.existsSync(files.summary) ? JSON.parse(fs.readFileSync(files.summary, 'utf8')) : {};
publicSummary.generatedAt = new Date().toISOString();
publicSummary.chain = CFG.chain;
publicSummary.chainId = CFG.chainId;
publicSummary.startBlock = CFG.startBlock;
publicSummary.snapshotBlock = SNAPSHOT_BLOCK;
publicSummary.nftContract = CFG.nftContract;
publicSummary.mint = {
  totalSupply: tokenIds.size,
  currentSupplyAtSnapshot: tokenIds.size - 2,
  mintEventsFromZero: sums.totalMintEvents,
  uniqueMintTransactions: txRows.length,
  directPaidMintNFTs: sums.directPaidMintCount,
  directPaidMintMON: String(sums.directPaidMintMON),
  routerPaidMintNFTs: sums.routerPaidMintCount,
  routerPaidMintMON: String(sums.routerPaidMintMON),
  freeMintedNFTs: sums.freeMintCount,
  unknownUnprovenNFTs: sums.unknownUnprovenCount,
  mintPriceMON: MINT_PRICE_MON,
  provenPaidMintProceedsMON: String(sums.totalProvenPaidMintProceedsMON),
  mintProceedsCollectedMON: String(sums.totalProvenPaidMintProceedsMON)
};
publicSummary.withdrawals = publicSummary.withdrawals || {};
publicSummary.withdrawals.totalWithdrawnFromNFTContractMON = String(withdrawalTotal);
publicSummary.withdrawals.mintInfrastructurePayoutContract = {
  label: 'ArchetypePayouts / mint infrastructure payout contract',
  address: CFG.wallets.mintInfrastructurePayoutContract
};
publicSummary.provenance = {
  generatedBy: 'classify-mints.mjs',
  classificationCsv: 'mint-proceeds-output/mint_classification.csv',
  classificationSummaryJson: 'mint-proceeds-output/mint_classification_summary.json'
};
fs.writeFileSync(files.summary, JSON.stringify(publicSummary, null, 2));

console.log(`Wrote ${files.classificationCsv}`);
console.log(`Wrote ${files.classificationSummary}`);
console.log(JSON.stringify(summary.summary, null, 2));
