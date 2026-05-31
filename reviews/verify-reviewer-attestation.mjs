import fs from 'fs';
import path from 'path';
import { verifyMessage, getAddress } from 'ethers';

const ROOT = path.resolve('..');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const GENERATED_AT = process.env.AUDIT_GENERATED_AT || CFG.reproducibleBuild?.generatedAt || 'snapshot-77822541';
const canonicalMessage = CFG.reviewerAttestations?.canonicalMessage || '';
const reviewDir = path.join(ROOT, CFG.reviewerAttestations?.attestationDirectory || 'reviews/reviewer-attestations');
const evidenceFile = path.join(ROOT, CFG.reviewerAttestations?.evidenceFile || 'reviews/reviewer_attestation_evidence.json');
const ownerSet = new Set((CFG.walletControlAttestations?.expectedOwnerAddresses || CFG.ownersFromProvidedSource || []).map(a => getAddress(a).toLowerCase()));

function toRel(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

function readJson(file) {
  try {
    return { ok: true, value: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
}

const files = fs.existsSync(reviewDir)
  ? fs.readdirSync(reviewDir).filter(f => f.endsWith('.json')).sort((a, b) => a.localeCompare(b)).map(f => path.join(reviewDir, f))
  : [];

const attestations = [];
for (const file of files) {
  const parsed = readJson(file);
  if (!parsed.ok) {
    attestations.push({ file: toRel(file), status: 'invalid', signatureValid: false, recovered: null, messageMatches: false, nonOwnerReviewer: false, notes: parsed.error });
    continue;
  }
  const att = parsed.value;
  const declaredStatus = String(att.status || 'pending_signature');
  const signedMessage = String(att.signedMessage || '');
  const signature = String(att.signature || '').trim();
  const messageMatches = signedMessage === canonicalMessage;
  let recovered = null;
  let recoverError = null;
  if (signature) {
    try {
      recovered = getAddress(verifyMessage(signedMessage, signature));
    } catch (error) {
      recoverError = String(error?.message || error);
    }
  }
  const nonOwnerReviewer = Boolean(recovered) && !ownerSet.has(recovered.toLowerCase());
  const referencesRelease = signedMessage.includes(CFG.reproducibleBuild?.canonicalReleaseTag || '') && signedMessage.includes(String(CFG.snapshotBlock));
  const signatureValid = Boolean(recovered) && messageMatches && nonOwnerReviewer && referencesRelease;
  const status = signatureValid ? 'verified_external_reviewer' : (declaredStatus === 'pending_signature' && !signature ? 'pending_signature' : 'invalid');
  attestations.push({
    file: toRel(file),
    declaredStatus,
    reviewerAddress: att.reviewerAddress || null,
    recovered,
    messageMatches,
    referencesRelease,
    nonOwnerReviewer,
    signatureValid,
    status,
    notes: status === 'verified_external_reviewer'
      ? 'Reviewer signature verifies to a non-owner address over the canonical reproduction message.'
      : status === 'pending_signature'
        ? 'Template/pending reviewer attestation; not counted as independent review.'
        : 'Reviewer attestation is absent, malformed, signed by an owner address, or not bound to the canonical message.',
    ...(recoverError ? { recoverError } : {})
  });
}

const verifiedCount = attestations.filter(a => a.status === 'verified_external_reviewer').length;
const pendingCount = attestations.filter(a => a.status === 'pending_signature').length;
const invalidCount = attestations.filter(a => a.status === 'invalid').length;
const evidence = {
  generatedAt: GENERATED_AT,
  script: 'reviews/verify-reviewer-attestation.mjs',
  chain: CFG.chain,
  chainId: CFG.chainId,
  snapshotBlock: CFG.snapshotBlock,
  releaseTag: CFG.reproducibleBuild?.canonicalReleaseTag,
  canonicalMessage,
  verifiedReviewerCount: verifiedCount,
  pendingReviewerCount: pendingCount,
  invalidReviewerCount: invalidCount,
  status: verifiedCount > 0 ? 'independently_reproduced_by_signed_reviewer' : 'no_signed_external_review',
  proofBoundary: 'Absence of a valid non-owner reviewer signature means the package remains self-contained and not independently reviewed. A valid signature verifies reproduction/key control for a reviewer address; it is not a broad security certification.',
  attestations
};

fs.writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ verifiedReviewers: verifiedCount, pendingReviewers: pendingCount, invalidReviewers: invalidCount, status: evidence.status }, null, 2));
