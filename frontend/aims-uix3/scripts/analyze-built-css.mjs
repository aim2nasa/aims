import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const distDir = join(import.meta.dirname, '..', 'dist', 'assets');
const cssFile = readdirSync(distDir).find(f => f.endsWith('.css'));
const css = readFileSync(join(distDir, cssFile), 'utf-8');

console.log('CSS file:', cssFile);
console.log('Total length:', css.length, 'chars');
console.log('');

// Find @layer declarations (order statements like: @layer a, b, c;)
const layerDeclRegex = /@layer\s+[\w][\w,\s]+;/g;
let m;
console.log('=== @layer ORDER declarations ===');
while ((m = layerDeclRegex.exec(css)) !== null) {
  console.log(`  Position ${m.index}: ${m[0].substring(0, 200)}`);
}

// Find first occurrence of each @layer block
console.log('');
console.log('=== First @layer BLOCK positions ===');
const layers = ['reset', 'tokens', 'theme', 'base', 'utilities', 'components', 'views', 'responsive'];
for (const layer of layers) {
  const patterns = [
    `@layer ${layer}{`,
    `@layer ${layer} {`,
  ];
  let pos = -1;
  for (const p of patterns) {
    const idx = css.indexOf(p);
    if (idx !== -1 && (pos === -1 || idx < pos)) pos = idx;
  }
  if (pos !== -1) {
    console.log(`  @layer ${layer}: position ${pos} (${(pos / css.length * 100).toFixed(1)}%)`);
  } else {
    console.log(`  @layer ${layer}: NOT FOUND`);
  }
}

// Show first 500 chars
console.log('');
console.log('=== First 500 chars ===');
console.log(css.substring(0, 500));
