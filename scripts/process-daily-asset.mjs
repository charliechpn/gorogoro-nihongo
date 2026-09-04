import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inputPath = resolve(
  projectRoot,
  'assets',
  'ChatGPT Image 26 de ago. de 2026, 22_47_53.png',
);
const outputPath = resolve(
  projectRoot,
  'public',
  'home-assets',
  'daily-practice.png',
);

const width = 1340;
const height = 938;
const radius = 48;
const mask = Buffer.from(
  `<svg width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="white"/></svg>`,
);

await sharp(inputPath)
  .extract({ left: 54, top: 75, width, height })
  .ensureAlpha()
  .composite([{ input: mask, blend: 'dest-in' }])
  .png({ compressionLevel: 9 })
  .toFile(outputPath);
