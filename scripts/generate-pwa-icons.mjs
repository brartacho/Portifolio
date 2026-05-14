// Gerador one-off de ícones do PWA admin.
// Como rodar (sharp não fica salvo no package.json — é só ferramenta):
//   npm install --no-save sharp && node scripts/generate-pwa-icons.mjs
// Gera 3 PNGs a partir de imagens/logo_artacho.dev_001.png em admin/icons/.
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), '..');
const src = path.join(root, 'imagens', 'logo_artacho.dev_001.png');
const out = path.join(root, 'admin', 'icons');
const bg = { r: 10, g: 10, b: 15, alpha: 1 }; // matches --bg #0a0a0f

async function makeIcon({ size, fillRatio, file }) {
  const innerWidth = Math.round(size * fillRatio);
  const logoBuf = await sharp(src)
    .resize({ width: innerWidth, fit: 'inside', withoutEnlargement: false })
    .toBuffer();
  const meta = await sharp(logoBuf).metadata();
  const left = Math.round((size - meta.width) / 2);
  const top = Math.round((size - meta.height) / 2);
  await sharp({
    create: { width: size, height: size, channels: 4, background: bg },
  })
    .composite([{ input: logoBuf, left, top }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(out, file));
  console.log(`wrote ${file} (${size}x${size}, logo ${meta.width}x${meta.height})`);
}

await makeIcon({ size: 192, fillRatio: 0.82, file: 'icon-192.png' });
await makeIcon({ size: 512, fillRatio: 0.82, file: 'icon-512.png' });
// Maskable: Android crops to a shape; keep logo inside ~60% safe zone.
await makeIcon({ size: 512, fillRatio: 0.60, file: 'icon-maskable-512.png' });
