import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const directory = resolve('apps/web/public/cards');
const manifestPath = resolve(directory, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
for (const kind of ['draw3', 'life', 'freeze']) {
  const source = resolve(directory, `${kind}.png`);
  const destination = resolve(directory, `${kind}.webp`);
  const info = await sharp(source)
    .rotate()
    .resize({ width: 768, withoutEnlargement: true })
    .webp({ quality: 88 })
    .toFile(destination);
  manifest.assets[kind] = `/cards/${kind}.webp`;
  manifest.printedFaces = [...new Set([...(manifest.printedFaces ?? []), kind])];
  console.log(`${kind}: ${info.width} × ${info.height}, ${(info.size / 1024).toFixed(0)} KB`);
}
manifest.theme = '7 endeas';
manifest.status = Object.keys(manifest.assets).length === 23 ? 'complete' : 'partial';
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log('Cartas importadas. En producción volvé a ejecutar npm run build.');
