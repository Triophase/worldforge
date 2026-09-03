import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    // Defensive, matching the root frontend config's own fix (M6.2):
    // `npm run build`'s `dist/*.test.js` output must never be picked up
    // as a second copy of the same suite.
    exclude: [...configDefaults.exclude, 'dist/**'],
  },
})
