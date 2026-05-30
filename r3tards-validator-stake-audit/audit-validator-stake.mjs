import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";

const CHAIN_ID = 143;
const STAKING_PRECOMPILE = "0x0000000000000000000000000000000000001000";
const ZERO = "0x0000000000000000000000000000000000000000";

const RPC_URL = process.env.RPC_URL || "https://rpc.monad.xyz";
const VALIDATOR_NAME = (process.env.VALIDATOR_NAME || "forthenads").trim();
const VALIDATOR_ID_ENV = process.env.VALIDATOR_ID;
const BLOCK_TAG = process.env.BLOCK_TAG || "latest";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";
const START_BLOCK = process.env.START_BLOCK || "0";
const END_BLOCK = process.env.END_BLOCK || "latest";
const API_DELAY_MS = Number(process.env.API_DELAY_MS || "500");
const INCLUDE_DELEGATORS = String(process.env.INCLUDE_DELEGATORS || "false").toLowerCase() === "true";
const DELEGATOR_ADDRESS = (process.env.DELEGATOR_ADDRESS || process.env.DEPLOYER_WALLET || "").trim();
const MAX_DELEGATORS = Number(process.env.MAX_DELEGATORS || "10000");
const RPC_DELAY_MS = Number(process.env.RPC_DELAY_MS || "100");
const OUTPUT_DIR = process.env.OUTPUT_DIR || "validator-stake-output";

const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);

const abi = [
  "function getEpoch() returns (uint64 epoch, bool inEpochDelayPeriod)",
  "function getValidator(uint64 validatorId) returns (address authAddress, uint64 flags, uint256 stake, uint256 accRewardPerToken, uint256 commission, uint256 unclaimedRewards, uint256 consensusStake, uint256 consensusCommission, uint256 snapshotStake, uint256 snapshotCommission, bytes secpPubkey, bytes blsPubkey)",
  "function getDelegators(uint64 validatorId, address startDelegator) returns (bool isDone, address nextDelegator, address[] delegators)",
  "function getDelegator(uint64 validatorId, address delegator) returns (uint256 stake, uint256 accRewardPerToken, uint256 unclaimedRewards, uint256 deltaStake, uint256 nextDeltaStake, uint64 deltaEpoch, uint64 nextDeltaEpoch)",
  "event Delegate(uint64 indexed validatorId, address indexed delegator, uint256 amount, uint64 activationEpoch)",
  "event Undelegate(uint64 indexed validatorId, address indexed delegator, uint8 withdrawId, uint256 amount, uint64 activationEpoch)",
  "event ClaimRewards(uint64 indexed validatorId, address indexed delegator, uint256 amount, uint64 epoch)",
  "event ValidatorRewarded(uint64 indexed validatorId, address indexed from, uint256 amount, uint64 epoch)",
  "event CommissionChanged(uint64 indexed validatorId, uint256 oldCommission, uint256 newCommission)",
  "event ValidatorCreated(uint64 indexed validatorId, address indexed authAddress, uint256 commission)"
];
const iface = new ethers.Interface(abi);

function mkdirp(dir) { fs.mkdirSync(dir, { recursive: true }); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function mon(v) { return Number(ethers.formatEther(v)); }
function monString(v) { return ethers.formatEther(v); }
function jsonReplacer(_k, v) { return typeof v === "bigint" ? v.toString() : v; }
function writeJson(file, data) { fs.writeFileSync(file, JSON.stringify(data, jsonReplacer, 2)); }
function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}
function writeCsv(file, rows) {
  if (!rows.length) { fs.writeFileSync(file, ""); return; }
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map(h => csvEscape(row[h])).join(","));
  fs.writeFileSync(file, lines.join("\n"));
}
function deepFindObjects(value, predicate, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) deepFindObjects(item, predicate, out);
  } else if (value && typeof value === "object") {
    if (predicate(value)) out.push(value);
    for (const item of Object.values(value)) deepFindObjects(item, predicate, out);
  }
  return out;
}
function objectContainsString(obj, needle) {
  const n = needle.toLowerCase();
  return JSON.stringify(obj).toLowerCase().includes(n);
}
function pickValidatorId(obj) {
  const candidates = ["validatorId", "validator_id", "valId", "val_id", "id", "validatorID", "validator_id_decimal"];
  for (const k of candidates) {
    if (obj[k] !== undefined && obj[k] !== null && String(obj[k]).match(/^\d+$/)) return Number(obj[k]);
  }
  return null;
}
function topicForUint64(id) {
  return ethers.zeroPadValue(ethers.toBeHex(BigInt(id)), 32);
}

async function stakingCall(functionName, args = []) {
  // Monad staking precompile methods are intentionally `nonpayable`, not `view`.
  // ethers.Contract tries to send a transaction for nonpayable methods when connected
  // only to a Provider, so we perform a raw eth_call instead. A top-level eth_call
  // simulates a normal CALL to the precompile without needing a signer.
  const data = iface.encodeFunctionData(functionName, args);
  const blockTag = BLOCK_TAG === "latest" ? "latest" : Number(BLOCK_TAG);
  const result = await provider.call({ to: STAKING_PRECOMPILE, data }, blockTag);
  return iface.decodeFunctionResult(functionName, result);
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "accept": "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return await res.json();
}

async function findValidatorFromGmonads(name) {
  const endpoints = ["validators/metadata", "validators/epoch", "validators/performance"];
  const allMatches = [];
  for (const ep of endpoints) {
    const url = `https://www.gmonads.com/api/v1/public/${ep}?network=mainnet`;
    try {
      const data = await fetchJson(url);
      writeJson(path.join(OUTPUT_DIR, `raw_gmonads_${ep.replaceAll("/", "_")}.json`), data);
      const matches = deepFindObjects(data, obj => objectContainsString(obj, name));
      for (const match of matches) allMatches.push({ source: ep, match });
    } catch (err) {
      console.warn(`[WARN] Could not fetch Gmonads ${ep}: ${err.message}`);
    }
  }

  const enriched = allMatches.map(m => ({ ...m, validatorId: pickValidatorId(m.match) })).filter(m => m.validatorId !== null);
  writeJson(path.join(OUTPUT_DIR, "gmonads_matches_all.json"), allMatches);
  if (enriched.length === 0) return null;

  // Prefer a match where a human-readable field exactly/includes the requested name.
  enriched.sort((a, b) => {
    const astr = JSON.stringify(a.match).toLowerCase();
    const bstr = JSON.stringify(b.match).toLowerCase();
    const aname = astr.includes(`"${name.toLowerCase()}"`) ? 0 : 1;
    const bname = bstr.includes(`"${name.toLowerCase()}"`) ? 0 : 1;
    return aname - bname;
  });
  return enriched[0];
}

async function readValidatorState(validatorId) {
  const v = await stakingCall("getValidator", [validatorId]);
  const epoch = await stakingCall("getEpoch", []).catch(err => ({ error: err.message }));
  return {
    validatorId,
    blockTag: BLOCK_TAG,
    stakingPrecompile: STAKING_PRECOMPILE,
    epoch: epoch?.error ? epoch : { epoch: epoch[0], inEpochDelayPeriod: epoch[1] },
    authAddress: v[0],
    flags: v[1],
    executionStakeWei: v[2],
    executionStakeMON: monString(v[2]),
    accRewardPerToken: v[3],
    executionCommissionRaw: v[4],
    executionCommissionPercent: Number(ethers.formatUnits(v[4], 16)),
    unclaimedRewardsWei: v[5],
    unclaimedRewardsMON: monString(v[5]),
    consensusStakeWei: v[6],
    consensusStakeMON: monString(v[6]),
    consensusCommissionRaw: v[7],
    consensusCommissionPercent: Number(ethers.formatUnits(v[7], 16)),
    snapshotStakeWei: v[8],
    snapshotStakeMON: monString(v[8]),
    snapshotCommissionRaw: v[9],
    snapshotCommissionPercent: Number(ethers.formatUnits(v[9], 16)),
    secpPubkey: v[10],
    blsPubkey: v[11]
  };
}

async function readOneDelegator(validatorId, delegator) {
  if (!delegator) return null;
  if (!ethers.isAddress(delegator)) throw new Error(`Invalid DELEGATOR_ADDRESS/DEPLOYER_WALLET: ${delegator}`);
  const d = await stakingCall("getDelegator", [validatorId, delegator]);
  return {
    validatorId,
    delegator: ethers.getAddress(delegator),
    stakeWei: d[0],
    stakeMON: monString(d[0]),
    accRewardPerToken: d[1],
    unclaimedRewardsWei: d[2],
    unclaimedRewardsMON: monString(d[2]),
    deltaStakeWei: d[3],
    deltaStakeMON: monString(d[3]),
    nextDeltaStakeWei: d[4],
    nextDeltaStakeMON: monString(d[4]),
    deltaEpoch: d[5].toString(),
    nextDeltaEpoch: d[6].toString()
  };
}

async function readDelegators(validatorId) {
  const rows = [];
  let start = ZERO;
  let page = 0;
  let seen = new Set();
  let isDone = false;
  while (!isDone && rows.length < MAX_DELEGATORS) {
    page += 1;
    const res = await stakingCall("getDelegators", [validatorId, start]);
    isDone = Boolean(res[0]);
    const next = res[1];
    const delegators = Array.from(res[2] || []);
    console.log(`  delegator page ${page}: ${delegators.length} address(es), isDone=${isDone}`);
    for (const delegator of delegators) {
      const key = delegator.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      await sleep(RPC_DELAY_MS);
      const d = await stakingCall("getDelegator", [validatorId, delegator]);
      rows.push({
        validatorId,
        delegator,
        stakeMON: monString(d[0]),
        unclaimedRewardsMON: monString(d[2]),
        deltaStakeMON: monString(d[3]),
        nextDeltaStakeMON: monString(d[4]),
        deltaEpoch: d[5].toString(),
        nextDeltaEpoch: d[6].toString()
      });
      if (rows.length % 25 === 0) console.log(`  delegator details checked ${rows.length}`);
      if (rows.length >= MAX_DELEGATORS) break;
    }
    if (!next || next.toLowerCase() === start.toLowerCase()) break;
    start = next;
    await sleep(RPC_DELAY_MS);
  }
  return rows;
}

async function etherscanGetLogs(topic0, validatorId) {
  const topic1 = topicForUint64(validatorId);
  const logs = [];
  let page = 1;
  const offset = 1000;
  while (true) {
    const params = new URLSearchParams({
      chainid: String(CHAIN_ID),
      module: "logs",
      action: "getLogs",
      address: STAKING_PRECOMPILE,
      fromBlock: String(START_BLOCK),
      toBlock: String(END_BLOCK),
      topic0,
      topic1,
      page: String(page),
      offset: String(offset),
      apikey: ETHERSCAN_API_KEY
    });
    const url = `https://api.etherscan.io/v2/api?${params.toString()}`;
    const data = await fetchJson(url);
    if (data.status === "0" && /No records/i.test(data.message || "")) break;
    if (data.status === "0" && data.result && typeof data.result === "string") {
      throw new Error(`Etherscan logs error: ${data.message || ""} ${data.result}`);
    }
    const batch = Array.isArray(data.result) ? data.result : [];
    logs.push(...batch);
    console.log(`  logs page ${page}: ${batch.length}, total ${logs.length}`);
    if (batch.length < offset) break;
    page += 1;
    await sleep(API_DELAY_MS);
  }
  return logs;
}

function decodeRows(logs, eventName) {
  const rows = [];
  for (const log of logs) {
    try {
      const parsed = iface.parseLog({ topics: log.topics, data: log.data });
      const args = parsed.args;
      if (eventName === "Delegate") {
        rows.push({
          eventName,
          blockNumber: Number(log.blockNumber),
          txHash: log.transactionHash,
          logIndex: Number(log.logIndex),
          validatorId: args.validatorId.toString(),
          delegator: args.delegator,
          amountMON: monString(args.amount),
          activationEpoch: args.activationEpoch.toString()
        });
      } else if (eventName === "Undelegate") {
        rows.push({
          eventName,
          blockNumber: Number(log.blockNumber),
          txHash: log.transactionHash,
          logIndex: Number(log.logIndex),
          validatorId: args.validatorId.toString(),
          delegator: args.delegator,
          withdrawId: args.withdrawId.toString(),
          amountMON: monString(args.amount),
          activationEpoch: args.activationEpoch.toString()
        });
      }
    } catch (err) {
      rows.push({ eventName, decodeError: err.message, raw: JSON.stringify(log) });
    }
  }
  return rows;
}

async function main() {
  mkdirp(OUTPUT_DIR);
  console.log("\n=== Monad validator stake audit v1.2 ===");
  console.log(`RPC:                 ${RPC_URL}`);
  console.log(`Validator name:      ${VALIDATOR_NAME}`);
  console.log(`Validator ID env:    ${VALIDATOR_ID_ENV || "not set"}`);
  console.log(`Block tag:           ${BLOCK_TAG}`);
  console.log(`Include delegators:  ${INCLUDE_DELEGATORS}`);
  console.log(`Delegator filter:     ${DELEGATOR_ADDRESS || "not set"}`);
  console.log(`Etherscan history:   ${ETHERSCAN_API_KEY ? "enabled" : "disabled"}`);
  console.log(`Output dir:          ${path.resolve(OUTPUT_DIR)}\n`);

  let validatorId = VALIDATOR_ID_ENV ? Number(VALIDATOR_ID_ENV) : null;
  let gmonadsMatch = null;
  if (!validatorId) {
    console.log("Finding validator by name from Gmonads public API...");
    gmonadsMatch = await findValidatorFromGmonads(VALIDATOR_NAME);
    if (!gmonadsMatch) {
      throw new Error(`Could not find validator name "${VALIDATOR_NAME}" from Gmonads. Re-run with VALIDATOR_ID=<id>.`);
    }
    validatorId = gmonadsMatch.validatorId;
    writeJson(path.join(OUTPUT_DIR, "gmonads_match.json"), gmonadsMatch);
    console.log(`Matched validator ID: ${validatorId} from ${gmonadsMatch.source}`);
  }

  console.log("Reading current on-chain validator state from staking precompile...");
  const validatorState = await readValidatorState(validatorId);
  writeJson(path.join(OUTPUT_DIR, "validator_state.json"), validatorState);

  let deployerDelegator = null;
  if (DELEGATOR_ADDRESS) {
    console.log("Reading specific delegator stake for DELEGATOR_ADDRESS/DEPLOYER_WALLET...");
    deployerDelegator = await readOneDelegator(validatorId, DELEGATOR_ADDRESS);
    writeJson(path.join(OUTPUT_DIR, "specific_delegator_state.json"), deployerDelegator);
    writeCsv(path.join(OUTPUT_DIR, "specific_delegator_state.csv"), [deployerDelegator]);
  }

  let delegatorRows = [];
  if (INCLUDE_DELEGATORS) {
    console.log("Reading current delegator list + per-delegator stake...");
    delegatorRows = await readDelegators(validatorId);
    writeCsv(path.join(OUTPUT_DIR, "delegators.csv"), delegatorRows);
  }

  let delegateRows = [];
  let undelegateRows = [];
  if (ETHERSCAN_API_KEY) {
    console.log("Fetching indexed Delegate events from Etherscan API V2...");
    const delegateTopic0 = ethers.id("Delegate(uint64,address,uint256,uint64)");
    const delegateLogs = await etherscanGetLogs(delegateTopic0, validatorId);
    writeJson(path.join(OUTPUT_DIR, "raw_delegate_logs.json"), delegateLogs);
    delegateRows = decodeRows(delegateLogs, "Delegate");
    writeCsv(path.join(OUTPUT_DIR, "delegation_events.csv"), delegateRows);

    await sleep(API_DELAY_MS);
    console.log("Fetching indexed Undelegate events from Etherscan API V2...");
    const undelegateTopic0 = ethers.id("Undelegate(uint64,address,uint8,uint256,uint64)");
    const undelegateLogs = await etherscanGetLogs(undelegateTopic0, validatorId);
    writeJson(path.join(OUTPUT_DIR, "raw_undelegate_logs.json"), undelegateLogs);
    undelegateRows = decodeRows(undelegateLogs, "Undelegate");
    writeCsv(path.join(OUTPUT_DIR, "undelegation_events.csv"), undelegateRows);
  }

  const grossDelegated = delegateRows.reduce((a, r) => a + Number(r.amountMON || 0), 0);
  const grossUndelegated = undelegateRows.reduce((a, r) => a + Number(r.amountMON || 0), 0);
  const targetDelegator = DELEGATOR_ADDRESS ? ethers.getAddress(DELEGATOR_ADDRESS).toLowerCase() : null;
  const deployerDelegateRows = targetDelegator ? delegateRows.filter(r => String(r.delegator || "").toLowerCase() === targetDelegator) : [];
  const deployerUndelegateRows = targetDelegator ? undelegateRows.filter(r => String(r.delegator || "").toLowerCase() === targetDelegator) : [];
  if (targetDelegator && ETHERSCAN_API_KEY) {
    writeCsv(path.join(OUTPUT_DIR, "specific_delegator_delegation_events.csv"), deployerDelegateRows);
    writeCsv(path.join(OUTPUT_DIR, "specific_delegator_undelegation_events.csv"), deployerUndelegateRows);
  }
  const deployerGrossDelegated = deployerDelegateRows.reduce((a, r) => a + Number(r.amountMON || 0), 0);
  const deployerGrossUndelegated = deployerUndelegateRows.reduce((a, r) => a + Number(r.amountMON || 0), 0);
  const delegatorStakeSum = delegatorRows.reduce((a, r) => a + Number(r.stakeMON || 0), 0);
  const delegatorUnclaimedRewardsSum = delegatorRows.reduce((a, r) => a + Number(r.unclaimedRewardsMON || 0), 0);

  const summary = {
    generatedAt: new Date().toISOString(),
    network: "Monad mainnet",
    chainId: CHAIN_ID,
    rpcUrl: RPC_URL,
    blockTag: BLOCK_TAG,
    validatorNameSearch: VALIDATOR_NAME,
    validatorId,
    stakingPrecompile: STAKING_PRECOMPILE,
    authAddress: validatorState.authAddress,
    epoch: validatorState.epoch,
    executionStakeMON: validatorState.executionStakeMON,
    consensusStakeMON: validatorState.consensusStakeMON,
    snapshotStakeMON: validatorState.snapshotStakeMON,
    unclaimedRewardsMON: validatorState.unclaimedRewardsMON,
    executionCommissionPercent: validatorState.executionCommissionPercent,
    consensusCommissionPercent: validatorState.consensusCommissionPercent,
    snapshotCommissionPercent: validatorState.snapshotCommissionPercent,
    delegatorCountChecked: delegatorRows.length,
    delegatorStakeSumMON: delegatorRows.length ? String(delegatorStakeSum) : null,
    delegatorUnclaimedRewardsSumMON: delegatorRows.length ? String(delegatorUnclaimedRewardsSum) : null,
    specificDelegatorAddress: DELEGATOR_ADDRESS ? ethers.getAddress(DELEGATOR_ADDRESS) : null,
    specificDelegatorCurrentStakeMON: deployerDelegator ? deployerDelegator.stakeMON : null,
    specificDelegatorUnclaimedRewardsMON: deployerDelegator ? deployerDelegator.unclaimedRewardsMON : null,
    specificDelegatorDeltaStakeMON: deployerDelegator ? deployerDelegator.deltaStakeMON : null,
    specificDelegatorNextDeltaStakeMON: deployerDelegator ? deployerDelegator.nextDeltaStakeMON : null,
    eventHistoryEnabled: Boolean(ETHERSCAN_API_KEY),
    eventStartBlock: ETHERSCAN_API_KEY ? START_BLOCK : null,
    eventEndBlock: ETHERSCAN_API_KEY ? END_BLOCK : null,
    delegateEventCount: delegateRows.length,
    undelegateEventCount: undelegateRows.length,
    grossDelegatedMONByEvents: ETHERSCAN_API_KEY ? String(grossDelegated) : null,
    grossUndelegatedMONByEvents: ETHERSCAN_API_KEY ? String(grossUndelegated) : null,
    netDelegatedMONByEvents: ETHERSCAN_API_KEY ? String(grossDelegated - grossUndelegated) : null,
    specificDelegatorDelegateEventCount: ETHERSCAN_API_KEY && targetDelegator ? deployerDelegateRows.length : null,
    specificDelegatorUndelegateEventCount: ETHERSCAN_API_KEY && targetDelegator ? deployerUndelegateRows.length : null,
    specificDelegatorGrossDelegatedMONByEvents: ETHERSCAN_API_KEY && targetDelegator ? String(deployerGrossDelegated) : null,
    specificDelegatorGrossUndelegatedMONByEvents: ETHERSCAN_API_KEY && targetDelegator ? String(deployerGrossUndelegated) : null,
    specificDelegatorNetDelegatedMONByEvents: ETHERSCAN_API_KEY && targetDelegator ? String(deployerGrossDelegated - deployerGrossUndelegated) : null,
    notes: [
      "executionStakeMON is the real-time staking precompile execution view.",
      "consensusStakeMON is the stake currently used by consensus.",
      "snapshotStakeMON is the staking snapshot view for epoch transition logic.",
      "Event totals are historical flow metrics. Current on-chain validator state is the authoritative snapshot."
    ]
  };
  writeJson(path.join(OUTPUT_DIR, "summary.json"), summary);

  console.log("\n=== Summary ===");
  console.log(`Validator ID:            ${validatorId}`);
  console.log(`Auth address:            ${summary.authAddress}`);
  console.log(`Execution stake MON:     ${summary.executionStakeMON}`);
  console.log(`Consensus stake MON:     ${summary.consensusStakeMON}`);
  console.log(`Snapshot stake MON:      ${summary.snapshotStakeMON}`);
  console.log(`Commission %:            ${summary.consensusCommissionPercent}`);
  if (deployerDelegator) {
    console.log(`Specific delegator:      ${summary.specificDelegatorAddress}`);
    console.log(`Specific stake MON:      ${summary.specificDelegatorCurrentStakeMON}`);
    console.log(`Specific rewards MON:    ${summary.specificDelegatorUnclaimedRewardsMON}`);
  }
  if (ETHERSCAN_API_KEY) {
    console.log(`Gross delegated events:  ${summary.grossDelegatedMONByEvents} MON`);
    console.log(`Gross undelegated events:${summary.grossUndelegatedMONByEvents} MON`);
    console.log(`Net by events:           ${summary.netDelegatedMONByEvents} MON`);
    if (targetDelegator) {
      console.log(`Specific gross delegated:${summary.specificDelegatorGrossDelegatedMONByEvents} MON`);
      console.log(`Specific gross undeleg.: ${summary.specificDelegatorGrossUndelegatedMONByEvents} MON`);
      console.log(`Specific net by events:  ${summary.specificDelegatorNetDelegatedMONByEvents} MON`);
    }
  }
  console.log(`\nWrote: ${path.resolve(OUTPUT_DIR)}`);
}

main().catch(err => {
  console.error("\n[FATAL]", err);
  process.exit(1);
});
