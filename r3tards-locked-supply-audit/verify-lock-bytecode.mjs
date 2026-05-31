import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const ROOT = path.resolve('..');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const OUT = path.resolve('locked-supply-output');
fs.mkdirSync(OUT, { recursive: true });

const deterministicGeneratedAt = process.env.AUDIT_GENERATED_AT || CFG.reproducibleBuild?.generatedAt || 'snapshot-77822541';
const lockContract = CFG.wallets.lockedTeamSupplyContract;
const sourceFile = 'r3tards-locked-supply-audit/contracts/NFTTimeLock.sol';
const sourcePath = path.join(ROOT, sourceFile);
const stateReadFile = path.join(OUT, 'lock_contract_state_read.json');
const matchEvidenceFile = path.join(OUT, 'lock_bytecode_match_evidence.json');

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

const sourcePresent = fs.existsSync(sourcePath);
const sourceSha256 = sourcePresent ? sha256(fs.readFileSync(sourcePath)) : null;
const stateReadPresent = fs.existsSync(stateReadFile);
let stateReadSummary = null;
if (stateReadPresent) {
  const j = JSON.parse(fs.readFileSync(stateReadFile, 'utf8'));
  stateReadSummary = {
    file: 'r3tards-locked-supply-audit/locked-supply-output/lock_contract_state_read.json',
    nftContractMatchesExpected: j.nftContractMatchesExpected === true,
    ownersMatchExpectedSet: j.ownersMatchExpectedSet === true,
    unlockDateUTC: j.unlockDateUTC || null,
    blockTag: j.blockTag || null
  };
}

let matchEvidencePresent = false;
let matchEvidenceSummary = null;
let sourceEquivalenceStatus = 'not_verified_by_repo';
let deployedBytecodeCompared = false;
let deployedBytecodeHash = null;
let compiledRuntimeBytecodeHash = null;
let compiledRuntimeBytecodeStrippedHash = null;
let selectedCompilerSettings = null;
let bytecodeProofBoundary = 'The repo includes source, tests, token custody proof, and optional deployed state reads. It does not currently prove exact deployed bytecode/source equivalence. Treat lock behavior as source/test-supported plus deployed-state-read-supported, not bytecode-equivalence-proven.';

if (fs.existsSync(matchEvidenceFile)) {
  matchEvidencePresent = true;
  const ev = JSON.parse(fs.readFileSync(matchEvidenceFile, 'utf8'));
  const contractMatches = String(ev.lockContract || '').toLowerCase() === String(lockContract).toLowerCase();
  const sourceMatches = ev.sourceSha256 === sourceSha256;
  const chainMatches = Number(ev.chainId) === Number(CFG.chainId);
  const verified = contractMatches && sourceMatches && chainMatches && ev.metadataStrippedRuntimeMatch === true;
  sourceEquivalenceStatus = verified ? 'verified_match' : 'evidence_present_but_not_verified_match';
  deployedBytecodeCompared = true;
  deployedBytecodeHash = ev.deployedRuntimeBytecodeHash || null;
  compiledRuntimeBytecodeHash = ev.compiledRuntimeBytecodeHash || null;
  compiledRuntimeBytecodeStrippedHash = ev.compiledRuntimeBytecodeStrippedHash || null;
  selectedCompilerSettings = ev.selectedCompilerSettings || null;
  matchEvidenceSummary = {
    file: 'r3tards-locked-supply-audit/locked-supply-output/lock_bytecode_match_evidence.json',
    generatedAt: ev.generatedAt || null,
    blockTag: ev.blockTag || null,
    solcVersion: ev.solcVersion || null,
    contractMatches,
    sourceMatches,
    chainMatches,
    exactRuntimeMatch: ev.exactRuntimeMatch === true,
    metadataStrippedRuntimeMatch: ev.metadataStrippedRuntimeMatch === true,
    selectedCompilerSettings,
    deployedRuntimeBytecodeHash: ev.deployedRuntimeBytecodeHash || null,
    deployedRuntimeBytecodeStrippedHash: ev.deployedRuntimeBytecodeStrippedHash || null,
    compiledRuntimeBytecodeHash,
    compiledRuntimeBytecodeStrippedHash
  };
  if (verified) {
    bytecodeProofBoundary = 'Deployed runtime bytecode has been compared against locally compiled runtime bytecode from the committed NFTTimeLock.sol source. Solidity metadata may differ, but metadata-stripped runtime bytecode matches, supporting deployed source equivalence for executable runtime logic.';
  }
}

const result = {
  generatedAt: deterministicGeneratedAt,
  script: 'verify-lock-bytecode.mjs',
  chain: CFG.chain,
  chainId: CFG.chainId,
  snapshotBlock: CFG.snapshotBlock,
  lockContract,
  sourceFile,
  sourcePresent,
  sourceSha256,
  sourceEquivalenceStatus,
  deployedBytecodeCompared,
  deployedBytecodeHash,
  compiledRuntimeBytecodeHash,
  compiledRuntimeBytecodeStrippedHash,
  selectedCompilerSettings,
  matchEvidencePresent,
  matchEvidenceSummary,
  stateReadPresent,
  stateReadSummary,
  proofBoundary: bytecodeProofBoundary,
  howToStrengthen: sourceEquivalenceStatus === 'verified_match' ? [
    'Keep lock_bytecode_match_evidence.json committed and checksummed.',
    'Have an external reviewer independently rerun npm run lock:fetch-bytecode and confirm the same selected compiler settings and metadata-stripped hash match.'
  ] : [
    'Verify source on a Monad explorer if source verification is supported.',
    'Run npm run lock:fetch-bytecode with RPC_URL and BLOCK_TAG=77822541.',
    'If no match is found, rerun with the exact compiler/settings used at deployment, then commit lock_bytecode_match_evidence.json only if sourceEquivalenceStatus becomes verified_match.'
  ]
};

fs.writeFileSync(path.join(OUT, 'lock_bytecode_verification.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ sourceEquivalenceStatus: result.sourceEquivalenceStatus, deployedBytecodeCompared: result.deployedBytecodeCompared }, null, 2));
