import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import RulesCarousel from '~/components/RulesCarousel.vue'

afterEach(() => {
  vi.useRealTimers()
})

describe('RulesCarousel', () => {
  it('rend les trois cartes du carrousel', () => {
    const wrapper = mount(RulesCarousel)

    expect(wrapper.findAll('article')).toHaveLength(3)
  })

  it('affiche le contenu réel de chaque carte (plus aucun texte de remplissage)', () => {
    const text = mount(RulesCarousel).text()

    expect(text).toContain('Répondez vite')
    expect(text).toContain('Débloquez des bonus !')
    expect(text).toContain('Enchaînez trois bonnes réponses pour gagner des pouvoirs.')
    expect(text).toContain('Remportez la première place !')
    expect(text).toContain(
      'Grimpez dans le classement et décrochez la première place face à tous vos adversaires.'
    )
    expect(text.toLowerCase()).not.toContain('lorem')
  })

  // RGAA 9.1 : le titre du bloc est un h2, chaque carte un h3 — pas de saut de niveau.
  it('hiérarchise les titres sans saut de niveau', () => {
    const wrapper = mount(RulesCarousel)

    expect(wrapper.findAll('h2')).toHaveLength(1)
    expect(wrapper.findAll('h3')).toHaveLength(3)
  })

  // RGAA 1.2 : les pictogrammes doublent le titre, ils sont décoratifs.
  it('rend les pictogrammes décoratifs et dimensionnés', () => {
    const images = mount(RulesCarousel).findAll('article img')

    expect(images).toHaveLength(3)
    for (const img of images) {
      expect(img.attributes('alt')).toBe('')
      expect(img.attributes('title')).toBeUndefined()
      expect(img.attributes('width')).toBeTruthy()
      expect(img.attributes('height')).toBeTruthy()
    }
  })

  // Chaque icône garde son ratio propre : pas de dimension unique pour les trois.
  it('dimensionne chaque pictogramme selon son ratio', () => {
    const sizes = mount(RulesCarousel)
      .findAll('article img')
      .map(img => `${img.attributes('width')}x${img.attributes('height')}`)

    expect(sizes).toEqual(['18x21', '15x21', '22x20'])
  })

  it('étiquette les puces de navigation et signale la carte courante', async () => {
    const wrapper = mount(RulesCarousel)
    const dots = wrapper.findAll('.dot')

    expect(dots).toHaveLength(3)
    expect(dots[0]!.attributes('aria-label')).toBe('Aller à la slide 1')
    expect(dots[0]!.attributes('aria-current')).toBe('true')

    await dots[2]!.trigger('click')

    expect(wrapper.findAll('.dot')[2]!.attributes('aria-current')).toBe('true')
    expect(wrapper.findAll('article')[2]!.attributes('aria-hidden')).toBe('false')
  })

  it('masque aux technologies d’assistance les cartes non affichées', () => {
    const hidden = mount(RulesCarousel)
      .findAll('article')
      .map(card => card.attributes('aria-hidden'))

    expect(hidden).toEqual(['false', 'true', 'true'])
  })
})
