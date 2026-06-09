// Renders build/icon.svg to build/icon.ico (multi-size) and build/icon.png.
// One-time tool; run with: npm i --no-save sharp png-to-ico && node scripts/generate-icon.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svgPath = path.join(root, 'build', 'icon.svg');
const sizes = [16, 24, 32, 48, 64, 128, 256];

const svg = fs.readFileSync(svgPath);
const pngs = await Promise.all(
  sizes.map((size) => sharp(svg, { density: 300 }).resize(size, size).png().toBuffer())
);

fs.writeFileSync(path.join(root, 'build', 'icon.ico'), await pngToIco(pngs));
fs.writeFileSync(path.join(root, 'build', 'icon.png'), pngs[sizes.length - 1]);
console.log('Wrote build/icon.ico and build/icon.png');
