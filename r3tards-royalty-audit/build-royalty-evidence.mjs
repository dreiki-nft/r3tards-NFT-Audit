import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('..');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const OUT = path.resolve('royalty-audit-v4-output');
const files = {
  payments: path.join(OUT, 'all_indexed_inbound_payments.csv'),
  checked: path.join(OUT, 'checked_payment_txs.jsonl'),
  evidenceCsv: path.join(OUT, 'likely_royalties_evidence.csv'),
  summary: path.join(OUT, 'summary.json')
};
function parseCsvLine(line) {
  const out = []; let cur = ''; let q = false;
  for (let i=0;i<line.length;i++) { const c=line[i], n=line[i+1];
    if (c==='"' && q && n==='"') { cur+='"'; i++; }
    else if (c==='"') q=!q;
    else if (c===',' && !q) { out.push(cur); cur=''; }
    else cur+=c;
  }
  out.push(cur); return out;
}
function parseCsv(text) {
  const lines=text.trim().split(/\r?\n/).filter(Boolean); if(!lines.length) return [];
  const h=parseCsvLine(lines.shift()).map(x=>x.trim()); return lines.map(line=>{const c=parseCsvLine(line); const r={}; h.forEach((k,i)=>r[k]=(c[i]||'').trim()); return r;});
}
function csvEscape(v){const s=String(v??''); return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
function writeCsv(file, rows, headers){fs.writeFileSync(file, [headers.join(','), ...rows.map(r=>headers.map(h=>csvEscape(r[h])).join(','))].join('\n')+'\n');}
for (const f of [files.payments, files.checked]) if (!fs.existsSync(f)) throw new Error(`Missing input: ${f}`);
const payments=parseCsv(fs.readFileSync(files.payments,'utf8'));
const checked=fs.readFileSync(files.checked,'utf8').trim().split(/\r?\n/).filter(Boolean).map(x=>JSON.parse(x));
const checkedByHash=new Map(checked.map(r=>[(r.hash||'').toLowerCase(), r]));
const rows=[];
let high=0, med=0, low=0;
let mon=0, wmon=0, other=0;
for (const p of payments) {
  const h=(p.hash||'').toLowerCase();
  const c=checkedByHash.get(h);
  if (!c || !c.hasSecondaryNftTransfer) continue;
  const asset = p.paymentSource === 'WMON_ERC20' || (p.tokenSymbol||'').toUpperCase()==='WMON' ? 'WMON' : (p.tokenSymbol || 'MON');
  const amount = Number(p.amountMON || 0);
  const confidence = c.receiptStatus === '0x1' && c.nftSecondaryTransferCount > 0 && !c.error ? 'high' : 'medium';
  if (confidence==='high') high++; else if (confidence==='medium') med++; else low++;
  if (asset === 'WMON') wmon += amount; else if (asset === 'MON' || asset === 'native') mon += amount; else other += amount;
  const transfers=(c.transfers||[]).filter(t=>t.secondary);
  rows.push({
    tx_hash: h,
    block: p.blockNumber,
    timestamp: p.timeStamp,
    royalty_wallet: CFG.royaltyWallet,
    asset,
    amount_raw: p.rawValue,
    amount_mon_normalized: p.amountMON,
    nft_contract: CFG.nftContract,
    token_ids_transferred: (c.secondaryTokenIds || []).join('|'),
    transfer_from: transfers.map(t=>t.from).join('|'),
    transfer_to: transfers.map(t=>t.to).join('|'),
    marketplace_or_contract_if_identified: '',
    matching_evidence: 'same transaction contains inbound payment to royalty wallet and secondary ERC721 Transfer from collection',
    confidence,
    notes: 'Heuristic match; can include false positives/negatives if marketplace routing is non-standard.'
  });
}
writeCsv(files.evidenceCsv, rows, ['tx_hash','block','timestamp','royalty_wallet','asset','amount_raw','amount_mon_normalized','nft_contract','token_ids_transferred','transfer_from','transfer_to','marketplace_or_contract_if_identified','matching_evidence','confidence','notes']);
const total = Number((mon+wmon+other).toFixed(12));
let summary=fs.existsSync(files.summary)?JSON.parse(fs.readFileSync(files.summary,'utf8')):{};
summary.chainId=String(CFG.chainId);
summary.startBlock=CFG.startBlock;
summary.endBlock=CFG.snapshotBlock;
summary.snapshotBlock=CFG.snapshotBlock;
summary.nftContract=CFG.nftContract.toLowerCase();
summary.royaltyWallet=CFG.royaltyWallet.toLowerCase();
summary.methodology='Matched likely royalties: inbound MON/WMON payment to royalty wallet in the same transaction as a secondary ERC721 transfer from the r3tards NFT contract. This is a heuristic, not contract-level royalty enforcement proof.';
summary.counts = { ...(summary.counts||{}), likelyRoyaltyTxs: rows.length, confidenceHigh: high, confidenceMedium: med, confidenceLow: low };
summary.totals = { ...(summary.totals||{}), likelyNativeMON: String(Number(mon.toFixed(12))), likelyWmonMON: String(Number(wmon.toFixed(12))), likelyOtherMON: String(Number(other.toFixed(12))), likelyTotalMONEquivalent: String(total) };
summary.limitations = {
  possibleFalsePositives: 'A non-royalty inbound payment in the same tx as a secondary transfer could be counted.',
  possibleFalseNegatives: 'A royalty paid in a different tx, different asset, or route not indexed here could be missed.',
  exactness: 'Report as matched likely royalties unless stronger marketplace/contract proof is added.'
};
summary.outputFiles = { ...(summary.outputFiles||{}), likelyRoyaltiesEvidenceCsv: 'royalty-audit-v4-output/likely_royalties_evidence.csv' };
fs.writeFileSync(files.summary, JSON.stringify(summary,null,2));
console.log(`Wrote ${files.evidenceCsv}`);
console.log(JSON.stringify({rows:rows.length, mon,wmon,total, high,med,low}, null, 2));
