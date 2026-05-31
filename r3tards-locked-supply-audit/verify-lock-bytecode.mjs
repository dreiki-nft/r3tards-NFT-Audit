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
  sourceEquivalenceStatus: 'not_verified_by_repo',
  deployedBytecodeCompared: false,
  deployedBytecodeHash: null,
  compiledRuntimeBytecodeHash: null,
  stateReadPresent,
  stateReadSummary,
  proofBoundary: 'The repo includes source, tests, token custody proof, and optional deployed state reads. It does not currently prove exact deployed bytecode/source equivalence. Treat lock behavior as source/test-supported plus deployed-state-read-supported, not bytecode-equivalence-proven.',
  howToStrengthen: [
    'Verify source on a Monad explorer if source verification is supported.',
    'Compile NFTTimeLock.sol with the exact deployed compiler/settings and compare runtime bytecode after handling Solidity metadata/constructor args.',
    'Commit the comparison output only if sourceEquivalenceStatus becomes verified_match.'
  ]
};

fs.writeFileSync(path.join(OUT, 'lock_bytecode_verification.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ sourceEquivalenceStatus: result.sourceEquivalenceStatus, deployedBytecodeCompared: result.deployedBytecodeCompared }, null, 2));
