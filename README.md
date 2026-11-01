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
| `npm run check-links` | Check every internal link in the built site (after `npm run build`) |
| `npm run new-page -- apis/a11-x "A11 — X"` | Create a module page from the template |
| `npm run check-format` | Check module pages against the formatting standard (`docs/STYLE.md`) |

Needs Node 22.23.4 or newer (Astro 7); developed on Node 24.6.0.

## Deploying

Every push to `main` deploys automatically through Cloudflare Workers Builds, which is connected to this
repository on the `web-infra-guide` Worker:

| Setting | Value |
| --- | --- |
| Branch | `main` (builds for other branches are off) |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Build variable | `NODE_VERSION` = `24.6.0` |

Build logs are under the Worker's **Deployments** tab in the Cloudflare dashboard. `npm run deploy` still
deploys straight from your machine. No secrets are stored in this repo: the site is static files only, and
deploys use Cloudflare's build token or your own Wrangler login.

## Project layout

| Path | What lives there |
| --- | --- |
| `source/guide.md` | The original course export. The single source of truth for page text. |
| `scripts/split-guide.mjs` | Generates `src/content/docs/*.mdx` from the guide (verbatim text, anchors, diagram placement). |
| `scripts/check-links.mjs` | Checks every internal link and `#fragment` in `dist/` (`npm run check-links` after a build). |
| `src/content/docs/` | Generated pages, one per part. Edit `source/guide.md` and re-run `npm run split-guide` instead of editing these. |
| `src/content/docs/apis/` | The hand-written APIs on HTTP track (A0–A11). |
| `src/content/docs/foundations/`, `src/content/docs/practice/` | Hand-written pages added around the guide: C1–C2 (containers) and T0–T2 (cryptography, TLS, HTTP/2 and HTTP/3 in practice). |
| `docs/STYLE.md` | The formatting standard for module pages. A0 is the reference page. |
| `templates/module-page.mdx` | The skeleton `npm run new-page` copies. |
| `scripts/check-format.mjs`, `scripts/new-page.mjs` | The format check and the page scaffolder. |
| `src/components/content/` | `Takeaway` and `Checkpoint`, used inside pages, and static sections the generator inserts into guide pages (see `EXTRAS` in `split-guide.mjs`). |
| `src/components/diagrams/` | One React component per interactive diagram, plus shared pieces (`DiagramFrame`, `Sequence`, `shared.tsx`, `diagram.css`). |
| `astro.config.mjs` | Site title and the sidebar (Start here, Phases 1–5, APIs on HTTP, Reference). |
| `public/sidebar-resize.js` | Lets readers drag the left navigation to resize it; the width is remembered. |
| `wrangler.jsonc` | Cloudflare Workers static-assets config. |

Concept numbers are linkable: `/part-1-networking/#concept-1-5` jumps to concept 1.5.
