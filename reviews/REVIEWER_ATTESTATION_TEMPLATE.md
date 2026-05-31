# Reviewer Attestation Template

This template is for an external reviewer who independently reproduces the canonical audit package.
Do not fill this out unless you personally ran the commands in `REVIEW.md` against the canonical release.

## Canonical reviewer message

Sign this exact message with EIP-191 `personal_sign` / `signMessage` from a reviewer wallet that is **not** one of the project owner wallets:

```text
r3tards NFT audit independent reproduction attestation | chainId 143 | NFT 0x200723A706de0013316E5cd8EBa2b3f53DD90c29 | lock 0xec823eaffa4584f482a0d9c3e634840d14066242 | snapshot 77822541 | release snapshot-77822541-v8
```

## JSON file format

Commit a file under `reviews/reviewer-attestations/`, for example `reviews/reviewer-attestations/reviewer-0xabc.json`:

```json
{
  "schema": "r3tards-external-reviewer-attestation-v1",
  "status": "verified_external_reviewer",
  "reviewerAddress": "0x0000000000000000000000000000000000000000",
  "signedMessage": "r3tards NFT audit independent reproduction attestation | chainId 143 | NFT 0x200723A706de0013316E5cd8EBa2b3f53DD90c29 | lock 0xec823eaffa4584f482a0d9c3e634840d14066242 | snapshot 77822541 | release snapshot-77822541-v8",
  "signature": "0x...",
  "reviewScope": "I independently reproduced npm run rebuild and npm run validate for the canonical release and observed 0 failures / 0 warnings.",
  "notes": "This attests reproduction of this package, not a full security audit."
}
```

`reviews/verify-reviewer-attestation.mjs` checks that the signature recovers to a non-owner address and that the signed message equals the canonical release/snapshot message from `config.json`.
