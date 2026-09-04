import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyFile } from 'node:fs/promises';
import sharp from 'sharp';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assetsDirectory = resolve(projectRoot, 'assets');
const outputDirectory = resolve(projectRoot, 'public', 'home-assets');
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

async function alphaBounds(imageBuffer) {
  const { data, info } = await sharp(imageBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * 4 + 3];
      if (alpha <= 8) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }

  if (right < left || bottom < top) {
    throw new Error('The supplied asset has no visible pixels.');
  }

  return {
    left,
    top,
    width: right - left + 1,
    height: bottom - top + 1,
  };
}

async function writeCard(inputPath, outputPath, region) {
  const source = sharp(inputPath).ensureAlpha();
  const isolated = region
    ? await source.extract(region).png().toBuffer()
    : await source.png().toBuffer();
  const bounds = await alphaBounds(isolated);

  await sharp(isolated)
    .extract(bounds)
    .resize({
      width: 500,
      height: 550,
      fit: 'contain',
      background: transparent,
    })
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
}

const pairedIcons = resolve(assetsDirectory, 'icons.png');

await Promise.all([
  copyFile(
    resolve(assetsDirectory, 'cat illustration.png'),
    resolve(outputDirectory, 'hero-garden.png'),
  ),
  writeCard(
    pairedIcons,
    resolve(outputDirectory, 'mode-kanji.png'),
    { left: 0, top: 0, width: 768, height: 1024 },
  ),
  writeCard(
    pairedIcons,
    resolve(outputDirectory, 'mode-vocabulary.png'),
    { left: 768, top: 0, width: 768, height: 1024 },
  ),
  writeCard(
    resolve(assetsDirectory, 'icon cat.png'),
    resolve(outputDirectory, 'mode-word-game.png'),
  ),
  writeCard(
    resolve(assetsDirectory, 'icon book.png'),
    resolve(outputDirectory, 'mode-verbs.png'),
  ),
]);
