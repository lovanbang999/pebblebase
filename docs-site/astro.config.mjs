import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
  site: 'https://lovanbang999.github.io',
  base: '/pebblebase',
  integrations: [
    starlight({
      title: 'Pebblebase Studio',
      logo: {
        src: './src/assets/logo.svg',
      },
      social: {
        github: 'https://github.com/lovanbang999/pebblebase',
      },
      editLink: {
        baseUrl: 'https://github.com/lovanbang999/pebblebase/edit/main/docs-site/',
      },
      customCss: ['./src/styles/custom.css'],
      sidebar: [
        {
          label: 'Start Here',
          autogenerate: { directory: 'getting-started' },
        },
        {
          label: 'Core Features',
          autogenerate: { directory: 'features' },
        },
        {
          label: 'Supported Databases',
          autogenerate: { directory: 'databases' },
        },
        {
          label: 'Deployment & Self-Hosting',
          autogenerate: { directory: 'deployment' },
        },
        {
          label: 'Reference',
          autogenerate: { directory: 'reference' },
        },
      ],
    }),
  ],
});
