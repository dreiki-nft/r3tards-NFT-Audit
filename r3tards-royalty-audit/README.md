# Monad Royalty Audit v4 — Indexed API Fast Mode

This version is built to avoid the slow full-chain RPC crawl.

Instead of scanning 10M+ blocks for NFT transfers, it does this:

1. Uses **Etherscan API V2** with Monad `chainid=143` to fetch indexed inbound payments to your royalty wallet:
   - WMON ERC20 transfers into the wallet
   - native MON internal transfers into the wallet
   - direct native MON transfers into the wallet, for completeness
2. For only those payment transaction hashes, it fetches the transaction receipt from RPC.
3. It counts the payment as a likely royalty only if that same transaction also contains a **secondary ERC721 Transfer** from the r3tards NFT contract.

That means this should be much faster than v3.

## Configured defaults

```txt
NFT contract:    0x200723A706de0013316E5cd8EBa2b3f53DD90c29
Royalty wallet:  0x40Ea55E0b8f02f8eBc9D91e082e202ed988647fA
WMON:            0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A
Monad chain ID:  143
Start block:     67220770
RPC:             https://rpc.monad.xyz
```

## Step 1 — get an Etherscan API key

MonadScan uses Etherscan infrastructure. Etherscan API V2 is unified across supported chains, so a normal Etherscan API key should work with `chainid=143`.

Create/get a key from your Etherscan account dashboard.

## Step 2 — install

In Git Bash:

```bash
cd ~/Desktop/monad-royalty-audit-v4-indexed
npm install --ignore-scripts
```

There are no runtime package dependencies, but `npm install` is harmless and keeps the workflow familiar.

## Step 3 — run fast indexed audit

Use your actual latest end block if you want a fixed audit snapshot:

```bash
ETHERSCAN_API_KEY="YOUR_KEY_HERE" RPC_URL="https://rpc.monad.xyz" START_BLOCK=67220770 END_BLOCK=77822541 npm run api
```

Or omit `END_BLOCK` to scan to the API default max:

```bash
ETHERSCAN_API_KEY="YOUR_KEY_HERE" RPC_URL="https://rpc.monad.xyz" START_BLOCK=67220770 npm run api
```

## Output

The script writes:

```txt
royalty-audit-v4-output/summary.json
royalty-audit-v4-output/likely_royalties.csv
royalty-audit-v4-output/all_indexed_inbound_payments.csv
royalty-audit-v4-output/ignored_inbound_payments_no_matching_nft_transfer.csv
royalty-audit-v4-output/checked_payment_txs.jsonl
```

The number for your tweet/post is:

```txt
royalty-audit-v4-output/summary.json
→ totals.likelyTotalMONEquivalent
```

## Crash safety / resume

The receipt-checking phase writes continuously to:

```txt
royalty-audit-v4-output/checked_payment_txs.jsonl
```

If the script crashes, rerun the same command. Already checked txs are skipped.

To rebuild CSVs and summary from saved API JSON + journal:

```bash
REBUILD_ONLY=true npm run rebuild
```

## Rate limit tuning

If the API says rate-limited, slow it down:

```bash
ETHERSCAN_API_KEY="YOUR_KEY_HERE" API_DELAY_MS=1000 RPC_DELAY_MS=100 START_BLOCK=67220770 END_BLOCK=77822541 npm run api
```

If Etherscan free tier returns only 1,000 rows per page, keep the default:

```txt
API_OFFSET=1000
```

## Why this is faster than v3

v3 asks the public RPC for NFT Transfer logs across every block range. Monad public RPC was forcing tiny ranges, which made the scan crawl.

v4 asks indexed APIs: “show me payments into my royalty wallet.” Then it checks only those txs for NFT transfers.

That reduces the search space massively.
