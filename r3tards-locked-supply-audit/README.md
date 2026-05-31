# r3tards Locked Supply Audit

Read-only locked supply and burn proof module for the r3tards NFT audit repo.

## What this module proves from committed data

- 35 NFTs are owned by the locked team supply contract at snapshot block `77,822,541`.
- 2 NFTs were transferred to the dead address and are counted as burns.
- The provided `NFTTimeLock.sol` source defines a 3-year-plus-1-day lock duration, four owner addresses, and owner-only withdrawals after unlock.
- The included deterministic Foundry test output records `31 passed`, `0 failed`, `0 skipped`.

## Important proof boundary

The source and tests prove the behavior of the provided source. The ownership CSV proves the lock contract currently holds the listed NFTs. Exact deployed `unlockTime`, deployed owner list, and `nftContract` can be read from Monad with the optional read-only RPC script.

This module does not ask for private keys, signatures, approvals, or wallet connections.

## Files

| File | Meaning |
|---|---|
| `contracts/NFTTimeLock.sol` | Provided lock contract source. |
| `test/NFTTimeLockTest.t.sol` | Provided deterministic Foundry tests. |
| `test-results/foundry-test-output.txt` | Recorded `forge test -v` summary showing 31 passed / 0 failed. |
| `test-results/foundry-test-output.png` | Screenshot of the local Foundry test run. |
| `locked-supply-output/locked_tokens.csv` | Token IDs owned by the lock contract at snapshot. |
| `locked-supply-output/burn_proofs.csv` | Token IDs transferred to the burn/dead address. |
| `locked-supply-output/lock_contract_source_analysis.json` | Static source/test evidence summary. |
| `locked-supply-output/locked_supply_summary.json` | Combined locked supply, source/test, and burn summary. |
| `locked-supply-output/lock_contract_state_read.json` | Optional output if `npm run fetch:state` is run locally. |

## Rebuild offline from committed raw snapshots

From repo root:

```bash
npm run lock:rebuild
```

Or from this folder:

```bash
npm run rebuild
```

## Optional deployed state read

This uses read-only `eth_call` calls through the RPC URL. It does not send transactions.

```bash
cd r3tards-locked-supply-audit
npm install --ignore-scripts
RPC_URL="https://rpc.monad.xyz" SNAPSHOT_BLOCK=77822541 npm run fetch:state
```

This writes:

```txt
locked-supply-output/lock_contract_state_read.json
```

## Foundry tests

The repo includes the provided test file. To run the tests in a Foundry project, place the test file under `test/NFTTimeLockTest.t.sol` and run:

```bash
forge test -v
```

Recorded result from the provided test run:

```txt
31 tests passed, 0 failed, 0 skipped
```

## Optional 96+ bytecode/source equivalence proof

The committed audit can prove token custody and source/test behavior offline. To additionally prove that the deployed timelock runtime bytecode matches the committed `NFTTimeLock.sol` source, run the online bytecode match step:

```bash
cd r3tards-locked-supply-audit
npm install
RPC_URL="https://rpc.monad.xyz" BLOCK_TAG=77822541 npm run fetch:bytecode
npm run rebuild
cd ..
npm run checksums
npm run validate
```

A successful match writes `locked-supply-output/lock_bytecode_match_evidence.json` and changes `lock_bytecode_verification.json` to `sourceEquivalenceStatus: "verified_match"`. The comparison allows Solidity metadata to differ but requires metadata-stripped deployed runtime bytecode to match the locally compiled runtime bytecode.

If the script does not find a match, do not claim deployed bytecode/source equivalence. Try again only with the exact compiler and optimizer settings used at deployment.
