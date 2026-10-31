#!/usr/bin/env node
// Splits source/guide.md into one Starlight .mdx page per top-level section.
//
// The guide's wording is copied verbatim. The only transformations are:
//   - the Contents list and every "Back to contents" link are removed
//   - #mxyrjhrn9ys.* anchor links are rewritten to the right page + heading
//   - "[embedded content: …]" placeholders become React diagram components
//   - concept numbers (1.1, 1.2 …) get linkable anchors (#concept-1-1), and
//     cross-references to them, like "(1.5)", become links
//   - headings are shifted up one level (the section's ## becomes the page title)
//
// Re-run with `npm run split-guide`. It overwrites src/content/docs/*.mdx.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import GithubSlugger from 'github-slugger';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'source/guide.md');
const OUT = join(root, 'src/content/docs');

/** Section heading (exact text after "## ") → page slug + sidebar label. */
const PAGES = [
  { heading: 'How to use this guide', slug: 'index', label: 'How to use this guide' },
  { heading: 'Part 1 — Networking foundations', slug: 'part-1-networking', label: 'Part 1 — Networking foundations' },
  { heading: 'Part 2 — The Linux layer', slug: 'part-2-linux', label: 'Part 2 — The Linux layer' },
  { heading: 'Part 3 — HTTP/1.1 in depth', slug: 'part-3-http11', label: 'Part 3 — HTTP/1.1 in depth' },
  { heading: 'Part 4 — Building raw web servers', slug: 'part-4-raw-servers', label: 'Part 4 — Building raw web servers' },
  { heading: 'Part 5 — TLS and HTTPS', slug: 'part-5-tls', label: 'Part 5 — TLS and HTTPS' },
  { heading: 'Part 6 — HTTP/2 and HTTP/3', slug: 'part-6-http2-http3', label: 'Part 6 — HTTP/2 and HTTP/3' },
  { heading: 'Part 7 — nginx core', slug: 'part-7-nginx-core', label: 'Part 7 — nginx core' },
  { heading: 'One hostname, three checks — DNS, TLS and nginx', slug: 'one-hostname-three-checks', label: 'One hostname, three checks' },
  { heading: 'Part 8 — nginx as a reverse proxy', slug: 'part-8-reverse-proxy', label: 'Part 8 — nginx as a reverse proxy' },
  { heading: 'Part 9 — Load balancing', slug: 'part-9-load-balancing', label: 'Part 9 — Load balancing' },
  { heading: 'Part 10 — Caching, performance and security hardening', slug: 'part-10-caching-security', label: 'Part 10 — Caching, performance and security' },
  { heading: 'Part 11 — Application servers: WSGI, ASGI, Gunicorn, Uvicorn', slug: 'part-11-app-servers', label: 'Part 11 — Application servers' },
  { heading: 'Part 12 — Observability and debugging', slug: 'part-12-observability', label: 'Part 12 — Observability and debugging' },
  { heading: 'Field guide — where to start looking when something breaks', slug: 'field-guide', label: 'Field guide' },
  { heading: 'Part 13 — The edge: CDNs, cloud load balancers and multiple zones', slug: 'part-13-edge', label: 'Part 13 — The edge' },
  { heading: 'Part 14 — Deploying and operating nginx in production', slug: 'part-14-production', label: 'Part 14 — nginx in production' },
  { heading: 'Part 15 — Capstone: build it, break it, rebuild it', slug: 'part-15-capstone', label: 'Part 15 — Capstone' },
  { heading: 'Learning path and milestones', slug: 'learning-path', label: 'Learning path and milestones' },
  { heading: 'Toolkit and resources', slug: 'toolkit', label: 'Toolkit and resources' },
];

/** Placeholder text prefix → diagram component name (src/components/diagrams/<Name>.tsx). */
const DIAGRAMS = [
  ['layer model', 'LayerModel'],
  ['TCP connection lifecycle', 'TcpLifecycle'],
  ['DNS resolution', 'DnsResolution'],
  ['concurrency simulator', 'ConcurrencySimulator'],
  ['chain of trust', 'ChainOfTrust'],
  ['TLS 1.3 handshake', 'Tls13Handshake'],
  ['TLS termination modes', 'TlsTermination'],
  ['head-of-line blocking', 'HolBlocking'],
  ['location matching', 'LocationMatching'],
  ['hostname simulator', 'HostnameChecks'],
  ['reverse proxy', 'ReverseProxyErrors'],
  ['load balancing simulator', 'LoadBalancing'],
  ['proxy cache simulator', 'ProxyCache'],
  ['rate limiting simulator', 'RateLimiting'],
  ['app server simulator', 'GunicornBuffering'],
  ['Tomcat connector simulator', 'TomcatConnector'],
  ['debugging flow', 'DebuggingFlow'],
  ['request path', 'RequestPath'],
  ['learning path', 'LearningPath'],
];

const pageHref = (slug) => (slug === 'index' ? '/' : `/${slug}/`);
const conceptId = (num) => `concept-${num.replace('.', '-')}`;

// ---------------------------------------------------------------- parse
const raw = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
const lines = raw.split('\n');

// The document preamble (title + byline) sits above "## Contents".
const contentsStart = lines.findIndex((l) => l === '## Contents');
const preamble = lines.slice(0, contentsStart);
const byline = preamble.find((l) => l.trim() && !l.startsWith('#'))?.trim()
  // Keep the date only; the author handle is not published.
  ?.replace(/\s*·\s*@.*$/, "");

// Split into ## sections.
const sections = [];
for (let i = 0; i < lines.length; i++) {
  const m = /^## (.+)$/.exec(lines[i]);
  if (m) sections.push({ heading: m[1], start: i, body: [] });
  else if (sections.length) sections[sections.length - 1].body.push(lines[i]);
}

// Map Contents-list anchor ids → link text.
const contents = sections.find((s) => s.heading === 'Contents');
const anchorText = new Map();
for (const l of contents.body) {
  for (const m of l.matchAll(/\[([^\]]+)\]\(#(mxyrjhrn9ys\.\d+)\)/g)) anchorText.set(m[2], m[1]);
}

const pageSections = sections.filter((s) => s.heading !== 'Contents');
for (const s of pageSections) {
  s.page = PAGES.find((p) => p.heading === s.heading);
  if (!s.page) throw new Error(`No page mapping for section "${s.heading}"`);
}
if (pageSections.length !== PAGES.length) throw new Error('Section/page count mismatch');

// Heading text (### or ##) → href, using the same slugger Starlight uses.
const unescape = (t) => t.replace(/\\([_\\*[\]])/g, '$1');
const headingHref = new Map();
for (const s of pageSections) {
  const slugger = new GithubSlugger();
  headingHref.set(s.heading, pageHref(s.page.slug));
  for (const l of s.body) {
    const m = /^#{3,6} (.+)$/.exec(l);
    if (m) headingHref.set(unescape(m[1]), `${pageHref(s.page.slug)}#${slugger.slug(unescape(m[1]))}`);
  }
}
const anchorHref = new Map();
for (const [id, text] of anchorText) {
  const href = headingHref.get(unescape(text));
  if (href) anchorHref.set(id, href);
}

// Concept number → page slug (from "- **1.1 Title.**" definitions).
const conceptPage = new Map();
for (const s of pageSections) {
  for (const l of s.body) {
    const m = /^- \*\*(\d+\.\d+) /.exec(l);
    if (m) conceptPage.set(m[1], s.page.slug);
  }
}

// ---------------------------------------------------------------- transform
/** Apply fn to the parts of a line outside inline code spans. */
function outsideCode(line, fn) {
  return line
    .split(/(`[^`]*`)/)
    .map((part, i) => (i % 2 ? part : fn(part)))
    .join('');
}

const conceptLink = (num, fromSlug) => {
  const slug = conceptPage.get(num);
  if (!slug) return num;
  const href = slug === fromSlug ? `#${conceptId(num)}` : `${pageHref(slug)}#${conceptId(num)}`;
  return `[${num}](${href})`;
};
const NUM = /\b(\d{1,2}\.\d{1,2})\b/g;
const linkNums = (text, slug) => text.replace(NUM, (n) => conceptLink(n, slug));

/**
 * Cross-references to concepts. Only unambiguous forms are linked, so that
 * "TLS 1.3", "HTTP/1.1", "Servlet 6.1" or "nginx 1.27" are never touched:
 *   - a parenthetical made only of concept numbers: "(1.5)", "(4.8, 4.9)", "(10.1 to 10.4)"
 *   - "concepts 3.9, 6.2, 6.5 and 6.6"
 *   - "Part 5 (5.14)" style is covered by the first rule
 *   - a short list of in-sentence phrases from the guide
 */
const PHRASES = [
  /(Because of )(\d+\.\d+)/g,
  /(the model from )(\d+\.\d+)/g,
  /(the listen backlog from )(\d+\.\d+)/g,
  /(the Java version of )(\d+\.\d+)/g,
  /(background for )(\d+\.\d+)/g,
  /(Part 1 \()(1\.1)( to )/g,
  /(Part \d+ \(\d+\.\d+, )(\d+\.\d+)/g,
];
function linkCrossRefs(text, slug) {
  text = text.replace(/\(([\d.,\s]+(?:(?:to|and) [\d.]+)?)\)/g, (all, inner) =>
    /\d+\.\d+/.test(inner) ? `(${linkNums(inner, slug)})` : all,
  );
  text = text.replace(/(concepts )((?:\d+\.\d+(?:, | and )?)+)/g, (_, pre, list) => pre + linkNums(list, slug));
  for (const re of PHRASES) {
    // With only two groups the 3rd callback arg is the match offset, not a string.
    text = text.replace(re, (_, pre, num, post) =>
      pre + conceptLink(num, slug) + (typeof post === 'string' ? post : ''),
    );
  }
  return text;
}

/** MDX treats {, } and < as syntax in prose; escape them outside code. */
const mdxSafe = (text) => text.replace(/[{}]/g, (c) => `\\${c}`).replace(/<(?=[A-Za-z/!])/g, '&lt;');

const usedDiagrams = new Set();
function transformSection(s) {
  const slug = s.page.slug;
  const out = [];
  let inFence = false;
  const imports = [];
  for (let line of s.body) {
    if (/^```/.test(line)) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    // Remove "Back to contents" links.
    if (/^\[↑ Back to contents\]\(#mxyrjhrn9ys\.\d+\)$/.test(line.trim())) continue;

    // Diagram placeholders.
    const ph = /^&#91;embedded content: (.+)\\\]$/.exec(line.trim());
    if (ph) {
      const hit = DIAGRAMS.find(([prefix]) => ph[1].startsWith(prefix));
      if (!hit) throw new Error(`Unknown placeholder: ${ph[1]}`);
      const name = hit[1];
      if (usedDiagrams.has(name)) throw new Error(`Diagram used twice: ${name}`);
      usedDiagrams.add(name);
      imports.push(`import ${name} from '../../components/diagrams/${name}';`);
      out.push(`<${name} client:visible />`);
      continue;
    }

    // Promote headings one level (### → ##).
    line = line.replace(/^(#{3,6}) /, (_, h) => `${h.slice(1)} `);

    // Rewrite internal anchors.
    line = line.replace(/\]\(#(mxyrjhrn9ys\.\d+)\)/g, (all, id) => {
      const href = anchorHref.get(id);
      if (!href) throw new Error(`Unresolved anchor #${id} in "${s.heading}"`);
      return `](${href})`;
    });

    line = outsideCode(line, (t) => linkCrossRefs(mdxSafe(t), slug));

    // Concept definitions: "- **1.1 Title.** …" → anchored number.
    line = line.replace(
      /^- \*\*(\d+\.\d+) /,
      (_, num) => `- **<a id="${conceptId(num)}" class="concept-num" href="#${conceptId(num)}">${num}</a> `,
    );
    out.push(line);
  }
  return { imports, body: out.join('\n').replace(/\n{3,}/g, '\n\n').trim() };
}

// ---------------------------------------------------------------- write
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (f.endsWith('.mdx') || f.endsWith('.md')) rmSync(join(OUT, f));

const yaml = (s) => JSON.stringify(s);
for (const s of pageSections) {
  const { imports, body } = transformSection(s);
  const fm = ['---', `title: ${yaml(s.heading)}`];
  if (s.page.slug === 'index') fm.push('tableOfContents:', '  maxHeadingLevel: 2');
  fm.push('---', '');
  const head = imports.length ? imports.join('\n') + '\n\n' : '';
  const lead = s.page.slug === 'index' && byline ? `<p class="guide-byline">${mdxSafe(byline)}</p>\n\n` : '';
  writeFileSync(join(OUT, `${s.page.slug}.mdx`), fm.join('\n') + head + lead + body + '\n');
}

const missing = DIAGRAMS.map(([, n]) => n).filter((n) => !usedDiagrams.has(n));
if (missing.length) throw new Error(`Diagrams never placed: ${missing.join(', ')}`);

console.log(`Wrote ${pageSections.length} pages, ${usedDiagrams.size} diagrams, ${conceptPage.size} concepts, ${anchorHref.size} anchors mapped.`);
