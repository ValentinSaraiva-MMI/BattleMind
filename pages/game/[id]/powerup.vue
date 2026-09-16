<script setup lang="ts">
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useGame } from '~/composables/useGame'
import { usePowerups, type DrawnPowerup } from '~/composables/usePowerups'
import { useServerTime } from '~/composables/useServerTime'
import { remainingSeconds, POWERUP_ROOM_DURATION_S, type RankedPlayer } from '~/utils/game'

const route = useRoute()
const lobbyId = computed(() => String(route.params.id ?? ''))

const { resolveUserId, fetchGameMeta, fetchLeaderboard, nextRound } = useGame()
const {
  pending,
  errorMessage,
  drawPowerup,
  applyPowerup,
  subscribeToLobbyPhase,
  unsubscribeChannel
} = usePowerups()

// Le décompte se lit sur l'horloge SERVEUR : une horloge locale en avance
// amputerait la salle d'autant (même raison que pour une question, ANO-028).
const { sync: syncServerClock, serverNow } = useServerTime()

type PageStatus = 'pending' | 'loaded' | 'error'
const status = ref<PageStatus>('pending')

// Le serveur referme la salle : tous les clients repartent sur la question.
const goToQuestion = () => navigateTo(`/game/${lobbyId.value}`)

/** Palier de bonnes réponses d'affilée donnant droit à un tirage (règle serveur). */
const POWERUP_STREAK_GOAL = 3

// Métronome : seul l'hôte referme la salle. En solo (3b), le joueur EST l'hôte.
const meId = ref<string | null>(null)
const hostId = ref<string | null>(null)
const isHost = computed(() => Boolean(meId.value) && meId.value === hostId.value)

// Résultat du tirage : `draw_powerup` décide SEULE, la page ne fait qu'afficher.
const granted = ref(false)
const streak = ref(0)
const powerup = ref<DrawnPowerup | null>(null)

const streakFilled = computed(() => Math.min(streak.value, POWERUP_STREAK_GOAL))
const isSelfTarget = computed(() => powerup.value?.target === 'self')

// Classement de l'arène : sert aussi de liste de cibles pour un malus.
const leaderboard = ref<RankedPlayer[]>([])
/** Cibles possibles d'un malus : tout le monde SAUF moi (on ne s'attaque pas). */
const opponents = computed(() => leaderboard.value.filter(player => !player.isMe))

// Activation : irréversible. Une fois la cible retenue, les commandes disparaissent.
const appliedTarget = ref('')
const applied = computed(() => appliedTarget.value !== '')
const applyError = ref('')

/** Commandes visibles seulement tant que le power-up n'a pas été joué. */
const canActivate = computed(() => granted.value && Boolean(powerup.value) && !applied.value)
const canAttack = computed(() => canActivate.value && !isSelfTarget.value)

// Décompte dérivé du départ SERVEUR de la phase, jamais d'un compteur local.
const phaseStartedAt = ref<string | null>(null)
const remaining = ref(POWERUP_ROOM_DURATION_S)

// Garde-fou : le métronome ne se déclenche qu'une fois.
const advancing = ref(false)

const RING_CIRCUMFERENCE = 2 * Math.PI * 20
const ringOffset = computed(() =>
  RING_CIRCUMFERENCE * (1 - remaining.value / POWERUP_ROOM_DURATION_S)
)

useHead({ title: 'Salle de power-up — Battlemind' })

/** Confirmation d'activation, nommant la cible retenue. */
const confirmMessage = computed(() => {
  if (!applied.value || !powerup.value) return ''
  return isSelfTarget.value
    ? `${powerup.value.name} activé. L’effet s’applique à la prochaine question.`
    : `${powerup.value.name} lancé sur ${appliedTarget.value}.`
})

/**
 * Restitution accessible (RGAA 7.4) : la confirmation est annoncée en zone
 * `status`. La zone est présente en permanence — seul son contenu change, sinon
 * l'annonce ne part pas. L'échec, lui, a déjà son `role="alert"` : l'ajouter ici
 * le ferait annoncer deux fois.
 */
const announcement = computed(() => confirmMessage.value)

// --- Décompte de la salle -------------------------------------------------
// On relit `remainingSeconds` à chaque top ; la vérité reste `phase_started_at`.
let ticker: ReturnType<typeof setInterval> | null = null

const stopTicker = () => {
  if (ticker !== null) {
    clearInterval(ticker)
    ticker = null
  }
}

const tick = () => {
  if (!phaseStartedAt.value) return
  remaining.value = remainingSeconds(
    phaseStartedAt.value,
    serverNow(),
    POWERUP_ROOM_DURATION_S
  )
  if (remaining.value === 0) void onTimeUp()
}

const startTicker = () => {
  stopTicker()
  tick() // affichage immédiat
  ticker = setInterval(tick, 250)
}

/**
 * À l'expiration : seul l'HÔTE referme la salle via `next_round` (métronome) ; un
 * non-hôte attend passivement le changement de phase via Realtime. On ne martèle
 * pas en cas d'échec — le drapeau `advancing` garantit un seul appel.
 */
const onTimeUp = async () => {
  if (!isHost.value || advancing.value || status.value !== 'loaded') return
  advancing.value = true
  stopTicker() // le décompte reste figé jusqu'à la bascule
  await nextRound(lobbyId.value)
  advancing.value = false
}

// Canal Realtime de la phase, fermé au démontage.
let phaseChannel: RealtimeChannel | null = null

onMounted(async () => {
  // Non attendu : le minuteur ne doit pas dépendre d'un aller-retour réseau.
  void syncServerClock()

  meId.value = await resolveUserId()

  const meta = await fetchGameMeta(lobbyId.value)
  if (!meta) {
    status.value = 'error'
    return
  }
  hostId.value = meta.hostId
  phaseStartedAt.value = meta.phaseStartedAt
  if (meta.phaseStartedAt) {
    remaining.value = remainingSeconds(
      meta.phaseStartedAt,
      serverNow(),
      POWERUP_ROOM_DURATION_S
    )
  }

  // Le tirage appartient à la base : elle seule sait si la série le justifie.
  const drawn = await drawPowerup(lobbyId.value)
  if (!drawn) {
    status.value = 'error'
    return
  }
  granted.value = drawn.granted
  streak.value = drawn.streak ?? 0
  powerup.value = drawn.powerup ?? null

  leaderboard.value = await fetchLeaderboard(lobbyId.value)

  status.value = 'loaded'
  startTicker()

  // Retour à la question : le serveur rebascule la phase pour TOUT le monde.
  phaseChannel = subscribeToLobbyPhase(lobbyId.value, phase => {
    if (phase === 'question') {
      stopTicker()
      goToQuestion()
    }
  })
})

// Ne laisser ni intervalle ni canal Realtime ouverts après la sortie de la page.
onUnmounted(() => {
  stopTicker()
  if (phaseChannel) unsubscribeChannel(phaseChannel)
})

/**
 * Joue le power-up. `target` n'est renseigné que pour un malus ; le serveur
 * revérifie la propriété de l'exemplaire et l'appartenance de la cible au lobby.
 * L'opération est définitive : on verrouille dès qu'elle aboutit.
 */
const onApply = async (target?: RankedPlayer) => {
  if (!powerup.value || pending.value || applied.value) return
  applyError.value = ''

  const ok = await applyPowerup(powerup.value.instanceId, target?.userId)
  if (!ok) {
    applyError.value = errorMessage.value || 'Ce power-up n’a pas pu être activé. Réessaie.'
    return
  }

  appliedTarget.value = target ? target.pseudo : 'toi'
}
</script>

<template>
  <main class="room">
    <template v-if="status === 'pending'">
      <h1 class="sr-only">Salle de power-up</h1>
      <p class="state" role="status">Ouverture de la salle…</p>
    </template>

    <template v-else-if="status === 'error'">
      <h1 class="sr-only">Salle de power-up indisponible</h1>
      <p class="state state--error" role="alert">
        <img src="/icons/close.svg" alt="" width="12" height="12">
        {{ errorMessage || 'La salle de power-up n’a pas pu s’ouvrir.' }}
      </p>
      <NuxtLink class="button button--ghost" :to="`/game/${lobbyId}`">Retour à la partie</NuxtLink>
    </template>

    <div v-else class="layout">
      <section class="stage">
        <div class="stage__header">
          <p class="stage__label">Power-ups</p>

          <div class="timer" role="timer" aria-label="Temps restant dans la salle de power-up">
            <svg class="timer__ring" viewBox="0 0 44 44" aria-hidden="true">
              <circle class="timer__track" cx="22" cy="22" r="20" fill="none" />
              <circle
                class="timer__progress"
                cx="22"
                cy="22"
                r="20"
                fill="none"
                :stroke-dasharray="RING_CIRCUMFERENCE"
                :stroke-dashoffset="ringOffset"
              />
            </svg>
            <span class="timer__value" aria-hidden="true">{{ remaining }}</span>
          </div>
        </div>

        <!-- Tirage refusé : ce n'est PAS une panne, rien n'emprunte le registre d'erreur. -->
        <template v-if="!granted || !powerup">
          <div class="miss">
            <span class="miss__badge">
              <img src="/icons/timer.svg" alt="" width="24" height="28">
            </span>
            <h1 class="miss__title">Encore un effort !</h1>
            <p class="miss__text">
              Aucun power-up obtenu pour cette manche.
              Reste concentré, la prochaine est la bonne.
            </p>
          </div>

          <div class="streak">
            <div class="streak__header">
              <h2 class="streak__title">
                <img src="/icons/bolt.svg" alt="" width="12" height="15">
                Série de victoires
              </h2>
              <p class="streak__count">
                <span aria-hidden="true">{{ streakFilled }} / {{ POWERUP_STREAK_GOAL }}</span>
                <span class="sr-only">
                  {{ streakFilled }} bonne réponse d’affilée sur {{ POWERUP_STREAK_GOAL }}
                </span>
              </p>
            </div>

            <!-- Doublon visuel du compteur ci-dessus : rien à restituer en plus. -->
            <div class="streak__bar" aria-hidden="true">
              <span
                v-for="step in POWERUP_STREAK_GOAL"
                :key="step"
                class="streak__step"
                :class="{ 'streak__step--filled': step <= streakFilled }"
              />
            </div>

            <p class="streak__hint">
              Il faut {{ POWERUP_STREAK_GOAL }} bonnes réponses d’affilée pour
              <span class="streak__hint-strong">débloquer un power-up</span>.
            </p>
          </div>
        </template>

        <!-- Tirage accordé : la base a déjà décidé du power-up, on le restitue. -->
        <div v-else class="reward">
          <p class="reward__eyebrow">Récompense</p>

          <span class="reward__badge" :class="`reward__badge--${powerup.kind}`">
            <img
              class="reward__glyph"
              :src="powerup.kind === 'bonus'
                ? '/icons/powerup-bonus.svg'
                : '/icons/powerup-malus.svg'"
              alt=""
              width="72"
              height="72"
            >
          </span>

          <h1 class="reward__name">{{ powerup.name }}</h1>

          <!-- Nature de l'effet en toutes lettres : jamais la seule couleur (RGAA 3.1). -->
          <p class="reward__kind" :class="`reward__kind--${powerup.kind}`">
            <img src="/icons/bolt.svg" alt="" width="8" height="10">
            {{ powerup.kind === 'bonus' ? 'Bonus' : 'Malus' }}
          </p>

          <p class="reward__description">{{ powerup.description }}</p>

          <!-- Activation jouée : les commandes cèdent la place à la confirmation. -->
          <p v-if="applied" class="reward__done">{{ confirmMessage }}</p>

          <button
            v-else-if="isSelfTarget"
            class="button button--activate"
            type="button"
            :disabled="pending"
            @click="onApply()"
          >
            Activer {{ powerup.name }}
          </button>

          <p v-else-if="opponents.length" class="reward__hint">
            Choisis le joueur à viser dans le classement.
          </p>
          <p v-else class="reward__hint">
            Aucun adversaire à viser dans cette partie : ce malus restera inutilisé.
          </p>

          <p v-if="applyError" class="state state--error" role="alert">
            <img src="/icons/close.svg" alt="" width="12" height="12">
            {{ applyError }}
          </p>
        </div>

        <p class="sr-only" role="status">{{ announcement }}</p>
      </section>

      <aside class="hud">
        <section class="leaderboard" aria-labelledby="leaderboard-title">
          <h2 id="leaderboard-title" class="leaderboard__title">
            <img src="/icons/rank.svg" alt="" width="16" height="16">
            Classement de l’arène
          </h2>

          <ol class="leaderboard__list">
            <li
              v-for="player in leaderboard"
              :key="player.userId"
              class="rank"
              :class="{ 'rank--me': player.isMe }"
            >
              <span class="rank__line">
                <span class="rank__position">{{ player.rank }}</span>
                <span class="rank__avatar" aria-hidden="true">{{ player.initials }}</span>
                <span class="rank__pseudo">
                  {{ player.pseudo }}
                  <span v-if="player.isMe" class="sr-only">(toi)</span>
                </span>
                <span class="rank__score">{{ player.score }} pts</span>
              </span>

              <!-- Cible d'un malus. Le bouton reste dans le DOM et se révèle au
                   survol OU au focus clavier : sans quoi il serait inatteignable
                   au clavier (RGAA 10.7 / 12). -->
              <button
                v-if="canAttack && !player.isMe"
                class="attack"
                type="button"
                :disabled="pending"
                :aria-label="`Attaquer ${player.pseudo}`"
                @click="onApply(player)"
              >
                <img src="/icons/powerup-malus.svg" alt="" width="12" height="12">
                Attaquer
              </button>
            </li>
          </ol>
        </section>

        <img class="hud__logo" src="/icons/logo-symbole-footer.svg" alt="" width="46" height="35">
      </aside>
    </div>
  </main>
</template>

<style scoped>
.room {
  display: flex;
  flex: 1;
  flex-direction: column;
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
}

.layout {
  display: flex;
  flex: 1;
  align-items: stretch;
  min-height: 0;
}

/* --- Colonne centrale -------------------------------------------------- */

.stage {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 24px;
  min-width: 0;
  padding: 42px;
  border-right: 1px solid var(--color-border-subtle);
}

.stage__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.stage__label {
  margin: 0;
  color: var(--color-text-muted);
  font-family: var(--font-body);
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  line-height: normal;
}

/* --- Compte à rebours (dérivé de phase_started_at côté serveur) --------- */

.timer {
  position: relative;
  display: flex;
  width: 64px;
  height: 64px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
}

.timer__ring {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  /* Départ à 12 h, vidage horaire. */
  transform: rotate(-90deg);
}

.timer__track {
  stroke: var(--color-border-subtle);
  stroke-width: 4;
}

/* Objet graphique porteur d'info → contraste ≥ 3:1. */
.timer__progress {
  stroke: var(--color-success);
  stroke-width: 4;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.25s linear;
}

.timer__value {
  position: relative;
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  line-height: 1;
}

/* --- Tirage refusé ----------------------------------------------------- */

.miss {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  min-height: 0;
  padding: 33px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  background-color: var(--color-surface-overlay);
  text-align: center;
}

.miss__badge {
  display: flex;
  width: 80px;
  height: 80px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-text-muted);
  border-radius: 9999px;
  background-color: var(--color-surface-overlay);
}

.miss__title {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: var(--text-question);
  font-weight: var(--weight-semibold);
  letter-spacing: 1px;
  line-height: normal;
}

.miss__text {
  max-width: 34ch;
  margin: 0;
  color: var(--color-text-muted);
  font-family: var(--font-body);
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  line-height: normal;
}

/* --- Série de victoires ------------------------------------------------ */

.streak {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 25px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  background-color: var(--color-surface-overlay);
}

.streak__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.streak__title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: var(--text-md);
  font-weight: var(--weight-medium);
  letter-spacing: 1px;
  line-height: 20px;
  text-transform: uppercase;
}

.streak__count {
  margin: 0;
  flex-shrink: 0;
  color: var(--color-success);
  font-family: var(--font-display);
  font-size: var(--text-md);
  font-weight: var(--weight-medium);
  letter-spacing: 1px;
  line-height: 20px;
}

.streak__bar {
  display: flex;
  gap: 8px;
}

.streak__step {
  flex: 1;
  height: 12px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 9999px;
  background-color: var(--color-accent-subtle);
}

/* Palier franchi : lueur portée par le jeton, jamais une couleur écrite en dur. */
.streak__step--filled {
  border-color: var(--color-success);
  background-color: var(--color-success);
  box-shadow: 0 0 8px 0 var(--color-success-subtle);
}

.streak__hint {
  margin: 0;
  color: var(--color-text-muted);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  line-height: 20px;
  text-align: center;
}

.streak__hint-strong {
  color: var(--color-accent);
}

/* --- Tirage accordé ---------------------------------------------------- */

.reward {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  min-height: 0;
  text-align: center;
}

.reward__eyebrow {
  margin: 0;
  color: var(--color-accent);
  font-family: var(--font-display);
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  letter-spacing: 2.8px;
  line-height: 20px;
  text-transform: uppercase;
}

/* Objet graphique porteur d'info → contraste ≥ 3:1 (RGAA 3.3). */
.reward__badge {
  display: flex;
  width: 192px;
  height: 192px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 2px solid currentcolor;
  border-radius: 9999px;
  background-color: var(--color-surface-overlay);
}

.reward__badge--bonus {
  color: var(--color-success);
  box-shadow: 0 0 30px 0 var(--color-success-subtle);
}

.reward__badge--malus {
  color: var(--color-danger);
  box-shadow: 0 0 30px 0 var(--color-danger-subtle);
}

/* `contain` : les deux glyphes n'ont pas le même rapport, aucun ne doit s'étirer. */
.reward__glyph {
  width: 72px;
  height: 72px;
  object-fit: contain;
}

.reward__name {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: var(--text-question);
  font-weight: var(--weight-semibold);
  letter-spacing: 1px;
  line-height: normal;
}

.reward__kind {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0;
  padding: 5px 13px;
  border: 1px solid currentcolor;
  border-radius: 9999px;
  background-color: var(--color-surface-overlay);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  line-height: 20px;
  text-transform: uppercase;
}

.reward__kind--bonus {
  color: var(--color-success);
}

.reward__kind--malus {
  color: var(--color-danger);
}

.reward__description {
  max-width: 44ch;
  margin: 0;
  color: var(--color-text-muted);
  font-family: var(--font-body);
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  line-height: normal;
}

.reward__hint {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  color: var(--color-text-muted);
  font-family: var(--font-body);
  font-size: var(--text-md);
  font-weight: var(--weight-medium);
  line-height: 20px;
}

/* Confirmation : l'activation est définitive, plus aucune commande. */
.reward__done {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 10px 24px;
  border: 1px solid var(--color-success);
  border-radius: var(--radius);
  color: var(--color-success);
  font-family: var(--font-body);
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  line-height: 20px;
}

/* --- Colonne classement ------------------------------------------------ */

.hud {
  display: flex;
  width: 320px;
  flex-shrink: 0;
  flex-direction: column;
  gap: 24px;
  padding: 42px 24px;
  background-color: var(--color-surface-overlay);
}

.leaderboard {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
}

.leaderboard__title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  line-height: 20px;
  text-transform: uppercase;
}

.leaderboard__list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.rank {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 9px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 4px;
  background-color: var(--color-surface-overlay);
}

.rank__line {
  display: flex;
  align-items: center;
  gap: 16px;
}

/* Ma ligne se distingue par la bordure ET le libellé « (toi) » (SR). */
.rank--me {
  border-color: var(--color-accent);
  background-color: var(--color-accent-subtle);
}

.rank__position {
  width: 16px;
  flex-shrink: 0;
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  line-height: 16px;
  text-align: center;
}

.rank--me .rank__position {
  color: var(--color-accent);
}

.rank__avatar {
  display: flex;
  width: 25px;
  height: 25px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border-interactive);
  border-radius: 9999px;
  background-color: var(--color-background);
  color: var(--color-text-muted);
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
}

.rank__pseudo {
  overflow: hidden;
  flex: 1;
  min-width: 0;
  color: var(--color-text);
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rank__score {
  flex-shrink: 0;
  color: var(--color-success);
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  line-height: 20px;
}

/* --- Bouton « Attaquer » ------------------------------------------------ */

/* Escamoté tant que la ligne n'est ni survolée ni focalisée, mais TOUJOURS dans
   le DOM et focalisable : `:focus-within` le fait réapparaître dès que le clavier
   l'atteint, sinon il serait inatteignable autrement qu'à la souris. */
.attack {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  border: 0;
  clip-path: inset(50%);
  white-space: nowrap;
}

.rank:hover .attack,
.rank:focus-within .attack {
  position: static;
  display: flex;
  width: 100%;
  height: auto;
  align-items: center;
  justify-content: center;
  gap: 8px;
  overflow: visible;
  padding: 9px;
  border: 1px solid var(--color-danger);
  border-radius: 4px;
  /* Fond opaque : c'est lui qui porte le ratio de 4,5:1 du libellé rouge. */
  background-color: var(--color-surface);
  clip-path: none;
  color: var(--color-danger);
  font-family: var(--font-body);
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  line-height: 20px;
  cursor: pointer;
}

.rank:hover .attack:disabled,
.rank:focus-within .attack:disabled {
  cursor: default;
  opacity: 0.55;
}

/* --- États & boutons ---------------------------------------------------- */

.state {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-md);
  font-weight: var(--weight-medium);
  line-height: 20px;
}

.state--error {
  color: var(--color-danger);
}

.room > .state {
  margin: 42px;
}

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 24px;
  border: 1px solid var(--color-border-interactive);
  border-radius: var(--radius);
  background-color: transparent;
  color: var(--color-text);
  font-family: inherit;
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  line-height: 20px;
  text-decoration: none;
}

.button--ghost {
  margin: 0 42px;
}

.button--ghost:hover {
  filter: brightness(1.12);
}

.button--activate {
  border-color: var(--color-success);
  background-color: var(--color-success);
  color: var(--color-background);
  cursor: pointer;
}

.button--activate:hover:not(:disabled) {
  filter: brightness(1.1);
}

.button--activate:disabled {
  cursor: default;
  opacity: 0.55;
}

@media (max-width: 900px) {
  .layout {
    flex-direction: column;
  }

  .stage {
    border-right: 0;
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .hud {
    width: 100%;
  }
}
</style>
