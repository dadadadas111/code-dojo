import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/tests/setup.ts'],
    testTimeout: 30000,
    // Integration tests share a single MongoDB database (code-dojo-test).
    // Running files in parallel would cause afterEach collection-clears to race
    // across suites. Sequential execution keeps each suite fully isolated.
    fileParallelism: false,
  },
});
