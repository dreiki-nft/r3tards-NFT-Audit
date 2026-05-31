import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ethers } from 'ethers';
import solc from 'solc';

const ROOT = path.resolve('..');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const OUT = path.resolve('locked-supply-output');
fs.mkdirSync(OUT, { recursive: true });

const DETERMINISTIC_GENERATED_AT = process.env.AUDIT_GENERATED_AT || CFG.reproducibleBuild?.generatedAt || 'snapshot-77822541';
const RPC_URL = process.env.RPC_URL || 'https://rpc.monad.xyz';
const BLOCK_TAG = process.env.BLOCK_TAG || process.env.SNAPSHOT_BLOCK || CFG.snapshotBlock;
const LOCK_CONTRACT = CFG.wallets.lockedTeamSupplyContract;
const SOURCE_FILE = 'r3tards-locked-supply-audit/contracts/NFTTimeLock.sol';
const SOURCE_PATH = path.join(ROOT, SOURCE_FILE);
const CONTRACT_NAME = 'NFTTimeLock';

function sha256Hex(hexOrString) {
  const s = String(hexOrString || '');
  if (s.startsWith('0x')) return crypto.createHash('sha256').update(Buffer.from(s.slice(2), 'hex')).digest('hex');
  return crypto.createHash('sha256').update(s).digest('hex');
}
function toHex0x(hex) {
  const h = String(hex || '');
  return h.startsWith('0x') ? h : `0x${h}`;
}
function normalizeHex(hex) {
  const h = String(hex || '').toLowerCase();
  return h.startsWith('0x') ? h : `0x${h}`;
}
function stripSolidityMetadata(runtimeBytecode) {
  const h = normalizeHex(runtimeBytecode).slice(2);
  if (h.length < 4 || h.length % 2 !== 0) return normalizeHex(runtimeBytecode);
  const metadataLenBytes = parseInt(h.slice(-4), 16);
  const metadataAndLengthHexChars = (metadataLenBytes + 2) * 2;
  if (!Number.isFinite(metadataLenBytes) || metadataAndLengthHexChars <= 4 || metadataAndLengthHexChars >= h.length) return normalizeHex(runtimeBytecode);
  return `0x${h.slice(0, -metadataAndLengthHexChars)}`;
}
function blockTagValue(v) {
  return String(v).toLowerCase() === 'latest' ? 'latest' : Number(v);
}
function compileCandidate(source, settings, sourceKey) {
  const input = {
    language: 'Solidity',
    sources: {
      [sourceKey]: { content: source }
    },
    settings: {
      optimizer: settings.optimizer,
      outputSelection: {
        '*': {
          '*': ['evm.deployedBytecode.object', 'evm.bytecode.object']
        }
      }
    }
  };
  if (settings.evmVersion) input.settings.evmVersion = settings.evmVersion;
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors || []).filter(e => e.severity === 'error');
  if (errors.length) {
    return { ok: false, errors: errors.map(e => e.formattedMessage || e.message) };
  }
  const contract = output.contracts?.[sourceKey]?.[CONTRACT_NAME];
  const runtime = contract?.evm?.deployedBytecode?.object;
  if (!runtime) return { ok: false, errors: ['Compiled runtime bytecode missing'] };
  return {
    ok: true,
    runtimeBytecode: toHex0x(runtime),
    runtimeBytecodeHash: sha256Hex(toHex0x(runtime)),
    runtimeBytecodeStripped: stripSolidityMetadata(toHex0x(runtime)),
    runtimeBytecodeStrippedHash: sha256Hex(stripSolidityMetadata(toHex0x(runtime)))
  };
}

const source = fs.readFileSync(SOURCE_PATH, 'utf8');
const sourceSha256 = sha256Hex(source);
const provider = new ethers.JsonRpcProvider(RPC_URL);
const deployedRuntimeBytecode = normalizeHex(await provider.getCode(LOCK_CONTRACT, blockTagValue(BLOCK_TAG)));
if (!deployedRuntimeBytecode || deployedRuntimeBytecode === '0x') throw new Error(`No deployed bytecode found for ${LOCK_CONTRACT} at blockTag=${BLOCK_TAG}`);
const deployedRuntimeBytecodeHash = sha256Hex(deployedRuntimeBytecode);
const deployedRuntimeBytecodeStripped = stripSolidityMetadata(deployedRuntimeBytecode);
const deployedRuntimeBytecodeStrippedHash = sha256Hex(deployedRuntimeBytecodeStripped);

const optimizerSettings = [
  { enabled: false, runs: 200 },
  { enabled: true, runs: 200 },
  { enabled: true, runs: 1000 },
  { enabled: true, runs: 1000000 }
];
const evmVersions = [null, 'cancun', 'shanghai', 'paris', 'london'];
const sourceKeys = ['contracts/NFTTimeLock.sol', 'NFTTimeLock.sol'];
const candidates = [];
let match = null;

for (const sourceKey of sourceKeys) {
  for (const optimizer of optimizerSettings) {
    for (const evmVersion of evmVersions) {
      const settings = { optimizer, evmVersion };
      const compiled = compileCandidate(source, settings, sourceKey);
      const candidate = {
        sourceKey,
        optimizer,
        evmVersion,
        ok: compiled.ok,
        exactRuntimeMatch: false,
        metadataStrippedRuntimeMatch: false,
        compiledRuntimeBytecodeHash: compiled.runtimeBytecodeHash || null,
        compiledRuntimeBytecodeStrippedHash: compiled.runtimeBytecodeStrippedHash || null,
        errors: compiled.errors || []
      };
      if (compiled.ok) {
        candidate.exactRuntimeMatch = compiled.runtimeBytecodeHash === deployedRuntimeBytecodeHash;
        candidate.metadataStrippedRuntimeMatch = compiled.runtimeBytecodeStrippedHash === deployedRuntimeBytecodeStrippedHash;
      }
      candidates.push(candidate);
      if (!match && (candidate.exactRuntimeMatch || candidate.metadataStrippedRuntimeMatch)) {
        match = { ...candidate };
      }
    }
  }
}

const evidence = {
  generatedAt: DETERMINISTIC_GENERATED_AT,
  script: 'fetch-and-match-lock-bytecode.mjs',
  chain: CFG.chain,
  chainId: CFG.chainId,
  snapshotBlock: CFG.snapshotBlock,
  blockTag: String(BLOCK_TAG),
  lockContract: LOCK_CONTRACT,
  sourceFile: SOURCE_FILE,
  sourceSha256,
  solcVersion: solc.version(),
  deployedRuntimeBytecodeHash,
  deployedRuntimeBytecodeLengthBytes: (deployedRuntimeBytecode.length - 2) / 2,
  deployedRuntimeBytecodeStrippedHash,
  deployedRuntimeBytecodeStrippedLengthBytes: (deployedRuntimeBytecodeStripped.length - 2) / 2,
  exactRuntimeMatch: match?.exactRuntimeMatch === true,
  metadataStrippedRuntimeMatch: match?.metadataStrippedRuntimeMatch === true,
  selectedCompilerSettings: match ? {
    sourceKey: match.sourceKey,
    optimizer: match.optimizer,
    evmVersion: match.evmVersion
  } : null,
  compiledRuntimeBytecodeHash: match?.compiledRuntimeBytecodeHash || null,
  compiledRuntimeBytecodeStrippedHash: match?.compiledRuntimeBytecodeStrippedHash || null,
  candidateCount: candidates.length,
  candidates,
  proofBoundary: match
    ? 'Verified by comparing deployed runtime bytecode against locally compiled runtime bytecode from the committed NFTTimeLock.sol source. Solidity metadata is allowed to differ; metadata-stripped runtime bytecode must match.'
    : 'No runtime bytecode match found with the compiler/settings matrix in this script. Do not claim deployed bytecode/source equivalence from this evidence.'
};

fs.writeFileSync(path.join(OUT, 'lock_bytecode_match_evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({
  lockContract: evidence.lockContract,
  solcVersion: evidence.solcVersion,
  exactRuntimeMatch: evidence.exactRuntimeMatch,
  metadataStrippedRuntimeMatch: evidence.metadataStrippedRuntimeMatch,
  selectedCompilerSettings: evidence.selectedCompilerSettings,
  output: 'r3tards-locked-supply-audit/locked-supply-output/lock_bytecode_match_evidence.json'
}, null, 2));

if (!evidence.metadataStrippedRuntimeMatch) process.exitCode = 2;
