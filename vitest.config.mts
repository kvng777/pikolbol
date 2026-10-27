import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    // The existing src/lib/__tests__/bookingService.test.ts is a tsx script, not a vitest suite.
    include: ['src/lib/agent/**/*.test.ts'],
  },
})
