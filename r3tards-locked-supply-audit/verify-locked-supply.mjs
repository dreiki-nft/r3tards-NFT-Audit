import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('..');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const SNAP = Number(process.env.SNAPSHOT_BLOCK || CFG.snapshotBlock);
const RAW = path.join(ROOT, 'r3tards-mint-proceeds-audit/mint-proceeds-output/raw_erc721_transfers_for_collection.json');
const OUT = path.resolve('locked-supply-output');
fs.mkdirSync(OUT, { recursive: true });
const lock = CFG.wallets.lockedTeamSupplyContract.toLowerCase();
const burn = CFG.wallets.burnAddress.toLowerCase();

function csvEscape(v){const s=String(v??''); return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
function writeCsv(file, rows, headers){fs.writeFileSync(file, [headers.join(','), ...rows.map(r=>headers.map(h=>csvEscape(r[h])).join(','))].join('\n')+'\n');}
const transfers = JSON.parse(fs.readFileSync(RAW, 'utf8')).filter(r => Number(r.blockNumber) <= SNAP);
transfers.sort((a,b)=> Number(a.blockNumber)-Number(b.blockNumber) || Number(a.transactionIndex||0)-Number(b.transactionIndex||0));
const owner = new Map();
const last = new Map();
for (const r of transfers) {
  const tid = String(r.tokenID || r.tokenId || r.token_id);
  owner.set(tid, (r.to||'').toLowerCase());
  last.set(tid, r);
}
const lockedTokens = [...owner.entries()].filter(([,o])=>o===lock).map(([t])=>Number(t)).sort((a,b)=>a-b);
const burnRows = [...owner.entries()].filter(([,o])=>o===burn).map(([t])=>last.get(t)).sort((a,b)=>Number(a.tokenID)-Number(b.tokenID));
const lockedRows = lockedTokens.map(t=> {
  const r = last.get(String(t));
  return { token_id:t, current_owner: CFG.wallets.lockedTeamSupplyContract, last_transfer_tx: r.hash, last_transfer_block: r.blockNumber, evidence: 'current owner derived from latest ERC721 Transfer at or before snapshot block' };
});
writeCsv(path.join(OUT,'locked_tokens.csv'), lockedRows, ['token_id','current_owner','last_transfer_tx','last_transfer_block','evidence']);
writeCsv(path.join(OUT,'burn_proofs.csv'), burnRows.map(r=>({ token_id:r.tokenID, burn_tx_hash:r.hash, burn_block:r.blockNumber, from:r.from, to:r.to, functionName:r.functionName, burn_mechanism: r.to.toLowerCase()===burn ? 'transferred_to_dead_address' : 'unknown', evidence:'ERC721 Transfer to burn/dead address in committed raw transfer snapshot' })), ['token_id','burn_tx_hash','burn_block','from','to','functionName','burn_mechanism','evidence']);
const summary = {
  generatedAt: new Date().toISOString(),
  script: 'verify-locked-supply.mjs',
  chain: CFG.chain,
  chainId: CFG.chainId,
  snapshotBlock: SNAP,
  collectionContract: CFG.nftContract,
  lockContract: CFG.wallets.lockedTeamSupplyContract,
  lockedTokenCountVerifiedByOwnership: lockedTokens.length,
  lockedTokenIds: lockedTokens,
  unlockDateClaim: 'April 2029',
  unlockDateVerifiedFromContractState: false,
  withdrawalRulesVerifiedFromSourceOrAbi: false,
  uncertainty: 'This repo verifies token ownership by the lock contract from ERC721 Transfer history. It does not include decoded lock contract ABI/source/read outputs proving the unlock timestamp or withdrawal rules. The April 2029 date should be described as a documented project claim until contract-state proof is added.',
  burnProofs: {
    burnAddress: CFG.wallets.burnAddress,
    burnCountVerified: burnRows.length,
    burnedTokenIds: burnRows.map(r=>r.tokenID),
    mechanism: 'ERC721 Transfer to 0x000000000000000000000000000000000000dEaD'
  },
  inputFiles: { rawErc721Transfers: 'r3tards-mint-proceeds-audit/mint-proceeds-output/raw_erc721_transfers_for_collection.json' },
  outputFiles: { lockedTokensCsv:'r3tards-locked-supply-audit/locked-supply-output/locked_tokens.csv', burnProofsCsv:'r3tards-locked-supply-audit/locked-supply-output/burn_proofs.csv' }
};
fs.writeFileSync(path.join(OUT,'locked_supply_summary.json'), JSON.stringify(summary,null,2));
console.log(JSON.stringify({ locked:lockedTokens.length, burns:burnRows.length }, null, 2));
