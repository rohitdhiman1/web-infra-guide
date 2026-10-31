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
