# Claim Status

This file separates verified claims, high-confidence heuristic claims, source/test-supported claims, and claims that are not measured.

## Verified Claims

| Claim | Status | Evidence |
|---|---|---|
| Total minted lifetime supply is 1,033 NFTs | Verified | `r3tards-mint-proceeds-audit/mint-proceeds-output/mint_classification.csv` |
| Current supply at snapshot is 1,031 NFTs | Verified from burn accounting | `collection-info/burn_proofs.csv`, `r3tards-locked-supply-audit/locked-supply-output/burn_proofs.csv` |
| Mint proceeds are 288,045 MON gross | Verified by token-level classification | 705 direct paid mints + 160 router/internal paid mints in `mint_classification_summary.json` |
| Direct paid mints total 234,765 MON | Verified | `mint_classification_summary.json` |
| Router/internal paid mints total 53,280 MON | Verified from internal transfer evidence | `mint_classification.csv` |
| Free mints total 168 NFTs | Verified by token-level classification | `mint_classification_summary.json` |
| 35 NFTs are held by the locked team supply contract at snapshot | Verified | `locked_tokens.csv`, `locked_supply_summary.json` |
| Deployer net validator stake is 281,946.1742440292 MON | Verified by event formula and snapshot-bounded state/read evidence | `validator-stake-output/summary.json` |
| Validator/delegator state reads are at canonical snapshot block 77,822,541 | Verified | `validator-stake-output/summary.json`, `validator_state.json`, `specific_delegator_state.json` |
| Lock deployed bytecode/source equivalence | Verified match for executable runtime logic after Solidity metadata stripping | `lock_bytecode_verification.json`, `lock_bytecode_match_evidence.json` |

## Wallet-Control Attestation Claims

| Wallet-control claim | Status | Evidence |
|---|---|---|
| Owner-wallet key control | 0/4 cryptographically attested by owner signature; 4/4 pending attestation templates | `collection-info/wallet-attestations/*.json`, `collection-info/wallet_attestation_evidence.json` |

Pending attestation templates are not verified proof. A wallet-control claim becomes cryptographically attested only when the claimed owner address signs the canonical release-bound EIP-191 message from `config.json` and the verifier recovers the same address. This proves key control for that message only; it does not prove personal identity or beneficial ownership.

## High-Confidence Heuristic Claims

| Claim | Status | Evidence |
|---|---|---|
| Matched likely royalties are 78,483.61 MON-equivalent | Heuristic / high confidence | Inbound MON/WMON payments matched to secondary r3tards NFT transfers in `likely_royalties_evidence.csv` |

## Source/Test-Supported Claims

| Claim | Status | Evidence |
|---|---|---|
| Lock contract behavior requires owner-only withdrawal after unlock | Source/test-supported | `NFTTimeLock.sol`, `NFTTimeLockTest.t.sol`, Foundry test output |
| Lock duration is 3 years + 1 day from deployment timestamp | Source/test-supported; deployed state read strengthens this when present | `NFTTimeLock.sol`, `lock_contract_state_read.json` if present |

## Not Verified / Not Measured

| Claim | Status | Reason |
|---|---|---|
| Total royalties owed but unpaid | Not measured | Unpaid royalties never reached the wallet and cannot be counted from inbound transfer data alone |
| Exact marketplace royalty enforcement behavior for every sale | Not measured | Requires marketplace execution-level attribution beyond current scope |
| Profit | Not measured | Mint proceeds are gross value and do not subtract costs |
| Independent third-party review | Not present | No signed non-owner reviewer attestation is committed in `reviews/reviewer-attestations/` |
