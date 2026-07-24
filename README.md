# BattleMind

Quiz multijoueur temps réel de type *Battle Royale*. Les joueurs se retrouvent dans un
lobby (public ou privé via code), répondent à des questions synchronisées entre tous les
clients, et gagnent de l'XP à l'issue de la partie.

Projet de certification **RNCP 39583 — Bloc 2**.

## Stack

| Rôle | Techno |
| --- | --- |
| Front / SSR | Nuxt 3 (Vue 3, Composition API, `<script setup lang="ts">`) |
| Base de données, Auth, Realtime | Supabase (PostgreSQL) |
| Validation des réponses | Supabase Edge Function (Deno) |
| Tests | Vitest + Vue Test Utils + happy-dom |
| CI | GitHub Actions |
| Hébergement | Vercel |

---

## Prérequis

- **Node.js 22** et npm 10 (la CI utilise Node 22 — les versions antérieures ne sont pas testées)
- Un compte [Supabase](https://supabase.com) — le plan gratuit suffit
- La [**Supabase CLI**](https://supabase.com/docs/guides/cli) — indispensable pour déployer
  l'Edge Function qui valide les réponses
- *(optionnel)* Une application [Discord Developers](https://discord.com/developers/applications)
  si vous voulez tester la connexion OAuth

> **À noter** — le projet ne fonctionne pas avec une base locale « vide ». Il lui faut un projet
> Supabase (hébergé ou local via `supabase start`) avec le schéma appliqué **et** l'Edge Function
> déployée. Les étapes 2 à 6 ci-dessous ne sont pas optionnelles.

---

## 1. Cloner et installer

```bash
git clone <url-du-depot> BattleMind
cd BattleMind
npm install
```

## 2. Créer le projet Supabase

1. Dashboard Supabase → **New project** (région **Paris / eu-west-3** recommandée pour la latence Realtime).
2. Notez le mot de passe de la base : il est demandé lors du `supabase link` à l'étape 4.
3. Relevez dans **Project Settings → API** :
   - l'**URL du projet** (`https://xxxxxxxxxxxx.supabase.co`)
   - la clé **`anon` / publishable** → pour le `.env` du front
   - la clé **`service_role`** → pour le secret de l'Edge Function (étape 4). **Elle ne doit
     jamais être committée ni exposée au navigateur.**

## 3. Appliquer le schéma et les données de démonstration

Dans le **SQL Editor** du dashboard Supabase, exécuter dans cet ordre :

1. [`db/migrations/schema.sql`](db/migrations/schema.sql) — dump complet et cumulatif : types,
   tables, RLS, fonctions RPC (`start_game`, `next_round`, `finish_game`, `reset_lobby`,
   `join_lobby_by_code`, `get_round_question`), triggers et publications Realtime.
2. [`db/seed_questions_demo.sql`](db/seed_questions_demo.sql) — six questions de démonstration.
   **Sans ce seed, aucune partie ne peut démarrer** (la table `questions` serait vide).

Le script est idempotent sur les publications Realtime : `lobbies`, `lobby_players` et
`game_rounds` sont ajoutées à `supabase_realtime` uniquement si elles n'y sont pas déjà.

### Vérification rapide

```sql
select count(*) from public.questions;              -- doit retourner 6
select tablename from pg_publication_tables
 where pubname = 'supabase_realtime';               -- doit lister lobbies, lobby_players, game_rounds
```

## 4. Déployer l'Edge Function `submit_answer`

C'est elle qui valide les réponses et calcule les scores. **La colonne `correct_key` ne quitte
jamais la base** : le client ne reçoit que des questions expurgées, et la comparaison se fait ici.

```bash
supabase login
supabase link --project-ref <ref-du-projet>   # la ref est dans l'URL du dashboard
supabase functions deploy submit_answer
```

Puis déclarer le secret que la fonction attend :

```bash
supabase secrets set BATTLEMIND_SECRET_KEY=<votre-cle-service_role>
```

> **Pourquoi ce nom ?** Supabase réserve le préfixe `SUPABASE_` pour ses propres variables
> injectées (`SUPABASE_URL`, `SUPABASE_ANON_KEY`…) et refuse qu'on y ajoute un secret. La clé
> `service_role` est donc lue sous le nom `BATTLEMIND_SECRET_KEY`
> ([`supabase/functions/submit_answer/index.ts:41`](supabase/functions/submit_answer/index.ts#L41)).
> **Si ce secret est absent, la fonction répond 500 et aucune réponse n'est validée.**

`verify_jwt` est volontairement à `false` dans [`supabase/config.toml`](supabase/config.toml) :
la fonction vérifie elle-même le JWT et en déduit l'identité du joueur, plutôt que de faire
confiance à un identifiant envoyé par le client.

## 5. Configurer l'authentification

Dans **Authentication → URL Configuration** :

- **Site URL** : `http://localhost:3000`
- **Redirect URLs** : ajouter `http://localhost:3000/confirm`
  (la page de retour OAuth déclarée dans [`nuxt.config.ts`](nuxt.config.ts))

Pour le développement, désactiver « Confirm email » dans **Authentication → Sign In / Providers → Email**
évite d'avoir à valider chaque compte de test par mail.

### Discord OAuth (optionnel)

Le bouton « Continuer avec Discord » ([`composables/useAuth.ts:84`](composables/useAuth.ts#L84))
nécessite le provider Discord activé côté Supabase :

1. Créer une application sur le portail Discord Developers, onglet **OAuth2**.
2. Y ajouter comme redirect URI l'URL de callback affichée par Supabase
   (`https://<ref>.supabase.co/auth/v1/callback`).
3. Reporter le **Client ID** et le **Client Secret** dans **Authentication → Providers → Discord**.

Sans cette configuration, l'inscription et la connexion par email restent pleinement
fonctionnelles ; seul le bouton Discord échouera.

## 6. Variables d'environnement

```bash
cp .env.example .env
```

Renseigner les deux variables lues par le module `@nuxtjs/supabase` :

| Variable | Valeur | Secret ? |
| --- | --- | --- |
| `SUPABASE_URL` | URL de l'API du projet | non |
| `SUPABASE_KEY` | clé **`anon` / publishable** | non — publique par nature, protégée par la RLS |

`.env` est gitignoré. **Ne jamais y placer la clé `service_role`** : elle appartient à
l'Edge Function (étape 4) et contourne toutes les politiques RLS.

## 7. Lancer

```bash
npm run dev
```

L'application est disponible sur <http://localhost:3000>.

Pour tester le multijoueur en local, ouvrir un second navigateur (ou une fenêtre privée) avec
un compte distinct — deux onglets partageant la même session comptent pour un seul joueur.

## 8. Déployer en production (Vercel)

1. Importer le dépôt sur Vercel — le préréglage Nuxt est détecté automatiquement, aucune
   configuration de build n'est requise.
2. Déclarer `SUPABASE_URL` et `SUPABASE_KEY` sur les **trois environnements** (Production,
   Preview, Development), **sans** les marquer « Sensitive » : elles sont publiques par
   conception et doivent rester lisibles au build.
3. Dans **Supabase → Authentication → URL Configuration**, ajouter l'URL de production comme
   **Site URL**, et `https://<domaine>/confirm` aux **Redirect URLs**. Pour les prévisualisations,
   ajouter le motif `https://*-<équipe>.vercel.app/**`.
4. Côté Discord, ajouter l'URL de callback de production si le provider est utilisé.

Le déploiement suit les branches : chaque branche produit une prévisualisation, `master` publie
en production.

---

## Scripts npm

| Commande | Effet |
| --- | --- |
| `npm run dev` | serveur de développement (HMR) sur le port 3000 |
| `npm run build` | build de production |
| `npm run preview` | prévisualisation du build de production |
| `npm run test` | suite Vitest, une passe |
| `npm run test:watch` | Vitest en mode watch |
| `npm run test:coverage` | tests + rapport de couverture (`text` + HTML dans `coverage/`) |
| `npm run lint` | ESLint |
| `npm run lint:fix` | ESLint avec correction automatique |

Les tests tournent **en isolation du runtime Nuxt** (`@vitejs/plugin-vue` + Vue Test Utils, sans
`@nuxt/test-utils`) : ils ne nécessitent ni `.env`, ni connexion Supabase, ni base de données.
Un `git clone && npm install && npm test` suffit à les exécuter.

La CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) rejoue lint + couverture + build
sur chaque push et chaque PR vers `master`.

---

## Structure

```
assets/css/main.css      tokens sémantiques + styles globaux
components/              composants Vue
composables/             logique métier testable (useAuth, useLobby, useGame, useProfile…)
pages/                   routes (routing par fichiers)
public/icons/            SVG
server/                  routes serveur Nitro
supabase/functions/      Edge Functions Deno (submit_answer)
tests/                   specs Vitest
db/migrations/           historique SQL versionné
utils/                   helpers purs
.github/workflows/       CI
```

---

## Dépannage

| Symptôme | Cause probable |
| --- | --- |
| `supabaseUrl is required` au démarrage | `.env` absent ou vide — reprendre l'étape 6, puis relancer `npm run dev` (les variables sont lues au boot) |
| Le bouton « Lancer la partie » échoue | table `questions` vide → rejouer `db/seed_questions_demo.sql` |
| Réponse en erreur / score jamais mis à jour | Edge Function non déployée, ou secret `BATTLEMIND_SECRET_KEY` non défini (étape 4). Les logs sont dans **Edge Functions → submit_answer → Logs** |
| Les autres joueurs n'apparaissent pas dans le lobby | tables absentes de la publication `supabase_realtime` → rejouer `schema.sql` |
| Retour de connexion en 404 après OAuth | `http://localhost:3000/confirm` manquant dans les Redirect URLs (étape 5) |

---

## Contraintes du projet

Trois règles structurent le code et doivent être respectées par toute contribution — le détail
est dans [`CLAUDE.md`](CLAUDE.md) :

- **Sécurité** — `correct_key` ne quitte jamais la base ; RLS active sur toutes les tables ;
  colonnes économiques (`xp`, `battlecoin_balance`…) en écriture serveur uniquement.
- **Accessibilité** — conformité RGAA 4.1.2 / WCAG 2.1 AA dès la première écriture d'un composant,
  et un test d'accessibilité par composant d'interface.
- **Modèle de données** — aucune valeur dérivée stockée (le niveau se calcule depuis l'XP,
  le taux de victoire depuis `games_won / games_played`).

## Commits

[Conventional Commits](https://www.conventionalcommits.org/). Types : `feat`, `fix`, `test`,
`ci`, `docs`, `chore`, `refactor`. Scopes : `ui`, `auth`, `lobby`, `quiz`, `profile`, `db`, `deps`.

```
feat(auth): add discord oauth provider
fix(ui): associate labels with auth form inputs
```
