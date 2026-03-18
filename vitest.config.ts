import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['linkedin-summarizer/**', 'node_modules/**', 'dist/**', '.output/**'],
  },
})
