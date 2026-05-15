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
    },
  },
});