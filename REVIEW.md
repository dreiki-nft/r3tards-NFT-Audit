# Reviewer Reproduction Guide

This guide is for an external reviewer who wants to independently reproduce the canonical `r3tards-NFT-Audit` package for release `snapshot-77822541-v8`.

This is a reproducibility and transparency review guide. It is not, by itself, a third-party security audit.

## Canonical release parameters

| Field | Value |
|---|---:|
| Chain | Monad |
| Chain ID | `143` |
| Snapshot block | `77822541` |
| NFT contract | `0x200723A706de0013316E5cd8EBa2b3f53DD90c29` |
| Lock contract | `0xec823eaffa4584f482a0d9c3e634840d14066242` |
| Release tag | `snapshot-77822541-v8` |

## Clean install

Use lifecycle scripts disabled:

```bash
npm ci --ignore-scripts
```

Some sub-audits have their own lockfiles. Install those only when you intend to run their network-facing read-only fetchers:

```bash
cd r3tards-locked-supply-audit && npm ci --ignore-scripts && cd ..
cd r3tards-validator-stake-audit && npm ci --ignore-scripts && cd ..
```

## Offline rebuild and validation

```bash
npm run rebuild
npm run validate
```

Expected final output:

```text
Validation complete: 0 failure(s), 0 warning(s).
```

Re-running the rebuild should not change files:

```bash
npm run rebuild
git diff --exit-code
```

## Optional read-only bytecode fetch and match

This command refreshes the deployed lock bytecode/source-match evidence using a read-only Monad RPC call:

```bash
cd r3tards-locked-supply-audit
RPC_URL="https://rpc.monad.xyz" BLOCK_TAG=77822541 npm run fetch:bytecode
npm run rebuild
cd ..
npm run checksums
npm run validate
```

Expected validation output remains:

```text
Validation complete: 0 failure(s), 0 warning(s).
```

The committed bytecode evidence should keep:

```json
{
  "sourceEquivalenceStatus": "verified_match",
  "deployedBytecodeCompared": true,
  "metadataStrippedRuntimeMatch": true
}
```

## Wallet-attestation verification

Wallet-control attestations are verified offline from committed files. For this release, all four expected owner wallets have signed the canonical wallet-attestation message.

```bash
npm run attestations:verify
npm run validate
```

Expected current status for this release:

```text
wallet attestations verified 4/4; pending 0/4
```

The signatures prove key control for the canonical release-bound message only. They do not prove personal identity or beneficial ownership.

## Reviewer-attestation verification

External reviewer attestations are optional and only count if a committed signature verifies to a non-owner address over the canonical reviewer message from `config.json`.

```bash
npm run review:verify
npm run validate
```

Expected current status without a committed external reviewer signature:

```text
0 verified external reviewer attestations.
```

## Optional reviewer-attestation signing

Only an actual external reviewer should perform this step after independently running the reproduction commands above. Do not commit a reviewer attestation unless the reviewer address signs the exact canonical reviewer message from `config.json`:

```text
r3tards NFT audit independent reproduction attestation | chainId 143 | NFT 0x200723A706de0013316E5cd8EBa2b3f53DD90c29 | lock 0xec823eaffa4584f482a0d9c3e634840d14066242 | snapshot 77822541 | release snapshot-77822541-v8
```

A reviewer can create a JSON file under `reviews/reviewer-attestations/`, using [`reviews/REVIEWER_ATTESTATION_TEMPLATE.md`](./reviews/REVIEWER_ATTESTATION_TEMPLATE.md) as the source format, then run:

```bash
npm run review:verify
npm run validate
```

The reviewer verification only counts if the committed signature recovers to a non-owner address over the exact canonical reviewer message. A verified reviewer attestation is not a broad security certification.

## SHA256s to recompute

A reviewer should independently recompute and compare:

```bash
sha256sum r3tards-transparency.docx
sha256sum r3tards-transparency.pdf
sha256sum data/checksums.json
cat REPORT_HASHES.txt
```

Stable report-file SHA256s expected for this release:

```text
591ac27bc1573410213497a96355e430fff963c099ee6350928448ff35970984 *r3tards-transparency.docx
998fa3f4aef2d5884cf2b3ab0c70ee6cc288ee90349d6c9d56a1ca3c153a1be9 *r3tards-transparency.pdf
```

`data/checksums.json` is generated after every committed file update, so its SHA256 is intentionally pinned in `REPORT_HASHES.txt` rather than duplicated here. Recompute it with `sha256sum data/checksums.json` and compare to the third line of `REPORT_HASHES.txt`.

The checksum manifest itself must cover every non-excluded committed file except the intentionally circular files `data/checksums.json` and `REPORT_HASHES.txt`:

```bash
node scripts/validate-audit.mjs
```
