# Audit Fixes and Evidence Notes

This file records the defensive changes made after a skeptical review of the r3tards NFT audit repository.

## What was broken or weak

1. The mint proceeds claim used `865 x 333 MON = 288,045 MON`, but the old mint transaction CSV alone only showed `236,097 MON` as direct transaction value.
2. The missing amount was not clearly explained by the old public report.
3. Royalty matching was presented too strongly for a heuristic method.
4. Some scripts used `latest` or `999999999` instead of the canonical snapshot block.
5. Locked/team supply claimed an April 2029 lock, but the repo only had token ownership evidence and not decoded lock contract state proving unlock rules.
6. Rebuild/validation commands were not clearly separated from network fetch commands.
7. The repo needed a safety statement and reproducibility checks.

## What changed

### Mint proceeds

Added `r3tards-mint-proceeds-audit/classify-mints.mjs` and generated:

- `mint-proceeds-output/mint_classification.csv`
- `mint-proceeds-output/mint_classification_summary.json`

The new classification accounts for every minted token:

- `705` direct paid mints backed by direct transaction value to the NFT contract: `234,765 MON`.
- `160` router/forwarder paid mints backed by internal native MON transfers into the NFT contract: `53,280 MON`.
- `168` free mints with no native payment trace in committed evidence.
- `0` unknown/unproven mints after reconciling committed internal transfer evidence.

Total proven paid mint proceeds: `288,045 MON`.

The important router/forwarder evidence is not just a formula. It is token-level evidence in `mint_classification.csv` and transaction-level internal transfer evidence in `raw_internal_txs_for_nft_contract.json`.

### Royalty audit

Added `r3tards-royalty-audit/build-royalty-evidence.mjs` and generated:

- `royalty-audit-v4-output/likely_royalties_evidence.csv`

The royalty audit is now described as **matched likely royalties**, not exact enforced royalties. A match requires an inbound MON/WMON payment to the royalty wallet in the same transaction as a secondary r3tards ERC-721 transfer.

### Locked/team supply

Added `r3tards-locked-supply-audit/verify-locked-supply.mjs` and generated:

- `locked-supply-output/locked_tokens.csv`
- `locked-supply-output/burn_proofs.csv`
- `locked-supply-output/locked_supply_summary.json`

The repo now distinguishes:

- Verified: token ownership by the lock contract at snapshot.
- Not fully proven from current committed data: exact April 2029 unlock timestamp and withdrawal rules.

### Validator stake

Validator output now states the canonical snapshot block. The deployer-specific staking formula remains:

`317,501.1742440292 MON delegated - 35,555 MON undelegated = 281,946.1742440292 MON net delegated`.

### Official wallets and burns

Added:

- `collection-info/official_wallets.csv`
- `collection-info/burn_proofs.csv`

Official wallet labels now include attribution/evidence source/confidence rather than implying unsupported custody claims.

Burn proofs now identify token IDs, burn tx hashes, blocks, from/to, and burn mechanism.

### Reproducibility and integrity

Added:

- root `package.json`
- root `config.json`
- root `.env.example`
- `scripts/validate-audit.mjs`
- `scripts/generate-checksums.mjs`
- `data/checksums.json`
- `SECURITY.md`

## Claims that became stronger

- Mint proceeds are now supported by token-level classification plus direct/internal payment evidence.
- Royalty totals now have a per-transaction evidence CSV.
- Burned supply now has token-level proof from ERC-721 transfer events.
- Locked supply now has token-level current ownership proof.

## Claims that were weakened

- Royalties should be called **matched likely royalties**, not exact enforced royalties.
- The April 2029 locked-team-supply date should be described as a documented lock claim unless decoded contract state/source is added to prove the unlock timestamp and withdrawal rules.
- Official wallets should be described with attribution and confidence, not broad ownership claims.

## Remaining unresolved questions

- The exact verified source/ABI for the locked team supply contract is not committed here.
- The router/forwarder contract at `0xdb9b1e94b5b69df7e401ddbede43491141047db3` is identified in the repo by its on-chain behavior in these transactions. External sources associate this deterministic address with MetaMask Delegation Manager deployments on multiple chains, but the repo's proof only requires its internal transfer evidence into the NFT contract.
- Marketplace/contract attribution for royalty transactions is not fully decoded.

## Commands run / expected local commands

```bash
npm install --ignore-scripts
npm run rebuild
npm run validate
npm run checksums
```

Subfolder commands:

```bash
cd r3tards-mint-proceeds-audit && npm run rebuild
cd r3tards-royalty-audit && npm run rebuild
cd r3tards-locked-supply-audit && npm run rebuild
```

Fetch commands require read-only API/RPC environment variables. Rebuild commands use committed raw snapshots.
