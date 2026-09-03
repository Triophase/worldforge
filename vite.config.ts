import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // `server/` (M6.1) is a separate npm project with its own Vitest
    // config/suite — without this, the default include glob also picks
    // up its compiled `server/dist/*.test.js` output (and would run its
    // Postgres-dependent tests under the wrong jsdom environment).
    exclude: [...configDefaults.exclude, 'server/**'],
  },
})
