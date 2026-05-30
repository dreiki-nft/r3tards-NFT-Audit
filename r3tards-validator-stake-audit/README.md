# Monad Validator Stake Audit v1.1

Fixes v1 raw precompile reads by using `eth_call` directly for Monad staking precompile methods.

# Monad Validator Stake Audit v1

Audits the MON staked on a Monad validator such as `forthenads`.

It collects three types of info:

1. **Current on-chain validator state** from Monad staking precompile `0x0000000000000000000000000000000000001000`.
2. **Optional delegator list + per-delegator stake** using `getDelegators()` and `getDelegator()`.
3. **Optional delegation event history** using Etherscan API V2 with Monad `chainid=143`.

## Install

```bash
cd monad-validator-stake-audit-v1
npm install --ignore-scripts
```

## Fast current stake by validator name

```bash
RPC_URL="https://rpc.monad.xyz" VALIDATOR_NAME="forthenads" npm run stake
```

If the script cannot find the validator by name from Gmonads, run it with the validator id:

```bash
RPC_URL="https://rpc.monad.xyz" VALIDATOR_ID=123 npm run stake
```

## Include indexed delegation event history

```bash
ETHERSCAN_API_KEY="YOUR_KEY" RPC_URL="https://rpc.monad.xyz" VALIDATOR_NAME="forthenads" START_BLOCK=67220770 API_DELAY_MS=500 npm run stake
```

## Include current delegator list

This can be slower if the validator has many delegators.

```bash
RPC_URL="https://rpc.monad.xyz" VALIDATOR_NAME="forthenads" INCLUDE_DELEGATORS=true RPC_DELAY_MS=100 npm run stake
```

## Snapshot block

For a fixed public snapshot, use:

```bash
RPC_URL="https://rpc.monad.xyz" VALIDATOR_NAME="forthenads" BLOCK_TAG=77822541 npm run stake
```

Note: historical staking precompile reads require the RPC to support historical state at that block. If it fails, use `BLOCK_TAG=latest` or omit `BLOCK_TAG`.

## Outputs

Files are written to `validator-stake-output/`:

- `summary.json`
- `validator_state.json`
- `gmonads_match.json`
- `delegators.csv` if `INCLUDE_DELEGATORS=true`
- `delegation_events.csv` if `ETHERSCAN_API_KEY` is provided
- `undelegation_events.csv` if `ETHERSCAN_API_KEY` is provided

## Good public wording

Use `consensusStakeMON` for stake currently securing consensus, and `executionStakeMON` for real-time current stake. Event totals are useful to show gross delegation activity over time, but current on-chain state is the authoritative snapshot.


## v1.2 specific delegator / deployer wallet check

By default the script reports total validator stake for the selected validator. To also check how much a single wallet has staked to that validator, pass `DELEGATOR_ADDRESS` or `DEPLOYER_WALLET`:

```bash
RPC_URL="https://rpc.monad.xyz" VALIDATOR_ID=154 DELEGATOR_ADDRESS="0x40Ea55E0b8f02f8eBc9D91e082e202ed988647fA" npm run stake
```

With an Etherscan API key, it also filters historical Delegate/Undelegate events for that specific wallet:

```bash
RPC_URL="https://rpc.monad.xyz" VALIDATOR_ID=154 DELEGATOR_ADDRESS="0x40Ea55E0b8f02f8eBc9D91e082e202ed988647fA" ETHERSCAN_API_KEY="YOUR_KEY" START_BLOCK=67220770 API_DELAY_MS=500 npm run stake
```

Outputs include `specific_delegator_state.json`, `specific_delegator_state.csv`, and, when API history is enabled, `specific_delegator_delegation_events.csv` / `specific_delegator_undelegation_events.csv`.
