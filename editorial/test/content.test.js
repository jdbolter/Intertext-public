'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildAll,
  buildSectionPackage,
  discoverWorks,
  parseSpine,
  validateSectionPackage,
} = require('../lib/content');

const root = path.join(__dirname, '..', '..');
const contentRoot = path.join(root, 'editorial', 'content');

function normalize(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

test('all editorial work manifests match the current text configs', () => {
  const discovered = discoverWorks(contentRoot);
  assert.deepEqual(discovered.map(({ work }) => work.id), ['example']);
  assert.deepEqual(discovered.map(({ work }) => work.order), [1]);

  for (const { work } of discovered) {
    const config = require(path.join(root, work.id, 'config.js'));
    const sections = work.sections.slice().sort((a, b) => a.order - b.order);
    assert.deepEqual(sections.map(section => section.title), config.sectionNames);
    assert.deepEqual(sections.map(section => section.order), config.sectionNames.map((_, index) => index + 1));
  }
});

test('marked spine parser creates stable, unique passages', () => {
  const passages = parseSpine([
    '<!-- intertext:passage example-p01 -->',
    'First passage.',
    '<!-- intertext:passage example-p02 -->',
    'Second passage.',
  ].join('\n'));
  assert.deepEqual(passages, [
    { id: 'example-p01', markdown: 'First passage.' },
    { id: 'example-p02', markdown: 'Second passage.' },
  ]);
});

test('section validation rejects a fund entry anchored to a nonexistent passage', () => {
  const { work, workDir } = discoverWorks(contentRoot).find(item => item.work.id === 'example');
  const section = work.sections.find(item => item.id === 'borders-that-are-not-there');
  const sectionPackage = buildSectionPackage(work, section, workDir);
  // A fund entry from the frozen fixture (see fixture-root/README.md), anchored to a passage that does not exist.
  const fixture = JSON.parse(fs.readFileSync(
    path.join(__dirname, 'fixture-root', 'api', 'editorial-seed', 'fixture', 'section-five.json'), 'utf8'));
  sectionPackage.fundEntries = [{ ...fixture.fundEntries[0], anchors: ['missing-passage'] }];
  assert.throws(
    () => validateSectionPackage(sectionPackage),
    /refers to unknown anchor missing-passage/
  );
});

test('buildAll writes a portable editor index and validated section snapshot', () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'intertext-editorial-'));
  try {
    const index = buildAll({ contentRoot, outputRoot });
    assert.equal(index.works.length, 1);
    assert.equal(index.works.flatMap(work => work.sections).length, 4);
    const proofs = index.works.find(work => work.id === 'example');
    assert.ok(proofs.sections.every(section => section.readiness === 'packaged'));
    assert.ok(proofs.sections.every(section => section.fundCounts.accepted === 0 && section.fundCounts.candidate === 0));
    assert.ok(fs.existsSync(path.join(outputRoot, 'index.json')));
    assert.ok(fs.existsSync(path.join(outputRoot, 'example', 'borders-that-are-not-there.json')));
  } finally {
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
});

test('reader home page offers the example text', () => {
  const homepage = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const cards = [...homepage.matchAll(/<a class="card" href="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(cards, ['example/public/index.html']);
});

test('public readers carry compact cross-section memory and restore per-section history', () => {
  for (const workId of ['example']) {
    const app = fs.readFileSync(path.join(root, workId, 'public', 'app.js'), 'utf8');
    const style = fs.readFileSync(path.join(root, workId, 'public', 'style.css'), 'utf8');
    assert.match(app, /const sectionSummaries = new Map\(\)/);
    assert.match(app, /priorSectionSummaries: priorSectionSummaries\(activeSection\)/);
    assert.match(app, /const activeSectionHistory = sectionHistories\.get\(activeSection\) \|\| \[\]/);
    assert.match(app, /sectionHistory: activeSectionHistory/);
    assert.match(app, /data\.editorial\?\.sectionSummary/);
    assert.match(app, /history: readingEdition === 'original' \? history : \[\]/);
    assert.match(app, /const firstContinuation = continuing && activeSectionHistory\.length === 0/);
    assert.match(app, /firstContinuation,/);
    assert.doesNotMatch(app, /firstSend/);
    assert.match(app, /function focusInput\(\)[\s\S]*input\.focus\(\{ preventScroll: true \}\)/);
    assert.match(app, /document\.getElementById\('consent-overlay'\)\.style\.display = 'none';\n  focusInput\(\);/);
    assert.match(app, /if \(thinking\) conv\.appendChild\(thinking\)/);
    assert.match(style, /#message-input \{[\s\S]*caret-color: var\(--text\)/);
  }
});

test('author editor is generic, loads the generated index, and exposes versioned editing controls', () => {
  const app = fs.readFileSync(path.join(root, 'editorial', 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'editorial', 'index.html'), 'utf8');
  assert.match(app, /fetch\('data\/index\.json'\)/);
  assert.doesNotMatch(app, /map argues|a-map-is-a-choice/i);
  assert.match(app, /\/api\/author-section/);
  assert.match(html, /Author editor/);
  assert.match(html, /Publish author revision/);
  assert.match(html, /Add entry/);
  assert.match(html, /The fund/);
});

test('unauthenticated editorial workspace is excluded from Vercel deployments', () => {
  const vercelIgnore = fs.readFileSync(path.join(root, '.vercelignore'), 'utf8');
  assert.match(vercelIgnore, /^editorial\/$/m);
});

test('Vercel functions include the generated editorial runtime seed', () => {
  const vercelConfig = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  assert.equal(vercelConfig.functions['api/chat.js'].includeFiles, 'api/editorial-seed/**');
  assert.equal(vercelConfig.functions['api/evolve.js'].includeFiles, 'api/editorial-seed/**');
});

test('example: the introductions the page shows match the ones the model is told about', () => {
  // H-006: the boxes live in app.js (what the reader sees) and in config.js (what the model is told
  // the reader saw). They must say the same thing.
  const config = require(path.join(root, 'example', 'config.js'));
  const app = fs.readFileSync(path.join(root, 'example', 'public', 'app.js'), 'utf8');
  const block = app.slice(app.indexOf('const SECTION_INTROS = ['), app.indexOf('];', app.indexOf('const SECTION_INTROS = [')));
  const shown = [...block.matchAll(/`([\s\S]*?)`/g)].map(m => m[1]);
  const plain = s => s
    .replace(/<[^>]+>/g, '')
    .replace(/&mdash;/g, '—').replace(/&rsquo;/g, '’').replace(/&lsquo;/g, '‘')
    .replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”').replace(/&amp;/g, '&')
    .replace(/[’‘]/g, "'").replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ').trim();
  assert.equal(shown.length, config.sectionIntros.length);
  shown.forEach((html, i) => assert.equal(plain(html), plain(config.sectionIntros[i]), `section ${i + 1} introduction`));
});

test('example: the chapters the page shows match config.chapters (H-014)', () => {
  const config = require(path.join(root, 'example', 'config.js'));
  const app = fs.readFileSync(path.join(root, 'example', 'public', 'app.js'), 'utf8');
  const block = app.slice(app.indexOf('const CHAPTERS = ['), app.indexOf('];', app.indexOf('const CHAPTERS = [')) + 2);
  const shown = new Function(`${block}; return CHAPTERS;`)();
  assert.deepEqual(shown, config.chapters.map(({ number, title, firstSection, label }) => (label ? { number, title, firstSection, label } : { number, title, firstSection })));
  assert.equal(config.chapters[0].firstSection, 0);
  assert.ok(config.chapters.every(ch => typeof ch.point === 'string' && ch.point.trim()));
  assert.equal(config.sectionPoints.length, config.sectionNames.length);
  const numerals = new Function(`${app.slice(app.indexOf('const SECTION_NUMERALS = ['), app.indexOf('];', app.indexOf('const SECTION_NUMERALS = [')) + 2)}; return SECTION_NUMERALS;`)();
  assert.equal(numerals.length, config.sectionNames.length);
  assert.equal(numerals[config.chapters[1].firstSection], 'I');
});

test('example: every section is packaged without changing its authored prose', () => {
  const { work, workDir } = discoverWorks(contentRoot).find(item => item.work.id === 'example');
  const config = require(path.join(root, 'example', 'config.js'));
  assert.equal(work.sections.length, config.sectionNames.length);
  for (const section of work.sections.slice().sort((a, b) => a.order - b.order)) {
    const sectionPackage = buildSectionPackage(work, section, workDir);
    const [heading, ...body] = fs.readFileSync(
      path.join(root, 'example', 'source_texts', 'sections', `section-${section.order}.md`), 'utf8').trim().split(/\n\s*\n/);
    assert.equal(heading.replace(/^##\s+/u, '').trim(), section.title);
    assert.equal(sectionPackage.spine.map(passage => passage.markdown).join('\n\n'), body.join('\n\n'));
    assert.deepEqual(sectionPackage.fundEntries, []);
  }
});
