import { describe, it, expect } from 'vitest'
import {
  TOTAL_ROUNDS,
  answerState,
  formatRoundProgress,
  initialsOf,
  rankPlayers,
  type PlayerScore
} from '~/utils/game'

const PLAYERS: PlayerScore[] = [
  { userId: 'u1', pseudo: 'NeonDrifter', score: 4 },
  { userId: 'u2', pseudo: 'CipherX', score: 7 },
  { userId: 'u3', pseudo: 'AlexTheQuizz', score: 4 }
]

describe('rankPlayers', () => {
  it('trie par score décroissant et numérote les rangs', () => {
    const ranked = rankPlayers(PLAYERS, null)

    expect(ranked.map(player => player.pseudo)).toEqual([
      'CipherX', // 7
      'AlexTheQuizz', // 4, départage alphabétique
      'NeonDrifter' // 4
    ])
    expect(ranked.map(player => player.rank)).toEqual([1, 2, 3])
  })

  it('donne des rangs distincts aux ex æquo (rang par position, pas compétition)', () => {
    const ranked = rankPlayers(
      [
        { userId: 'a', pseudo: 'Bravo', score: 5 },
        { userId: 'b', pseudo: 'Alpha', score: 5 }
      ],
      null
    )

    // Même score → départage par pseudo, et deux rangs différents (1 puis 2).
    expect(ranked.map(player => ({ pseudo: player.pseudo, rank: player.rank }))).toEqual([
      { pseudo: 'Alpha', rank: 1 },
      { pseudo: 'Bravo', rank: 2 }
    ])
  })

  it('marque la ligne du joueur courant et en dérive les initiales', () => {
    const ranked = rankPlayers(PLAYERS, 'u3')
    const me = ranked.find(player => player.isMe)

    expect(me).toMatchObject({ userId: 'u3', pseudo: 'AlexTheQuizz', initials: 'AL' })
    // Une seule ligne « moi » au plus.
    expect(ranked.filter(player => player.isMe)).toHaveLength(1)
  })

  it('ne surligne personne sans joueur courant', () => {
    expect(rankPlayers(PLAYERS, null).some(player => player.isMe)).toBe(false)
  })

  it('ne mute pas le tableau reçu', () => {
    const input = [...PLAYERS]
    rankPlayers(input, null)
    expect(input).toEqual(PLAYERS)
  })

  it('tolère une liste vide', () => {
    expect(rankPlayers([], 'u1')).toEqual([])
  })
})

describe('initialsOf', () => {
  it('prend les deux premières lettres en majuscules', () => {
    expect(initialsOf('NeonDrifter')).toBe('NE')
    expect(initialsOf('ci')).toBe('CI')
  })

  it('retombe sur « ? » pour un pseudo vide ou blanc', () => {
    expect(initialsOf('   ')).toBe('?')
    expect(initialsOf('')).toBe('?')
  })
})

describe('answerState', () => {
  const outcome = { selectedKey: 'A', correctKey: 'B' }

  it('reste neutre tant qu’aucune réponse n’est verrouillée', () => {
    expect(answerState('A', null)).toBe('idle')
    expect(answerState('B', null)).toBe('idle')
  })

  it('passe la bonne réponse au vert', () => {
    expect(answerState('B', outcome)).toBe('correct')
  })

  it('passe le choix erroné au rouge', () => {
    expect(answerState('A', outcome)).toBe('incorrect')
  })

  it('laisse les autres réponses neutres', () => {
    expect(answerState('C', outcome)).toBe('idle')
    expect(answerState('D', outcome)).toBe('idle')
  })

  it('n’affiche que le vert quand le joueur a bon (choix = bonne réponse)', () => {
    const right = { selectedKey: 'C', correctKey: 'C' }
    expect(answerState('C', right)).toBe('correct')
  })
})

describe('formatRoundProgress', () => {
  it('complète le numéro à la largeur du total, façon maquette', () => {
    expect(formatRoundProgress(8)).toBe('08/10')
    expect(formatRoundProgress(10)).toBe('10/10')
    expect(TOTAL_ROUNDS).toBe(10)
  })

  it('borne les valeurs incohérentes plutôt que d’afficher 00/10 ou 11/10', () => {
    expect(formatRoundProgress(0)).toBe('01/10')
    expect(formatRoundProgress(99)).toBe('10/10')
    expect(formatRoundProgress(Number.NaN)).toBe('01/10')
  })

  it('respecte un total personnalisé', () => {
    expect(formatRoundProgress(3, 5)).toBe('3/5')
  })
})
