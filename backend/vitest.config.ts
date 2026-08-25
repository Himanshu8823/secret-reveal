import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Mock the env-dependent modules so importing them in tests doesn't try
    // to connect to Postgres / Redis.
    setupFiles: [],
  },
});
