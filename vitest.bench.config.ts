import { defineConfig } from 'vitest/config';

// Повний прогін балансу — довгий і нічого не стверджує, тому живе окремо
// від `npm test`. Запуск: npm run bench
export default defineConfig({
  test: {
    include: ['bench/**/*.test.ts'],
    environment: 'node',
    testTimeout: 900000,
    hookTimeout: 900000,
  },
});
