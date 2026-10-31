# web-infra-guide

Documentation site for *Web Servers, HTTPS & nginx — Concept Map*, built with
[Astro](https://astro.build) + [Starlight](https://starlight.astro.build) and
deployed to Cloudflare Workers (static assets).

## Commands

| Command | What it does |
| --- | --- |
| `npm install` | Install dependencies |
| `npm run dev` | Local dev server at `localhost:4321` |
| `npm run build` | Build the static site into `./dist` |
| `npm run preview` | Build, then serve `./dist` through `wrangler dev` (Workers runtime) |
| `npm run deploy` | Build, then `wrangler deploy` (run `npx wrangler login` once first) |
| `npm run split-guide` | Regenerate the content pages from `source/guide.md` |

No secrets are stored in this repo; deploys use your own Wrangler login.

## Project layout

| Path | What lives there |
| --- | --- |
| `source/guide.md` | The original course export. The single source of truth for page text. |
| `scripts/split-guide.mjs` | Generates `src/content/docs/*.mdx` from the guide (verbatim text, anchors, diagram placement). |
| `scripts/check-links.mjs` | Checks every internal link and `#fragment` in `dist/` (`npm run check-links` after a build). |
| `src/content/docs/` | Generated pages, one per part. Edit `source/guide.md` and re-run `npm run split-guide` instead of editing these. |
| `src/components/diagrams/` | One React component per interactive diagram, plus shared pieces (`DiagramFrame`, `Sequence`, `shared.tsx`, `diagram.css`). |
| `astro.config.mjs` | Site title and the sidebar (Start here, Phases 1–5, Reference). |
| `wrangler.jsonc` | Cloudflare Workers static-assets config. |

Concept numbers are linkable: `/part-1-networking/#concept-1-5` jumps to concept 1.5.
