import fs from 'node:fs';
import path from 'node:path';

const ZERO = '0x0000000000000000000000000000000000000000';
const DEFAULT_NFT = '0x200723A706de0013316E5cd8EBa2b3f53DD90c29';
const DEFAULT_DEPLOYER = '0x40Ea55E0b8f02f8eBc9D91e082e202ed988647fA';
const DEFAULT_RPC = 'https://rpc.monad.xyz';

const env = process.env;
const CFG = {
  etherscanApiKey: env.ETHERSCAN_API_KEY || '',
  chainId: env.CHAIN_ID || '143',
  rpcUrl: env.RPC_URL || DEFAULT_RPC,
  nftContract: (env.NFT_CONTRACT || DEFAULT_NFT).toLowerCase(),
  deployerWallet: (env.DEPLOYER_WALLET || DEFAULT_DEPLOYER).toLowerCase(),
  startBlock: Number(env.START_BLOCK || '0'),
  endBlock: Number(env.END_BLOCK || '999999999'),
  apiDelayMs: Number(env.API_DELAY_MS || '500'),
  rpcDelayMs: Number(env.RPC_DELAY_MS || '100'),
  outputDir: path.resolve(env.OUTPUT_DIR || './mint-proceeds-output'),
  rebuildOnly: String(env.REBUILD_ONLY || '').toLowerCase() === 'true',
  totalSupply: Number(env.TOTAL_SUPPLY || '1033'),
  actualFreeMintTokenCount: Number(env.ACTUAL_FREE_MINT_TOKEN_COUNT || '168'),
  mintPriceMON: Number(env.MINT_PRICE_MON || '333'),
};

const FILES = {
  rawNftTransfers: path.join(CFG.outputDir, 'raw_erc721_transfers_for_collection.json'),
  rawInternalTxs: path.join(CFG.outputDir, 'raw_internal_txs_for_nft_contract.json'),
  txDetailsJsonl: path.join(CFG.outputDir, 'mint_tx_details.jsonl'),
  mintEventsCsv: path.join(CFG.outputDir, 'mint_events_from_zero.csv'),
  mintTxsCsv: path.join(CFG.outputDir, 'mint_txs_with_native_value.csv'),
  withdrawalsCsv: path.join(CFG.outputDir, 'withdrawals_from_nft_contract.csv'),
  summary: path.join(CFG.outputDir, 'summary.json'),
};

function mkdirp(dir) { fs.mkdirSync(dir, { recursive: true }); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function lc(x) { return String(x || '').toLowerCase(); }
function isZero(x) { return lc(x) === ZERO; }
function nowIso() { return new Date().toISOString(); }

function requireApiKeyIfNeeded() {
  if (!CFG.rebuildOnly && !CFG.etherscanApiKey) {
    throw new Error('Missing ETHERSCAN_API_KEY. Example: ETHERSCAN_API_KEY="YOUR_KEY" START_BLOCK=67220770 npm run mint');
  }
}

function readJsonIfExists(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function writeJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, bigintReplacer, 2));
}
function bigintReplacer(_key, value) {
  return typeof value === 'bigint' ? value.toString() : value;
}

function appendJsonl(file, obj) {
  fs.appendFileSync(file, JSON.stringify(obj, bigintReplacer) + '\n');
}

function readJsonlMap(file, key = 'hash') {
  const map = new Map();
  if (!fs.existsSync(file)) return map;
  const txt = fs.readFileSync(file, 'utf8').trim();
  if (!txt) return map;
  for (const line of txt.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (obj && obj[key]) map.set(lc(obj[key]), obj);
    } catch {
      // ignore partial/corrupt line from an ugly crash
    }
  }
  return map;
}

function weiToDecimalString(weiLike, decimals = 18, precision = 18) {
  const wei = typeof weiLike === 'bigint' ? weiLike : BigInt(String(weiLike || '0'));
  const base = 10n ** BigInt(decimals);
  const whole = wei / base;
  const frac = wei % base;
  if (frac === 0n) return whole.toString();
  let fracStr = frac.toString().padStart(decimals, '0');
  fracStr = fracStr.slice(0, precision).replace(/0+$/, '');
  return `${whole.toString()}.${fracStr}`;
}

function decimalNumberFromWei(weiLike) {
  return Number(weiToDecimalString(weiLike, 18, 12));
}

function csvEscape(v) {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function writeCsv(file, rows, headers) {
  const out = [headers.join(',')];
  for (const row of rows) out.push(headers.map(h => csvEscape(row[h])).join(','));
  fs.writeFileSync(file, out.join('\n') + '\n');
}

async function etherscanAccountAction(action, extraParams = {}) {
  const params = new URLSearchParams({
    chainid: CFG.chainId,
    module: 'account',
    action,
    startblock: String(CFG.startBlock),
    endblock: String(CFG.endBlock),
    sort: 'asc',
    apikey: CFG.etherscanApiKey,
    ...Object.fromEntries(Object.entries(extraParams).map(([k, v]) => [k, String(v)])),
  });
  const url = `https://api.etherscan.io/v2/api?${params.toString()}`;

  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await fetch(url, { headers: { 'accept': 'application/json' } });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { status: '0', message: `Non-JSON HTTP ${res.status}`, result: text.slice(0, 500) }; }

    const message = String(json.message || '');
    const result = json.result;

    if (res.ok && Array.isArray(result)) return result;
    if (res.ok && json.status === '0' && /No transactions found/i.test(message)) return [];

    const isRate = /rate|limit|timeout|busy|NOTOK/i.test(message) || res.status === 429 || res.status >= 500;
    if (attempt < 6 && isRate) {
      const backoff = CFG.apiDelayMs * attempt * 2;
      console.warn(`[WARN] Etherscan ${action} attempt ${attempt} failed/rate-limited: ${message || res.status}. Retrying in ${backoff}ms...`);
      await sleep(backoff);
      continue;
    }

    throw new Error(`Etherscan ${action} failed: HTTP ${res.status}; message=${message}; result=${typeof result === 'string' ? result.slice(0, 500) : JSON.stringify(result).slice(0, 500)}`);
  }
}

async function fetchPagedAccountAction(action, extraParams = {}, label = action) {
  const cachedFile = action === 'tokennfttx' ? FILES.rawNftTransfers : action === 'txlistinternal' ? FILES.rawInternalTxs : null;
  if (cachedFile && fs.existsSync(cachedFile)) {
    console.log(`Using cached ${label}: ${cachedFile}`);
    return readJsonIfExists(cachedFile) || [];
  }

  const offset = Number(extraParams.offset || 10000);
  let page = 1;
  const all = [];

  while (true) {
    console.log(`Fetching ${label} page ${page}...`);
    const batch = await etherscanAccountAction(action, { ...extraParams, page, offset });
    all.push(...batch);
    console.log(`  got ${batch.length}, total ${all.length}`);
    await sleep(CFG.apiDelayMs);
    if (batch.length < offset) break;
    page += 1;
  }

  if (cachedFile) writeJson(cachedFile, all);
  return all;
}

async function rpc(method, params) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await fetch(CFG.rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
    });
    const json = await res.json().catch(async () => ({ error: { message: await res.text() } }));
    if (!json.error) return json.result;
    const msg = json.error?.message || JSON.stringify(json.error);
    if (attempt < 6) {
      const backoff = CFG.rpcDelayMs * attempt * 3;
      console.warn(`[WARN] RPC ${method} attempt ${attempt} failed: ${msg}. Retrying in ${backoff}ms...`);
      await sleep(backoff);
      continue;
    }
    throw new Error(`RPC ${method} failed: ${msg}`);
  }
}

async function getTxByHash(hash) {
  await sleep(CFG.rpcDelayMs);
  return rpc('eth_getTransactionByHash', [hash]);
}
async function getBalance(address, blockNumber) {
  const blockTag = blockNumber && blockNumber < 999999999 ? '0x' + BigInt(blockNumber).toString(16) : 'latest';
  try {
    const hex = await rpc('eth_getBalance', [address, blockTag]);
    return BigInt(hex || '0x0');
  } catch (e) {
    console.warn(`[WARN] Could not read contract balance at ${blockTag}: ${e.message}`);
    return null;
  }
}

function groupMintEvents(nftTransfers) {
  const mintEvents = nftTransfers.filter(ev => isZero(ev.from) && lc(ev.contractAddress || ev.contractaddress) === CFG.nftContract);
  const grouped = new Map();
  for (const ev of mintEvents) {
    const hash = lc(ev.hash);
    if (!grouped.has(hash)) {
      grouped.set(hash, {
        hash,
        blockNumber: Number(ev.blockNumber || 0),
        timeStamp: ev.timeStamp || '',
        tokenIds: [],
        recipients: new Set(),
        rawEvents: [],
      });
    }
    const g = grouped.get(hash);
    g.tokenIds.push(String(ev.tokenID ?? ev.tokenId ?? ''));
    g.recipients.add(lc(ev.to));
    g.rawEvents.push(ev);
  }
  return { mintEvents, grouped };
}

async function loadOrFetchMintTxDetails(groupedMints) {
  const details = readJsonlMap(FILES.txDetailsJsonl, 'hash');
  const hashes = Array.from(groupedMints.keys()).sort((a, b) => groupedMints.get(a).blockNumber - groupedMints.get(b).blockNumber);

  if (CFG.rebuildOnly) return details;

  let checked = 0;
  for (const hash of hashes) {
    if (details.has(hash)) continue;
    const meta = groupedMints.get(hash);
    let record;
    try {
      const tx = await getTxByHash(hash);
      if (!tx) throw new Error('RPC returned null transaction');
      const valueWei = BigInt(tx.value || '0x0');
      const to = lc(tx.to);
      const from = lc(tx.from);
      const methodSelector = tx.input && tx.input.length >= 10 ? tx.input.slice(0, 10) : '';
      const mintedCount = meta.tokenIds.length;
      record = {
        hash,
        ok: true,
        blockNumber: meta.blockNumber,
        timeStamp: meta.timeStamp,
        from,
        to,
        valueWei: valueWei.toString(),
        valueMON: weiToDecimalString(valueWei),
        mintedCount,
        recipients: Array.from(meta.recipients),
        tokenIds: meta.tokenIds,
        directToNFTContract: to === CFG.nftContract,
        viaOtherContract: to !== CFG.nftContract,
        methodSelector,
        pricePerTokenMON: mintedCount > 0 ? weiToDecimalString(valueWei / BigInt(mintedCount)) : '0',
      };
    } catch (e) {
      record = {
        hash,
        ok: false,
        blockNumber: meta.blockNumber,
        timeStamp: meta.timeStamp,
        error: e.message,
        mintedCount: meta.tokenIds.length,
        recipients: Array.from(meta.recipients),
        tokenIds: meta.tokenIds,
      };
    }
    appendJsonl(FILES.txDetailsJsonl, record);
    details.set(hash, record);
    checked += 1;
    if (checked % 25 === 0) console.log(`  tx details checked ${checked} new / ${hashes.length} total mint txs`);
  }
  return details;
}

function summarize({ mintEvents, groupedMints, txDetails, internalTxs, contractBalanceWei }) {
  const detailRows = Array.from(txDetails.values()).filter(x => groupedMints.has(lc(x.hash)));
  const okRows = detailRows.filter(x => x.ok);

  let grossAll = 0n;
  let grossDirect = 0n;
  let grossVia = 0n;
  let paidTxCount = 0;
  let paidTokenCount = 0;
  let freeTxCount = 0;
  let freeTokenCount = 0;
  const uniqueMinters = new Set();
  const uniqueRecipients = new Set();
  const selectorCounts = new Map();

  for (const row of okRows) {
    const value = BigInt(row.valueWei || '0');
    const mintedCount = Number(row.mintedCount || 0);
    grossAll += value;
    if (row.directToNFTContract) grossDirect += value;
    else grossVia += value;
    if (value > 0n) { paidTxCount += 1; paidTokenCount += mintedCount; }
    else { freeTxCount += 1; freeTokenCount += mintedCount; }
    if (row.from) uniqueMinters.add(lc(row.from));
    for (const r of row.recipients || []) uniqueRecipients.add(lc(r));
    const sel = row.methodSelector || '0x';
    selectorCounts.set(sel, (selectorCounts.get(sel) || 0) + 1);
  }

  const outgoingInternal = [];
  let internalOutTotal = 0n;
  let internalOutToDeployer = 0n;
  for (const itx of internalTxs || []) {
    const from = lc(itx.from);
    const to = lc(itx.to);
    const value = BigInt(String(itx.value || '0'));
    const isErr = String(itx.isError || '0') === '1';
    if (!isErr && from === CFG.nftContract && value > 0n) {
      internalOutTotal += value;
      if (to === CFG.deployerWallet) internalOutToDeployer += value;
      outgoingInternal.push({
        blockNumber: itx.blockNumber,
        timeStamp: itx.timeStamp,
        hash: itx.hash,
        from: itx.from,
        to: itx.to,
        valueWei: value.toString(),
        valueMON: weiToDecimalString(value),
        type: itx.type || '',
      });
    }
  }

  const methodSelectors = Array.from(selectorCounts.entries())
    .map(([methodSelector, count]) => ({ methodSelector, mintTxCount: count }))
    .sort((a, b) => b.mintTxCount - a.mintTxCount);

  const mintEventRows = mintEvents.map(ev => ({
    blockNumber: ev.blockNumber,
    timeStamp: ev.timeStamp,
    hash: lc(ev.hash),
    from: ev.from,
    to: ev.to,
    tokenID: ev.tokenID ?? ev.tokenId ?? '',
    tokenName: ev.tokenName || '',
    tokenSymbol: ev.tokenSymbol || '',
  }));

  const mintTxRows = okRows.map(row => ({
    blockNumber: row.blockNumber,
    timeStamp: row.timeStamp,
    hash: row.hash,
    from: row.from,
    to: row.to,
    valueWei: row.valueWei,
    valueMON: row.valueMON,
    mintedCount: row.mintedCount,
    pricePerTokenMON: row.pricePerTokenMON,
    directToNFTContract: row.directToNFTContract,
    viaOtherContract: row.viaOtherContract,
    methodSelector: row.methodSelector,
    recipients: (row.recipients || []).join('|'),
    tokenIds: (row.tokenIds || []).join('|'),
  }));

  const projectActualFreeMintTokenCount = CFG.actualFreeMintTokenCount;
  const projectNonFreeMintedTokenCount = Math.max(0, CFG.totalSupply - projectActualFreeMintTokenCount);
  const mintProceedsCollectedMON = projectNonFreeMintedTokenCount * CFG.mintPriceMON;

  const summary = {
    collection: 'r3tards NFT',
    chain: 'Monad',
    nftContract: DEFAULT_NFT,
    deployerWallet: DEFAULT_DEPLOYER,
    startBlock: CFG.startBlock,
    snapshotBlock: CFG.endBlock >= 999999999 ? null : CFG.endBlock,
    generatedAt: nowIso(),
    mint: {
      totalSupply: CFG.totalSupply,
      currentSupplyAtSnapshot: CFG.totalSupply - 2,
      mintEventsFromZero: mintEvents.length,
      uniqueMintTransactions: groupedMints.size,
      freeMintedNFTs: projectActualFreeMintTokenCount,
      nonFreeMintedNFTs: projectNonFreeMintedTokenCount,
      mintPriceMON: CFG.mintPriceMON,
      mintProceedsCollectedMON
    },
    withdrawals: {
      totalWithdrawnFromNFTContractWei: internalOutTotal.toString(),
      totalWithdrawnFromNFTContractMON: weiToDecimalString(internalOutTotal),
      withdrawnToDeployerWalletWei: internalOutToDeployer.toString(),
      withdrawnToDeployerWalletMON: weiToDecimalString(internalOutToDeployer),
      withdrawnToMintInfrastructurePayoutContractWei: (internalOutTotal - internalOutToDeployer).toString(),
      withdrawnToMintInfrastructurePayoutContractMON: weiToDecimalString(internalOutTotal - internalOutToDeployer),
      nftContractNativeBalanceWei: contractBalanceWei === null ? '0' : contractBalanceWei.toString(),
      nftContractNativeBalanceMON: contractBalanceWei === null ? '0' : weiToDecimalString(contractBalanceWei)
    },
    supportingData: {
      uniqueMintSenders: uniqueMinters.size,
      uniqueMintRecipients: uniqueRecipients.size,
      checkedMintTxCount: okRows.length,
      failedTxLookupCount: detailRows.filter(x => !x.ok).length
    },
    notes: [
      'Mint proceeds collected are calculated as non-free minted NFTs multiplied by mint price.',
      'Mint proceeds are gross value, not profit.',
      'Withdrawal figures are tracked separately from royalties and validator stake.'
    ]
  };

  return { summary, mintEventRows, mintTxRows, outgoingInternal };
}

async function main() {
  mkdirp(CFG.outputDir);
  requireApiKeyIfNeeded();

  console.log('\n=== Monad mint proceeds audit v5: indexed + crash-safe ===');
  console.log(`Chain ID:        ${CFG.chainId}`);
  console.log(`RPC:             ${CFG.rpcUrl}`);
  console.log(`NFT contract:    ${CFG.nftContract}`);
  console.log(`Deployer wallet: ${CFG.deployerWallet}`);
  console.log(`Block range:     ${CFG.startBlock} -> ${CFG.endBlock >= 999999999 ? 'latest indexed' : CFG.endBlock}`);
  console.log(`Output dir:      ${CFG.outputDir}`);

  let nftTransfers, internalTxs;
  if (CFG.rebuildOnly) {
    nftTransfers = readJsonIfExists(FILES.rawNftTransfers) || [];
    internalTxs = readJsonIfExists(FILES.rawInternalTxs) || [];
    if (!nftTransfers.length) throw new Error('REBUILD_ONLY=true but raw_erc721_transfers_for_collection.json is missing/empty.');
  } else {
    nftTransfers = await fetchPagedAccountAction('tokennfttx', {
      contractaddress: CFG.nftContract,
      page: 1,
      offset: 10000,
    }, 'ERC721 transfers for collection');

    internalTxs = await fetchPagedAccountAction('txlistinternal', {
      address: CFG.nftContract,
      page: 1,
      offset: 10000,
    }, 'internal txs for NFT contract');
  }

  const { mintEvents, grouped } = groupMintEvents(nftTransfers);
  console.log(`Mint Transfer events from zero: ${mintEvents.length}`);
  console.log(`Unique mint txs:                ${grouped.size}`);

  const txDetails = await loadOrFetchMintTxDetails(grouped);
  const contractBalanceWei = CFG.rebuildOnly ? null : await getBalance(CFG.nftContract, CFG.endBlock);

  const { summary, mintEventRows, mintTxRows, outgoingInternal } = summarize({
    mintEvents,
    groupedMints: grouped,
    txDetails,
    internalTxs,
    contractBalanceWei,
  });

  writeCsv(FILES.mintEventsCsv, mintEventRows, ['blockNumber', 'timeStamp', 'hash', 'from', 'to', 'tokenID', 'tokenName', 'tokenSymbol']);
  writeCsv(FILES.mintTxsCsv, mintTxRows, ['blockNumber', 'timeStamp', 'hash', 'from', 'to', 'valueWei', 'valueMON', 'mintedCount', 'pricePerTokenMON', 'directToNFTContract', 'viaOtherContract', 'methodSelector', 'recipients', 'tokenIds']);
  writeCsv(FILES.withdrawalsCsv, outgoingInternal, ['blockNumber', 'timeStamp', 'hash', 'from', 'to', 'valueWei', 'valueMON', 'type']);
  writeJson(FILES.summary, summary);

  console.log('\n=== SUMMARY ===');
  console.log(`Minted tokens from zero:           ${summary.mint.mintEventsFromZero}`);
  console.log(`Mint txs:                          ${summary.mint.uniqueMintTransactions}`);
  console.log(`Free-minted NFTs:                  ${summary.mint.freeMintedNFTs}`);
  console.log(`Non-free minted NFTs:              ${summary.mint.nonFreeMintedNFTs}`);
  console.log(`Mint price:                        ${summary.mint.mintPriceMON} MON`);
  console.log(`Mint proceeds collected:           ${summary.mint.mintProceedsCollectedMON} MON`);
  console.log(`Withdrawn from NFT contract:       ${summary.withdrawals.totalWithdrawnFromNFTContractMON} MON`);
  console.log(`Withdrawn to deployer wallet:      ${summary.withdrawals.withdrawnToDeployerWalletMON} MON`);
  console.log(`NFT contract native balance:       ${summary.withdrawals.nftContractNativeBalanceMON ?? 'not checked in rebuild'} MON`);
  console.log(`\nWrote: ${FILES.summary}`);
  console.log(`Wrote: ${FILES.mintTxsCsv}`);
  console.log(`Wrote: ${FILES.withdrawalsCsv}`);
}

main().catch(err => {
  console.error('\n[FATAL]', err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
