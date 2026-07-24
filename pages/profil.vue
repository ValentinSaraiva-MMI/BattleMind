<script setup lang="ts">
import { winRate } from '~/composables/useProgression'
import { useProfile } from '~/composables/useProfile'

useHead({ title: 'Profil — Battlemind' })

const supabase = useSupabaseClient()
const user = useSupabaseUser()

// État partagé avec le layout : le chip d'en-tête et cette page lisent le même
// profil, chargé une seule fois pour toute la navigation.
const { profile, status, errorMessage, initials, level, xp, reset } = useProfile()

const formatCount = (value: number) => value.toLocaleString('en-US')

/**
 * Statistiques de carrière. Le taux de réussite est dérivé (jamais stocké) et
 * vaut « — » sur un profil neuf — doublé d'une mention lisible par lecteur
 * d'écran, le tiret seul ne portant aucune information (RGAA 3.1).
 */
const stats = computed(() => {
  const p = profile.value
  if (!p) return []

  const rate = winRate(p.games_won, p.games_played)

  return [
    { id: 'played', label: 'Parties jouées', value: formatCount(p.games_played), hint: '' },
    { id: 'won', label: 'Victoires', value: formatCount(p.games_won), hint: '' },
    {
      id: 'winrate',
      label: 'Taux de réussite',
      value: rate === null
        ? '—'
        : `${rate.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`,
      hint: rate === null ? 'Non disponible : aucune partie jouée' : ''
    },
    { id: 'powerups', label: 'Power-ups utilisés', value: formatCount(p.powerups_used), hint: '' }
  ]
})

const signingOut = ref(false)
const signOutError = ref('')

/** Déconnexion puis retour sur la page de connexion. */
const handleSignOut = async () => {
  if (signingOut.value) return

  signingOut.value = true
  signOutError.value = ''

  try {
    const { error } = await supabase.auth.signOut()

    if (error) {
      signOutError.value = 'La déconnexion a échoué. Réessaie.'
      return
    }

    // Vide l'état partagé : sans ça le chip d'en-tête garderait le profil
    // du compte précédent jusqu'au prochain rechargement complet.
    reset()
    await navigateTo('/login')
  } catch {
    signOutError.value = 'La déconnexion a échoué. Réessaie.'
  } finally {
    signingOut.value = false
  }
}

// Vignettes de la galerie : hors périmètre, purement décoratives (voile « Bientôt disponible »).
// Aucun câblage prévu ici : badges, objectif et notifications restent inertes.
const badgePreviews = [1, 2, 3, 4, 5, 6]
</script>

<template>
  <main class="main">
    <!-- Chargement : un h1 est présent dans chaque état pour ne jamais laisser la page sans titre. -->
    <template v-if="status === 'pending'">
      <h1 class="sr-only">Profil</h1>
      <p class="state" role="status">Chargement de ton profil…</p>
    </template>

    <!-- Profil introuvable : la déconnexion reste accessible pour repartir d'une session saine. -->
    <template v-else-if="!profile">
      <h1 class="sr-only">Profil</h1>
      <p class="state state--error" role="alert">{{ errorMessage }}</p>
      <button class="logout logout--standalone" type="button" :disabled="signingOut" :aria-busy="signingOut" @click="handleSignOut">
        <img src="/icons/door-open.svg" alt="" width="24" height="24">
        {{ signingOut ? 'Déconnexion…' : 'Déconnexion' }}
      </button>
      <p v-if="signOutError" class="state" role="alert">{{ signOutError }}</p>
    </template>

    <template v-else>
      <section class="hero">
        <img
          v-if="profile.avatar_url"
          class="hero__avatar hero__avatar--image"
          :src="profile.avatar_url"
          alt=""
          width="192"
          height="192"
        >
        <!-- Pas d'avatar : repli sur les initiales du pseudo, déjà annoncé par le h1. -->
        <p v-else class="hero__avatar" aria-hidden="true">{{ initials }}</p>

        <div class="hero__identity">
          <h1 class="hero__pseudo">
            <span class="sr-only">Profil de </span>{{ profile.pseudo }}
          </h1>
          <p class="hero__email">{{ user?.email }}</p>
        </div>

        <div class="hero__actions">
          <button class="logout" type="button" :disabled="signingOut" :aria-busy="signingOut" @click="handleSignOut">
            <img src="/icons/door-open.svg" alt="" width="24" height="24">
            {{ signingOut ? 'Déconnexion…' : 'Déconnexion' }}
          </button>
          <p v-if="signOutError" class="hero__error" role="alert">{{ signOutError }}</p>
        </div>
      </section>

      <div class="grid">
        <div class="grid__left">
          <section class="progress" aria-labelledby="progress-title">
            <img class="progress__flourish" src="/icons/trend-up.svg" alt="" width="139" height="96">

            <div class="progress__header">
              <div>
                <h2 id="progress-title" class="progress__title">Progression actuelle</h2>
                <p class="progress__level">Niveau {{ level }}</p>
              </div>
              <p class="progress__next">
                <span class="sr-only">Niveau suivant : </span>{{ level + 1 }}
              </p>
            </div>

            <div class="progress__bar-group">
              <div
                class="bar"
                role="progressbar"
                aria-label="Expérience vers le niveau suivant"
                :aria-valuenow="xp.current"
                aria-valuemin="0"
                :aria-valuemax="xp.target"
                :aria-valuetext="`${xp.current.toLocaleString('en-US')} sur ${xp.target.toLocaleString('en-US')} points d'expérience`"
              >
                <span class="bar__fill" :style="{ width: `${xp.percent}%` }" />
              </div>
              <p class="progress__xp">
                {{ xp.current.toLocaleString('en-US') }} / {{ xp.target.toLocaleString('en-US') }} XP
              </p>
            </div>

            <div class="progress__tiles">
              <!-- Monnaie virtuelle sans usage tant que la boutique est hors
                   périmètre : le solde reste un aperçu décoratif sous voile. -->
              <div class="stub stub--tile">
                <div class="tile" aria-hidden="true">
                  <span class="tile__icon">
                    <img src="/icons/battlecoin.svg" alt="" width="28" height="20">
                  </span>
                  <div>
                    <p class="tile__label">Solde battlecoin</p>
                    <p class="tile__value">
                      {{ formatCount(profile.battlecoin_balance) }}
                      <span class="tile__unit">B</span>
                    </p>
                  </div>
                </div>
                <p class="stub__veil">Bientôt disponible</p>
              </div>

              <!-- Mode Ranked hors périmètre : aperçu décoratif sous voile. -->
              <div class="stub stub--tile">
                <div class="tile" aria-hidden="true">
                  <span class="tile__icon">
                    <img src="/icons/rank.svg" alt="" width="20" height="26">
                  </span>
                  <div>
                    <p class="tile__label">Points de rang</p>
                    <p class="tile__value">
                      2,840 <span class="tile__unit tile__unit--rank">RP</span>
                    </p>
                  </div>
                </div>
                <p class="stub__veil">Bientôt disponible</p>
              </div>
            </div>
          </section>

          <section class="stats" aria-labelledby="stats-title">
            <h2 id="stats-title" class="section-title">
              <img src="/icons/stats.svg" alt="" width="18" height="18">
              Statistiques de carrière
            </h2>
            <ul class="stats__grid">
              <li v-for="stat in stats" :key="stat.id" class="stat">
                <p class="stat__label">{{ stat.label }}</p>
                <p class="stat__value">
                  {{ stat.value }}
                  <!-- Le « — » seul ne dit rien à un lecteur d'écran : on double par un texte. -->
                  <span v-if="stat.hint" class="sr-only">{{ stat.hint }}</span>
                </p>
              </li>
            </ul>
          </section>
        </div>

        <!-- Galerie de badges et prochain objectif hors périmètre : aperçus décoratifs sous voile. -->
        <aside class="stub grid__right">
          <div class="stub__content">
            <section class="badges" aria-labelledby="badges-title">
              <h2 id="badges-title" class="section-title">
                <img src="/icons/badge.svg" alt="" width="10" height="20">
                Galerie de badges
              </h2>
              <ul class="badges__grid" aria-hidden="true">
                <li v-for="badge in badgePreviews" :key="badge" class="badges__item">
                  <img :src="`/icons/badge-${badge}.svg`" alt="" width="25" height="25">
                </li>
              </ul>
              <button class="badges__all" type="button" disabled aria-hidden="true">
                Voir tous les badges (5/6)
              </button>
            </section>

            <section class="objective" aria-labelledby="objective-title">
              <h2 id="objective-title" class="objective__title">Prochain objectif</h2>
              <p class="objective__text" aria-hidden="true">
                Gagnez 3 parties supplémentaires pour débloquer le badge
                <span class="objective__badge">« Stratège »</span>.
              </p>
              <div class="bar bar--thin" aria-hidden="true">
                <span class="bar__fill" style="width: 66.67%" />
              </div>
            </section>
          </div>
          <p class="stub__veil">Bientôt disponible</p>
        </aside>
      </div>
    </template>
  </main>
</template>

<style scoped>
/* `.page` (colonne pleine hauteur + fond) vit desormais dans layouts/default.vue. */
.main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 32px;
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  padding: 42px 24px;
}

/* États de chargement / erreur */

.state {
  margin: 0;
  padding: 24px;
  border: 1px solid var(--color-border-interactive);
  border-radius: var(--radius-lg);
  background-color: var(--color-surface-overlay);
  color: var(--color-text);
  font-size: var(--text-md);
  line-height: 20px;
}

/* L'erreur reste identifiable sans la couleur : le texte du message porte l'information. */
.state--error {
  border-left: 4px solid var(--color-danger-strong);
}

/* En-tête profil */

.hero {
  display: flex;
  align-items: flex-end;
  gap: 32px;
  flex-wrap: wrap;
  padding: 24px 24px 25px;
  border-bottom: 1px solid var(--color-border-subtle);
  border-radius: var(--radius);
}

.hero__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 192px;
  height: 192px;
  flex-shrink: 0;
  margin: 0;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius);
  background-color: var(--color-surface-overlay);
  color: var(--color-text-muted);
  font-size: var(--text-display);
  font-weight: var(--weight-semibold);
  line-height: 1;
}

/* Avatar réel : même gabarit que le repli initiales. */
.hero__avatar--image {
  object-fit: cover;
}

.hero__identity {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.hero__pseudo {
  margin: 0;
  color: var(--color-text);
  font-size: var(--text-3xl);
  letter-spacing: 1px;
  line-height: 38px;
}

.hero__email {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-md);
  font-weight: var(--weight-medium);
  line-height: 20px;
}

.hero__actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  flex-shrink: 0;
}

.hero__error {
  margin: 0;
  color: var(--color-text);
  font-size: var(--text-sm);
  line-height: 16px;
}

.logout {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-shrink: 0;
  padding: 10px 24px;
  border: none;
  border-radius: var(--radius);
  background-color: var(--color-danger-strong);
  color: var(--color-text);
  font-family: inherit;
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  line-height: 20px;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.logout:hover,
.logout:focus-visible {
  opacity: 0.85;
}

.logout:disabled {
  cursor: progress;
  opacity: 0.7;
}

/* Hors du hero (état « profil introuvable ») : le bouton ne s'étire pas. */
.logout--standalone {
  align-self: flex-start;
}

/* Grille principale */

.grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  align-items: start;
  gap: 32px;
}

.grid__left {
  display: flex;
  flex-direction: column;
  gap: 32px;
  min-width: 0;
}

.grid__right {
  min-width: 0;
}

/* Titres de section */

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  line-height: normal;
  text-transform: uppercase;
}

/* Progression */

.progress {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 24px;
  overflow: hidden;
  padding: 25px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  background-color: var(--color-surface-overlay);
}

.progress__flourish {
  position: absolute;
  top: 0;
  right: 0;
  pointer-events: none;
}

.progress__header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}

.progress__title {
  margin: 0;
  color: var(--color-accent);
  font-size: var(--text-md);
  font-weight: var(--weight-medium);
  letter-spacing: 1px;
  line-height: 20px;
  text-transform: uppercase;
}

.progress__level {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: var(--weight-semibold);
  letter-spacing: 1px;
  line-height: 38px;
  text-transform: uppercase;
}

.progress__next {
  margin: 0;
  color: var(--color-accent);
  font-family: var(--font-display);
  font-size: var(--text-md);
  font-weight: var(--weight-medium);
  letter-spacing: 1px;
  line-height: 20px;
}

.progress__bar-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.bar {
  width: 100%;
  height: 12px;
  overflow: hidden;
  padding: 2px;
  border-radius: 9999px;
  background-color: var(--color-accent-subtle);
}

.bar--thin {
  height: 4px;
  padding: 0;
}

.bar__fill {
  display: block;
  height: 100%;
  border-radius: 9999px;
  background-color: var(--color-accent);
}

.progress__xp {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  line-height: 16px;
}

.progress__tiles {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  padding-top: 8px;
}

.tile {
  display: flex;
  align-items: center;
  gap: 16px;
  height: 100%;
  padding: 17px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius);
  background-color: var(--color-background);
}

.tile__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border-radius: 4px;
  background-color: var(--color-surface-overlay);
}

.tile__label {
  margin: 0;
  color: var(--color-text-muted);
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  line-height: 20px;
  text-transform: uppercase;
}

.tile__value {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: var(--text-md);
  font-weight: var(--weight-medium);
  letter-spacing: 1px;
  line-height: 20px;
}

/* L'unité reste lisible sans la couleur : le sigle « B » / « RP » porte l'information. */
.tile__unit {
  color: var(--color-accent);
}

.tile__unit--rank {
  color: var(--color-secondary);
}

/* Statistiques */

.stats {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.stats__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 24px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 25px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  background-color: var(--color-surface-overlay);
}

.stat__label {
  margin: 0;
  color: var(--color-text-muted);
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  line-height: 20px;
  text-transform: uppercase;
}

.stat__value {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: var(--weight-semibold);
  letter-spacing: 1px;
  line-height: 38px;
}

/* Blocs hors périmètre */

.stub {
  position: relative;
}

.stub__content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* Voile : porte le libellé « Bientôt disponible » et masque l'aperçu décoratif. */
.stub__veil {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  border-radius: var(--radius);
  background-color: var(--color-veil);
  backdrop-filter: blur(2.5px);
  color: var(--color-text);
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  text-transform: uppercase;
}

.stub--tile .stub__veil {
  font-size: var(--text-md);
}

.badges {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 25px;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-lg);
  background-color: var(--color-surface-overlay);
}

.badges__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.badges__item {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius);
  background-color: var(--color-background);
}

.badges__all {
  padding: 11px 1px;
  border: 1px solid var(--color-accent);
  border-radius: var(--radius);
  background: none;
  color: var(--color-text);
  font-family: inherit;
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  line-height: 20px;
  text-transform: uppercase;
  cursor: not-allowed;
}

.objective {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 25px 25px 25px 28px;
  border: 1px solid var(--color-border-subtle);
  border-left: 4px solid var(--color-accent);
  border-radius: var(--radius-lg);
  background-color: var(--color-surface);
}

.objective__title {
  margin: 0;
  color: var(--color-text-strong);
  font-size: var(--text-md);
  font-weight: var(--weight-medium);
  letter-spacing: 1px;
  line-height: 20px;
  text-transform: uppercase;
}

.objective__text {
  margin: 0 0 8px;
  color: var(--color-text-muted);
  font-size: var(--text-md);
  line-height: 20px;
}

.objective__badge {
  color: var(--color-accent);
}

@media (max-width: 900px) {
  .grid {
    grid-template-columns: 1fr;
  }

  .progress__tiles {
    grid-template-columns: 1fr;
  }
}
</style>
