import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';

const ROOT = path.resolve('..');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const DETERMINISTIC_GENERATED_AT = process.env.AUDIT_GENERATED_AT || CFG.reproducibleBuild?.generatedAt || 'snapshot-77822541';
const OUT = path.resolve('locked-supply-output');
fs.mkdirSync(OUT, { recursive: true });

const RPC_URL = process.env.RPC_URL || 'https://rpc.monad.xyz';
const BLOCK_TAG = process.env.BLOCK_TAG || process.env.SNAPSHOT_BLOCK || CFG.snapshotBlock;
const provider = new ethers.JsonRpcProvider(RPC_URL);
const abi = [
  'function unlockTime() view returns (uint256)',
  'function nftContract() view returns (address)',
  'function getOwners() view returns (address[])',
  'function timeUntilUnlock() view returns (uint256)',
  'function isOwner(address) view returns (bool)'
];
const lock = new ethers.Contract(CFG.wallets.lockedTeamSupplyContract, abi, provider);
const expectedOwners = [
  CFG.wallets.teamDeployerRoyalty,
  CFG.wallets.communityTreasury,
  CFG.wallets.activations,
  CFG.wallets.futureCollabsPartners
];
function blockTagValue(v){ return String(v).toLowerCase()==='latest' ? 'latest' : Number(v); }
const overrides = { blockTag: blockTagValue(BLOCK_TAG) };
const unlockTime = await lock.unlockTime(overrides);
const nftContract = await lock.nftContract(overrides);
const owners = await lock.getOwners(overrides);
const timeUntilUnlock = await lock.timeUntilUnlock(overrides).catch(() => null);
const isOwnerResults = {};
for (const owner of expectedOwners) isOwnerResults[owner] = await lock.isOwner(owner, overrides);
const unlockDate = new Date(Number(unlockTime) * 1000).toISOString();
const output = {
  generatedAt: DETERMINISTIC_GENERATED_AT,
  script: 'verify-lock-contract-state.mjs',
  rpcUrl: RPC_URL.replace(/\/[^/]*@/, '//***@'),
  blockTag: BLOCK_TAG,
  chain: CFG.chain,
  chainId: CFG.chainId,
  lockContract: CFG.wallets.lockedTeamSupplyContract,
  nftContractReadFromLock: nftContract,
  expectedNftContract: CFG.nftContract,
  nftContractMatchesExpected: String(nftContract).toLowerCase() === CFG.nftContract.toLowerCase(),
  unlockTime: unlockTime.toString(),
  unlockDateUTC: unlockDate,
  unlockDateHuman: unlockDate.slice(0,10),
  timeUntilUnlockSecondsAtBlockTag: timeUntilUnlock === null ? null : timeUntilUnlock.toString(),
  ownersReadFromLock: owners,
  expectedOwners,
  ownersMatchExpectedSet: owners.map(x=>x.toLowerCase()).sort().join(',') === expectedOwners.map(x=>x.toLowerCase()).sort().join(','),
  isOwnerResults,
  note: 'Read-only eth_call evidence from deployed timelock contract. Add this file to the repo only if you want committed on-chain read proof for exact unlockTime and owner set.'
};
fs.writeFileSync(path.join(OUT, 'lock_contract_state_read.json'), JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
