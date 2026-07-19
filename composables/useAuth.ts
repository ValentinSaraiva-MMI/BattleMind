import { mapAuthError } from '~/utils/authErrors'

// Couche fine autour de Supabase Auth : isole les appels réseau et centralise
// l'état (chargement, messages, redirection). Logique pure : ~/utils/authErrors.
export function useAuth() {
  const supabase = useSupabaseClient()

  const loading = ref(false)
  const errorMessage = ref('')
  const infoMessage = ref('')

  const reset = () => {
    errorMessage.value = ''
    infoMessage.value = ''
  }

  /** Connexion email / mot de passe. Redirige vers le hub au succès. */
  const signIn = async (email: string, password: string): Promise<boolean> => {
    loading.value = true
    reset()
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        errorMessage.value = mapAuthError(error)
        return false
      }
      await navigateTo('/')
      return true
    } catch (error) {
      // Fail closed : toute exception réseau devient un message utilisateur sûr.
      errorMessage.value = mapAuthError(error)
      return false
    } finally {
      loading.value = false
    }
  }

  /**
   * Inscription email / mot de passe. Le `pseudo` part en métadonnées pour le
   * trigger SQL qui crée la ligne `profiles`. Confirmation email active : sans
   * session immédiate on affiche un message de vérification, sinon on redirige.
   */
  const signUp = async (pseudo: string, email: string, password: string): Promise<boolean> => {
    loading.value = true
    reset()
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { pseudo },
          // Callback exclu du middleware ; URL à autoriser dans Supabase (Redirect URLs).
          emailRedirectTo: `${window.location.origin}/confirm`
        }
      })
      if (error) {
        errorMessage.value = mapAuthError(error)
        return false
      }
      if (data.session) {
        await navigateTo('/')
        return true
      }
      infoMessage.value = 'Compte créé. Vérifie ta boîte mail pour confirmer ton adresse.'
      return true
    } catch (error) {
      errorMessage.value = mapAuthError(error)
      return false
    } finally {
      loading.value = false
    }
  }

  /**
   * Connexion OAuth Discord. Redirige le navigateur vers Discord ; au retour sur
   * /confirm, le plugin Supabase échange le code contre une session (cf.
   * pages/confirm.vue). Le pseudo Discord (raw_user_meta_data.full_name) alimente
   * le trigger SQL qui crée la ligne `profiles`.
   */
  const signInWithDiscord = async (): Promise<boolean> => {
    loading.value = true
    reset()
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'discord',
        options: {
          redirectTo: `${window.location.origin}/confirm`
        }
      })
      if (error) {
        errorMessage.value = mapAuthError(error)
        return false
      }
      // Succès : supabase-js déclenche la redirection plein écran vers Discord.
      return true
    } catch (error) {
      // Fail closed : toute exception réseau devient un message utilisateur sûr.
      errorMessage.value = mapAuthError(error)
      return false
    } finally {
      loading.value = false
    }
  }

  return { loading, errorMessage, infoMessage, signIn, signUp, signInWithDiscord }
}
