import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
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

// On ne stubbe que la frontière réseau (useSupabaseClient) et navigateTo :
// le vrai useAuth et authErrors s'exécutent (test d'intégration du composant).
let signInWithPassword: ReturnType<typeof vi.fn>
let signUp: ReturnType<typeof vi.fn>
let navigateToMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  signInWithPassword = vi.fn().mockResolvedValue({ error: null })
  // Confirmation email active : le cas nominal renvoie une inscription SANS session.
  signUp = vi.fn().mockResolvedValue({ data: { session: null }, error: null })
  navigateToMock = vi.fn()

  vi.stubGlobal('useSupabaseClient', () => ({
    auth: { signInWithPassword, signUp }
  }))
  vi.stubGlobal('navigateTo', navigateToMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// Helper RGAA 11.1 : chaque <input> a un id unique et un <label for> associé.
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

  describe('branchement Supabase', () => {
    it('appelle signInWithPassword avec les identifiants saisis (connexion)', async () => {
      const wrapper = mount(AuthPanel, { global })

      await wrapper.find('#login-email').setValue('joueur@battlemind.gg')
      await wrapper.find('#login-password').setValue('secret123')
      await wrapper.find('#panel-connexion').trigger('submit')
      await flushPromises()

      expect(signInWithPassword).toHaveBeenCalledWith({
        email: 'joueur@battlemind.gg',
        password: 'secret123'
      })
    })

    it('redirige vers le hub après une connexion réussie', async () => {
      signInWithPassword.mockResolvedValue({ error: null })
      const wrapper = mount(AuthPanel, { global })

      await wrapper.find('#login-email').setValue('joueur@battlemind.gg')
      await wrapper.find('#login-password').setValue('secret123')
      await wrapper.find('#panel-connexion').trigger('submit')
      await flushPromises()

      expect(navigateToMock).toHaveBeenCalledWith('/')
    })

    it('transmet le pseudo en métadonnées à signUp (options.data)', async () => {
      const wrapper = mount(AuthPanel, { global })
      await wrapper.findAll('[role="tab"]')[1]!.trigger('click')

      await wrapper.find('#signup-pseudo').setValue('AlexTheQuizz')
      await wrapper.find('#signup-email').setValue('alex@battlemind.gg')
      await wrapper.find('#signup-password').setValue('secret123')
      await wrapper.find('#signup-password-confirm').setValue('secret123')
      await wrapper.find('#panel-inscription').trigger('submit')
      await flushPromises()

      expect(signUp).toHaveBeenCalledWith(expect.objectContaining({
        email: 'alex@battlemind.gg',
        password: 'secret123',
        options: expect.objectContaining({ data: { pseudo: 'AlexTheQuizz' } })
      }))

      // Le lien de confirmation doit ramener sur la page de callback /confirm.
      const options = signUp.mock.calls[0]![0].options
      expect(options.emailRedirectTo).toMatch(/\/confirm$/)
    })

    it('affiche un message de vérification si aucune session (confirmation email active)', async () => {
      signUp.mockResolvedValue({ data: { session: null }, error: null })
      const wrapper = mount(AuthPanel, { global })
      await wrapper.findAll('[role="tab"]')[1]!.trigger('click')

      await wrapper.find('#signup-pseudo').setValue('Alex')
      await wrapper.find('#signup-email').setValue('alex@battlemind.gg')
      await wrapper.find('#signup-password').setValue('secret123')
      await wrapper.find('#signup-password-confirm').setValue('secret123')
      await wrapper.find('#panel-inscription').trigger('submit')
      await flushPromises()

      expect(navigateToMock).not.toHaveBeenCalled()
      const status = wrapper.find('[role="status"]')
      expect(status.exists()).toBe(true)
      expect(status.text()).toContain('Vérifie ta boîte mail')
    })
  })

  describe('erreurs accessibles (RGAA 3.1 / 7.4 / 11.10)', () => {
    it('affiche une alerte liée aux champs sur identifiants invalides (connexion)', async () => {
      signInWithPassword.mockResolvedValue({ error: { code: 'invalid_credentials' } })
      const wrapper = mount(AuthPanel, { global })

      await wrapper.find('#login-email').setValue('joueur@battlemind.gg')
      await wrapper.find('#login-password').setValue('mauvais')
      await wrapper.find('#panel-connexion').trigger('submit')
      await flushPromises()

      const alert = wrapper.find('#panel-connexion [role="alert"]')
      expect(alert.exists(), 'un conteneur role="alert" doit apparaître').toBe(true)
      expect(alert.attributes('id')).toBe('login-error')
      expect(alert.text()).toContain('Email ou mot de passe incorrect')

      const password = wrapper.find('#login-password')
      expect(password.attributes('aria-invalid')).toBe('true')
      expect(password.attributes('aria-describedby')).toBe('login-error')
    })

    it('bloque l\'inscription et alerte si les mots de passe diffèrent, sans appel réseau', async () => {
      const wrapper = mount(AuthPanel, { global })
      await wrapper.findAll('[role="tab"]')[1]!.trigger('click')

      await wrapper.find('#signup-pseudo').setValue('Alex')
      await wrapper.find('#signup-email').setValue('alex@battlemind.gg')
      await wrapper.find('#signup-password').setValue('secret123')
      await wrapper.find('#signup-password-confirm').setValue('secret124')
      await wrapper.find('#panel-inscription').trigger('submit')
      await flushPromises()

      expect(signUp).not.toHaveBeenCalled()

      const alert = wrapper.find('#panel-inscription [role="alert"]')
      expect(alert.exists()).toBe(true)
      expect(alert.attributes('id')).toBe('signup-error')
      expect(alert.text()).toContain('ne correspondent pas')

      const confirm = wrapper.find('#signup-password-confirm')
      expect(confirm.attributes('aria-invalid')).toBe('true')
      expect(confirm.attributes('aria-describedby')).toBe('signup-error')
    })

    it('désactive le bouton et annonce aria-busy pendant la requête', async () => {
      let resolvePending: (value: unknown) => void = () => {}
      signInWithPassword.mockReturnValue(new Promise((resolve) => {
        resolvePending = resolve
      }))
      const wrapper = mount(AuthPanel, { global })

      await wrapper.find('#login-email').setValue('joueur@battlemind.gg')
      await wrapper.find('#login-password').setValue('secret123')
      await wrapper.find('#panel-connexion').trigger('submit')
      await nextTick()

      const button = wrapper.find('#panel-connexion button[type="submit"]')
      expect(button.attributes('disabled')).toBeDefined()
      expect(button.attributes('aria-busy')).toBe('true')

      resolvePending({ error: null })
      await flushPromises()
    })
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
