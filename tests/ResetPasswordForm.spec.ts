// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import ResetPasswordForm from '~/components/ResetPasswordForm.vue'
import { MIN_PASSWORD_LENGTH, PASSWORD_UPDATED_MESSAGE } from '~/utils/authErrors'

// On ne stubbe que la frontière réseau (useSupabaseClient) : le vrai useAuth et
// les validateurs d'authErrors s'exécutent.
let updateUser: ReturnType<typeof vi.fn>

beforeEach(() => {
  updateUser = vi.fn().mockResolvedValue({ error: null })
  vi.stubGlobal('useSupabaseClient', () => ({ auth: { updateUser } }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const fill = async (wrapper: VueWrapper, password: string, confirm = password) => {
  await wrapper.find('#reset-password').setValue(password)
  await wrapper.find('#reset-password-confirm').setValue(confirm)
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

describe('ResetPasswordForm', () => {
  it('applique le nouveau mot de passe via updateUser', async () => {
    const wrapper = mount(ResetPasswordForm)

    await fill(wrapper, 'nouveauSecret1')

    expect(updateUser).toHaveBeenCalledWith({ password: 'nouveauSecret1' })
  })

  it('signale le succès à la page parente', async () => {
    const wrapper = mount(ResetPasswordForm)

    await fill(wrapper, 'nouveauSecret1')

    expect(wrapper.emitted('done')).toHaveLength(1)
  })

  it('affiche la confirmation avant que la page ne redirige', async () => {
    const wrapper = mount(ResetPasswordForm)

    await fill(wrapper, 'nouveauSecret1')

    const status = wrapper.find('[role="status"]')
    expect(status.exists()).toBe(true)
    expect(status.text()).toContain(PASSWORD_UPDATED_MESSAGE)
  })

  it('ne signale rien à la page parente quand Supabase refuse', async () => {
    updateUser.mockResolvedValue({ error: { code: 'weak_password' } })
    const wrapper = mount(ResetPasswordForm)

    await fill(wrapper, 'nouveauSecret1')

    expect(wrapper.emitted('done')).toBeUndefined()
    expect(wrapper.find('[role="alert"]').text()).toContain(String(MIN_PASSWORD_LENGTH))
  })

  it('reste fail closed quand l\'appel réseau lève une exception', async () => {
    updateUser.mockRejectedValue(new Error('network down'))
    const wrapper = mount(ResetPasswordForm)

    await fill(wrapper, 'nouveauSecret1')

    expect(wrapper.emitted('done')).toBeUndefined()
    // Message générique : aucun détail technique ne fuit vers l'utilisateur.
    expect(wrapper.find('[role="alert"]').text()).toContain('Une erreur est survenue')
    expect(wrapper.find('[role="alert"]').text()).not.toContain('network down')
  })

  it('bloque la soumission sans appel réseau si les mots de passe diffèrent', async () => {
    const wrapper = mount(ResetPasswordForm)

    await fill(wrapper, 'nouveauSecret1', 'nouveauSecret2')

    expect(updateUser).not.toHaveBeenCalled()
    expect(wrapper.emitted('done')).toBeUndefined()
    expect(wrapper.find('[role="alert"]').text()).toContain('ne correspondent pas')
  })

  it('bloque la soumission sans appel réseau si le mot de passe est trop court', async () => {
    const wrapper = mount(ResetPasswordForm)

    await fill(wrapper, 'abc')

    expect(updateUser).not.toHaveBeenCalled()
    expect(wrapper.find('[role="alert"]').text()).toContain(String(MIN_PASSWORD_LENGTH))
  })

  it('désactive le bouton et annonce aria-busy pendant la requête', async () => {
    let resolvePending: (value: unknown) => void = () => {}
    updateUser.mockReturnValue(new Promise((resolve) => {
      resolvePending = resolve
    }))
    const wrapper = mount(ResetPasswordForm)

    await wrapper.find('#reset-password').setValue('nouveauSecret1')
    await wrapper.find('#reset-password-confirm').setValue('nouveauSecret1')
    await wrapper.find('form').trigger('submit')
    await nextTick()

    const button = wrapper.find('button[type="submit"]')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('aria-busy')).toBe('true')

    resolvePending({ error: null })
    await flushPromises()
  })
})

describe('ResetPasswordForm — accessibilité (RGAA 4.1.2 / WCAG 2.1 AA)', () => {
  it('associe une étiquette unique à chaque champ (RGAA 11.1)', () => {
    const wrapper = mount(ResetPasswordForm)
    const inputs = wrapper.findAll('input')

    expect(inputs).toHaveLength(2)

    const ids = inputs.map((input) => input.attributes('id'))
    for (const id of ids) {
      expect(id).toBeTruthy()
      expect(wrapper.find(`label[for="${id}"]`).exists(), `label for="${id}"`).toBe(true)
    }
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('mentionne le caractère obligatoire dans l\'étiquette, pas seulement via required', () => {
    const wrapper = mount(ResetPasswordForm)

    for (const label of wrapper.findAll('label')) {
      expect(label.text()).toContain('obligatoire')
    }
    for (const input of wrapper.findAll('input')) {
      expect(input.attributes('required')).toBeDefined()
    }
  })

  it('n\'utilise pas le placeholder comme étiquette', () => {
    const wrapper = mount(ResetPasswordForm)

    for (const input of wrapper.findAll('input')) {
      expect(input.attributes('placeholder')).toBeUndefined()
    }
  })

  it('propose new-password à la saisie assistée', () => {
    const wrapper = mount(ResetPasswordForm)

    for (const input of wrapper.findAll('input')) {
      expect(input.attributes('autocomplete')).toBe('new-password')
    }
  })

  it('conserve l\'aide de saisie dans aria-describedby quand une erreur s\'ajoute', async () => {
    const wrapper = mount(ResetPasswordForm)
    const password = () => wrapper.find('#reset-password')

    expect(password().attributes('aria-describedby')).toBe('reset-password-hint')
    expect(wrapper.find('#reset-password-hint').text()).toContain(String(MIN_PASSWORD_LENGTH))

    await fill(wrapper, 'abc')

    expect(password().attributes('aria-describedby')).toBe('reset-password-hint reset-error')
    expect(password().attributes('aria-invalid')).toBe('true')
    expect(wrapper.find('#reset-error').exists()).toBe(true)
  })

  it('double la couleur d\'erreur d\'une icône et d\'un texte (RGAA 3.1)', async () => {
    const wrapper = mount(ResetPasswordForm)

    await fill(wrapper, 'abc')

    const alert = wrapper.find('[role="alert"]')
    expect(alert.find('svg[aria-hidden="true"]').exists()).toBe(true)
    expect(alert.text().trim()).not.toBe('')
  })

  it('double la couleur de succès d\'une icône et d\'un texte (RGAA 3.1)', async () => {
    const wrapper = mount(ResetPasswordForm)

    await fill(wrapper, 'nouveauSecret1')

    const status = wrapper.find('[role="status"]')
    expect(status.find('svg[aria-hidden="true"]').exists()).toBe(true)
    expect(status.text().trim()).not.toBe('')
  })
})
