#!/usr/bin/env node
// Creates a new module page from templates/module-page.mdx.
//
//   npm run new-page -- apis/a11-authentication "A11 — Authentication"
//
// The module code (A11) is taken from the start of the title. The script never overwrites a page.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [slug, title] = process.argv.slice(2);
if (!slug || !title) {
  console.error('Usage: npm run new-page -- <slug> "<Title>"\n  e.g. npm run new-page -- apis/a11-authentication "A11 — Authentication"');
  process.exit(1);
}
const code = (title.match(/^([A-Z]+\d+)\b/) ?? [])[1];
if (!code) {
  console.error(`The title should start with a module code, like "A11 — Authentication". Got: "${title}"`);
  process.exit(1);
}
const root = new URL('..', import.meta.url).pathname;
const target = join(root, 'src/content/docs', `${slug}.mdx`);
if (existsSync(target)) {
  console.error(`Refusing to overwrite ${target}`);
  process.exit(1);
}
// Imports in the template assume a page one folder deep (apis/…). Adjust for the real depth.
const toSrc = '../'.repeat(2 + slug.split('/').length - 1);
const subject = title.replace(/^[A-Z]+\d+\s*[—-]\s*/, '');
const page = readFileSync(join(root, 'templates/module-page.mdx'), 'utf8')
  .replaceAll('{{TITLE}}', title)
  .replaceAll('{{CODE}}', code)
  .replaceAll('{{code}}', code.toLowerCase())
  .replaceAll('{{SUBJECT}}', subject.toLowerCase())
  .replaceAll('../../../components/', `${toSrc}components/`);
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, page);
console.log(`Created src/content/docs/${slug}.mdx

Next:
  1. Add it to the sidebar in astro.config.mjs:
       page('${title}', '${slug}'),
  2. Replace the placeholder text and delete the {/* comments */}.
  3. npm run build && npm run check-links && npm run check-format`);
