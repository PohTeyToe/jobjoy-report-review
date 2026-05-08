/**
 * Sync design-experiments variant HTMLs into static/variants/.
 *
 * Source of truth: the standalone public repo
 *   https://github.com/PohTeyToe/jobjoy-design-experiments
 * (extracted from commit ce5e304 on JobJoy's chore/design-experiments branch,
 * history preserved via git filter-repo).
 *
 * On first run we clone it into .cache/jobjoy-design-experiments; on later runs
 * we fetch + hard-reset to origin/<PIN_REF>. The cache dir is gitignored.
 * Files are read from the cache on disk, not via `git show`, so all downstream
 * transformations operate on a plain working tree.
 *
 * Latest upstream landings (for traceability — not load-bearing, sync follows main):
 *   - 084cafb  fix(impeccable): George's IPP feedback (Smyth->Sample,
 *              +Motivating Situations as 8th radial element, End Result arrow flipped)
 *   - 500e376  fix(impeccable): George's remaining pin feedback (Colophon delete,
 *              TOC trim I/II/III, how-page wording, PS kicker plain, +Definitions
 *              + Career Options pages, folio cascade Sample 02-12)
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const VARIANTS = [
  'faithful',
  'recommended',
  'impeccable',
  'taste-frontend',
  'huashu',
  'baseline'
] as const;
const REPO_URL = 'https://github.com/PohTeyToe/jobjoy-design-experiments.git';
const PIN_REF = 'main';
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const CACHE_DIR = resolve(PROJECT_ROOT, '.cache', 'jobjoy-design-experiments');
const DEST_ROOT = resolve(PROJECT_ROOT, 'static', 'variants');

const COVER_REQUIREMENTS = ['JobJoy Report', 'Sample 1', 'George Dutch'];

function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; stdio?: 'inherit' | 'ignore' | 'pipe' } = {}
): string {
  return execFileSync(cmd, args, {
    cwd: opts.cwd,
    encoding: 'utf8',
    stdio: opts.stdio ?? 'pipe',
    maxBuffer: 16 * 1024 * 1024
  });
}

function ensureCache(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(dirname(CACHE_DIR), { recursive: true });
    console.log(`Cloning ${REPO_URL} into ${CACHE_DIR}...`);
    run('git', ['clone', REPO_URL, CACHE_DIR], { stdio: 'inherit' });
  } else {
    console.log(`Refreshing cache at ${CACHE_DIR}...`);
    run('git', ['fetch', 'origin', '--prune'], { cwd: CACHE_DIR, stdio: 'inherit' });
  }
  run('git', ['reset', '--hard', `origin/${PIN_REF}`], { cwd: CACHE_DIR, stdio: 'inherit' });
  const head = run('git', ['rev-parse', 'HEAD'], { cwd: CACHE_DIR }).trim();
  console.log(`Cache HEAD: ${head} (ref=${PIN_REF})`);
}

const SHARED_FONTS_SRC = join(CACHE_DIR, 'fonts');

function readCache(relPath: string): string {
  return readFileSync(join(CACHE_DIR, relPath), 'utf8');
}

function cacheExists(relPath: string): boolean {
  return existsSync(join(CACHE_DIR, relPath));
}

function rewriteFontUrls(css: string, slug: string): string {
  return css.replace(
    /url\(\s*(['"]?)([^)'"]+?\.(?:woff2?|ttf|otf))\1\s*\)/gi,
    (_m, _q, path: string) => {
      const filename = path.split(/[\\/]/).pop()!;
      return `url('/variants/${slug}/fonts/${filename}')`;
    }
  );
}

function sha(buf: string | Buffer): string {
  return createHash('sha256').update(buf).digest('hex').slice(0, 12);
}

function copyFontsInto(destFonts: string): void {
  if (!existsSync(SHARED_FONTS_SRC)) {
    throw new Error(`shared fonts dir missing in cache: ${SHARED_FONTS_SRC}`);
  }
  mkdirSync(destFonts, { recursive: true });
  for (const entry of readdirSync(SHARED_FONTS_SRC)) {
    const full = join(SHARED_FONTS_SRC, entry);
    if (statSync(full).isFile()) cpSync(full, join(destFonts, entry));
  }
}

function syncVariant(slug: string): { ok: boolean; hash: string; pages: number; notes: string[] } {
  const notes: string[] = [];
  const srcIndex = `${slug}/final/index.html`;
  if (!cacheExists(srcIndex)) {
    return { ok: false, hash: '', pages: 0, notes: [`missing in cache: ${srcIndex}`] };
  }

  const dest = join(DEST_ROOT, slug);
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });

  copyFontsInto(join(dest, 'fonts'));

  let html = readCache(srcIndex);
  const $ = cheerio.load(html);

  $('html').attr('data-variant-slug', slug);
  $('.page').each((i, el) => $(el).attr('data-page-index', String(i)));
  $('style').each((_i, el) => {
    let css = $(el).text();
    // Inline any `@import url(... fonts.css ...)` pulling from the shared stylesheet.
    css = css.replace(/@import\s+url\(\s*(['"]?)([^)'"]*fonts\.css)\1\s*\)\s*;?/gi, () => {
      const cssPath = 'fonts/fonts.css';
      if (!cacheExists(cssPath)) return '';
      return `\n/* inlined fonts.css */\n${rewriteFontUrls(readCache(cssPath), slug)}\n`;
    });
    css = rewriteFontUrls(css, slug);
    $(el).text(css);
  });

  $('link[rel="stylesheet"]').each((_i, el) => {
    const href = $(el).attr('href') ?? '';
    if (/fonts\.css$/.test(href)) {
      const cssPath = 'fonts/fonts.css';
      if (cacheExists(cssPath)) {
        const css = rewriteFontUrls(readCache(cssPath), slug);
        $(el).replaceWith(`<style data-inlined-from="fonts.css">${css}</style>`);
      }
    }
  });

  html = $.html();
  writeFileSync(join(dest, 'index.html'), html);

  const pageCount = $('.page').length;
  if (pageCount === 0) notes.push('WARN: no .page sections found');
  const markerHits: number[] = [];
  for (let n = 1; n <= 16; n++) if (html.includes(`(${n})`)) markerHits.push(n);
  if (markerHits.length < 16) {
    const missing = [...Array(16).keys()].map((i) => i + 1).filter((n) => !markerHits.includes(n));
    notes.push(`markers missing: ${missing.join(', ')}`);
  }
  for (const needle of COVER_REQUIREMENTS) {
    if (!html.includes(needle)) notes.push(`cover missing phrase: "${needle}"`);
  }

  return { ok: true, hash: sha(html), pages: pageCount, notes };
}

ensureCache();

const results = VARIANTS.map((slug) => ({ slug, ...syncVariant(slug) }));
console.log('\nVariant sync results:');
for (const r of results) {
  const status = r.ok ? 'OK' : 'FAIL';
  console.log(
    `  ${status.padEnd(4)} ${r.slug.padEnd(18)} ${r.hash}  pages=${r.pages}  ${r.notes.join(' | ')}`
  );
}
const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.error(`\n${failed.length} variant(s) failed to sync.`);
  process.exit(1);
}
