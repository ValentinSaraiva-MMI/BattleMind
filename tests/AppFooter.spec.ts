// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AppFooter from '~/components/AppFooter.vue'

describe('AppFooter — logotype', () => {
  it('ne donne un nom accessible qu’au logotype, le symbole restant décoratif', () => {
    const images = mount(AppFooter).findAll('img')

    expect(images).toHaveLength(2)
    // Image décorative : alt vide et aucune autre alternative (RGAA 1.2).
    expect(images[0]!.attributes('alt')).toBe('')
    expect(images[0]!.attributes('title')).toBeUndefined()
    expect(images[0]!.attributes('aria-label')).toBeUndefined()
    expect(images[1]!.attributes('alt')).toBe('Battlemind')
  })
})

describe('AppFooter — lien de signalement', () => {
  it('pointe vers le formulaire de signalement', () => {
    const link = mount(AppFooter).find('.footer__link')

    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('https://tally.so/r/obNzoX')
  })

  it('ouvre le formulaire dans un nouvel onglet, sans fuite d’opener', () => {
    const link = mount(AppFooter).find('.footer__link')

    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener noreferrer')
  })

  it('annonce l’ouverture dans un nouvel onglet dans le nom accessible', () => {
    const link = mount(AppFooter).find('.footer__link')

    // Le libellé visible est conservé dans le nom accessible (WCAG 2.5.3).
    expect(link.text()).toContain('Signaler un problème')
    expect(link.find('.sr-only').text()).toBe('(nouvel onglet)')
  })

  it('reste un lien natif, donc atteignable au clavier sans tabindex ajouté', () => {
    const link = mount(AppFooter).find('.footer__link')

    expect(link.element.tagName).toBe('A')
    expect(link.attributes('tabindex')).toBeUndefined()
  })
})
