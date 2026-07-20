// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import App from '~/app.vue'

// Stubs des composants Nuxt : on ne teste ici que le câblage, pas leur contenu.
const global = {
  stubs: {
    NuxtRouteAnnouncer: { template: '<div class="announcer" />' },
    NuxtLayout: { template: '<div class="layout"><slot /></div>' },
    NuxtPage: { template: '<div class="page" />' }
  }
}

describe('app.vue — câblage racine', () => {
  /**
   * Régression : `app.vue` étant personnalisé, Nuxt n'applique les layouts que si
   * <NuxtPage> est enveloppé par <NuxtLayout>. Sans ce wrapper, layouts/default.vue
   * est ignoré en silence — l'en-tête disparaît de toutes les pages sans qu'aucun
   * test de layout monté isolément ne s'en aperçoive.
   */
  it('enveloppe NuxtPage dans NuxtLayout pour que les layouts s\'appliquent', () => {
    const layout = mount(App, { global }).find('.layout')

    expect(layout.exists(), '<NuxtLayout> doit envelopper la page').toBe(true)
    expect(layout.find('.page').exists(), '<NuxtPage> doit être dans le layout').toBe(true)
  })

  it('annonce les changements de route (RGAA 7.4)', () => {
    expect(mount(App, { global }).find('.announcer').exists()).toBe(true)
  })
})
