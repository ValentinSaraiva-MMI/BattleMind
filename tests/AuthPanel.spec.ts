import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
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

describe('AuthPanel', () => {
  it("affiche l'onglet Connexion par défaut", () => {
    const wrapper = mount(AuthPanel, { global })

    // Le formulaire de connexion propose un bouton « Se connecter ».
    expect(wrapper.text()).toContain('Se connecter')
    // Le champ « Confirmer le mot de passe » (propre à l'inscription) est absent.
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

    // Champs spécifiques à l'inscription désormais présents.
    expect(wrapper.find('input[placeholder="Pseudo"]').exists()).toBe(true)
    expect(wrapper.find('input[placeholder="Confirmer le mot de passe"]').exists()).toBe(true)
    // Bouton d'action de l'inscription.
    expect(wrapper.text()).toContain("S'inscrire")
    // L'onglet Inscription est maintenant marqué actif.
    expect(inscriptionTab.attributes('aria-selected')).toBe('true')
  })

  it("propose « Jouer en tant qu'invité » seulement en connexion", async () => {
    const wrapper = mount(AuthPanel, { global })

    // Présent sur l'onglet Connexion (v-if activeTab === 'connexion').
    expect(wrapper.text()).toContain("Jouer en tant qu'invité")

    await wrapper.findAll('[role="tab"]')[1]!.trigger('click')

    // Absent sur l'onglet Inscription.
    expect(wrapper.text()).not.toContain("Jouer en tant qu'invité")
  })

  it('met à jour le v-model du champ email (connexion)', async () => {
    const wrapper = mount(AuthPanel, { global })
    const email = wrapper.find('input[type="email"]')

    await email.setValue('joueur@battlemind.gg')

    expect((email.element as HTMLInputElement).value).toBe('joueur@battlemind.gg')
  })
})
