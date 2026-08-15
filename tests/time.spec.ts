import { describe, it, expect } from 'vitest'
import { MAX_CLOCK_OFFSET_MS, clockOffset } from '~/utils/time'

// Instant de référence commun à tous les cas : l'horloge SERVEUR.
const SERVER = new Date('2026-07-21T10:00:00.000Z')
const SERVER_MS = SERVER.getTime()

describe('clockOffset — dérive de l’horloge locale', () => {
  it('rend un offset négatif quand le poste est en avance de 7 s', () => {
    // Le poste croit qu'il est 10:00:07 alors que le serveur est à 10:00:00.
    const sentAt = SERVER_MS + 7000
    const offset = clockOffset(sentAt, sentAt, SERVER)

    expect(offset).toBeCloseTo(-7000, -1)
  })

  it('rend un offset positif quand le poste est en retard de 3 s', () => {
    const sentAt = SERVER_MS - 3000
    const offset = clockOffset(sentAt, sentAt, SERVER)

    expect(offset).toBeCloseTo(3000, -1)
  })

  it('rend un offset nul quand les horloges sont alignées', () => {
    const offset = clockOffset(SERVER_MS, SERVER_MS, SERVER)

    expect(offset).toBeCloseTo(0, -1)
  })
})

describe('clockOffset — latence réseau', () => {
  it('n’attribue pas l’aller-retour à la dérive (latence symétrique)', () => {
    // Horloges alignées, 200 ms d'aller-retour : le serveur a répondu au MILIEU
    // du trajet. Attribuer l'aller entier donnerait -100, ce qui est faux.
    const sentAt = SERVER_MS - 100
    const receivedAt = SERVER_MS + 100
    const offset = clockOffset(sentAt, receivedAt, SERVER)

    expect(offset).toBeCloseTo(0, -1)
    expect(offset).not.toBeCloseTo(-100, -1)
  })
})

describe('clockOffset — entrées aberrantes (fail closed)', () => {
  it('retourne 0 sur une date serveur invalide', () => {
    expect(clockOffset(SERVER_MS, SERVER_MS, 'pas-une-date')).toBe(0)
  })

  it('retourne 0 quand la réception précède l’envoi', () => {
    // Horloge locale rectifiée en cours de mesure : l'aller-retour n'a plus de sens.
    expect(clockOffset(SERVER_MS, SERVER_MS - 5000, SERVER)).toBe(0)
  })

  it('ignore un écart supérieur au maximum toléré', () => {
    // Horloge du poste calée sur le mauvais jour : mesure jugée aberrante,
    // on retombe sur l'horloge locale plutôt que de décaler la manche d'un jour.
    const sentAt = SERVER_MS + MAX_CLOCK_OFFSET_MS + 60_000

    expect(clockOffset(sentAt, sentAt, SERVER)).toBe(0)
  })
})
