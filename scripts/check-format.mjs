#!/usr/bin/env node
// Checks module pages against the formatting standard in docs/STYLE.md (reference: /apis/a0-foundations/).
//
//   npm run check-format            check pages that use the standard; list pages that don't yet
//   npm run check-format -- --all   also show every issue on pages that don't use it yet
//
// A page "uses the standard" once it imports the Takeaway component. Only those pages can fail the check,
// so older pages can be migrated one at a time.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DOCS = join(ROOT, 'src/content/docs');
const SHOW_ALL = process.argv.includes('--all');
const MAX_TEXT_BLOCK_LINE = 64; // ```text blocks are for small diagrams; longer lines scroll on phones

/** Module pages are the ones whose title starts with a code like "A3 —". */
function modulePages() {
  const out = [];
  (function walk(dir) {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith('.mdx') && /^title:\s*"?[A-Z]+\d+\s*[—-]/m.test(readFileSync(p, 'utf8'))) out.push(p);
    }
  })(DOCS);
  return out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function check(file) {
  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');
  const issues = [];
  const at = (i, msg) => issues.push(`line ${i + 1}: ${msg}`);
  const code = (src.match(/^title:\s*"?([A-Z]+\d+)/m) ?? [])[1];

  // Frontmatter: the concepts (###) must appear in the "On this page" bar.
  if (!/tableOfContents:\s*\n\s*maxHeadingLevel:\s*3/.test(src)) issues.push('frontmatter: set tableOfContents.maxHeadingLevel to 3');

  // Body = everything after frontmatter, imports and MDX comments.
  const fmEnd = lines.indexOf('---', 1);
  let body = [];
  let inComment = false;
  let inFence = false;
  lines.forEach((l, i) => {
    if (i <= fmEnd) return;
    if (!inFence && l.trim().startsWith('{/*')) inComment = true;
    const skip = inComment || (!inFence && /^import\s/.test(l));
    if (inComment && l.includes('*/}')) inComment = false;
    if (l.trim().startsWith('```')) inFence = !inFence;
    if (!skip) body.push([i, l]);
  });
  const first = body.find(([, l]) => l.trim() !== '');
  if (!first || /^(#|<|:::|\||-|\*\*)/.test(first[1].trim())) {
    issues.push('lead: the page must open with a plain paragraph (the lead), not a heading, list, table or component');
  }

  // Imports must match use.
  for (const comp of ['Takeaway', 'Checkpoint']) {
    if (src.includes(`<${comp}>`) && !new RegExp(`^import ${comp} from`, 'm').test(src)) issues.push(`imports: <${comp}> is used but not imported`);
  }

  // Sections.
  const h2 = body.filter(([, l]) => /^## /.test(l));
  const conceptsIdx = h2.findIndex(([, l]) => l.trim() === '## Concepts');
  // A page with no concepts (like the capstone) says so with an MDX comment: {/* format: no-concepts */}
  const noConcepts = src.includes('format: no-concepts');
  if (conceptsIdx < 0 && !noConcepts) issues.push('sections: missing "## Concepts" (or mark the page {/* format: no-concepts */})');
  const gotIt = h2.find(([, l]) => /^## You['’]ve got it when/.test(l));
  if (!gotIt) issues.push(`sections: missing "## You've got it when"`);
  else {
    const after = lines.slice(gotIt[0] + 1).find((l) => l.trim() !== '');
    if (!after || !after.trim().startsWith('<Checkpoint')) at(gotIt[0], `"You've got it when" must contain a <Checkpoint> list`);
  }

  // Concepts: anchor span, badge heading, sequential numbers, a Takeaway each.
  if (conceptsIdx >= 0 && code) {
    const start = h2[conceptsIdx][0];
    const end = h2[conceptsIdx + 1]?.[0] ?? lines.length;
    const heads = [];
    for (let i = start + 1; i < end; i++) if (/^### /.test(lines[i])) heads.push(i);
    if (!heads.length) at(start, 'Concepts has no ### concept headings');
    heads.forEach((i, n) => {
      const num = n + 1;
      const want = `### <span class="concept-badge">${code}.${num}</span> `;
      if (!lines[i].startsWith(want)) at(i, `concept heading should start with: ${want}`);
      const prev = lines.slice(0, i).reverse().find((l) => l.trim() !== '');
      const anchor = `<span id="concept-${code.toLowerCase()}-${num}"></span>`;
      if (prev?.trim() !== anchor) at(i, `put ${anchor} on the line before this heading (keeps old links working)`);
      const stop = heads[n + 1] ?? end;
      if (!lines.slice(i, stop).some((l) => l.trim() === '<Takeaway>')) at(i, `concept ${code}.${num} has no <Takeaway>`);
    });
  }

  // Patterns the standard replaced.
  let fence = null;
  lines.forEach((l, i) => {
    const t = l.trim();
    if (t.startsWith('```')) {
      fence = fence ? null : t.slice(3).trim() || 'plain';
      return;
    }
    if (fence) {
      if (fence === 'text' && l.length > MAX_TEXT_BLOCK_LINE) at(i, `text block line is ${l.length} chars (max ${MAX_TEXT_BLOCK_LINE}): use a table, or wrap it`);
      return;
    }
    if (/^\*\*Takeaway:?\*\*/.test(t)) at(i, 'use <Takeaway>…</Takeaway> instead of a bold "Takeaway:" paragraph');
    if (/^\*\*[^*]+\*\*$/.test(t)) at(i, `a bold line on its own should be a #### label: "${t.replaceAll('*', '')}"`);
    if (/^- \*\*<a id="concept-/.test(t)) at(i, 'concept written as a bullet: make it a ### concept section (see A0)');
  });
  return issues;
}

let failed = 0;
const pending = [];
for (const file of modulePages()) {
  const rel = relative(ROOT, file);
  const uses = /^import Takeaway from/m.test(readFileSync(file, 'utf8'));
  const issues = check(file);
  if (uses) {
    if (issues.length) {
      failed++;
      console.log(`✗ ${rel}\n${issues.map((x) => `    ${x}`).join('\n')}`);
    } else console.log(`✓ ${rel}`);
  } else {
    pending.push([rel, issues]);
  }
}
if (pending.length) {
  console.log(`\nNot on the standard yet (${pending.length}): ${SHOW_ALL ? '' : 'run with --all for details'}`);
  for (const [rel, issues] of pending) {
    console.log(`  · ${rel}: ${issues.length} issue${issues.length === 1 ? '' : 's'}`);
    if (SHOW_ALL) console.log(issues.map((x) => `      ${x}`).join('\n'));
  }
}
if (failed) {
  console.log(`\n${failed} page(s) break the formatting standard. See docs/STYLE.md.`);
  process.exit(1);
}
