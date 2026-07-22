// Expose les auto-imports Vue en globals (comme Nuxt), pour tester sans runtime Nuxt.
import * as vue from 'vue'

const autoImports = [
  'ref',
  'reactive',
  'computed',
  'watch',
  'watchEffect',
  'onMounted',
  'onBeforeUnmount',
  'onUnmounted',
  'nextTick',
  'toRefs',
  'toRef'
] as const

for (const name of autoImports) {
  ;(globalThis as Record<string, unknown>)[name] = (vue as Record<string, unknown>)[name]
}
