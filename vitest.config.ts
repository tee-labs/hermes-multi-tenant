import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '../../src/config/loader.js': path.resolve(__dirname, 'src/config/loader.ts'),
      '../../src/types/config.js': path.resolve(__dirname, 'src/types/config.ts'),
      '../../src/store/db.js': path.resolve(__dirname, 'src/store/db.ts'),
      '../../src/store/tenant-store.js': path.resolve(__dirname, 'src/store/tenant-store.ts'),
    },
  },
});