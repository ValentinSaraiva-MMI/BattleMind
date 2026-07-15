// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],

  modules: [
    '@nuxt/test-utils',
    '@nuxt/eslint',
    '@nuxt/fonts',
    '@nuxt/icon',
    '@nuxt/image'
  ],

  fonts: {
    families: [
      { name: 'Saira', provider: 'google', weights: [400, 500, 600, 700] },
      { name: 'Montserrat', provider: 'google', weights: [400, 500, 600, 700] }
    ]
  }
})