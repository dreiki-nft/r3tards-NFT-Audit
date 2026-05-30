#!/usr/bin/env node

/**
 * Monad Royalty Audit v4 — INDEXED API FAST MODE
 *
 * Strategy:
 * 1) Pull indexed incoming payments to the royalty wallet from Etherscan API V2 / Monad chainid=143:
 *    - WMON ERC20 transfers into royalty wallet
 *    - native MON internal transfers into royalty wallet
 *    - direct native MON normal txs into royalty wallet, for completeness
 * 2) For only those tx hashes, fetch tx receipts via RPC and check whether the tx also contains
 *    a secondary ERC721 Transfer from the r3tards NFT contract.
 * 3) Sum only confirmed matching txs.
 *
 * This is much faster than scanning all NFT Transfer logs across 10M+ blocks.
 */

import fs from "node:fs";
import path from "node:path";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const ERC721_TRANSFER_TOPIC0 = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const CONFIG = {
  API_BASE: env("ETHERSCAN_API_BASE", "https://api.etherscan.io/v2/api"),
  API_KEY: env("ETHERSCAN_API_KEY", ""),
  CHAIN_ID: env("CHAIN_ID", "143"),
  RPC_URL: env("RPC_URL", "https://rpc.monad.xyz"),
  START_BLOCK: Number(env("START_BLOCK", "67220770")),
  END_BLOCK: Number(env("END_BLOCK", "999999999")),
  OFFSET: Number(env("API_OFFSET", "1000")),
  API_DELAY_MS: Number(env("API_DELAY_MS", "250")),
  RPC_DELAY_MS: Number(env("RPC_DELAY_MS", "25")),
  OUTPUT_DIR: path.resolve(env("OUTPUT_DIR", "./royalty-audit-v4-output")),
  NFT_CONTRACT: lower(env("NFT_CONTRACT", "0x200723A706de0013316E5cd8EBa2b3f53DD90c29")),
  ROYALTY_WALLET: lower(env("ROYALTY_WALLET", "0x40Ea55E0b8f02f8eBc9D91e082e202ed988647fA")),
  WMON_ADDRESS: lower(env("WMON_ADDRESS", "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A")),
  REBUILD_ONLY: boolEnv("REBUILD_ONLY", false),
  INCLUDE_DIRECT_NATIVE_TXS: boolEnv("INCLUDE_DIRECT_NATIVE_TXS", true),
};

const FILES = {
  state: path.join(CONFIG.OUTPUT_DIR, "state.json"),
  journal: path.join(CONFIG.OUTPUT_DIR, "checked_payment_txs.jsonl"),
  rawWmon: path.join(CONFIG.OUTPUT_DIR, "raw_wmon_inbound.json"),
  rawInternal: path.join(CONFIG.OUTPUT_DIR, "raw_native_internal_inbound.json"),
  rawDirect: path.join(CONFIG.OUTPUT_DIR, "raw_native_direct_inbound.json"),
  allPaymentsCsv: path.join(CONFIG.OUTPUT_DIR, "all_indexed_inbound_payments.csv"),
  likelyCsv: path.join(CONFIG.OUTPUT_DIR, "likely_royalties.csv"),
  ignoredCsv: path.join(CONFIG.OUTPUT_DIR, "ignored_inbound_payments_no_matching_nft_transfer.csv"),
  summary: path.join(CONFIG.OUTPUT_DIR, "summary.json"),
};

function env(name, fallback) {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}
function boolEnv(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return ["1", "true", "yes", "y"].includes(String(v).toLowerCase());
}
function lower(v) { return String(v).toLowerCase(); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function writeJson(file, obj) { fs.writeFileSync(file, JSON.stringify(obj, null, 2)); }
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function appendJsonl(file, obj) { fs.appendFileSync(file, JSON.stringify(obj) + "\n"); }
function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function csvEscape(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function writeCsv(file, rows, columns) {
  const out = [columns.join(",")];
  for (const row of rows) out.push(columns.map((c) => csvEscape(row[c])).join(","));
  fs.writeFileSync(file, out.join("\n") + "\n");
}

function formatUnits18(raw) {
  const n = BigInt(raw || "0");
  const neg = n < 0n;
  const x = neg ? -n : n;
  const whole = x / 10n ** 18n;
  const frac = x % (10n ** 18n);
  let fracStr = frac.toString().padStart(18, "0").replace(/0+$/, "");
  const s = fracStr ? `${whole}.${fracStr}` : `${whole}`;
  return neg ? `-${s}` : s;
}
function decimalStringAdd(a, b) {
  return (BigInt(a || "0") + BigInt(b || "0")).toString();
}
function toNumberSafeDecimal18(raw) {
  return Number(formatUnits18(raw));
}
function sumRaw(rows, field = "rawValue") {
  return rows.reduce((acc, r) => acc + BigInt(r[field] || "0"), 0n).toString();
}

function topicToAddress(topic) {
  if (!topic || topic.length < 66) return "";
  return lower("0x" + topic.slice(-40));
}
function topicToTokenId(topic) {
  if (!topic) return "";
  try { return BigInt(topic).toString(); } catch { return topic; }
}

async function etherscanApi(params, attempt = 1) {
  const url = new URL(CONFIG.API_BASE);
  const all = {
    chainid: CONFIG.CHAIN_ID,
    apikey: CONFIG.API_KEY,
    ...params,
  };
  for (const [k, v] of Object.entries(all)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, { headers: { "accept": "application/json" } });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch {
    throw new Error(`Non-JSON Etherscan response HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  if (!res.ok) throw new Error(`Etherscan HTTP ${res.status}: ${JSON.stringify(json).slice(0, 500)}`);

  const msg = String(json.message || "");
  const result = json.result;

  if (json.status === "1" && Array.isArray(result)) return result;
  if (json.status === "0" && /No .*found/i.test(msg)) return [];

  const asString = typeof result === "string" ? result : JSON.stringify(result);
  const rateLimited = /rate limit|Max rate|timeout|busy|try again/i.test(msg + " " + asString);
  if (rateLimited && attempt <= 5) {
    const wait = CONFIG.API_DELAY_MS * attempt * 4;
    console.warn(`[WARN] Etherscan API rate/temporary issue. Waiting ${wait}ms and retrying... ${msg} ${asString}`);
    await sleep(wait);
    return etherscanApi(params, attempt + 1);
  }

  throw new Error(`Etherscan API error: status=${json.status} message=${msg} result=${asString}`);
}

async function fetchPaged(action, extraParams, label) {
  const rows = [];
  let page = 1;
  while (true) {
    const params = {
      module: "account",
      action,
      startblock: CONFIG.START_BLOCK,
      endblock: CONFIG.END_BLOCK,
      page,
      offset: CONFIG.OFFSET,
      sort: "asc",
      ...extraParams,
    };
    const batch = await etherscanApi(params);
    rows.push(...batch);
    console.log(`${label}: page ${page} -> ${batch.length} row(s), total ${rows.length}`);
    if (batch.length < CONFIG.OFFSET) break;
    page += 1;
    await sleep(CONFIG.API_DELAY_MS);
  }
  return rows;
}

async function rpc(method, params, attempt = 1) {
  const res = await fetch(CONFIG.RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch {
    throw new Error(`Non-JSON RPC response HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  if (json.error) {
    const msg = JSON.stringify(json.error);
    if (attempt <= 5 && /rate|timeout|busy|429|503|502|504/i.test(msg)) {
      const wait = 500 * attempt;
      console.warn(`[WARN] RPC temporary issue. Waiting ${wait}ms and retrying... ${msg}`);
      await sleep(wait);
      return rpc(method, params, attempt + 1);
    }
    throw new Error(`RPC error ${method}: ${msg}`);
  }
  return json.result;
}

async function getReceipt(hash) {
  return rpc("eth_getTransactionReceipt", [hash]);
}

function analyzeReceiptForNft(receipt) {
  const transfers = [];
  if (!receipt || !Array.isArray(receipt.logs)) {
    return { hasNftTransfer: false, hasSecondaryNftTransfer: false, nftTransferCount: 0, nftSecondaryTransferCount: 0, tokenIds: [] };
  }
  for (const log of receipt.logs) {
    if (lower(log.address) !== CONFIG.NFT_CONTRACT) continue;
    const topics = log.topics || [];
    if (lower(topics[0] || "") !== ERC721_TRANSFER_TOPIC0) continue;
    const from = topicToAddress(topics[1]);
    const to = topicToAddress(topics[2]);
    const tokenId = topicToTokenId(topics[3]);
    const secondary = from !== ZERO_ADDR && to !== ZERO_ADDR;
    transfers.push({ from, to, tokenId, secondary });
  }
  const secondary = transfers.filter((t) => t.secondary);
  return {
    hasNftTransfer: transfers.length > 0,
    hasSecondaryNftTransfer: secondary.length > 0,
    nftTransferCount: transfers.length,
    nftSecondaryTransferCount: secondary.length,
    tokenIds: transfers.map((t) => t.tokenId),
    secondaryTokenIds: secondary.map((t) => t.tokenId),
    transfers,
  };
}

function normalizeWmon(row) {
  return {
    paymentSource: "WMON_ERC20",
    blockNumber: Number(row.blockNumber),
    timeStamp: row.timeStamp || "",
    hash: lower(row.hash),
    from: lower(row.from),
    to: lower(row.to),
    tokenContract: lower(row.contractAddress),
    tokenSymbol: row.tokenSymbol || "WMON",
    rawValue: String(row.value || "0"),
    amountMON: formatUnits18(row.value || "0"),
    traceId: "",
    isError: row.isError || "0",
  };
}
function normalizeInternal(row) {
  return {
    paymentSource: "NATIVE_INTERNAL",
    blockNumber: Number(row.blockNumber),
    timeStamp: row.timeStamp || "",
    hash: lower(row.hash),
    from: lower(row.from),
    to: lower(row.to),
    tokenContract: "native",
    tokenSymbol: "MON",
    rawValue: String(row.value || "0"),
    amountMON: formatUnits18(row.value || "0"),
    traceId: row.traceId || "",
    isError: row.isError || "0",
  };
}
function normalizeDirect(row) {
  return {
    paymentSource: "NATIVE_DIRECT_TX",
    blockNumber: Number(row.blockNumber),
    timeStamp: row.timeStamp || "",
    hash: lower(row.hash),
    from: lower(row.from),
    to: lower(row.to),
    tokenContract: "native",
    tokenSymbol: "MON",
    rawValue: String(row.value || "0"),
    amountMON: formatUnits18(row.value || "0"),
    traceId: "",
    isError: row.isError || "0",
  };
}

function dedupePaymentRows(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const key = [r.paymentSource, r.hash, r.traceId, r.from, r.to, r.rawValue, r.tokenContract].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out.sort((a, b) => a.blockNumber - b.blockNumber || a.hash.localeCompare(b.hash));
}

function loadJournalByHash() {
  const rows = readJsonl(FILES.journal);
  const latest = new Map();
  for (const row of rows) latest.set(lower(row.hash), row);
  return latest;
}

function rebuildOutputs(allPayments) {
  const checksByHash = loadJournalByHash();

  const enriched = allPayments.map((p) => {
    const c = checksByHash.get(lower(p.hash));
    return {
      ...p,
      hasNftTransfer: c?.hasNftTransfer ?? "",
      hasSecondaryNftTransfer: c?.hasSecondaryNftTransfer ?? "",
      nftTransferCount: c?.nftTransferCount ?? "",
      nftSecondaryTransferCount: c?.nftSecondaryTransferCount ?? "",
      nftTokenIds: Array.isArray(c?.tokenIds) ? c.tokenIds.join(";") : "",
      nftSecondaryTokenIds: Array.isArray(c?.secondaryTokenIds) ? c.secondaryTokenIds.join(";") : "",
      receiptStatus: c?.receiptStatus ?? "",
      error: c?.error ?? "",
    };
  });

  const likely = enriched.filter((r) => r.hasSecondaryNftTransfer === true || r.hasSecondaryNftTransfer === "true");
  const ignored = enriched.filter((r) => !(r.hasSecondaryNftTransfer === true || r.hasSecondaryNftTransfer === "true"));

  const grouped = new Map();
  for (const r of likely) {
    const h = lower(r.hash);
    if (!grouped.has(h)) {
      grouped.set(h, {
        blockNumber: r.blockNumber,
        timeStamp: r.timeStamp,
        hash: h,
        sources: [],
        rawWmon: "0",
        rawNativeInternal: "0",
        rawNativeDirect: "0",
        rawTotal: "0",
        nftSecondaryTransferCount: r.nftSecondaryTransferCount,
        nftSecondaryTokenIds: r.nftSecondaryTokenIds,
      });
    }
    const g = grouped.get(h);
    if (!g.sources.includes(r.paymentSource)) g.sources.push(r.paymentSource);
    if (r.paymentSource === "WMON_ERC20") g.rawWmon = decimalStringAdd(g.rawWmon, r.rawValue);
    else if (r.paymentSource === "NATIVE_INTERNAL") g.rawNativeInternal = decimalStringAdd(g.rawNativeInternal, r.rawValue);
    else if (r.paymentSource === "NATIVE_DIRECT_TX") g.rawNativeDirect = decimalStringAdd(g.rawNativeDirect, r.rawValue);
    g.rawTotal = decimalStringAdd(g.rawTotal, r.rawValue);
  }

  const likelyGrouped = [...grouped.values()].map((g) => ({
    ...g,
    sources: g.sources.join("+"),
    wmonMON: formatUnits18(g.rawWmon),
    nativeInternalMON: formatUnits18(g.rawNativeInternal),
    nativeDirectMON: formatUnits18(g.rawNativeDirect),
    totalMONEquivalent: formatUnits18(g.rawTotal),
  })).sort((a, b) => a.blockNumber - b.blockNumber || a.hash.localeCompare(b.hash));

  const totalWmonRaw = likelyGrouped.reduce((a, g) => a + BigInt(g.rawWmon), 0n).toString();
  const totalNativeInternalRaw = likelyGrouped.reduce((a, g) => a + BigInt(g.rawNativeInternal), 0n).toString();
  const totalNativeDirectRaw = likelyGrouped.reduce((a, g) => a + BigInt(g.rawNativeDirect), 0n).toString();
  const totalRaw = likelyGrouped.reduce((a, g) => a + BigInt(g.rawTotal), 0n).toString();

  writeCsv(FILES.allPaymentsCsv, enriched, [
    "paymentSource", "blockNumber", "timeStamp", "hash", "from", "to", "tokenContract", "tokenSymbol",
    "rawValue", "amountMON", "traceId", "isError", "hasNftTransfer", "hasSecondaryNftTransfer",
    "nftTransferCount", "nftSecondaryTransferCount", "nftTokenIds", "nftSecondaryTokenIds", "receiptStatus", "error"
  ]);
  writeCsv(FILES.likelyCsv, likelyGrouped, [
    "blockNumber", "timeStamp", "hash", "sources", "wmonMON", "nativeInternalMON", "nativeDirectMON",
    "totalMONEquivalent", "rawWmon", "rawNativeInternal", "rawNativeDirect", "rawTotal",
    "nftSecondaryTransferCount", "nftSecondaryTokenIds"
  ]);
  writeCsv(FILES.ignoredCsv, ignored, [
    "paymentSource", "blockNumber", "timeStamp", "hash", "from", "to", "tokenSymbol", "amountMON",
    "hasNftTransfer", "hasSecondaryNftTransfer", "nftTransferCount", "nftTokenIds", "error"
  ]);

  const summary = {
    generatedAt: new Date().toISOString(),
    mode: "indexed-api-fast",
    chainId: CONFIG.CHAIN_ID,
    startBlock: CONFIG.START_BLOCK,
    endBlock: CONFIG.END_BLOCK,
    nftContract: CONFIG.NFT_CONTRACT,
    royaltyWallet: CONFIG.ROYALTY_WALLET,
    wmonAddress: CONFIG.WMON_ADDRESS,
    counts: {
      indexedInboundPaymentRows: allPayments.length,
      uniquePaymentTxs: new Set(allPayments.map((p) => lower(p.hash))).size,
      checkedPaymentTxs: checksByHash.size,
      likelyRoyaltyPaymentRows: likely.length,
      likelyRoyaltyTxs: likelyGrouped.length,
      ignoredInboundPaymentRows: ignored.length,
    },
    totals: {
      likelyWmonRaw: totalWmonRaw,
      likelyWmonMON: formatUnits18(totalWmonRaw),
      likelyNativeInternalRaw: totalNativeInternalRaw,
      likelyNativeInternalMON: formatUnits18(totalNativeInternalRaw),
      likelyNativeDirectRaw: totalNativeDirectRaw,
      likelyNativeDirectMON: formatUnits18(totalNativeDirectRaw),
      likelyTotalRaw: totalRaw,
      likelyTotalMONEquivalent: formatUnits18(totalRaw),
    },
    outputFiles: {
      allIndexedInboundPaymentsCsv: FILES.allPaymentsCsv,
      likelyRoyaltiesCsv: FILES.likelyCsv,
      ignoredInboundPaymentsCsv: FILES.ignoredCsv,
      receiptCheckJournal: FILES.journal,
    },
    note: "A tx is counted only if the indexed inbound payment to the royalty wallet shares a tx hash with a secondary ERC721 Transfer from the configured NFT contract. WMON is treated as 1:1 MON-equivalent.",
  };
  writeJson(FILES.summary, summary);
  return { summary, likelyGrouped, enriched };
}

async function main() {
  ensureDir(CONFIG.OUTPUT_DIR);
  console.log("\n=== Monad royalty audit v4: INDEXED API FAST MODE ===");
  console.log(`API base:        ${CONFIG.API_BASE}`);
  console.log(`Chain ID:        ${CONFIG.CHAIN_ID}`);
  console.log(`RPC:             ${CONFIG.RPC_URL}`);
  console.log(`NFT contract:    ${CONFIG.NFT_CONTRACT}`);
  console.log(`Royalty wallet:  ${CONFIG.ROYALTY_WALLET}`);
  console.log(`WMON address:    ${CONFIG.WMON_ADDRESS}`);
  console.log(`Block range:     ${CONFIG.START_BLOCK} -> ${CONFIG.END_BLOCK}`);
  console.log(`Output dir:      ${CONFIG.OUTPUT_DIR}`);

  const rawWmonSaved = readJson(FILES.rawWmon, null);
  const rawInternalSaved = readJson(FILES.rawInternal, null);
  const rawDirectSaved = readJson(FILES.rawDirect, null);

  let allPayments = [];

  if (CONFIG.REBUILD_ONLY) {
    console.log("\n[REBUILD_ONLY] Rebuilding CSVs and summary from saved raw JSON + journal...");
    if (!rawWmonSaved && !rawInternalSaved && !rawDirectSaved) throw new Error("No saved raw input files found.");
  } else {
    if (!CONFIG.API_KEY) {
      throw new Error("Missing ETHERSCAN_API_KEY. Create/use an Etherscan API V2 key and run ETHERSCAN_API_KEY=... npm run api");
    }
  }

  let rawWmon = rawWmonSaved;
  let rawInternal = rawInternalSaved;
  let rawDirect = rawDirectSaved;

  if (!CONFIG.REBUILD_ONLY) {
    if (!rawWmon) {
      console.log("\nFetching indexed WMON transfers into royalty wallet...");
      rawWmon = await fetchPaged("tokentx", {
        address: CONFIG.ROYALTY_WALLET,
        contractaddress: CONFIG.WMON_ADDRESS,
      }, "WMON inbound");
      writeJson(FILES.rawWmon, rawWmon);
    } else {
      console.log(`\nUsing saved WMON rows: ${rawWmon.length}`);
    }

    if (!rawInternal) {
      console.log("\nFetching indexed native MON internal transfers into royalty wallet...");
      rawInternal = await fetchPaged("txlistinternal", {
        address: CONFIG.ROYALTY_WALLET,
      }, "Native internal inbound");
      writeJson(FILES.rawInternal, rawInternal);
    } else {
      console.log(`\nUsing saved internal native rows: ${rawInternal.length}`);
    }

    if (CONFIG.INCLUDE_DIRECT_NATIVE_TXS) {
      if (!rawDirect) {
        console.log("\nFetching direct native MON transactions into royalty wallet, for completeness...");
        rawDirect = await fetchPaged("txlist", {
          address: CONFIG.ROYALTY_WALLET,
        }, "Native direct txs");
        writeJson(FILES.rawDirect, rawDirect);
      } else {
        console.log(`\nUsing saved direct native rows: ${rawDirect.length}`);
      }
    } else {
      rawDirect = [];
    }
  }

  rawWmon = rawWmon || [];
  rawInternal = rawInternal || [];
  rawDirect = rawDirect || [];

  const wmonPayments = rawWmon
    .filter((r) => lower(r.to) === CONFIG.ROYALTY_WALLET)
    .filter((r) => lower(r.contractAddress) === CONFIG.WMON_ADDRESS)
    .filter((r) => BigInt(r.value || "0") > 0n)
    .map(normalizeWmon);

  const internalPayments = rawInternal
    .filter((r) => lower(r.to) === CONFIG.ROYALTY_WALLET)
    .filter((r) => String(r.isError || "0") !== "1")
    .filter((r) => BigInt(r.value || "0") > 0n)
    .map(normalizeInternal);

  const directPayments = rawDirect
    .filter((r) => lower(r.to) === CONFIG.ROYALTY_WALLET)
    .filter((r) => String(r.isError || "0") !== "1")
    .filter((r) => BigInt(r.value || "0") > 0n)
    .map(normalizeDirect);

  allPayments = dedupePaymentRows([...wmonPayments, ...internalPayments, ...directPayments]);

  const txHashes = [...new Set(allPayments.map((r) => lower(r.hash)))].sort((a, b) => {
    const aa = allPayments.find((r) => lower(r.hash) === a)?.blockNumber || 0;
    const bb = allPayments.find((r) => lower(r.hash) === b)?.blockNumber || 0;
    return aa - bb || a.localeCompare(b);
  });

  console.log("\nIndexed inbound payment rows:");
  console.log(`  WMON ERC20 inbound:       ${wmonPayments.length}`);
  console.log(`  Native internal inbound:  ${internalPayments.length}`);
  console.log(`  Native direct inbound:    ${directPayments.length}`);
  console.log(`  Total payment rows:       ${allPayments.length}`);
  console.log(`  Unique payment txs:       ${txHashes.length}`);

  const checked = loadJournalByHash();
  console.log(`\nAlready receipt-checked txs from journal: ${checked.size}`);

  if (!CONFIG.REBUILD_ONLY) {
    let i = 0;
    for (const hash of txHashes) {
      i += 1;
      if (checked.has(hash)) continue;
      const paymentsInTx = allPayments.filter((r) => lower(r.hash) === hash);
      const block = paymentsInTx[0]?.blockNumber ?? "";
      try {
        const receipt = await getReceipt(hash);
        const analysis = analyzeReceiptForNft(receipt);
        const row = {
          checkedAt: new Date().toISOString(),
          hash,
          blockNumber: block,
          receiptStatus: receipt?.status ?? "",
          ...analysis,
          paymentRowsInTx: paymentsInTx.length,
          paymentSources: [...new Set(paymentsInTx.map((p) => p.paymentSource))],
          rawPaymentTotal: sumRaw(paymentsInTx),
          paymentTotalMONEquivalent: formatUnits18(sumRaw(paymentsInTx)),
          error: "",
        };
        appendJsonl(FILES.journal, row);
        checked.set(hash, row);
        if (analysis.hasSecondaryNftTransfer) {
          console.log(`  royalty found | block ${block} | ${row.paymentTotalMONEquivalent} MON-equivalent | ${hash}`);
        }
      } catch (err) {
        const row = {
          checkedAt: new Date().toISOString(),
          hash,
          blockNumber: block,
          receiptStatus: "",
          hasNftTransfer: false,
          hasSecondaryNftTransfer: false,
          nftTransferCount: 0,
          nftSecondaryTransferCount: 0,
          tokenIds: [],
          secondaryTokenIds: [],
          paymentRowsInTx: paymentsInTx.length,
          paymentSources: [...new Set(paymentsInTx.map((p) => p.paymentSource))],
          rawPaymentTotal: sumRaw(paymentsInTx),
          paymentTotalMONEquivalent: formatUnits18(sumRaw(paymentsInTx)),
          error: String(err?.message || err),
        };
        appendJsonl(FILES.journal, row);
        checked.set(hash, row);
        console.warn(`[WARN] receipt check failed for ${hash}: ${row.error}`);
      }

      if (i % 50 === 0) {
        writeJson(FILES.state, {
          updatedAt: new Date().toISOString(),
          checkedTxs: checked.size,
          totalTxs: txHashes.length,
          lastHash: hash,
        });
        rebuildOutputs(allPayments);
        console.log(`  checkpoint: checked ${checked.size}/${txHashes.length} payment txs`);
      }
      await sleep(CONFIG.RPC_DELAY_MS);
    }
  }

  const { summary } = rebuildOutputs(allPayments);
  writeJson(FILES.state, {
    updatedAt: new Date().toISOString(),
    checkedTxs: loadJournalByHash().size,
    totalTxs: txHashes.length,
    done: loadJournalByHash().size >= txHashes.length,
  });

  console.log("\n=== DONE ===");
  console.log(`Likely royalty txs:       ${summary.counts.likelyRoyaltyTxs}`);
  console.log(`Likely WMON:              ${summary.totals.likelyWmonMON}`);
  console.log(`Likely native internal:   ${summary.totals.likelyNativeInternalMON}`);
  console.log(`Likely native direct:     ${summary.totals.likelyNativeDirectMON}`);
  console.log(`Likely total MON-equiv:   ${summary.totals.likelyTotalMONEquivalent}`);
  console.log(`\nSummary: ${FILES.summary}`);
  console.log(`Likely royalties CSV: ${FILES.likelyCsv}`);
  console.log(`All payments CSV: ${FILES.allPaymentsCsv}`);
}

main().catch((err) => {
  console.error("\n[FATAL]", err?.stack || err?.message || err);
  console.error("\nIf raw API files or checked_payment_txs.jsonl were already written, rerun the same command to continue/rebuild.");
  process.exit(1);
});
