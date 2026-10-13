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
      defaultLocale: 'root',
      locales: {
        root: {
          label: 'English',
          lang: 'en',
        },
        vi: {
          label: 'Tiếng Việt',
          lang: 'vi',
        },
      },
      customCss: ['./src/styles/custom.css'],
      sidebar: [
        {
          label: 'Start Here',
          translations: {
            vi: 'Bắt đầu',
          },
          autogenerate: { directory: 'getting-started' },
        },
        {
          label: 'Core Features',
          translations: {
            vi: 'Tính năng chính',
          },
          autogenerate: { directory: 'features' },
        },
        {
          label: 'Supported Databases',
          translations: {
            vi: 'Cơ sở dữ liệu hỗ trợ',
          },
          autogenerate: { directory: 'databases' },
        },
        {
          label: 'Deployment & Self-Hosting',
          translations: {
            vi: 'Triển khai & Tự lưu trữ',
          },
          autogenerate: { directory: 'deployment' },
        },
        {
          label: 'Reference',
          translations: {
            vi: 'Tài liệu tham khảo',
          },
          autogenerate: { directory: 'reference' },
        },
      ],
    }),
  ],
});
