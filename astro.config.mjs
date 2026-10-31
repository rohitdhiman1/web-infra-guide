// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';

/** @param {string} label @param {string} slug */
const page = (label, slug) => ({ label, slug });

export default defineConfig({
  devToolbar: { enabled: false },
  integrations: [
    starlight({
      title: 'Web Servers, HTTPS & nginx',
      description:
        'A concept map and hands-on course on web servers, HTTP, HTTPS/TLS and nginx.',
      customCss: ['./src/styles/custom.css'],
      lastUpdated: false,
      pagination: true,
      sidebar: [
        {
          label: 'Start here',
          items: [{ label: 'How to use this guide', link: '/' }],
        },
        {
          label: 'Phase 1 — Foundations',
          items: [
            page('Part 1 — Networking foundations', 'part-1-networking'),
            page('Part 2 — The Linux layer', 'part-2-linux'),
            page('Part 3 — HTTP/1.1 in depth', 'part-3-http11'),
          ],
        },
        {
          label: 'Phase 2 — Build a server',
          items: [page('Part 4 — Building raw web servers', 'part-4-raw-servers')],
        },
        {
          label: 'Phase 3 — Secure it',
          items: [
            page('Part 5 — TLS and HTTPS', 'part-5-tls'),
            page('Part 6 — HTTP/2 and HTTP/3', 'part-6-http2-http3'),
          ],
        },
        {
          label: 'Phase 4 — Master nginx',
          items: [
            page('Part 7 — nginx core', 'part-7-nginx-core'),
            page('One hostname, three checks', 'one-hostname-three-checks'),
            page('Part 8 — nginx as a reverse proxy', 'part-8-reverse-proxy'),
            page('Part 9 — Load balancing', 'part-9-load-balancing'),
            page('Part 10 — Caching, performance and security', 'part-10-caching-security'),
          ],
        },
        {
          label: 'Phase 5 — Production',
          items: [
            page('Part 11 — Application servers', 'part-11-app-servers'),
            page('Part 12 — Observability and debugging', 'part-12-observability'),
            page('Field guide', 'field-guide'),
            page('Part 13 — The edge', 'part-13-edge'),
            page('Part 14 — nginx in production', 'part-14-production'),
            page('Part 15 — Capstone', 'part-15-capstone'),
          ],
        },
        {
          label: 'APIs on HTTP',
          items: [
            page('Overview', 'apis'),
            page('A0 — Foundations', 'apis/a0-foundations'),
            page('A1 — HTTP semantics', 'apis/a1-http-semantics'),
            page('A2 — Errors and contracts', 'apis/a2-errors-contracts'),
            page('A3 — Reliability', 'apis/a3-reliability'),
            page('A4 — Concurrency and caching', 'apis/a4-concurrency-caching'),
            page('A5 — Collections', 'apis/a5-collections'),
          ],
        },
        {
          label: 'Reference',
          items: [
            page('Learning path and milestones', 'learning-path'),
            page('Toolkit and resources', 'toolkit'),
          ],
        },
      ],
    }),
    react(),
  ],
});
