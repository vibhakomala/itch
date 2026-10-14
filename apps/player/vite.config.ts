import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

// Optional trusted LAN certificate for mobile camera testing.
export default defineConfig({
  base: './',
  server: {
    port: 5174,
    ...(process.env.ITCH_HTTPS_CERT && process.env.ITCH_HTTPS_KEY
      ? {
          https: {
            cert: readFileSync(process.env.ITCH_HTTPS_CERT),
            key: readFileSync(process.env.ITCH_HTTPS_KEY),
          },
        }
      : {}),
  },
});
