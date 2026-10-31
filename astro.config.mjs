// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';

export default defineConfig({
  integrations: [
    starlight({
      title: 'Web Servers, HTTPS & nginx',
      description:
        'A concept map and hands-on course on web servers, HTTP, HTTPS/TLS and nginx.',
      customCss: ['./src/styles/custom.css'],
      sidebar: [{ label: 'Start here', items: [{ label: 'How to use this guide', link: '/' }] }],
    }),
    react(),
  ],
});
