# r3tards Mint Proceeds Audit

Read-only mint proceeds audit for r3tards NFT on Monad.

Canonical snapshot block: `77,822,541`.

## Rebuild from committed snapshots

```bash
npm install --ignore-scripts
npm run rebuild
```

`npm run rebuild` runs `classify-mints.mjs`, which reads committed raw/CSV snapshots and regenerates:

- `mint-proceeds-output/mint_classification.csv`
- `mint-proceeds-output/mint_classification_summary.json`
- relevant fields in `mint-proceeds-output/summary.json`

## Fetch fresh indexed data

```bash
ETHERSCAN_API_KEY=YOUR_KEY RPC_URL=https://rpc.monad.xyz START_BLOCK=67220770 SNAPSHOT_BLOCK=77822541 npm run fetch
npm run rebuild
```

Fetches are read-only. Do not commit API keys.

## Final reconciled mint classification

| Classification | Count | MON | Evidence |
|---|---:|---:|---|
| `direct_paid_mint` | 705 | 234,765 | Native `tx.value` sent directly to NFT contract. |
| `router_paid_mint` | 160 | 53,280 | Internal native MON transfer into NFT contract in same mint transaction. |
| `free_mint` | 168 | 0 | No direct or internal native payment trace in committed evidence. |
| `unknown_unproven` | 0 | 0 | None after current reconciliation. |

Total proven paid mint proceeds: `288,045 MON`.

## Key output files

| File | Purpose |
|---|---|
| `mint-proceeds-output/mint_events_from_zero.csv` | ERC-721 mint events. |
| `mint-proceeds-output/mint_txs_with_native_value.csv` | Mint transaction metadata and native `tx.value`. |
| `mint-proceeds-output/raw_internal_txs_for_nft_contract.json` | Internal native MON transfers involving the NFT contract. |
| `mint-proceeds-output/mint_classification.csv` | Token-level classification/evidence. |
| `mint-proceeds-output/mint_classification_summary.json` | Summary and reconciliation. |
| `mint-proceeds-output/withdrawals_from_nft_contract.csv` | Native MON withdrawals from the NFT contract. |

## Withdrawal reconciliation

| Withdrawal | Amount |
|---|---:|
| Total withdrawn from NFT contract | 288,045 MON |
| Withdrawn to deployer wallet | 273,642.75 MON |
| Withdrawn to ArchetypePayouts / mint infrastructure payout contract | 14,402.25 MON |
| NFT contract native balance at snapshot | 0 MON |

Withdrawal reconciliation is a cross-check. Individual paid mint classification is backed by direct tx value or internal transfer evidence.
