# r3tards NFT Audit

## Full Community Report

A full community-friendly report is available in multiple formats:

- [Read the report online on Google Docs](https://docs.google.com/document/d/1hRabjj9FTkvruwnQ0b9RVOFMttnZ51Ancz_LcISCy28/edit?usp=sharing)
- [Download the r3tards transparency report as DOCX](./r3tards-transparency.docx)
- [Download the r3tards transparency report as PDF](./r3tards-transparency.pdf)

## Quick Summary

| Category | Result |
|---|---:|
| Collection | r3tards NFT |
| Chain | Monad |
| Total Supply | 1,033 NFTs |
| Current Supply at Snapshot | 1,031 NFTs |
| Start Block | 67,220,770 |
| Snapshot Block | 77,822,541 |
| Mint Proceeds Collected | 288,045 MON |
| Royalties Actually Received | 78,483.61 MON-equivalent |
| Matched Royalty Transactions | 241 |
| Validator | forthenads |
| Validator ID | 154 |
| Validator Total Stake, Snapshot View | ~99,762,221 MON |
| Deployer-Specific Validator Stake | ~281,946 MON |
| Locked Team Supply Contract | Locked until April 2029 |

## Introduction

This audit was created to give the r3tards NFT community a clear, reproducible, and public view of the collection's on-chain transparency data.

The goal is simple: show what was collected, what was actually received, what was committed back into the ecosystem, and what the community can independently verify.

This repository separates the most important categories instead of mixing everything into one vague number:

- **Mint proceeds** — native MON attached to primary mint transactions.
- **Royalties actually received** — MON / WMON that actually reached the royalty wallet and matched r3tards secondary NFT activity.
- **Validator stake** — MON committed to the `forthenads` validator, reported separately because stake is not revenue.
- **Supply, wallets, locked allocation, and burns** — project context that helps the community verify what exists, what is locked, and what has been burned.

## Why This Matters

NFT founders and artists are expected to fund, build, reward holders, keep culture alive, and continue operating long after mint day.

At the same time, creator royalties are often optional or unenforced. That means the royalties a collection actually receives can be much lower than what the royalty setting might suggest.

This audit exists to separate assumptions from actual on-chain receipts.

## Key Findings

### Mint Proceeds

| Metric | Value |
|---|---:|
| Mint events from zero address | 1,033 NFTs |
| Unique mint transactions | 673 |
| Mint proceeds collected | 288,045 MON |
| Price per NFT | 333 MON |
| Non-free minted NFTs | 865 tokens |
| Non-free minted tokens | 865 tokens |
| Mint price | Removed pending corrected classification |
| Unique mint senders | 542 |
| Unique mint recipients | 642 |

The audit also tracked native MON moved out of the NFT contract:

| Withdrawal Metric | Value |
|---|---:|
| Total withdrawn from NFT contract | 288,045 MON |
| Withdrawn to deployer wallet | 273,642.75 MON |
| Withdrawn to 0xaafd...1199 | 14,402.25 MON |
| NFT contract native balance at snapshot | 0 MON |






Mint proceeds collected are calculated as `865 non-free NFTs × 333 MON = 288,045 MON`.

This is the public-facing mint proceeds number. It matches the total MON withdrawn from the NFT contract in the audit outputs. Mint proceeds are gross value, not profit.

Mint proceeds are gross value, not profit. They do not subtract gas, refunds, free mints, infrastructure, art, marketing, or any other cost.

### Royalties Actually Received

| Source | Amount |
|---|---:|
| WMON received | 22,950.598 WMON |
| Native MON, internal transfers | 55,533.012 MON |
| Native MON, direct transfers | 0 MON |
| Total matched royalties | 78,483.61 MON-equivalent |

| Matching Counter | Value |
|---|---:|
| Indexed inbound payments examined | 272 |
| Payments matched to r3tards NFT activity | 241 |
| Payments ignored, no matching NFT transfer | 31 |

Royalties are not estimated from ERC-2981 alone. A payment is only counted as a royalty if the inbound MON / WMON transfer shares a transaction hash with a secondary ERC-721 transfer from the r3tards contract.

### Validator Stake: forthenads

Whole-validator numbers include many independent delegators, not just r3tards.

| Validator Metric | Value |
|---|---:|
| Snapshot stake | 99,762,221.33 MON |
| Consensus stake | 99,752,286.82 MON |
| Execution stake | 99,540,162.70 MON |
| Unclaimed rewards, validator | 93,799.68 MON |
| Commission | 15% |
| Epoch | 1557 |

Deployer-specific stake:

| Deployer Staking Metric | Value |
|---|---:|
| Current stake | 281,946.17 MON |
| Gross delegated, by events | 317,501.17 MON |
| Gross undelegated, by events | 35,555 MON |
| Net delegated, by events | 281,946.17 MON |
| Delegate / undelegate events | 5 / 1 |
| Unclaimed rewards, deployer | 297.18 MON |

Validator stake is not project revenue. It represents MON committed to the Monad ecosystem through validator operations.

## Supply, Wallets & Burns

| Metric | Value |
|---|---:|
| Total supply | 1,033 NFTs |
| Current supply at snapshot | 1,031 NFTs |
| Community burns | 2 NFTs |

The current supply is lower than the total supply because 2 NFTs were burned by community members.

Additional collection transparency information is available here:

- [Supply, wallets, and burns](./collection-info/supply-wallets-and-burns.md)
- [Machine-readable collection info](./collection-info/collection-info.json)

## Reproduce the Audit

Each audit folder contains its own script and output files.

To rerun an audit, enter the relevant folder and install dependencies with:

```bash
npm install --ignore-scripts
```

Then follow the README inside each audit folder.

The main folders are:

- `r3tards-mint-proceeds-audit`
- `r3tards-royalty-audit`
- `r3tards-validator-stake-audit`
- `collection-info`

## Important Context

Mint proceeds are not the same as profit.

Royalties received are not the same as royalties owed.

Validator stake is not revenue.

This report separates each category so the community can understand the numbers without mixing them together.

## Limitations

- Indexed APIs can have indexing delays.
- The snapshot is accurate only up to block `77,822,541`.
- Unpaid royalties that never reached the wallet cannot appear in the royalty total.
- Mint proceeds count native MON only.
- Native and internal transfer detection depends on available indexed/internal transaction data.
- This is not legal, financial, accounting, or tax advice.

## Mint Proceeds

Mint proceeds collected are calculated as `865 × 333 MON = 288,045 MON`.

| Metric | Value |
|---|---:|
| Total supply | 1,033 NFTs |
| Current supply at snapshot | 1,031 NFTs |
| Free-minted NFTs | 168 |
| Non-free minted NFTs | 865 |
| Mint price | 333 MON |
| Mint proceeds collected | 288,045 MON |
