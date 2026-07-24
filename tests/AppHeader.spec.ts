import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AppHeader from '~/components/AppHeader.vue'
import AppFooter from '~/components/AppFooter.vue'

// Stub du composant global NuxtLink.
const global = {
  stubs: {
    NuxtLink: {
      props: ['to'],
      template: '<a :href="to"><slot /></a>'
    }
  }
}

describe('AppHeader', () => {
  it('rend un en-tête réduit au logo, sans compteur de joueurs', () => {
    const wrapper = mount(AppHeader, { global })

    expect(wrapper.find('header').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('joueurs en ligne')
  })

  // Le logo n'est pas un lien : sur la page publique, il ne mènerait qu'à elle-même.
  it("n'expose aucun lien", () => {
    expect(mount(AppHeader, { global }).findAll('a')).toHaveLength(0)
  })

  // RGAA 1.1/1.2 : le symbole est décoratif, seul le logotype porte l'alternative.
  it('expose un seul nom accessible pour le lockup', () => {
    const wrapper = mount(AppHeader, { global })
    const alts = wrapper.findAll('img').map(img => img.attributes('alt'))

    expect(alts).toEqual(['', 'Battlemind'])
  })

  it('donne aux images décoratives aucune autre alternative', () => {
    const decorative = mount(AppHeader, { global }).findAll('img[alt=""]')

    expect(decorative).toHaveLength(1)
    for (const img of decorative) {
      expect(img.attributes('title')).toBeUndefined()
      expect(img.attributes('aria-label')).toBeUndefined()
    }
  })

  // Dimensions explicites : évite le saut de mise en page au chargement des SVG.
  it('dimensionne explicitement chaque image', () => {
    for (const img of mount(AppHeader, { global }).findAll('img')) {
      expect(img.attributes('width')).toBeTruthy()
      expect(img.attributes('height')).toBeTruthy()
    }
  })
})

describe('AppFooter', () => {
  it('rend un pied de page réduit au logotype', () => {
    const wrapper = mount(AppFooter, { global })

    expect(wrapper.find('footer').exists()).toBe(true)
    expect(wrapper.findAll('img').map(img => img.attributes('alt'))).toEqual(['', 'Battlemind'])
  })

  it('ne propose plus de liens légaux ni de contact', () => {
    const wrapper = mount(AppFooter, { global })

    expect(wrapper.findAll('a')).toHaveLength(0)
    expect(wrapper.find('nav').exists()).toBe(false)
  })
})
