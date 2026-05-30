# r3tards Mint Proceeds Audit

Fast indexed audit for documenting r3tards NFT mint proceeds on Monad.

## Public headline numbers

Mint proceeds collected are calculated as `865 × 333 MON = 288,045 MON`.

| Metric | Value |
|---|---:|
| Total supply | 1,033 NFTs |
| Current supply at snapshot | 1,031 NFTs |
| Free-minted NFTs | 168 |
| Non-free minted NFTs | 865 |
| Mint price | 333 MON |
| Mint proceeds collected | 288,045 MON |

## Withdrawals from the NFT contract

| Withdrawal Metric | Value |
|---|---:|
| Total withdrawn from NFT contract | 288,045 MON |
| Withdrawn to deployer wallet | 273,642.75 MON |
| Withdrawn to ArchetypePayouts / mint infrastructure payout contract | 14,402.25 MON |
| NFT contract native balance at snapshot | 0 MON |

## What the script does

The script gathers public mint activity and writes reproducible output files:

- `mint-proceeds-output/summary.json`
- `mint-proceeds-output/mint_events_from_zero.csv`
- `mint-proceeds-output/mint_txs_with_native_value.csv`
- `mint-proceeds-output/withdrawals_from_nft_contract.csv`

The public-facing proceeds figure is based on the project mint classification: 865 non-free NFTs at 333 MON each.

## Install

```bash
npm install --ignore-scripts
```

## Run to current/latest indexed block

```bash
ETHERSCAN_API_KEY="YOUR_KEY_HERE" RPC_URL="https://rpc.monad.xyz" START_BLOCK=67220770 API_DELAY_MS=500 npm run mint
```

## Run to a fixed snapshot block

```bash
ETHERSCAN_API_KEY="YOUR_KEY_HERE" RPC_URL="https://rpc.monad.xyz" START_BLOCK=67220770 END_BLOCK=77822541 API_DELAY_MS=500 npm run mint
```

## Rebuild CSVs/summary from saved data

```bash
REBUILD_ONLY=true npm run rebuild
```

## Important interpretation

Mint proceeds are gross value, not profit. They do not subtract gas, refunds, infrastructure, art, marketing, or any other project costs.
