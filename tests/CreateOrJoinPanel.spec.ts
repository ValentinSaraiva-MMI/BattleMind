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
  })

  it('met à jour le v-model du code saisi', async () => {
    const wrapper = mount(CreateOrJoinPanel)
    const input = wrapper.find('input')

    await input.setValue('AB12CD')

    expect((input.element as HTMLInputElement).value).toBe('AB12CD')
  })

  it('propose les deux actions : créer et rejoindre', () => {
    const wrapper = mount(CreateOrJoinPanel)

    expect(wrapper.text()).toContain('Créer une partie')
    expect(wrapper.text()).toContain('Rejoindre une partie')
    // « Rejoindre » soumet le formulaire du code.
    expect(wrapper.find('form button[type="submit"]').exists()).toBe(true)
  })
})
