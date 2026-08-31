import sharp from 'sharp';

const width = 1340;
const height = 938;
const radius = 48;
const mask = Buffer.from(
  `<svg width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="white"/></svg>`,
);

await sharp(
  'C:/Users/Pichau/Documents/SITES/Japanese learning/assets/ChatGPT Image 26 de ago. de 2026, 22_47_53.png',
)
  .extract({ left: 54, top: 75, width, height })
  .ensureAlpha()
  .composite([{ input: mask, blend: 'dest-in' }])
  .png({ compressionLevel: 9 })
  .toFile(
    'C:/Users/Pichau/Documents/ChatGPT/Site japonês/public/home-assets/daily-practice.png',
  );
