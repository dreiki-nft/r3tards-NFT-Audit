# r3tards NFT Audit

Public read-only transparency package for the r3tards NFT collection on Monad.

This repository is meant to document what can be verified from committed on-chain/indexed data snapshots and what remains heuristic or unproven. It avoids treating project statements as proof unless there is supporting data in the repo.

## Scope

This package covers:

- mint proceeds and mint classification
- matched likely royalties received by the royalty/deployer wallet
- deployer-specific validator stake with `forthenads`
- official/project wallet attribution
- locked/team supply ownership proof
- community burn proofs
- reproducibility, validation, checksums, and safety notes

## Canonical snapshot

| Field | Value |
|---|---:|
| Chain | Monad |
| Chain ID | 143 |
| Collection | r3tards NFT |
| NFT contract | `0x200723A706de0013316E5cd8EBa2b3f53DD90c29` |
| Start block | `67,220,770` |
| Snapshot block | `77,822,541` |
| Deployer / royalty wallet | `0x40Ea55E0b8f02f8eBc9D91e082e202ed988647fA` |
| Validator | `forthenads` / ID `154` |

Canonical config is stored in [`config.json`](./config.json).

## Community report

- [Read the report online on Google Docs](https://docs.google.com/document/d/1HzrB5AHCRScR9vykAjGCIRnr5OLBu9H_MDQBsbDgKYg/edit?usp=sharing)
- [Download the report as DOCX](./r3tards-transparency.docx)
- [Download the report as PDF](./r3tards-transparency.pdf)

## Quick summary

| Category | Result | Proof status |
|---|---:|---|
| Total minted lifetime | 1,033 NFTs | Verified from ERC-721 mint events |
| Current supply at snapshot | 1,031 NFTs | Reconciled as 1,033 minted minus 2 transfers to dead address |
| Direct paid mints | 705 NFTs / 234,765 MON | Verified from direct tx value to NFT contract |
| Router/forwarder paid mints | 160 NFTs / 53,280 MON | Verified from internal native MON transfers to NFT contract |
| Free mints | 168 NFTs | Verified as minted with no native payment trace in committed evidence |
| Total proven paid mint proceeds | 288,045 MON | 234,765 + 53,280 MON |
| Matched likely royalties | 78,483.61 MON-equivalent | Heuristic match; see royalty limitations |
| Deployer-specific validator stake | 281,946.1742440292 MON | Recalculated from delegate/undelegate events and current state |
| Locked contract current holdings | 35 NFTs | Verified from ERC-721 ownership derivation |
| Lock date/rules | April 2029 claim | Not proven from decoded contract state in current repo |

## Reproduce the audit

Install with lifecycle scripts disabled:

```bash
npm install --ignore-scripts
```

Rebuild committed derived outputs from committed snapshots:

```bash
npm run rebuild
```

Validate consistency:

```bash
npm run validate
```

Regenerate checksums:

```bash
npm run checksums
```

Subfolder rebuilds:

```bash
cd r3tards-mint-proceeds-audit && npm run rebuild
cd r3tards-royalty-audit && npm run rebuild
cd r3tards-locked-supply-audit && npm run rebuild
```

Network fetches, when needed, require read-only environment variables. See `.env.example` files.

## Required environment variables for network fetches

| Variable | Required for | Notes |
|---|---|---|
| `ETHERSCAN_API_KEY` | indexed explorer/API fetches | Read-only API key. Do not commit it. |
| `RPC_URL` | RPC lookups | Defaults to `https://rpc.monad.xyz` in scripts where supported. |
| `START_BLOCK` | optional override | Canonical default is `67220770`. |
| `SNAPSHOT_BLOCK` / `END_BLOCK` | optional override | Canonical default is `77822541`; overrides produce non-canonical outputs. |

## Output files

### Mint proceeds

| File | Meaning |
|---|---|
| `r3tards-mint-proceeds-audit/mint-proceeds-output/mint_events_from_zero.csv` | ERC-721 mint events from zero address. |
| `r3tards-mint-proceeds-audit/mint-proceeds-output/mint_txs_with_native_value.csv` | Mint transaction values and high-level tx metadata. |
| `r3tards-mint-proceeds-audit/mint-proceeds-output/raw_internal_txs_for_nft_contract.json` | Indexed internal native MON transfers involving the NFT contract. |
| `r3tards-mint-proceeds-audit/mint-proceeds-output/mint_classification.csv` | Token-level mint classification and evidence. |
| `r3tards-mint-proceeds-audit/mint-proceeds-output/mint_classification_summary.json` | Mint classification totals and reconciliation. |
| `r3tards-mint-proceeds-audit/mint-proceeds-output/withdrawals_from_nft_contract.csv` | Native MON withdrawals from the NFT contract. |

### Royalties

| File | Meaning |
|---|---|
| `r3tards-royalty-audit/royalty-audit-v4-output/all_indexed_inbound_payments.csv` | All indexed inbound MON/WMON payments to the royalty wallet used as candidate payments. |
| `r3tards-royalty-audit/royalty-audit-v4-output/checked_payment_txs.jsonl` | Receipt-level checks for candidate payment transactions. |
| `r3tards-royalty-audit/royalty-audit-v4-output/likely_royalties.csv` | Compact matched likely royalty summary by transaction. |
| `r3tards-royalty-audit/royalty-audit-v4-output/likely_royalties_evidence.csv` | Evidence-oriented CSV with tx, asset, amount, token IDs, transfer parties, evidence, and confidence. |
| `r3tards-royalty-audit/royalty-audit-v4-output/summary.json` | Royalty totals and limitations. |

### Validator stake

| File | Meaning |
|---|---|
| `r3tards-validator-stake-audit/validator-stake-output/summary.json` | Validator and deployer-specific stake summary. |
| `r3tards-validator-stake-audit/validator-stake-output/specific_delegator_delegation_events.csv` | Deployer-specific delegate events. |
| `r3tards-validator-stake-audit/validator-stake-output/specific_delegator_undelegation_events.csv` | Deployer-specific undelegate events. |
| `r3tards-validator-stake-audit/validator-stake-output/specific_delegator_state.json` | Deployer-specific current staking state. |

### Locked supply and burns

| File | Meaning |
|---|---|
| `r3tards-locked-supply-audit/locked-supply-output/locked_tokens.csv` | Token IDs currently owned by the lock contract at snapshot. |
| `r3tards-locked-supply-audit/locked-supply-output/locked_supply_summary.json` | Locked supply proof summary and uncertainty. |
| `r3tards-locked-supply-audit/locked-supply-output/burn_proofs.csv` | Burn/dead-address token transfer proof. |
| `collection-info/official_wallets.csv` | Wallet labels, attribution, evidence source, and confidence. |
| `collection-info/burn_proofs.csv` | Community-facing burn proof file with txs and links. |

## Mint proceeds methodology

The mint proceeds claim is now token-level, not only a formula.

`mint_classification.csv` accounts for all 1,033 minted tokens:

| Classification | Count | Amount | Evidence |
|---|---:|---:|---|
| `direct_paid_mint` | 705 | 234,765 MON | Native `tx.value` sent directly to NFT contract. |
| `router_paid_mint` | 160 | 53,280 MON | Internal native MON transfer into NFT contract in same mint transaction. |
| `free_mint` | 168 | 0 MON | No direct or internal native payment trace found in committed evidence. |
| `unknown_unproven` | 0 | 0 MON | None after current reconciliation. |

Total proven paid mint proceeds:

```text
234,765 MON direct + 53,280 MON router/internal = 288,045 MON
```

The router/forwarder evidence includes transactions that call `0xdb9b1e94b5b69df7e401ddbede43491141047db3` and contain internal native MON transfers into the NFT contract. This repository proves the payment flow from committed internal transfer evidence. It does not require treating the router label itself as proof.

## Royalties methodology

Royalties are reported as **matched likely royalties**.

A payment is counted when:

1. an indexed inbound MON/WMON payment reaches the royalty wallet, and
2. the same transaction contains a secondary ERC-721 transfer for the r3tards NFT contract.

This produces:

| Source | Amount |
|---|---:|
| WMON normalized 1:1 | 22,950.598 MON-equivalent |
| Native MON internal transfers | 55,533.012 MON |
| Native MON direct transfers | 0 MON |
| Total matched likely royalties | 78,483.61 MON-equivalent |
| Matched likely royalty txs | 241 |

Limitations:

- False positives are possible if a non-royalty inbound payment occurs in the same transaction as a secondary transfer.
- False negatives are possible if royalties were paid through an unindexed route, another asset, or a different transaction.
- This does not prove enforcement; it documents matched receipts.

## Validator stake methodology

The deployer-specific validator stake is reported separately from revenue.

Formula from committed event outputs:

```text
317,501.1742440292 MON delegated
- 35,555 MON undelegated
= 281,946.1742440292 MON net delegated
```

Validator stake is not creator revenue. It is MON committed to validator operations.

## Official wallets

Official/project wallet labels are listed in [`collection-info/official_wallets.csv`](./collection-info/official_wallets.csv). Each row includes:

- address
- attribution
- evidence source
- confidence
- notes

The repo avoids implying custody/ownership beyond the documented attribution.

## Locked/team supply

The current repo verifies that the lock contract owns 35 NFTs at the snapshot block from ERC-721 transfer history.

The repo does **not** currently include decoded lock contract state or verified source proving:

- the exact unlock timestamp,
- beneficiary,
- admin/owner,
- withdrawal rules.

Therefore, use this wording:

> 35 NFTs are verified as currently held by the locked team supply contract at snapshot. The April 2029 unlock date is documented by the project, but the current repo does not include decoded contract-state proof of the unlock timestamp or withdrawal rules.

## Burn proofs

Two tokens are verified as transferred to the dead address by committed ERC-721 transfer events:

| Burn | Token ID | Tx |
|---|---:|---|
| #1 | 257 | `0x6e8d254e9a44a310814c73cae0271237e8f46157df5c05df3264ba4644b18032` |
| #2 | 296 | `0x465c8c18e0089db770bcdfe6e69603ae145eac4b62b82e900bbd6f4b7b35edc7` |

The mechanism documented here is transfer to `0x000000000000000000000000000000000000dEaD`, not a contract-level burn function.

## Verified, inferred, and unresolved claims

### Verified from committed data

- 1,033 ERC-721 mint events.
- 705 direct paid mints / 234,765 MON.
- 160 router/internal paid mints / 53,280 MON.
- 288,045 MON total proven paid mint proceeds.
- 241 matched likely royalty transactions totaling 78,483.61 MON-equivalent.
- 2 dead-address burn transfers.
- 35 NFTs currently held by the lock contract.
- Deployer-specific validator net delegated amount from event math.

### Inferred or heuristic

- Royalty matches are heuristic, based on same-transaction payment + secondary NFT transfer.
- Router/forwarder contract labels are inferred from transaction behavior unless external contract labels/source are added.
- Some wallet attributions are project-documented rather than cryptographically proven ownership claims.

### Not proven by current repo

- Exact lock unlock timestamp and withdrawal rules from decoded lock contract state/source.
- Complete marketplace attribution for every royalty payment.
- A per-delegator sum for the full `forthenads` validator.

## Data integrity

Checksums and row counts are in [`data/checksums.json`](./data/checksums.json).

Regenerate with:

```bash
npm run checksums
```

## Safety note

See [`SECURITY.md`](./SECURITY.md). Scripts are read-only and should never require private keys, seed phrases, signatures, token approvals, or a connected wallet.
