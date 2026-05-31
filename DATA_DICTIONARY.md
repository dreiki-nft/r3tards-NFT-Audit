# Data Dictionary

## Mint Proceeds

### `r3tards-mint-proceeds-audit/mint-proceeds-output/mint_classification.csv`

Token-level mint classification file.

| Column | Meaning |
|---|---|
| `token_id` | NFT token ID minted |
| `mint_tx_hash` | Transaction hash where the token was minted |
| `mint_block` | Block number of mint transaction |
| `minter` / `recipient` | Wallet receiving the minted NFT |
| `collection_contract` | r3tards NFT contract |
| `tx_from` | Transaction sender |
| `tx_to` | Transaction target |
| `tx_value_mon` | Native MON attached directly to the transaction |
| `classification` | Mint classification such as `direct_paid_mint`, `router_paid_mint`, or `free_mint` |
| `evidence_type` | Evidence supporting the classification |
| `evidence_tx_hash` | Evidence transaction hash |
| `evidence_contract` | Contract involved in the evidence path |
| `amount_mon_attributed` | MON amount attributed to the minted token |
| `notes` | Extra context |

### `mint_classification_summary.json`

Summary of token-level mint classification.

Public mint proceeds number:

```txt
705 direct paid mints = 234,765 MON
160 router/internal paid mints = 53,280 MON
168 free mints = 0 MON
Total proven paid mint proceeds = 288,045 MON
```

## Royalties

### `r3tards-royalty-audit/royalty-audit-v4-output/likely_royalties_evidence.csv`

Matched likely royalty payments.

A payment is counted when inbound MON/WMON reaches the royalty wallet in the same transaction as a secondary r3tards NFT transfer.

This is high-confidence heuristic evidence, not marketplace-level royalty enforcement proof.

## Validator Stake

### `r3tards-validator-stake-audit/validator-stake-output/summary.json`

Contains validator and deployer-specific staking values.

Formula:

```txt
317,501.1742440292 MON delegated
- 35,555 MON undelegated
= 281,946.1742440292 MON net delegated
```

## Locked Supply

### `r3tards-locked-supply-audit/locked-supply-output/locked_tokens.csv`

Lists token IDs held by the locked team supply contract at the snapshot.

### `lock_contract_source_analysis.json`

Summarizes source-level lock behavior from `NFTTimeLock.sol`.

### `lock_contract_state_read.json`

Optional deployed state read. When present, it records deployed lock contract readable state at the snapshot or requested block.

## Burns

### `collection-info/burn_proofs.csv`

Documents community burn transactions and proof links.

## Checksums

### `data/checksums.json`

Contains SHA256 hashes and row counts for important committed files.
