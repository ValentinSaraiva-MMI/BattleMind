// Expose les auto-imports Vue globalement, comme le fait Nuxt en production.
// Ainsi les composants qui utilisent `ref`, `reactive`, etc. sans les importer
// fonctionnent aussi dans les tests unitaires (config Vitest pure, sans runtime Nuxt).
import * as vue from 'vue'

const autoImports = [
  'ref',
  'reactive',
  'computed',
  'watch',
  'watchEffect',
  'onMounted',
  'onUnmounted',
  'nextTick',
  'toRefs',
  'toRef'
] as const

for (const name of autoImports) {
  ;(globalThis as Record<string, unknown>)[name] = (vue as Record<string, unknown>)[name]
}
