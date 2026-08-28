import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: [],
    // Coverage defaults — used by `pnpm test:coverage`. Thresholds are
    // intentionally lenient at this stage; auth is the only module with
    // hard coverage requirements (per CLAUDE.md).
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/__tests__/**',
        'src/server.ts',
        'src/prisma/**',
        'src/config/**',
      ],
    },
  },
});
