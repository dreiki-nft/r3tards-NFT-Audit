# Release Integrity

This file summarizes the internal verification gates for the canonical public audit snapshot. It is intentionally separate from the community-facing report so reviewers can quickly see what the repository itself enforces.

## Canonical release

- Release tag: `snapshot-77822541-v8`
- Snapshot block: `77,822,541`
- Chain: Monad mainnet, chain ID `143`

## Required local verification

A reviewer should be able to run:

```bash
npm run rebuild
npm run validate
```

The expected result for the canonical v8 package is:

```text
Validation complete: 0 failure(s), 0 warning(s).
```

## Internal proof gates enforced by validation

- Every non-excluded committed file is covered by `data/checksums.json`, except the intentionally circular files `data/checksums.json` and `REPORT_HASHES.txt`.
- `REPORT_HASHES.txt` pins the PDF, DOCX, and checksum manifest.
- Canonical release metadata must match `snapshot-77822541-v8` across `config.json`, `README.md`, and this file.
- Mint classification accounts for all `1,033` minted tokens and proves `288,045 MON` gross paid mint proceeds.
- Royalty evidence remains classified as matched likely royalty evidence, not guaranteed marketplace-enforced royalties.
- Validator event history is bounded to snapshot block `77,822,541`.
- Validator and specific-delegator state reads are recorded at snapshot block `77,822,541`.
- Locked supply proof verifies `35` NFTs held by the lock contract at snapshot.
- Lock contract deployed runtime bytecode has been compared against locally compiled runtime bytecode from the committed `NFTTimeLock.sol` source.
- The lock bytecode proof requires `sourceEquivalenceStatus: verified_match` and `metadataStrippedRuntimeMatch: true`.
- Wallet-control attestation evidence is rebuilt from committed template/signature files. Pending attestations are reported as pending and are not counted as verified.
- Reviewer attestation evidence is rebuilt from committed reviewer-signature files. Without a valid non-owner reviewer signature, the package continues to state that it is not independently reviewed.

## Remaining boundary

This repository is a self-contained public transparency and reproducibility package. It is not a third-party security audit, does not prove unpaid royalties, and does not claim exact marketplace attribution for every secondary sale.
