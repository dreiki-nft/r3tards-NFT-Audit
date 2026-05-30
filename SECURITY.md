# Security and Safety

This repository is intended to be a read-only transparency/audit package.

## What the scripts do

- Read committed CSV/JSON evidence files.
- Optionally fetch public blockchain/indexer data using a read-only RPC/API key.
- Write local CSV/JSON/Markdown outputs inside the repository folder.

## What the scripts do not do

- They do not request private keys, seed phrases, wallet signatures, or wallet connections.
- They do not send transactions.
- They do not ask for token approvals.
- They do not use `eval` or obfuscated code.
- They do not intentionally write outside the repository.

## API keys

Some fetch scripts can use `ETHERSCAN_API_KEY` for indexed public data. This is a read-only API key and should be supplied through environment variables or a local `.env` file that is not committed.

Never commit real API keys or private RPC URLs.

## Dependency notes

The committed scripts are plain Node.js ESM scripts and use only built-in Node modules unless a subfolder package explicitly states otherwise. Install with:

```bash
npm install --ignore-scripts
```

This avoids running dependency lifecycle scripts.

## Reporting issues

If a script appears to request a wallet signature, private key, seed phrase, transaction approval, or token approval, treat that as a security issue and do not run it.
