// Expose les auto-imports Vue globalement (ref, reactive…), comme Nuxt en prod,
// pour que les composants tournent en test sans runtime Nuxt.
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
