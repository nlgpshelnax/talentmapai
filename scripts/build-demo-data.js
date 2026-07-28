'use strict';

/**
 * Prepares everything the browser-only demo build needs.
 *
 * GitHub Pages serves static files, so the demo has no Node process behind it.
 * Rather than hand-writing a second copy of the product (which would rot), this
 * script derives the demo's data and logic FROM THE REAL SERVER MODULES:
 *
 *   1. runs the real schema + seed against a throwaway SQLite file and dumps
 *      the resulting tables — so the demo shows exactly what a fresh install
 *      would contain;
 *   2. transpiles the shared pure-logic modules (questions, recommend) from
 *      CommonJS to ESM so the browser runs the *same* recommendation code as
 *      the server, not a re-implementation.
 *
 * Output: client/src/demo/snapshot.json and client/src/demo/generated/*.js
 * Both are generated artefacts — never edit them by hand.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'client', 'src', 'demo');
const GEN_DIR = path.join(OUT_DIR, 'generated');

// Point the DB at a scratch file before anything loads config/db.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'talentmap-demo-'));
process.env.DB_PATH = path.join(TMP, 'demo.db');
process.env.UPLOAD_DIR = path.join(TMP, 'uploads');
process.env.NODE_ENV = 'development';

const { dbAll, close } = require('../src/db');
const { createSchema } = require('../src/db/schema');
const { seedAll } = require('../src/db/seed');
const { QUESTIONS, publicQuestions } = require('../src/services/questions');
const { CONSTELLATION_TAGS } = require('../src/services/recommend');
const {
  publicConstellation,
  publicStar,
  publicResource,
  publicStoreItem,
} = require('../src/utils/serialize');

// ─────────────────────────────────────────────────── CJS → ESM transpilation

/**
 * These modules are plain logic with no Node built-ins, so a small, explicit
 * transform is enough — and far safer than maintaining a parallel copy.
 */
function toEsm(source, filename) {
  let out = source;

  out = out.replace(/^'use strict';\s*\n/m, '');

  // const { A, B } = require('./x');  →  import { A, B } from './x.js';
  out = out.replace(
    /const\s+\{([^}]+)\}\s*=\s*require\(['"]\.\/([\w-]+)['"]\);/g,
    (_, names, mod) => `import {${names}} from './${mod}.js';`
  );

  // module.exports = { A, B };  →  export { A, B };
  out = out.replace(/module\.exports\s*=\s*\{([^}]+)\};?\s*$/m, (_, names) => `export {${names}};`);

  // module.exports = [ ... ];  →  export default [ ... ];
  out = out.replace(/module\.exports\s*=\s*\[/m, 'export default [');

  if (/module\.exports|require\(/.test(out)) {
    throw new Error(`${filename}: CommonJS syntax left after transform — check the module shape`);
  }

  return (
    `// ЭТОТ ФАЙЛ СГЕНЕРИРОВАН АВТОМАТИЧЕСКИ — НЕ РЕДАКТИРУЙТЕ.\n` +
    `// Источник: src/services/${filename}\n` +
    `// Пересобрать: npm run demo:data\n\n` +
    out
  );
}

// ───────────────────────────────────────────────────────────────── main

async function main() {
  fs.mkdirSync(GEN_DIR, { recursive: true });

  await createSchema();
  await seedAll();

  const [constellations, stars, edges, resources, storeItems, cities] = await Promise.all([
    dbAll('SELECT * FROM constellations ORDER BY sort_order, id'),
    dbAll('SELECT * FROM stars ORDER BY constellation_id, order_index, id'),
    dbAll('SELECT * FROM star_edges'),
    dbAll('SELECT * FROM resources ORDER BY star_id, type'),
    dbAll('SELECT * FROM store_items ORDER BY sort_order, id'),
    dbAll('SELECT name FROM cities ORDER BY sort_order, name'),
  ]);

  // The demo scores answers in the browser, so the weights ship with it.
  // They are not a secret in a client-side build by definition.
  const answerWeights = {};
  for (const q of QUESTIONS) {
    if (!q.options) continue;
    for (const option of q.options) {
      if (option.weights && Object.keys(option.weights).length) {
        answerWeights[`${q.id}:${option.value}`] = option.weights;
      }
    }
  }

  const snapshot = {
    generatedAt: new Date().toISOString(),
    constellations: constellations.map(publicConstellation),
    stars: stars.map(publicStar),
    edges: edges.map((e) => ({ parent: e.parent_star_id, child: e.child_star_id })),
    resources: resources.map(publicResource),
    storeItems: storeItems.map(publicStoreItem),
    cities: cities.map((c) => c.name),
    questions: publicQuestions(),
    answerWeights,
    constellationTags: CONSTELLATION_TAGS,
  };

  fs.writeFileSync(path.join(OUT_DIR, 'snapshot.json'), JSON.stringify(snapshot, null, 2));

  for (const name of ['questions', 'recommend']) {
    const src = fs.readFileSync(path.join(ROOT, 'src', 'services', `${name}.js`), 'utf8');
    fs.writeFileSync(path.join(GEN_DIR, `${name}.js`), toEsm(src, `${name}.js`));
  }

  await close();
  fs.rmSync(TMP, { recursive: true, force: true });

  console.log(
    `[demo] снимок: ${snapshot.constellations.length} созвездий, ${snapshot.stars.length} звёзд, ` +
      `${snapshot.resources.length} ресурсов, ${snapshot.storeItems.length} товаров, ` +
      `${snapshot.cities.length} городов, ${snapshot.questions.length} вопросов`
  );
  console.log('[demo] сгенерированы ESM-модули: questions.js, recommend.js');
}

main().catch((err) => {
  console.error('[demo] ошибка сборки данных:', err);
  process.exit(1);
});
