import { defineConfig } from 'vitest/config';

// Сторінка живе на koshlss.github.io/chokepoint/, тому шляхи до ассетів
// мають бути з префіксом репозиторію, інакше збірка шукає їх у корені домену.
export default defineConfig({
  base: '/chokepoint/',
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    port: 5173,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
