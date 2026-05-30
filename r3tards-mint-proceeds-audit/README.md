# Monad Mint Proceeds Audit v5.1

Fast indexed audit for estimating how much native MON was collected from the r3tards NFT mint.

This script does **not** crawl millions of blocks. It uses the Etherscan API V2 indexed ERC721 transfer endpoint on Monad (`chainid=143`) to find all NFT mint events, then checks each mint transaction's native `value` via RPC.

## What it calculates

- Total tokens minted from the zero address.
- Total mint transactions.
- Gross native MON sent in mint transactions.
- Direct-to-NFT mint proceeds, where the transaction `to` is the NFT contract.
- Mint value routed through other contracts, if any.
- Free mint token count.
- Paid mint token count.
- Average MON per paid token.
- Native MON withdrawals from the NFT contract, from indexed internal transactions.
- Native MON withdrawn from the NFT contract to the deployer/proceeds wallet.
- Current native MON balance of the NFT contract at the end/latest block.

## Install

```bash
cd ~/Desktop/monad-mint-proceeds-audit-v5.1
npm install --ignore-scripts
```

There are no package dependencies, so install should be very quick.

## Run to current/latest indexed block

```bash
ETHERSCAN_API_KEY="YOUR_KEY_HERE" RPC_URL="https://rpc.monad.xyz" START_BLOCK=67220770 API_DELAY_MS=500 npm run mint
```

## Run to a fixed snapshot block

```bash
ETHERSCAN_API_KEY="YOUR_KEY_HERE" RPC_URL="https://rpc.monad.xyz" START_BLOCK=67220770 END_BLOCK=77822541 API_DELAY_MS=500 npm run mint
```

## Crash-safe behavior

The script writes transaction lookup progress to:

```txt
mint-proceeds-output/mint_tx_details.jsonl
```

If it crashes or you stop it, rerun the same command. It will reuse saved API files and skip already checked mint txs.

Do **not** delete `mint-proceeds-output` unless you want to restart from zero.

## Rebuild CSVs/summary from saved data

```bash
REBUILD_ONLY=true npm run rebuild
```

## Important interpretation

The cleanest headline number is usually:

```txt
summary.json -> totals -> grossMintTxValueMON
```

For strict proceeds that went directly into the NFT contract, use:

```txt
summary.json -> totals -> grossDirectToNFTContractMON
```

If the collection minted directly through the NFT contract, these should be the same. If any mint went through another contract/router, the script separates those values.


Mint proceeds collected are calculated as `865 non-free NFTs × 333 MON = 288,045 MON`.

This is the public-facing mint proceeds number. It matches the total MON withdrawn from the NFT contract in the audit outputs. Mint proceeds are gross value, not profit.

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
