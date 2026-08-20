import { describe, it, expect } from 'vitest'
import {
  mapAuthError,
  validatePassword,
  validatePasswordsMatch,
  validateResetRequest,
  validateSignupForm,
  MIN_PASSWORD_LENGTH,
  RESET_EMAIL_SENT_MESSAGE
} from '~/utils/authErrors'

describe('mapAuthError', () => {
  it('traduit invalid_credentials via le code stable', () => {
    expect(mapAuthError({ code: 'invalid_credentials' })).toBe('Email ou mot de passe incorrect.')
  })

  it('traduit user_already_exists via le code stable', () => {
    expect(mapAuthError({ code: 'user_already_exists' })).toContain('existe déjà')
  })

  it('mentionne la longueur minimale pour weak_password', () => {
    expect(mapAuthError({ code: 'weak_password' })).toContain(String(MIN_PASSWORD_LENGTH))
  })

  it('se replie sur le message anglais quand le code est absent', () => {
    expect(mapAuthError({ message: 'Invalid login credentials' })).toBe('Email ou mot de passe incorrect.')
  })

  it('se replie sur le statut 429 pour la limitation de débit', () => {
    expect(mapAuthError({ status: 429 })).toContain('Trop de tentatives')
  })

  it('retourne un message générique pour une erreur inconnue', () => {
    expect(mapAuthError({ code: 'code_inconnu' })).toBe('Une erreur est survenue. Réessaie dans un instant.')
  })

  it('retourne un message générique pour null / undefined (fail closed)', () => {
    expect(mapAuthError(null)).toContain('Une erreur est survenue')
    expect(mapAuthError(undefined)).toContain('Une erreur est survenue')
  })
})

describe('validatePassword', () => {
  it('rejette un mot de passe trop court', () => {
    expect(validatePassword('12345')).toContain('au moins')
  })

  it('accepte un mot de passe de longueur suffisante', () => {
    expect(validatePassword('123456')).toBeNull()
  })
})

describe('validatePasswordsMatch', () => {
  it('rejette deux mots de passe différents', () => {
    expect(validatePasswordsMatch('abcdef', 'abcdeg')).toBe('Les mots de passe ne correspondent pas.')
  })

  it('accepte deux mots de passe identiques', () => {
    expect(validatePasswordsMatch('abcdef', 'abcdef')).toBeNull()
  })
})

describe('validateSignupForm', () => {
  it('signale en priorité un mot de passe trop court', () => {
    expect(validateSignupForm({ password: '123', passwordConfirm: '123' })).toContain('au moins')
  })

  it('signale des mots de passe qui diffèrent', () => {
    expect(validateSignupForm({ password: '123456', passwordConfirm: '654321' })).toBe(
      'Les mots de passe ne correspondent pas.'
    )
  })

  it('retourne null quand le formulaire est valide', () => {
    expect(validateSignupForm({ password: '123456', passwordConfirm: '123456' })).toBeNull()
  })
})

describe('validateResetRequest', () => {
  it('réclame une adresse quand le champ est vide', () => {
    expect(validateResetRequest('')).toContain('Saisis ton adresse email')
  })

  it('ne considère pas des espaces comme une adresse', () => {
    expect(validateResetRequest('   ')).toContain('Saisis ton adresse email')
  })

  it('laisse passer une adresse renseignée (le serveur reste seul juge du format)', () => {
    expect(validateResetRequest('joueur@battlemind.gg')).toBeNull()
  })
})

describe('RESET_EMAIL_SENT_MESSAGE', () => {
  it('reste neutre : ne confirme jamais l\'existence du compte (énumération)', () => {
    expect(RESET_EMAIL_SENT_MESSAGE).toBe(
      "Si un compte existe pour cette adresse, un lien de réinitialisation vient d'être envoyé."
    )
  })
})
