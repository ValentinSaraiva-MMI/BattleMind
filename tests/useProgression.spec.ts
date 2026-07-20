import { describe, it, expect } from 'vitest'
import { winRate, levelFromXp, xpProgress, XP_PER_LEVEL } from '~/composables/useProgression'

describe('winRate', () => {
  it('renvoie null quand aucune partie n\'a été jouée (profil neuf)', () => {
    // REC-012 : pas de division par zéro, l'appelant affiche « — ».
    expect(winRate(0, 0)).toBeNull()
  })

  it('renvoie null pour un compteur de parties négatif ou incohérent', () => {
    expect(winRate(0, -3)).toBeNull()
    expect(winRate(5, Number.NaN)).toBeNull()
  })

  it('calcule le pourcentage de victoires', () => {
    expect(winRate(89, 142)).toBeCloseTo(62.676, 3)
    expect(winRate(1, 4)).toBe(25)
  })

  it('gère les bornes 0 % et 100 %', () => {
    expect(winRate(0, 10)).toBe(0)
    expect(winRate(10, 10)).toBe(100)
  })

  it('plafonne à 100 % si les victoires dépassent les parties jouées', () => {
    expect(winRate(15, 10)).toBe(100)
  })

  it('reste exact sur des valeurs élevées', () => {
    expect(winRate(500_000, 1_000_000)).toBe(50)
  })
})

describe('levelFromXp', () => {
  it('démarre au niveau 1 à 0 XP', () => {
    expect(levelFromXp(0)).toBe(1)
  })

  it('reste au niveau 1 juste avant le premier palier', () => {
    expect(levelFromXp(XP_PER_LEVEL - 1)).toBe(1)
  })

  it('passe au niveau suivant au palier exact', () => {
    expect(levelFromXp(XP_PER_LEVEL)).toBe(2)
    expect(levelFromXp(XP_PER_LEVEL * 2)).toBe(3)
  })

  it('déduit le niveau d\'une XP quelconque', () => {
    expect(levelFromXp(6250)).toBe(13)
  })

  it('traite une XP négative ou invalide comme 0 (fail closed)', () => {
    expect(levelFromXp(-100)).toBe(1)
    expect(levelFromXp(Number.NaN)).toBe(1)
  })

  it('reste cohérent sur des valeurs élevées', () => {
    expect(levelFromXp(1_000_000)).toBe(2001)
  })
})

describe('xpProgress', () => {
  it('renvoie une barre vide à 0 XP', () => {
    expect(xpProgress(0)).toEqual({ current: 0, target: XP_PER_LEVEL, percent: 0 })
  })

  it('repart de zéro à un palier exact', () => {
    expect(xpProgress(XP_PER_LEVEL)).toEqual({ current: 0, target: XP_PER_LEVEL, percent: 0 })
    expect(xpProgress(XP_PER_LEVEL * 7)).toEqual({ current: 0, target: XP_PER_LEVEL, percent: 0 })
  })

  it('mesure la progression à l\'intérieur du palier courant', () => {
    expect(xpProgress(250)).toEqual({ current: 250, target: XP_PER_LEVEL, percent: 50 })
    expect(xpProgress(6250)).toEqual({ current: 250, target: XP_PER_LEVEL, percent: 50 })
  })

  it('s\'arrête juste avant 100 % en fin de palier', () => {
    const progress = xpProgress(XP_PER_LEVEL - 1)
    expect(progress.current).toBe(XP_PER_LEVEL - 1)
    expect(progress.percent).toBeLessThan(100)
  })

  it('traite une XP négative ou invalide comme 0 (fail closed)', () => {
    expect(xpProgress(-42).percent).toBe(0)
    expect(xpProgress(Number.NaN).percent).toBe(0)
  })

  it('borne toujours le pourcentage entre 0 et 100, même très haut', () => {
    const progress = xpProgress(1_000_000 + 123)
    expect(progress.percent).toBeGreaterThanOrEqual(0)
    expect(progress.percent).toBeLessThan(100)
    expect(progress.current).toBe(123)
  })
})

describe('cohérence entre niveau et barre de progression', () => {
  it('franchit un niveau exactement quand la barre se vide', () => {
    for (const xp of [0, 499, 500, 501, 999, 1000, 12_345]) {
      const level = levelFromXp(xp)
      const { current } = xpProgress(xp)
      // L'XP totale se reconstitue depuis le niveau et la progression du palier.
      expect((level - 1) * XP_PER_LEVEL + current).toBe(xp)
    }
  })
})
