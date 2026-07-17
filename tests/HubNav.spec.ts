import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import HubNav, { type PlayerSummary } from '~/components/HubNav.vue'

// Stub du composant global NuxtLink utilisé par HubNav.
const global = {
  stubs: {
    NuxtLink: {
      props: ['to'],
      template: '<a :href="to"><slot /></a>'
    }
  }
}

const player: PlayerSummary = {
  pseudo: 'AlexTheQuizz',
  initials: 'AT',
  level: 13,
  xpPercent: 67,
  battlecoins: 1250
}

describe('HubNav', () => {
  it('expose une navigation principale étiquetée avec les liens attendus', () => {
    const wrapper = mount(HubNav, { global, props: { player } })
    const nav = wrapper.find('nav')

    expect(nav.attributes('aria-label')).toBe('Navigation principale')
    const hrefs = nav.findAll('a').map(a => a.attributes('href'))
    expect(hrefs).toEqual(['/', '/classement', '/profil'])
  })

  it('affiche le Shop désactivé avec la mention « Bientôt disponible » (hors périmètre)', () => {
    const wrapper = mount(HubNav, { global, props: { player } })
    const shop = wrapper.find('[aria-disabled="true"]')

    expect(shop.exists()).toBe(true)
    expect(shop.text()).toContain('Shop')
    expect(shop.text()).toContain('Bientôt disponible')
    // Jamais un lien mort : le Shop n'est pas un lien.
    expect(shop.element.tagName).not.toBe('A')
  })

  it('désactive le bouton notifications avec un nom accessible', () => {
    const wrapper = mount(HubNav, { global, props: { player } })
    const bell = wrapper.find('button')

    expect(bell.attributes('disabled')).toBeDefined()
    expect(bell.text()).toContain('Notifications (bientôt disponible)')
  })

  it("restitue la barre d'XP comme progressbar (nom, valeur, bornes)", () => {
    const wrapper = mount(HubNav, { global, props: { player } })
    const bar = wrapper.find('[role="progressbar"]')

    expect(bar.attributes('aria-label')).toBe('Expérience vers le niveau suivant')
    expect(bar.attributes('aria-valuenow')).toBe('67')
    expect(bar.attributes('aria-valuemin')).toBe('0')
    expect(bar.attributes('aria-valuemax')).toBe('100')
  })

  it('affiche le pseudo, le niveau et le solde de battlecoins formaté', () => {
    const wrapper = mount(HubNav, { global, props: { player } })

    expect(wrapper.text()).toContain('AlexTheQuizz')
    expect(wrapper.text()).toContain('Lv.13')
    // Format « 1,250 » + unité doublée d'un libellé lecteur d'écran.
    expect(wrapper.text()).toContain('1,250')
    expect(wrapper.text()).toContain('battlecoins')
  })
})
