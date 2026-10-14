import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const packages = ['protocol', 'core', 'vision', 'scratch', 'packs', 'devtools', 'test-utils'];

export default defineConfig({
  resolve: {
    alias: Object.fromEntries(
      packages.map((name) => [
        `@itch/${name}`,
        fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url)),
      ]),
    ),
  },
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
  },
});
