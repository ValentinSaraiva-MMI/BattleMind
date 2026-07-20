import { describe, it, expect, beforeAll } from 'vitest'
import { mount } from '@vue/test-utils'
import ProfilPage from '~/pages/profil.vue'

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).useHead = () => {}
})

const factory = () =>
  mount(ProfilPage, {
    global: {
      stubs: {
        HubNav: { template: '<header />' },
        AppFooter: { template: '<footer />' },
        NuxtLink: { template: '<a><slot /></a>' }
      }
    }
  })

describe('page profil — intégration statique', () => {
  it('expose un seul h1', () => {
    const h1s = factory().findAll('h1')
    expect(h1s).toHaveLength(1)
    expect(h1s[0].text()).toContain('AlexTheQuizz')
  })

  it('décrit la barre XP en progressbar avec ses bornes réelles', () => {
    const bar = factory().get('[role="progressbar"]')
    expect(bar.attributes('aria-valuenow')).toBe('4250')
    expect(bar.attributes('aria-valuemin')).toBe('0')
    expect(bar.attributes('aria-valuemax')).toBe('6000')
    expect(bar.attributes('aria-label')).toBeTruthy()
  })

  it('rend la déconnexion comme un vrai bouton', () => {
    const btn = factory().get('.logout')
    expect(btn.element.tagName).toBe('BUTTON')
    expect(btn.attributes('type')).toBe('button')
  })

  it('ne saute aucun niveau de titre', () => {
    const levels = factory()
      .findAll('h1, h2, h3, h4')
      .map(h => Number(h.element.tagName[1]))
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1)
    }
  })

  it('donne une alternative vide à toutes les icônes décoratives', () => {
    for (const img of factory().findAll('img')) {
      expect(img.attributes('alt')).toBe('')
      expect(img.attributes('title')).toBeUndefined()
      expect(img.attributes('aria-label')).toBeUndefined()
    }
  })

  it('affiche les valeurs de la maquette', () => {
    const text = factory().text()
    for (const v of ['142', '89', '62,7%', '57', '4,250 / 6,000 XP', '1,250', 'alex@battlemind.gg']) {
      expect(text).toContain(v)
    }
  })
})
