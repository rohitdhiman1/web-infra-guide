#!/usr/bin/env node
// Verifies that every internal link in dist/ points at an existing page and,
// if it has a #fragment, at an element with that id. Run after `npm run build`.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const htmlFiles = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.html')) htmlFiles.push(p);
  }
})(DIST);

const ids = new Map();
const pathOf = (file) => '/' + relative(DIST, file).replace(/index\.html$/, '').replace(/\.html$/, '');
for (const f of htmlFiles) {
  const html = readFileSync(f, 'utf8');
  ids.set(pathOf(f), new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
}

let bad = 0, checked = 0;
for (const f of htmlFiles) {
  const from = pathOf(f);
  const html = readFileSync(f, 'utf8');
  for (const [, href] of html.matchAll(/<a\s[^>]*href="([^"]+)"/g)) {
    if (/^(https?:|mailto:)/.test(href) || href.startsWith('/_astro') || href.startsWith('/pagefind')) continue;
    const [path, frag] = href.split('#');
    const target = path === '' ? from : path.endsWith('/') ? path : path + '/';
    checked++;
    if (!ids.has(target)) {
      if (!existsSync(join(DIST, path))) { bad++; console.log(`✗ ${from} → ${href} (no page)`); }
      continue;
    }
    if (frag && frag !== '_top' && !ids.get(target).has(decodeURIComponent(frag))) {
      bad++;
      console.log(`✗ ${from} → ${href} (no #${frag})`);
    }
  }
}
console.log(`${checked} internal links checked, ${bad} broken.`);
process.exit(bad ? 1 : 0);
