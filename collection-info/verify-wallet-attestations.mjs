import fs from 'fs';
import path from 'path';
import { verifyMessage, getAddress } from 'ethers';

const ROOT = path.resolve('..');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const GENERATED_AT = process.env.AUDIT_GENERATED_AT || CFG.reproducibleBuild?.generatedAt || 'snapshot-77822541';
const expectedOwners = (CFG.walletControlAttestations?.expectedOwnerAddresses || CFG.ownersFromProvidedSource || []).map(a => getAddress(a));
const canonicalMessage = CFG.walletControlAttestations?.canonicalMessage;
const attestationsDir = path.join(ROOT, CFG.walletControlAttestations?.attestationDirectory || 'collection-info/wallet-attestations');
const evidenceFile = path.join(ROOT, CFG.walletControlAttestations?.evidenceFile || 'collection-info/wallet_attestation_evidence.json');

function toRel(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

function safeReadJson(file) {
  try {
    return { ok: true, value: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
}

function emptyEvidence(reason) {
  return {
    generatedAt: GENERATED_AT,
    script: 'collection-info/verify-wallet-attestations.mjs',
    chain: CFG.chain,
    chainId: CFG.chainId,
    snapshotBlock: CFG.snapshotBlock,
    releaseTag: CFG.reproducibleBuild?.canonicalReleaseTag,
    canonicalMessage,
    expectedOwnerCount: expectedOwners.length,
    verifiedCount: 0,
    pendingCount: expectedOwners.length,
    invalidCount: 0,
    status: reason,
    attestations: expectedOwners.map(address => ({
      address,
      file: null,
      declaredStatus: 'pending_signature',
      recovered: null,
      messageMatches: false,
      addressMatches: false,
      signatureValid: false,
      status: 'pending_signature',
      notes: 'No attestation file was found for this owner address.'
    }))
  };
}

if (!canonicalMessage) {
  const evidence = emptyEvidence('missing_canonical_message');
  fs.writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ verified: 0, pending: expectedOwners.length, invalid: 0, status: evidence.status }, null, 2));
  process.exit(0);
}

const files = fs.existsSync(attestationsDir)
  ? fs.readdirSync(attestationsDir).filter(f => f.endsWith('.json')).sort((a, b) => a.localeCompare(b)).map(f => path.join(attestationsDir, f))
  : [];

const byAddress = new Map();
const malformed = [];
for (const file of files) {
  const parsed = safeReadJson(file);
  if (!parsed.ok) {
    malformed.push({ file: toRel(file), error: parsed.error });
    continue;
  }
  const att = parsed.value;
  let address = null;
  try {
    address = getAddress(att.address || '');
  } catch {
    malformed.push({ file: toRel(file), error: `invalid address: ${att.address || ''}` });
    continue;
  }
  byAddress.set(address.toLowerCase(), { file, att, address });
}

const attestations = [];
for (const expected of expectedOwners) {
  const row = byAddress.get(expected.toLowerCase());
  if (!row) {
    attestations.push({
      address: expected,
      file: null,
      declaredStatus: 'pending_signature',
      recovered: null,
      messageMatches: false,
      addressMatches: false,
      signatureValid: false,
      status: 'pending_signature',
      notes: 'No attestation file was found for this owner address.'
    });
    continue;
  }

  const att = row.att;
  const declaredStatus = String(att.status || 'pending_signature');
  const signedMessage = String(att.signedMessage || '');
  const signature = String(att.signature || '').trim();
  const messageMatches = signedMessage === canonicalMessage;
  let recovered = null;
  let signatureValid = false;
  let recoverError = null;

  if (signature) {
    try {
      recovered = getAddress(verifyMessage(signedMessage, signature));
      signatureValid = recovered.toLowerCase() === expected.toLowerCase() && messageMatches;
    } catch (error) {
      recoverError = String(error?.message || error);
    }
  }

  const addressMatches = recovered ? recovered.toLowerCase() === expected.toLowerCase() : false;
  const computedStatus = signatureValid ? 'verified' : (declaredStatus === 'pending_signature' && !signature ? 'pending_signature' : 'invalid');

  attestations.push({
    address: expected,
    file: toRel(row.file),
    declaredStatus,
    recovered,
    messageMatches,
    addressMatches,
    signatureValid,
    status: computedStatus,
    notes: computedStatus === 'verified'
      ? 'Signature recovers to the claimed owner address for the canonical message.'
      : computedStatus === 'pending_signature'
        ? 'Template pending a real owner signature; not counted as verified.'
        : 'Signature is absent, malformed, uses a non-canonical message, or recovers to a different address.',
    ...(recoverError ? { recoverError } : {})
  });
}

for (const malformedRow of malformed) {
  attestations.push({
    address: null,
    file: malformedRow.file,
    declaredStatus: 'invalid',
    recovered: null,
    messageMatches: false,
    addressMatches: false,
    signatureValid: false,
    status: 'invalid',
    notes: malformedRow.error
  });
}

const verifiedCount = attestations.filter(a => a.status === 'verified').length;
const pendingCount = attestations.filter(a => a.status === 'pending_signature').length;
const invalidCount = attestations.filter(a => a.status === 'invalid').length;
const evidence = {
  generatedAt: GENERATED_AT,
  script: 'collection-info/verify-wallet-attestations.mjs',
  chain: CFG.chain,
  chainId: CFG.chainId,
  snapshotBlock: CFG.snapshotBlock,
  releaseTag: CFG.reproducibleBuild?.canonicalReleaseTag,
  canonicalMessage,
  expectedOwnerCount: expectedOwners.length,
  verifiedCount,
  pendingCount,
  invalidCount,
  status: invalidCount > 0 ? 'has_invalid_attestations' : (verifiedCount === expectedOwners.length ? 'all_verified' : 'pending_signatures'),
  proofBoundary: 'This file verifies key control only for addresses with valid EIP-191 signatures over the canonical message. Pending templates are not counted as verified and do not prove personal identity or beneficial ownership.',
  attestations
};

fs.writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ verified: verifiedCount, pending: pendingCount, invalid: invalidCount, status: evidence.status }, null, 2));
