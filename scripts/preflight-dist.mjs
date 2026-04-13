import fs from 'node:fs';
import path from 'node:path';

const REQUIRED_FILES = [
  'build/icon.png',
  'build/icon.ico',
  'build/icon.icns'
];

const missing = [];
const tooSmall = [];

for (const relativePath of REQUIRED_FILES) {
  const absolutePath = path.resolve(relativePath);
  if (!fs.existsSync(absolutePath)) {
    missing.push(relativePath);
    continue;
  }

  const stats = fs.statSync(absolutePath);
  if (!stats.isFile() || stats.size < 1024) {
    tooSmall.push(relativePath);
  }
}

if (missing.length > 0 || tooSmall.length > 0) {
  console.error('❌ Distribution preflight failed.');
  if (missing.length > 0) {
    console.error(`  Missing files: ${missing.join(', ')}`);
  }
  if (tooSmall.length > 0) {
    console.error(`  Suspicious icon files (too small): ${tooSmall.join(', ')}`);
  }
  console.error('  Add real icon assets before running dist builds.');
  process.exit(1);
}

console.log('✅ Distribution preflight passed: all icon assets are present.');
