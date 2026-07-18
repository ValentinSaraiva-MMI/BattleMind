import { describe, it, expect } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import AuthPanel from '~/components/AuthPanel.vue'

// Stub du composant global NuxtLink utilisé par AuthPanel.
const global = {
  stubs: {
    NuxtLink: {
      props: ['to'],
      template: '<a :href="to"><slot /></a>'
    }
  }
}

// Helper d'accessibilité (RGAA 11.1) : vérifie que chaque <input> du formulaire
// possède un id non vide, unique, et une étiquette <label for="<id>"> associée.
function expectAllInputsLabelled(wrapper: VueWrapper) {
  const inputs = wrapper.findAll('input')

  expect(inputs.length).toBeGreaterThan(0)

  const seenIds: string[] = []

  for (const input of inputs) {
    const id = input.attributes('id')

    expect(id, 'chaque <input> doit avoir un id').toBeTruthy()

    expect(
      wrapper.find(`label[for="${id}"]`).exists(),
      `un <label for="${id}"> doit exister`
    ).toBe(true)

    seenIds.push(id!)
  }

  expect(new Set(seenIds).size, 'les id des inputs doivent être uniques').toBe(seenIds.length)
}

describe('AuthPanel', () => {
  it("affiche l'onglet Connexion par défaut", () => {
    const wrapper = mount(AuthPanel, { global })

    expect(wrapper.text()).toContain('Se connecter')
    expect(wrapper.find('input[placeholder="Confirmer le mot de passe"]').exists()).toBe(false)
  })

  it("marque l'onglet actif via aria-selected", () => {
    const wrapper = mount(AuthPanel, { global })
    const tabs = wrapper.findAll('[role="tab"]')

    expect(tabs).toHaveLength(2)
    expect(tabs[0]!.attributes('aria-selected')).toBe('true')
    expect(tabs[1]!.attributes('aria-selected')).toBe('false')
  })

  it("bascule vers le formulaire d'inscription au clic sur l'onglet", async () => {
    const wrapper = mount(AuthPanel, { global })
    const inscriptionTab = wrapper.findAll('[role="tab"]')[1]!

    await inscriptionTab.trigger('click')

    expect(wrapper.find('input[placeholder="Pseudo"]').exists()).toBe(true)
    expect(wrapper.find('input[placeholder="Confirmer le mot de passe"]').exists()).toBe(true)
    expect(wrapper.text()).toContain("S'inscrire")
    expect(inscriptionTab.attributes('aria-selected')).toBe('true')
  })

  it("propose « Jouer en tant qu'invité » seulement en connexion", async () => {
    const wrapper = mount(AuthPanel, { global })

    expect(wrapper.text()).toContain("Jouer en tant qu'invité")

    await wrapper.findAll('[role="tab"]')[1]!.trigger('click')

    expect(wrapper.text()).not.toContain("Jouer en tant qu'invité")
  })

  it('met à jour le v-model du champ email (connexion)', async () => {
    const wrapper = mount(AuthPanel, { global })
    const email = wrapper.find('input[type="email"]')

    await email.setValue('joueur@battlemind.gg')

    expect((email.element as HTMLInputElement).value).toBe('joueur@battlemind.gg')
  })

  describe('accessibilité (RGAA 4.1.2 / WCAG 2.1 AA)', () => {
    it('associe une étiquette à chaque champ de connexion (RGAA 11.1)', () => {
      const wrapper = mount(AuthPanel, { global })

      expectAllInputsLabelled(wrapper)
    })

    it('associe une étiquette à chacun des 4 champs d\'inscription (RGAA 11.1)', async () => {
      const wrapper = mount(AuthPanel, { global })

      await wrapper.findAll('[role="tab"]')[1]!.trigger('click')

      expect(wrapper.findAll('input')).toHaveLength(4)
      expectAllInputsLabelled(wrapper)
    })

    it('n\'utilise jamais deux fois le même id d\'input', async () => {
      const wrapper = mount(AuthPanel, { global })

      const collectIds = () =>
        wrapper.findAll('input').map((input) => input.attributes('id'))

      const connexionIds = collectIds()

      await wrapper.findAll('[role="tab"]')[1]!.trigger('click')
      const inscriptionIds = collectIds()

      const allIds = [...connexionIds, ...inscriptionIds]
      expect(allIds.every(Boolean)).toBe(true)
      expect(new Set(allIds).size).toBe(allIds.length)
    })

    it('relie chaque role="tab" à un role="tabpanel" via aria-controls (RGAA 7.1)', () => {
      const wrapper = mount(AuthPanel, { global })
      const tabs = wrapper.findAll('[role="tab"]')

      expect(tabs).toHaveLength(2)

      for (const tab of tabs) {
        const controls = tab.attributes('aria-controls')

        expect(controls, 'chaque role="tab" doit avoir un aria-controls').toBeTruthy()

        const panel = wrapper.find(`#${controls}`)
        expect(panel.exists(), `le panneau #${controls} doit exister`).toBe(true)
        expect(panel.attributes('role')).toBe('tabpanel')
      }
    })

    it("applique hidden au panneau inactif et le retire de l'actif (RGAA 7.1)", async () => {
      const wrapper = mount(AuthPanel, { global })

      expect(wrapper.find('#panel-connexion').attributes('hidden')).toBeUndefined()
      expect(wrapper.find('#panel-inscription').attributes('hidden')).toBeDefined()

      await wrapper.findAll('[role="tab"]')[1]!.trigger('click')

      expect(wrapper.find('#panel-connexion').attributes('hidden')).toBeDefined()
      expect(wrapper.find('#panel-inscription').attributes('hidden')).toBeUndefined()
    })
  })
})
