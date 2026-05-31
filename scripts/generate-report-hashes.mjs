import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const ROOT = process.cwd();
const files = ['r3tards-transparency.docx', 'r3tards-transparency.pdf', 'data/checksums.json'];
function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex');
}
const lines = files.map(file => `${sha256(file)} *${file}`).join('\n') + '\n';
fs.writeFileSync(path.join(ROOT, 'REPORT_HASHES.txt'), lines);
console.log(`Wrote ${path.join(ROOT, 'REPORT_HASHES.txt')} with ${files.length} entries.`);
