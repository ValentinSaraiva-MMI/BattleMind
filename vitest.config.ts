import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  // Compile les composants .vue, sans démarrer le runtime Nuxt.
  plugins: [vue()],
  resolve: {
    alias: {
      // Reproduit les alias Nuxt (~ et @ = racine du projet).
      '~': fileURLToPath(new URL('./', import.meta.url)),
      '@': fileURLToPath(new URL('./', import.meta.url))
    }
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    // Expose les auto-imports Vue (ref, reactive...) comme le fait Nuxt.
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['components/**/*.vue', 'pages/**/*.vue', 'composables/**/*.ts', 'utils/**/*.ts']
    }
  }
})
