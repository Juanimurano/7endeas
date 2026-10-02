import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';

const key = process.env.OPENAI_API_KEY;
if (!key) {
  console.error(
    'Falta OPENAI_API_KEY. Copiá .env.example a .env y configurala, o exportala en tu terminal. La clave nunca debe ir en React.',
  );
  process.exit(1);
}
const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
const directory = resolve('apps/web/public/cards');
await mkdir(directory, { recursive: true });
const manifestPath = resolve(directory, 'manifest.json');
let manifest;
try {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
} catch {
  manifest = { assets: {} };
}
const catalog = [
  ...Array.from({ length: 13 }, (_, value) => ({
    id: `number-${value}`,
    brief: `Number card ${value}, themed as ${value === 1 ? 'one endea' : `${value} endeas`}. Use a decorative abstract sunburst surrounded by ${Math.max(1, value)} small seven-ray endea sparks. Palette: ivory, deep violet, ${['coral', 'teal', 'gold', 'raspberry'][value % 4]}.`,
  })),
  ...[2, 4, 6, 8, 10].map((value) => ({
    id: `bonus-${value}`,
    brief: `Bonus points card +${value}, called Endeas extra. Golden yellow background, a shower of small seven-ray endea sparks and ${value / 2} radiant stars, deep violet outlines.`,
  })),
  {
    id: 'double',
    brief:
      'Double points card, called Doble endea. Two identical interlocking seven-ray endea emblems, symmetrical, warm golden yellow background and violet outlines.',
  },
  {
    id: 'life',
    brief:
      'Extra life card, called Otra endea. A coral heart protecting a little seven-ray endea spark that shines again, framed by a decorative ribbon. Coral red and pale pink, deep violet outlines.',
  },
  {
    id: 'freeze',
    brief:
      'Freeze action card, called No endeas. A seven-ray endea spark stopped by a striking padlock and a geometric barrier, suggesting no more turns. Teal and sky blue, deep violet outlines.',
  },
  {
    id: 'draw3',
    brief:
      'Draw three action card, called Endeá tres. Three stylized ivory cards, each decorated with the same seven-ray endea spark, fanning out with a playful zigzag lightning shape. Golden yellow background, violet outlines.',
  },
  {
    id: 'back',
    brief:
      'Card back for 7 endeas. Seven small seven-ray endea sparks arranged in a ring, with elegant interwoven geometric ornament. Deep violet background, ivory and golden yellow details. No numbers.',
  },
];
const onlyIndex = process.argv.indexOf('--only');
const selected =
  onlyIndex >= 0 ? catalog.filter((c) => c.id === process.argv[onlyIndex + 1]) : catalog;
if (!selected.length) {
  console.error('Carta desconocida. Ejemplo: npm run generate:cards -- --only life');
  process.exit(1);
}
const force = process.argv.includes('--force');
const style =
  'Create ORIGINAL illustration for a friendly retro art-deco party card game called 7 endeas. Its playful theme turns the invented word endea into a symbol of luck and taking one more chance. Represent an endea with an original abstract seven-ray spark motif, recurring consistently across the entire deck. Do not use an existing brand logo or copy an existing commercial card design. Portrait 2:3 ratio, flat hand-printed illustration with subtle paper grain, crisp deep violet linework, elegant geometric ornamental border and playful visual rhythm. Fill the whole canvas; no table, no mockup, no shadows outside the card. NO TEXT, NO LETTERS, NO NUMERALS, NO WATERMARK. Leave the middle 45% relatively uncluttered because the website overlays the value and themed Spanish card name in accessible HTML. Match all cards with a cohesive ivory, violet, coral, teal, gold palette.';
console.log(
  `GPT Images (${model}) · ${selected.length} cartas seleccionadas. Una solicitud paga por carta nueva; las existentes se omiten.`,
);
for (const card of selected) {
  const file = resolve(directory, `${card.id}.webp`);
  if (!force) {
    try {
      await access(file);
      manifest.assets[card.id] = `/cards/${card.id}.webp`;
      console.log(`Omitida: ${card.id} (ya existe).`);
      continue;
    } catch {}
  }
  const prompt = `${style}\nCard art direction: ${card.brief}`;
  console.log(`Generando ${card.id}…`);
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size: '1024x1536',
      quality: 'medium',
      output_format: 'webp',
    }),
    signal: AbortSignal.timeout(240000),
  });
  const result = await response.json();
  if (!response.ok || !result.data?.[0]?.b64_json) {
    console.error(
      `No se pudo generar ${card.id}: ${result.error?.message ?? response.status}. Podés ejecutar el comando otra vez para continuar.`,
    );
    process.exitCode = 1;
    break;
  }
  await writeFile(file, Buffer.from(result.data[0].b64_json, 'base64'));
  await writeFile(
    resolve(directory, `${card.id}.json`),
    JSON.stringify(
      {
        generator: 'GPT Images',
        theme: '7 endeas',
        model,
        prompt,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  manifest.assets[card.id] = `/cards/${card.id}.webp`;
  manifest.generator = 'GPT Images';
  manifest.theme = '7 endeas';
  manifest.model = model;
  manifest.status = Object.keys(manifest.assets).length === catalog.length ? 'complete' : 'partial';
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}
manifest.status = Object.keys(manifest.assets).length === catalog.length ? 'complete' : 'partial';
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
console.log(
  `Listo: ${Object.keys(manifest.assets).length}/${catalog.length} imágenes. Recargá la web; en producción volvé a ejecutar npm run build.`,
);
