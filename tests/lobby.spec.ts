import { describe, it, expect } from 'vitest'
import {
  LOBBY_CATEGORIES,
  LOBBY_CODE_LENGTH,
  MAX_PLAYERS,
  MIN_PLAYERS,
  canDecrementPlayers,
  canIncrementPlayers,
  categoryLabel,
  clampMaxPlayers,
  formatLobbyCode,
  isValidLobbyCode,
  lobbyDisplayStatus,
  normalizeLobbyCode
} from '~/utils/lobby'

describe('normalizeLobbyCode', () => {
  it('ne garde que les chiffres', () => {
    expect(normalizeLobbyCode('6a5b4c3d2e1f')).toBe('654321')
  })

  it('absorbe un collage mis en forme', () => {
    expect(normalizeLobbyCode('654 321')).toBe('654321')
    expect(normalizeLobbyCode('654-321')).toBe('654321')
  })

  it('tronque au-delà de 6 chiffres', () => {
    expect(normalizeLobbyCode('1234567890')).toBe('123456')
  })

  it('renvoie une chaîne vide pour une saisie vide ou absente', () => {
    expect(normalizeLobbyCode('')).toBe('')
    expect(normalizeLobbyCode(undefined as unknown as string)).toBe('')
  })
})

describe('isValidLobbyCode', () => {
  it('accepte exactement 6 chiffres', () => {
    expect(isValidLobbyCode('654321')).toBe(true)
    expect(LOBBY_CODE_LENGTH).toBe(6)
  })

  it('refuse un code trop court', () => {
    expect(isValidLobbyCode('65432')).toBe(false)
    expect(isValidLobbyCode('')).toBe(false)
  })

  it('refuse un code sans assez de chiffres, même long', () => {
    expect(isValidLobbyCode('abcdef')).toBe(false)
    expect(isValidLobbyCode('12ab34')).toBe(false)
  })

  it('accepte un code valide noyé dans du bruit, une fois normalisé', () => {
    expect(isValidLobbyCode('654 321')).toBe(true)
  })
})

describe('formatLobbyCode', () => {
  it('sépare le code en deux groupes de trois', () => {
    expect(formatLobbyCode('654321')).toBe('654 321')
  })

  it('laisse tel quel un code non conforme plutôt que d’inventer un format', () => {
    expect(formatLobbyCode('12')).toBe('12')
  })
})

describe('clampMaxPlayers', () => {
  it('respecte les bornes de la maquette', () => {
    expect(MIN_PLAYERS).toBe(2)
    expect(MAX_PLAYERS).toBe(6)
    expect(clampMaxPlayers(1)).toBe(MIN_PLAYERS)
    expect(clampMaxPlayers(7)).toBe(MAX_PLAYERS)
    expect(clampMaxPlayers(4)).toBe(4)
  })

  it('accepte les deux extrémités sans les modifier', () => {
    expect(clampMaxPlayers(2)).toBe(2)
    expect(clampMaxPlayers(6)).toBe(6)
  })

  it('retombe sur la valeur par défaut si le nombre n’est pas fini', () => {
    expect(clampMaxPlayers(Number.NaN)).toBe(MAX_PLAYERS)
    expect(clampMaxPlayers(Number.POSITIVE_INFINITY)).toBe(MAX_PLAYERS)
  })

  it('tronque les décimales', () => {
    expect(clampMaxPlayers(3.9)).toBe(3)
  })
})

describe('bornes du stepper', () => {
  it('désactive « − » à 2 et « + » à 6', () => {
    expect(canDecrementPlayers(MIN_PLAYERS)).toBe(false)
    expect(canIncrementPlayers(MAX_PLAYERS)).toBe(false)
  })

  it('autorise les deux sens entre les bornes', () => {
    expect(canDecrementPlayers(4)).toBe(true)
    expect(canIncrementPlayers(4)).toBe(true)
  })
})

describe('categoryLabel', () => {
  it('expose les 5 catégories de l’enum question_category', () => {
    expect(LOBBY_CATEGORIES.map(category => category.value)).toEqual([
      'culture_generale',
      'sciences',
      'histoire',
      'musique',
      'tech'
    ])
  })

  it('traduit une valeur d’enum en libellé lisible', () => {
    expect(categoryLabel('culture_generale')).toBe('Culture générale')
    expect(categoryLabel('tech')).toBe('Tech')
  })

  it('retombe sur la valeur brute pour une catégorie inconnue', () => {
    expect(categoryLabel('cinema')).toBe('cinema')
  })
})

describe('lobbyDisplayStatus', () => {
  it('marque « full » dès que la capacité est atteinte', () => {
    expect(lobbyDisplayStatus(6, 6)).toBe('full')
    expect(lobbyDisplayStatus(7, 6)).toBe('full')
  })

  it('reste « waiting » tant qu’il reste une place', () => {
    expect(lobbyDisplayStatus(5, 6)).toBe('waiting')
    expect(lobbyDisplayStatus(0, 6)).toBe('waiting')
  })
})
