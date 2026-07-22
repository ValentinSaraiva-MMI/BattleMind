import { describe, it, expect } from 'vitest'
import {
  ROUND_DURATION_S,
  TOTAL_ROUNDS,
  answerState,
  formatRoundProgress,
  initialsOf,
  isLastRound,
  ordinalFr,
  rankPlayers,
  remainingSeconds,
  splitStandings,
  xpForScore,
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

describe('remainingSeconds', () => {
  // Instant de départ SERVEUR fixe : le temps restant se calcule par rapport à lui,
  // jamais à un compteur local — c'est ce qui rendra la synchro 3c possible.
  const START = '2026-07-21T10:00:00.000Z'
  const t0 = Date.parse(START)

  it('vaut la durée pleine à l’instant du départ', () => {
    expect(remainingSeconds(START, t0)).toBe(ROUND_DURATION_S)
    expect(ROUND_DURATION_S).toBe(10)
  })

  it('décompte selon le temps écoulé depuis started_at', () => {
    expect(remainingSeconds(START, t0 + 3000)).toBe(7)
    // Arrondi au supérieur : 0,5 s restante s'affiche « 1 », pas « 0 ».
    expect(remainingSeconds(START, t0 + 9500)).toBe(1)
  })

  it('tombe à 0 à l’expiration et n’est jamais négatif', () => {
    expect(remainingSeconds(START, t0 + 10000)).toBe(0)
    expect(remainingSeconds(START, t0 + 15000)).toBe(0)
  })

  it('ne dépasse jamais la durée, même si l’horloge est en avance sur le serveur', () => {
    // Client légèrement en avance (started_at « dans le futur ») → borné à la durée.
    expect(remainingSeconds(START, t0 - 4000)).toBe(ROUND_DURATION_S)
  })

  it('accepte une durée personnalisée', () => {
    expect(remainingSeconds(START, t0 + 5000, 20)).toBe(15)
  })

  it('reste fail closed sur une date invalide (temps réputé écoulé)', () => {
    expect(remainingSeconds('pas-une-date', t0)).toBe(0)
    expect(remainingSeconds(START, Number.NaN)).toBe(0)
  })
})

describe('isLastRound', () => {
  it('reconnaît le dernier round de la partie', () => {
    expect(isLastRound(TOTAL_ROUNDS)).toBe(true)
    expect(isLastRound(9)).toBe(false)
  })

  it('considère tout numéro au-delà du total comme terminal (fail closed)', () => {
    expect(isLastRound(11)).toBe(true)
  })

  it('respecte un total personnalisé', () => {
    expect(isLastRound(5, 5)).toBe(true)
    expect(isLastRound(4, 5)).toBe(false)
  })

  it('tolère les entrées incohérentes sans planter', () => {
    expect(isLastRound(Number.NaN)).toBe(false)
    // Numéro décimal : tronqué avant comparaison.
    expect(isLastRound(9.9)).toBe(false)
    expect(isLastRound(10.4)).toBe(true)
  })
})

describe('xpForScore', () => {
  it('crédite 10 XP par point', () => {
    expect(xpForScore(6)).toBe(60)
    expect(xpForScore(10)).toBe(100)
    expect(xpForScore(0)).toBe(0)
  })

  it('reste à 0 sur une entrée incohérente (négatif, NaN)', () => {
    expect(xpForScore(-3)).toBe(0)
    expect(xpForScore(Number.NaN)).toBe(0)
  })
})

describe('ordinalFr', () => {
  it('donne un rang explicite en français', () => {
    expect(ordinalFr(1)).toBe('1er')
    expect(ordinalFr(2)).toBe('2e')
    expect(ordinalFr(3)).toBe('3e')
    expect(ordinalFr(10)).toBe('10e')
  })
})

describe('splitStandings', () => {
  const ranked = rankPlayers(
    [
      { userId: 'u1', pseudo: 'NeonDrifter', score: 10 },
      { userId: 'u2', pseudo: 'CipherX', score: 9 },
      { userId: 'u3', pseudo: 'NullPtr', score: 7 },
      { userId: 'u4', pseudo: 'AlexTheQuizz', score: 6 },
      { userId: 'u5', pseudo: 'ShadowNinja', score: 4 }
    ],
    'u4'
  )

  it('ordonne le podium 2e — 1er — 3e (vainqueur au centre), reste au-delà', () => {
    const { podium, rest } = splitStandings(ranked)

    // Ordre d'AFFICHAGE : le rang 2 à gauche, le rang 1 au centre, le rang 3 à droite.
    expect(podium.map(p => p.pseudo)).toEqual(['CipherX', 'NeonDrifter', 'NullPtr'])
    expect(podium.map(p => p.rank)).toEqual([2, 1, 3])
    // Le reste garde l'ordre du classement.
    expect(rest.map(p => p.pseudo)).toEqual(['AlexTheQuizz', 'ShadowNinja'])
  })

  it('gère une partie à deux joueurs (pas de 3e place)', () => {
    const { podium, rest } = splitStandings(ranked.slice(0, 2))

    expect(podium.map(p => p.rank)).toEqual([2, 1])
    expect(rest).toEqual([])
  })

  it('gère un seul joueur (juste le vainqueur)', () => {
    const { podium, rest } = splitStandings(ranked.slice(0, 1))

    expect(podium.map(p => p.rank)).toEqual([1])
    expect(rest).toEqual([])
  })

  it('tolère un classement vide', () => {
    expect(splitStandings([])).toEqual({ podium: [], rest: [] })
  })
})
