# Release Integrity

This file summarizes the internal verification gates for the canonical public audit snapshot. It is intentionally separate from the community-facing report so reviewers can quickly see what the repository itself enforces.

## Canonical release

- Release tag: `snapshot-77822541-v7`
- Snapshot block: `77,822,541`
- Chain: Monad mainnet, chain ID `143`

## Required local verification

A reviewer should be able to run:

```bash
npm run rebuild
npm run validate
```

The expected result for the canonical v6 package is:

```text
Validation complete: 0 failure(s), 0 warning(s).
```

## Internal proof gates enforced by validation

- Every non-excluded committed file is covered by `data/checksums.json`, except the intentionally circular files `data/checksums.json` and `REPORT_HASHES.txt`.
- `REPORT_HASHES.txt` pins the PDF, DOCX, and checksum manifest.
- Mint classification accounts for all `1,033` minted tokens and proves `288,045 MON` gross paid mint proceeds.
- Royalty evidence remains classified as matched likely royalty evidence, not guaranteed marketplace-enforced royalties.
- Validator event history is bounded to snapshot block `77,822,541`.
- Validator and specific-delegator state reads are recorded at snapshot block `77,822,541`.
- Locked supply proof verifies `35` NFTs held by the lock contract at snapshot.
- Lock contract deployed runtime bytecode has been compared against locally compiled runtime bytecode from the committed `NFTTimeLock.sol` source.
- The lock bytecode proof requires `sourceEquivalenceStatus: verified_match` and `metadataStrippedRuntimeMatch: true`.

## Remaining boundary

This repository is a self-contained public transparency and reproducibility package. It is not a third-party security audit, does not prove unpaid royalties, and does not claim exact marketplace attribution for every secondary sale.
