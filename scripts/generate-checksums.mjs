import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const ROOT = process.cwd();
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const OUT = path.join(ROOT, 'data');
fs.mkdirSync(OUT, { recursive: true });

const deterministicGeneratedAt = process.env.AUDIT_GENERATED_AT || CFG.reproducibleBuild?.generatedAt || 'snapshot-77822541';

// REPORT_HASHES.txt and data/checksums.json are excluded from this manifest to
// avoid circular hashing. REPORT_HASHES.txt separately pins data/checksums.json.
const EXCLUDED_DIRS = new Set(['.git', 'node_modules']);
const EXCLUDED_FILES = new Set(['data/checksums.json', 'REPORT_HASHES.txt']);

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function listAuditedFiles(dir = ROOT) {
  const out = [];
  for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, dirent.name);
    const rel = toPosix(path.relative(ROOT, full));
    if (dirent.isDirectory()) {
      if (EXCLUDED_DIRS.has(dirent.name)) continue;
      out.push(...listAuditedFiles(full));
    } else if (dirent.isFile()) {
      if (EXCLUDED_FILES.has(rel)) continue;
      out.push(rel);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function rowCount(file, text) {
  if (file.endsWith('.csv')) return Math.max(0, text.trim().split(/\r?\n/).filter(Boolean).length - 1);
  if (file.endsWith('.jsonl')) return text.trim().split(/\r?\n/).filter(Boolean).length;
  if (file.endsWith('.json')) {
    try {
      const j = JSON.parse(text);
      if (Array.isArray(j)) return j.length;
      if (Array.isArray(j.entries)) return j.entries.length;
      return null;
    } catch {
      return null;
    }
  }
  return null;
}

const entries = [];
for (const file of listAuditedFiles()) {
  const full = path.join(ROOT, file);
  const buf = fs.readFileSync(full);
  const text = buf.toString('utf8');
  entries.push({ file, sha256: sha256(buf), bytes: buf.length, rowCount: rowCount(file, text) });
}

const manifest = {
  generatedAt: deterministicGeneratedAt,
  generator: 'scripts/generate-checksums.mjs',
  deterministic: true,
  excluded: {
    directories: Array.from(EXCLUDED_DIRS).sort(),
    files: Array.from(EXCLUDED_FILES).sort()
  },
  note: 'Hashes are recomputed from every committed file except excluded directories/files. REPORT_HASHES.txt is excluded to avoid circular hashing and separately pins data/checksums.json.',
  entries
};
fs.writeFileSync(path.join(OUT, 'checksums.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote ${path.join(OUT, 'checksums.json')} with ${entries.length} entries.`);
