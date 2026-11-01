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
//   - layout only, in formatPage(), following docs/STYLE.md (the words stay the same):
//     concepts become "### <badge> Title" sections split into short paragraphs,
//     "Concepts", "In the sandbox" and "You've got it when" become sections,
//     the self-check goes in a <Checkpoint> box, standalone bold labels become
//     headings, and each diagram near the top gets a heading from its title
//   - EXTRAS: components that aren't in the guide (such as the HTTP timeline on
//     Part 3) are inserted after a page's opening paragraph
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

/**
 * Extra components that aren't in the guide. They add material without touching its wording.
 * `after: 'lead'` puts one after the opening paragraph, with a section heading;
 * `after: '2.7'` puts one right after that concept, inside its section, with no extra heading.
 * `before: 'Heading text'` puts a static content partial (src/components/content/<name>.mdx) under its own
 * `## <heading>` just before the guide's heading with that text. Used for site notes, not diagrams.
 */
const EXTRAS = {
  'part-3-http11': [{ name: 'HttpTimeline', after: 'lead' }],
  index: [{ name: 'BeyondTheGuide', before: 'The topics that give you chills', heading: 'Beyond the 15 parts' }],
  'part-2-linux': [
    { name: 'FdTable', after: '2.2' },
    { name: 'IoModels', after: '2.4' },
    { name: 'ZeroCopy', after: '2.7' },
    { name: 'EphemeralPorts', after: '2.8' },
  ],
};

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

// ---------------------------------------------------------------- layout (docs/STYLE.md)
/** Heading shown above each diagram (the diagram's own title). */
const DIAGRAM_TITLES = {
  LayerModel: 'The layer model',
  TcpLifecycle: 'TCP connection lifecycle',
  DnsResolution: 'DNS resolution',
  ConcurrencySimulator: 'Concurrency simulator',
  ChainOfTrust: 'Chain of trust',
  Tls13Handshake: 'TLS 1.3 handshake',
  TlsTermination: 'TLS termination modes',
  HolBlocking: 'Head-of-line blocking',
  LocationMatching: 'Location matching',
  HostnameChecks: 'The hostname simulator',
  ReverseProxyErrors: 'Reverse proxy errors',
  LoadBalancing: 'Load balancing simulator',
  ProxyCache: 'Proxy cache simulator',
  RateLimiting: 'Rate limiting simulator',
  GunicornBuffering: 'App server simulator',
  TomcatConnector: 'Tomcat connector simulator',
  DebuggingFlow: 'Debugging flow',
  RequestPath: 'Request path',
  LearningPath: 'The path at a glance',
  HttpTimeline: 'How HTTP got here',
};

const MAJOR = /^(Concepts|In the sandbox.*|You['’]ve got it when)$/;
const capitalise = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/** Split a long run of sentences into short paragraphs, without changing a word. */
function paragraphs(text) {
  const keep = [];
  const hold = (m) => `\u0000${keep.push(m) - 1}\u0000`;
  const t = text.replace(/`[^`]*`|\[[^\]]*\]\([^)]*\)|<[^>]+>|e\.g\./g, hold);
  const sentences = t.split(/(?<=[.!?”])\s+(?=[A-Z“(*\u0000])/).filter((x) => x.trim());
  const paras = [];
  let cur = [];
  for (const sentence of sentences) {
    cur.push(sentence);
    const joined = cur.join(' ');
    const limit = paras.length ? 300 : 230;
    if (joined.length >= limit || cur.length === 3 || (!paras.length && cur.length === 2)) {
      paras.push(joined);
      cur = [];
    }
  }
  if (cur.length) {
    const tail = cur.join(' ');
    if (paras.length && tail.length < 90 && paras.at(-1).length < 260) paras[paras.length - 1] += ` ${tail}`;
    else paras.push(tail);
  }
  return paras.map((p) => p.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[Number(i)]));
}

function formatPage(body) {
  const lines = body.split('\n');
  const out = [];
  let inFence = false;
  let seenH2 = false;
  // What the latest ## heading is: a section of the guide itself, a diagram heading, or none yet.
  // Bold labels become ### only inside a real guide section; otherwise they are sections (##).
  let lastH2 = null;
  let usesCheckpoint = false;
  for (const line of lines) {
    if (/^```/.test(line)) inFence = !inFence;
    if (inFence || /^```/.test(line)) {
      out.push(line);
      continue;
    }
    if (/^## /.test(line)) {
      seenH2 = true;
      lastH2 = 'guide';
    }

    // Concepts: "- **<a …>5.1</a> Title.** body" → anchor + badge heading + short paragraphs.
    const c = /^- \*\*<a id="(concept-[\d-]+)" class="concept-num" href="#concept-[\d-]+">([\d.]+)<\/a> (.+?)\*\* ?(.*)$/.exec(line);
    if (c) {
      const [, id, num, title, rest] = c;
      out.push(`<span id="${id}"></span>`, '', `### <span class="concept-badge">${num}</span> ${title.replace(/\.$/, '')}`, '');
      for (const p of paragraphs(rest)) out.push(p, '');
      continue;
    }

    // Diagrams near the top of a page get a section heading from their title.
    // Extras placed inside a concept keep its section and get no heading of their own.
    if (/^<[A-Za-z0-9]+ client:visible \/> \{\/\* inline \*\/\}$/.test(line)) {
      out.push(line.replace(' {/* inline */}', ''));
      continue;
    }
    const d = /^<([A-Za-z0-9]+) client:visible \/>$/.exec(line);
    if (d && DIAGRAM_TITLES[d[1]]) {
      if (lastH2 === 'guide' || lastH2 === 'major') out.push(`### ${DIAGRAM_TITLES[d[1]]}`, '', line);
      else {
        out.push(`## ${DIAGRAM_TITLES[d[1]]}`, '', line);
        lastH2 = 'diagram';
      }
      seenH2 = true;
      continue;
    }

    // Bold labels.
    const b = /^\*\*([^*]+?)\*\*(.*)$/.exec(line);
    if (b) {
      const label = b[1].trim().replace(/:$/, '');
      const rest = b[2].trim();
      if (/^You['’]ve got it when$/.test(label)) {
        usesCheckpoint = true;
        out.push("## You've got it when", '', '<Checkpoint title="">', '', capitalise(rest), '', '</Checkpoint>');
        seenH2 = true;
        lastH2 = 'major';
        continue;
      }
      const level = MAJOR.test(label) || !(lastH2 === 'guide' || lastH2 === 'major') ? '##' : '###';
      if (!rest || rest.startsWith('(') || (b[1].trim().endsWith(':') && MAJOR.test(label))) {
        out.push(`${level} ${label}`);
        if (rest) out.push('', rest.startsWith('(') ? rest : capitalise(rest));
        if (level === '##') {
          seenH2 = true;
          // A label promoted to a section sits beside the next label, not above it.
          lastH2 = MAJOR.test(label) ? 'major' : 'label';
        }
        continue;
      }
    }
    out.push(line);
  }
  return { body: out.join('\n').replace(/\n{3,}/g, '\n\n'), usesCheckpoint };
}

// ---------------------------------------------------------------- write
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (f.endsWith('.mdx') || f.endsWith('.md')) rmSync(join(OUT, f));

const yaml = (s) => JSON.stringify(s);
for (const s of pageSections) {
  const { imports, body: generated } = transformSection(s);
  // Insert any extras: after the opening paragraph, or right after a concept's line.
  let raw = generated;
  for (const { name, after, before, heading } of EXTRAS[s.page.slug] ?? []) {
    if (before) {
      imports.push(`import ${name} from '../../components/content/${name}.mdx';`);
      const lines = raw.split('\n');
      const i = lines.findIndex((l) => /^#+ /.test(l) && l.includes(before));
      if (i < 0) throw new Error(`EXTRAS: heading "${before}" not found on ${s.page.slug}`);
      lines.splice(i, 0, `## ${heading}`, '', `<${name} />`, '');
      raw = lines.join('\n');
      continue;
    }
    imports.push(`import ${name} from '../../components/diagrams/${name}';`);
    const tag = `<${name} client:visible />`;
    if (after === 'lead') {
      const cut = raw.indexOf('\n\n');
      raw = cut < 0 ? `${raw}\n\n${tag}` : `${raw.slice(0, cut)}\n\n${tag}${raw.slice(cut)}`;
    } else {
      const lines = raw.split('\n');
      const i = lines.findIndex((l) => l.includes(`id="${conceptId(after)}"`));
      if (i < 0) throw new Error(`EXTRAS: concept ${after} not found on ${s.page.slug}`);
      lines.splice(i + 1, 0, '', `${tag} {/* inline */}`, '');
      raw = lines.join('\n');
    }
  }
  const { body, usesCheckpoint } = formatPage(raw);
  if (usesCheckpoint) imports.push("import Checkpoint from '../../components/content/Checkpoint.astro';");
  const fm = ['---', `title: ${yaml(s.heading)}`];
  fm.push('tableOfContents:', '  maxHeadingLevel: 3');
  fm.push('---', '');
  const head = imports.length ? imports.join('\n') + '\n\n' : '';
  const lead = s.page.slug === 'index' && byline ? `<p class="guide-byline">${mdxSafe(byline)}</p>\n\n` : '';
  writeFileSync(join(OUT, `${s.page.slug}.mdx`), fm.join('\n') + head + lead + body + '\n');
}

const missing = DIAGRAMS.map(([, n]) => n).filter((n) => !usedDiagrams.has(n));
if (missing.length) throw new Error(`Diagrams never placed: ${missing.join(', ')}`);

console.log(`Wrote ${pageSections.length} pages, ${usedDiagrams.size} diagrams, ${conceptPage.size} concepts, ${anchorHref.size} anchors mapped.`);
