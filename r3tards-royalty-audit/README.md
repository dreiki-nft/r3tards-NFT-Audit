# r3tards Royalty Audit

Read-only matched likely royalty audit for r3tards NFT on Monad.

This audit is heuristic-based. It does **not** prove royalty enforcement. It counts inbound MON/WMON payments to the royalty wallet only when the same transaction also contains a secondary r3tards ERC-721 transfer.

## Rebuild from committed snapshots

```bash
npm install --ignore-scripts
npm run rebuild
```

This regenerates:

- `royalty-audit-v4-output/likely_royalties_evidence.csv`
- updated `royalty-audit-v4-output/summary.json`

## Fetch fresh indexed data

```bash
ETHERSCAN_API_KEY=YOUR_KEY RPC_URL=https://rpc.monad.xyz START_BLOCK=67220770 END_BLOCK=77822541 npm run fetch
npm run rebuild
```

If you run without `END_BLOCK=77822541`, mark the result as non-canonical.

## Current totals

| Metric | Value |
|---|---:|
| Matched likely royalty transactions | 241 |
| WMON normalized to MON-equivalent | 22,950.598 |
| Native MON internal transfers | 55,533.012 |
| Total matched likely royalties | 78,483.61 MON-equivalent |
| High-confidence same-tx matches | 241 |

## Limitations

- False positives are possible if unrelated inbound payments happen in the same tx as a secondary NFT transfer.
- False negatives are possible if royalties were paid through another route, asset, or transaction.
- Use the phrase `matched likely royalties`, not `exact royalties`, unless stronger marketplace/contract evidence is added.
