# CLAUDE.md — BattleMind

Contexte projet et règles à respecter pour toute contribution de code.
Documentation de certification détaillée : `docs/bc02/`.

---

## Projet

**BattleMind** — quiz multijoueur temps réel type Battle Royale. Lobbies privés/publics, quiz synchronisé, bonus/malus, profils avec XP, monnaie virtuelle (battlecoin).

Projet de certification **RNCP 39583 Bloc 2**. Le jury audite le dépôt Git, la couverture de tests, la CI et l'accessibilité. Quatre compétences sont **éliminatoires** : prototype fonctionnel, harnais de tests, sécurité + accessibilité, cahier de recettes.

## Stack

- **Nuxt 3** (Vue 3 / Vite), Composition API, `<script setup lang="ts">`
- **Supabase** — PostgreSQL, Auth, Realtime, Storage, Edge Functions (région Paris)
- **Vercel** — preview par branche, production sur `master`
- **Vitest** + happy-dom + Vue Test Utils
- Branche par défaut : **`master`**

---

# RÈGLES NON NÉGOCIABLES

## 1. Accessibilité — RGAA 4.1.2 (WCAG 2.1 AA)

**Tout composant produit doit être conforme dès sa première écriture.** Pas de correction en rattrapage.

### Formulaires (thématique 11)
- Chaque `<input>`, `<select>`, `<textarea>` a un `id` unique et un `<label for="<id>">` associé.
- **Un `placeholder` n'est JAMAIS une étiquette.** Si la maquette n'affiche pas de label visible, utiliser `<label class="sr-only">`.
- Champs obligatoires : attribut `required` + mention dans l'étiquette.
- Messages d'erreur : liés au champ via `aria-describedby`, conteneur `role="alert"`.
- Regrouper les champs de même nature avec `<fieldset>` + `<legend>` quand pertinent.

### Couleurs (thématique 3)
- **Critère 3.1** — l'information n'est jamais portée par la seule couleur. Statut, succès, erreur → toujours doublés d'une icône, d'un texte ou d'une forme.
- **Critère 3.2** — contrastes du texte :
  - texte < 24px non gras, ou < 18,5px gras → **4,5:1**
  - texte ≥ 24px non gras, ou ≥ 18,5px gras → **3:1**
  - *Exemption : éléments `disabled` (aucune action possible) et logos.*
- **Critère 3.3** — composants d'interface et objets graphiques → **3:1**. Utiliser `--color-border-interactive` pour les bordures de champs et boutons, jamais `--color-border-subtle` (réservée au décoratif).

### Images (thématique 1)
- Décoratives → `alt=""` et **aucun** autre attribut d'alternative (`title`, `aria-label`).
- Porteuses d'information → `alt` pertinent, court et concis.
- SVG inline porteur d'information → `role="img"` + `<title>` ou `aria-label`.

### Structuration & navigation (thématiques 9, 10, 12)
- Une page = un `<h1>` unique. Hiérarchie sans saut de niveau.
- `lang="fr"` sur `<html>`, `<title>` unique et pertinent par page.
- Balises sémantiques : `<header>`, `<nav>`, `<main>`, `<footer>`.
- **Navigation complète au clavier.** Focus toujours visible — ne jamais poser `outline: none` sans alternative visible équivalente.
- Composants ARIA (tabs, modale, menu) : implémenter le **pattern WAI-ARIA complet**, navigation clavier incluse. Un ARIA partiel est pire qu'aucun ARIA.

### Scripts (thématique 7)
- Tout composant interactif est utilisable au clavier et correctement restitué (nom, rôle, valeur, état).
- Les changements de contexte dynamiques sont annoncés (`aria-live`).

## 2. Sécurité — OWASP Top 10:2025

- **`correct_key` ne quitte JAMAIS la base.** Les questions sont servies expurgées par Edge Function ; validation et scoring **exclusivement côté serveur**.
- **RLS activée sur toutes les tables.** La table `questions` n'est pas exposée à l'API : seul `service_role` y accède.
- **Colonnes économiques en lecture seule côté client** (`xp`, `battlecoin_balance`, `games_played`, `games_won`, `powerups_used`). Écriture serveur uniquement (`revoke update` + `grant update (pseudo, avatar_url)`).
- **Aucun secret dans Git.** La clé `anon` Supabase peut être publique (protégée par RLS) ; la clé `service_role` **jamais**.
- Jamais de SQL brut construit côté client — requêtes paramétrées via supabase-js.
- Gestion d'erreurs explicite, principe *fail closed*.

## 3. Modèle de données

- **Ne jamais stocker une valeur dérivée.** Niveau ← XP. Taux de réussite ← `games_won / games_played`. Classements ← `ORDER BY`.
- `profiles` = extension 1:1 de `auth.users`. **Aucun mot de passe, aucun email** stocké.
- Les lobbies vivent en Postgres (jamais en cache mémoire) — requis pour Realtime et pour l'état autoritatif.
- Schéma appliqué via le SQL Editor Supabase, **et** sauvegardé dans `db/migrations/AAAA-MM-JJ_description.sql` (versionnage, compétence C2.2.4).

## 4. Style

- **Uniquement les tokens sémantiques** de `assets/css/main.css` (`--color-*`, `--text-*`, `--weight-*`, `--radius`). Jamais de couleur ou de taille en dur.
- Ne pas utiliser les primitives (`--purple-500`, `--gray-900`…) dans les composants : elles n'existent que pour alimenter les tokens sémantiques.
- CSS scopé par composant. Nommage BEM (`.panel__content`, `.button--primary`).
- Polices : `--font-display` (Saira) pour titres et chiffres, `--font-body` (Montserrat) pour le texte courant.

## 5. Tests

- **Vitest en isolation** : `@vitejs/plugin-vue` + Vue Test Utils. Ne PAS utiliser `@nuxt/test-utils` / `mountSuspended`.
- `environment: 'node'` par défaut (logique pure). `// @vitest-environment happy-dom` en tête des fichiers testant des composants.
- Stubber les composants Nuxt (`NuxtLink` → `<a>`).
- **Tout composant d'interface a un test vérifiant son accessibilité** (étiquettes liées, rôles ARIA, ids uniques).
- Le critère jury est « les tests couvrent **la majorité du code développé** » → suivre le total projet, pas le fichier.
- Tests écrits **avec** la feature, jamais après coup.

## 6. Commits

**Conventional Commits.** Types : `feat`, `fix`, `test`, `ci`, `docs`, `chore`, `refactor`.
**Scopes** : `ui`, `auth`, `lobby`, `quiz`, `profile`, `db`, `deps`.

```
feat(auth): add discord oauth provider
fix(ui): associate labels with auth form inputs
test(quiz): cover score calculation edge cases
```

Un commit = une unité cohérente et révocable seule. Découper par **dépendance fonctionnelle**, jamais par type de fichier.

**Ne jamais corriger silencieusement un bug rencontré** : le signaler pour consignation dans le registre d'anomalies (`docs/bc02/C2.3.2_plan_correction_bogues.md`). Les anomalies tracées sont un livrable de certification.

---

## Hors périmètre (stubs désactivés autorisés)

Boutique / cosmétiques · mode Ranked / ELO · questions Vrai/Faux · intégration Stripe · table `game_results`.

Un élément hors périmètre s'affiche `disabled` avec la mention « Bientôt disponible » — jamais un bouton mort.

## Structure

```
assets/css/main.css      tokens + styles globaux
components/              composants Vue
composables/             logique métier testable
pages/                   routes (routing par fichiers)
public/icons/            SVG
tests/                   specs Vitest
db/migrations/           historique SQL versionné
.github/workflows/       CI
```