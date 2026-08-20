// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, unref, nextTick, type Ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import ConfirmPage from '~/pages/confirm.vue'
import ResetPasswordForm from '~/components/ResetPasswordForm.vue'

// ANO-029 : /confirm est la cible commune du retour OAuth, de la confirmation
// d'inscription ET du lien de réinitialisation. Ces trois cas arrivent avec la
// même URL `?code=…` ; seul le marqueur `type=recovery` posé par nous les sépare.

type RouteStub = { query: Record<string, unknown>, hash: string }

let currentUser: Ref<Record<string, unknown> | null>
let route: RouteStub
let navigateToMock: ReturnType<typeof vi.fn>
let pluck: ReturnType<typeof vi.fn>
let updateUser: ReturnType<typeof vi.fn>
let headOptions: { title?: unknown } | null

/** Le titre est réactif : on le déréférence au moment de l'assertion. */
const pageTitle = () => unref(headOptions?.title) as string | undefined

/** Nuxt auto-importe les composants ; en isolation on les fournit explicitement. */
const mountPage = () =>
  mount(ConfirmPage, {
    attachTo: document.body,
    global: { components: { ResetPasswordForm } }
  })

beforeEach(() => {
  currentUser = ref(null)
  route = { query: {}, hash: '' }
  navigateToMock = vi.fn()
  pluck = vi.fn(() => null)
  updateUser = vi.fn().mockResolvedValue({ error: null })

  headOptions = null

  vi.stubGlobal('definePageMeta', () => {})
  vi.stubGlobal('useHead', (options: { title?: unknown }) => {
    headOptions = options
  })
  vi.stubGlobal('useSupabaseUser', () => currentUser)
  vi.stubGlobal('useRoute', () => route)
  vi.stubGlobal('useSupabaseCookieRedirect', () => ({ path: ref(null), pluck }))
  vi.stubGlobal('useSupabaseClient', () => ({ auth: { updateUser } }))
  vi.stubGlobal('navigateTo', navigateToMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('/confirm — retours OAuth et confirmation d\'inscription', () => {
  it('redirige dès qu\'une session existe, sans marqueur de réinitialisation', () => {
    currentUser.value = { sub: 'user-1' }

    const wrapper = mountPage()

    expect(navigateToMock).toHaveBeenCalledWith('/')
    wrapper.unmount()
  })

  it('restaure la page mémorisée plutôt que le hub quand le cookie en porte une', () => {
    pluck.mockReturnValue('/lobby/lobby-7')
    currentUser.value = { sub: 'user-1' }

    const wrapper = mountPage()

    expect(navigateToMock).toHaveBeenCalledWith('/lobby/lobby-7')
    wrapper.unmount()
  })

  it('n\'affiche jamais le formulaire de nouveau mot de passe', () => {
    currentUser.value = { sub: 'user-1' }

    const wrapper = mountPage()

    expect(wrapper.findComponent(ResetPasswordForm).exists()).toBe(false)
    expect(wrapper.find('#reset-password').exists()).toBe(false)
    wrapper.unmount()
  })

  it('affiche l\'attente tant qu\'aucune session n\'est établie', () => {
    const wrapper = mountPage()

    expect(navigateToMock).not.toHaveBeenCalled()
    expect(wrapper.find('[role="status"]').text()).toContain('Connexion en cours')
    wrapper.unmount()
  })

  it('renvoie vers /login quand le fournisseur signale une erreur', () => {
    route.query = { error: 'access_denied' }

    const wrapper = mountPage()

    expect(navigateToMock).toHaveBeenCalledWith('/login')
    wrapper.unmount()
  })
})

describe('/confirm — retour de réinitialisation (ANO-029)', () => {
  beforeEach(() => {
    route.query = { type: 'recovery' }
  })

  it('ne redirige pas alors qu\'une session est ouverte', () => {
    currentUser.value = { sub: 'user-1' }

    const wrapper = mountPage()

    // Le cœur de l'anomalie : rediriger ici consommerait la session de
    // récupération et laisserait l'ancien mot de passe valide.
    expect(navigateToMock).not.toHaveBeenCalled()
    expect(pluck).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('affiche le formulaire de nouveau mot de passe', () => {
    currentUser.value = { sub: 'user-1' }

    const wrapper = mountPage()

    expect(wrapper.findComponent(ResetPasswordForm).exists()).toBe(true)
    expect(wrapper.find('#reset-password').exists()).toBe(true)
    expect(wrapper.find('#reset-password-confirm').exists()).toBe(true)
    wrapper.unmount()
  })

  it('reconnaît aussi le marqueur porté par le hash (flux implicite)', () => {
    route.query = {}
    route.hash = '#access_token=abc&type=recovery'
    currentUser.value = { sub: 'user-1' }

    const wrapper = mountPage()

    expect(navigateToMock).not.toHaveBeenCalled()
    expect(wrapper.findComponent(ResetPasswordForm).exists()).toBe(true)
    wrapper.unmount()
  })

  it('patiente tant que la session du lien n\'est pas établie', async () => {
    const wrapper = mountPage()

    expect(wrapper.findComponent(ResetPasswordForm).exists()).toBe(false)
    expect(wrapper.find('[role="status"]').text()).toContain('Connexion en cours')

    currentUser.value = { sub: 'user-1' }
    await nextTick()

    expect(navigateToMock).not.toHaveBeenCalled()
    expect(wrapper.findComponent(ResetPasswordForm).exists()).toBe(true)
    wrapper.unmount()
  })

  it('redirige vers /login si aucune session ne s\'établit (lien expiré)', async () => {
    vi.useFakeTimers()
    const wrapper = mountPage()

    vi.advanceTimersByTime(8000)
    await flushPromises()

    expect(navigateToMock).toHaveBeenCalledWith('/login')
    wrapper.unmount()
  })

  it('redirige seulement après la confirmation du changement', async () => {
    vi.useFakeTimers()
    currentUser.value = { sub: 'user-1' }
    const wrapper = mountPage()

    wrapper.findComponent(ResetPasswordForm).vm.$emit('done')
    await nextTick()

    // La confirmation (role="status") doit avoir le temps d'être restituée.
    expect(navigateToMock).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1500)
    await flushPromises()

    expect(navigateToMock).toHaveBeenCalledWith('/')
    wrapper.unmount()
  })
})

describe('/confirm — accessibilité (RGAA 4.1.2 / WCAG 2.1 AA)', () => {
  it('n\'expose qu\'un seul h1, dans chacun des deux états', () => {
    const waiting = mountPage()
    expect(waiting.findAll('h1')).toHaveLength(1)
    expect(waiting.find('h1').text()).toContain('Connexion en cours')
    waiting.unmount()

    route.query = { type: 'recovery' }
    currentUser.value = { sub: 'user-1' }

    const recovery = mountPage()
    expect(recovery.findAll('h1')).toHaveLength(1)
    expect(recovery.find('h1').text()).toBe('Nouveau mot de passe')
    recovery.unmount()
  })

  it('adapte le titre de page à l\'état affiché (RGAA 8.6)', () => {
    const waiting = mountPage()
    expect(pageTitle()).toBe('Connexion en cours — Battlemind')
    waiting.unmount()

    route.query = { type: 'recovery' }

    const recovery = mountPage()
    expect(pageTitle()).toBe('Nouveau mot de passe — Battlemind')
    recovery.unmount()
  })

  it('déplace le focus sur le titre au basculement de l\'attente vers le formulaire', async () => {
    route.query = { type: 'recovery' }
    const wrapper = mountPage()

    currentUser.value = { sub: 'user-1' }
    await nextTick()
    await nextTick()

    const heading = wrapper.find('h1')
    expect(heading.attributes('tabindex')).toBe('-1')
    expect(document.activeElement).toBe(heading.element)
    wrapper.unmount()
  })

  it('place le focus sur le titre quand la session existe déjà au montage', async () => {
    route.query = { type: 'recovery' }
    currentUser.value = { sub: 'user-1' }

    const wrapper = mountPage()
    await nextTick()
    await nextTick()

    expect(document.activeElement).toBe(wrapper.find('h1').element)
    wrapper.unmount()
  })
})
