// Helpers d'auth purs (sans runtime Nuxt/Supabase), testables en isolation.
// La couche réseau vit dans ~/composables/useAuth.

export interface AuthErrorLike {
  code?: string
  message?: string
  status?: number
}

export interface SignupInput {
  password: string
  passwordConfirm: string
}

// Minimum imposé par Supabase.
export const MIN_PASSWORD_LENGTH = 6

const GENERIC_MESSAGE = 'Une erreur est survenue. Réessaie dans un instant.'

// Messages FR indexés par le `code` stable de Supabase (auth v2).
const MESSAGES_BY_CODE: Record<string, string> = {
  invalid_credentials: 'Email ou mot de passe incorrect.',
  email_not_confirmed: 'Adresse email non confirmée. Vérifie ta boîte mail.',
  user_already_exists: 'Un compte existe déjà avec cette adresse email.',
  email_exists: 'Un compte existe déjà avec cette adresse email.',
  weak_password: `Mot de passe trop faible : ${MIN_PASSWORD_LENGTH} caractères minimum.`,
  over_request_rate_limit: 'Trop de tentatives. Réessaie dans un instant.',
  over_email_send_rate_limit: 'Trop de mails envoyés. Réessaie dans un instant.',
  validation_failed: 'Saisie invalide. Vérifie les champs du formulaire.'
}

// Traduit une erreur Supabase en message FR : code stable, puis message anglais,
// sinon générique. Ne divulgue jamais le détail technique (fail closed).
export function mapAuthError(error: unknown): string {
  if (!error || typeof error !== 'object') return GENERIC_MESSAGE

  const { code, message, status } = error as AuthErrorLike

  if (code && MESSAGES_BY_CODE[code]) return MESSAGES_BY_CODE[code]

  const normalized = (message ?? '').toLowerCase()
  if (normalized.includes('invalid login credentials')) return MESSAGES_BY_CODE.invalid_credentials
  if (normalized.includes('already registered') || normalized.includes('already been registered')) {
    return MESSAGES_BY_CODE.user_already_exists
  }
  if (normalized.includes('email not confirmed')) return MESSAGES_BY_CODE.email_not_confirmed
  if (normalized.includes('password should be at least')) return MESSAGES_BY_CODE.weak_password
  if (status === 429) return MESSAGES_BY_CODE.over_request_rate_limit

  return GENERIC_MESSAGE
}

export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`
  }
  return null
}

export function validatePasswordsMatch(password: string, confirm: string): string | null {
  if (password !== confirm) return 'Les mots de passe ne correspondent pas.'
  return null
}

// Retourne le premier message d'erreur, ou null si le formulaire est valide.
export function validateSignupForm(input: SignupInput): string | null {
  return validatePassword(input.password) ?? validatePasswordsMatch(input.password, input.passwordConfirm)
}
