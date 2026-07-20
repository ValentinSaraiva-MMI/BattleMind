import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CreateOrJoinPanel from '~/components/CreateOrJoinPanel.vue'

describe('CreateOrJoinPanel', () => {
  it('associe une étiquette au champ code (le placeholder ne fait pas office de label)', () => {
    const wrapper = mount(CreateOrJoinPanel)
    const input = wrapper.find('input')
    const label = wrapper.find(`label[for="${input.attributes('id')}"]`)

    expect(input.attributes('id')).toBe('join-code')
    expect(label.exists()).toBe(true)
    // L'étiquette mentionne le caractère obligatoire du champ.
    expect(label.text()).toContain('obligatoire')
  })

  it('marque le champ code comme obligatoire et limité à 6 caractères', () => {
    const wrapper = mount(CreateOrJoinPanel)
    const input = wrapper.find('input')

    expect(input.attributes('required')).toBeDefined()
    expect(input.attributes('maxlength')).toBe('6')
    expect(input.attributes('inputmode')).toBe('numeric')
  })

  it('filtre la saisie pour ne conserver que les chiffres', async () => {
    const wrapper = mount(CreateOrJoinPanel)
    const input = wrapper.find('input')

    await input.setValue('6a5b4c3d2e1f')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.emitted('join')![0]).toEqual(['654321'])
  })

  it('propose les deux actions : créer et rejoindre', () => {
    const wrapper = mount(CreateOrJoinPanel)

    expect(wrapper.text()).toContain('Créer une partie')
    expect(wrapper.text()).toContain('Rejoindre une partie')
    // « Rejoindre » soumet le formulaire du code.
    expect(wrapper.find('form button[type="submit"]').exists()).toBe(true)
  })

  it('émet « create » sans ouvrir la modale elle-même', async () => {
    const wrapper = mount(CreateOrJoinPanel)

    await wrapper.find('button[type="button"]').trigger('click')

    expect(wrapper.emitted('create')).toHaveLength(1)
  })

  it('relie le message d’erreur au champ et l’annonce comme alerte', () => {
    const wrapper = mount(CreateOrJoinPanel, {
      props: { errorMessage: 'Aucune partie ouverte ne correspond à ce code.' }
    })

    const alert = wrapper.find('[role="alert"]')
    const input = wrapper.find('input')

    expect(alert.exists()).toBe(true)
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(input.attributes('aria-describedby')).toBe(alert.attributes('id'))
    // Erreur doublée d'une icône : jamais portée par la seule couleur (RGAA 3.1).
    expect(alert.find('img').exists()).toBe(true)
  })

  it('verrouille les deux actions pendant une jonction', () => {
    const wrapper = mount(CreateOrJoinPanel, { props: { pending: true } })

    for (const button of wrapper.findAll('button')) {
      expect(button.attributes('disabled')).toBeDefined()
    }
    expect(wrapper.find('input').attributes('disabled')).toBeDefined()
  })
})
