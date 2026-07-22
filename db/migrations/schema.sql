


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."lobby_access" AS ENUM (
    'public',
    'private'
);


ALTER TYPE "public"."lobby_access" OWNER TO "postgres";


CREATE TYPE "public"."lobby_status" AS ENUM (
    'waiting',
    'in_progress',
    'finished'
);


ALTER TYPE "public"."lobby_status" OWNER TO "postgres";


CREATE TYPE "public"."question_category" AS ENUM (
    'culture_generale',
    'sciences',
    'histoire',
    'musique',
    'tech'
);


ALTER TYPE "public"."question_category" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (id, pseudo, is_anonymous)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'pseudo',
      new.raw_user_meta_data->>'full_name',
      'Player_' || substr(new.id::text, 1, 8)
    ),
    coalesce(new.is_anonymous, false)
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_lobby_member"("p_lobby_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.lobby_players
    where lobby_id = p_lobby_id and user_id = auth.uid()
  );
$$;


-- Active la réplication Realtime pour lobby_players.
-- Le salon d'attente (pages/lobby/[id].vue) s'abonne aux INSERT/DELETE de cette
-- table pour synchroniser la grille des joueurs sans rechargement.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'lobby_players'
  ) then
    alter publication supabase_realtime add table public.lobby_players;
  end if;
end $$;



ALTER FUNCTION "public"."is_lobby_member"("p_lobby_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."join_lobby_by_code"("p_code" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_lobby   public.lobbies;
  v_count   int;
begin
  -- 1. Trouver le lobby par son code (security definer => outrepasse la RLS de lecture)
  select * into v_lobby from public.lobbies
  where code = p_code and status = 'waiting'
  for update;

  if v_lobby.id is null then
    raise exception 'Lobby introuvable ou déjà lancé';
  end if;

  -- 2. Déjà membre ? On renvoie simplement l'id (idempotent)
  if exists (select 1 from public.lobby_players
             where lobby_id = v_lobby.id and user_id = auth.uid()) then
    return v_lobby.id;
  end if;

  -- 3. Contrôle de capacité (atomique dans la transaction)
  select count(*) into v_count from public.lobby_players where lobby_id = v_lobby.id;
  if v_count >= v_lobby.max_players then
    raise exception 'Lobby plein';
  end if;

  -- 4. Insérer le joueur
  insert into public.lobby_players (lobby_id, user_id, is_host)
  values (v_lobby.id, auth.uid(), false);

  return v_lobby.id;
end;
$$;


ALTER FUNCTION "public"."join_lobby_by_code"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."lobbies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" DEFAULT "lpad"((("floor"(("random"() * (1000000)::double precision)))::integer)::"text", 6, '0'::"text") NOT NULL,
    "name" "text" NOT NULL,
    "host_id" "uuid",
    "category" "public"."question_category" NOT NULL,
    "access" "public"."lobby_access" DEFAULT 'public'::"public"."lobby_access" NOT NULL,
    "max_players" integer DEFAULT 6 NOT NULL,
    "powerups_enabled" boolean DEFAULT true NOT NULL,
    "status" "public"."lobby_status" DEFAULT 'waiting'::"public"."lobby_status" NOT NULL,
    "xp_credited" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lobbies_max_players_check" CHECK ((("max_players" >= 2) AND ("max_players" <= 6)))
);


ALTER TABLE "public"."lobbies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lobby_players" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lobby_id" "uuid",
    "user_id" "uuid",
    "is_host" boolean DEFAULT false NOT NULL,
    "is_ready" boolean DEFAULT false NOT NULL,
    "score" integer DEFAULT 0 NOT NULL,
    "streak" integer DEFAULT 0 NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lobby_players" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "pseudo" "text" NOT NULL,
    "avatar_url" "text",
    "xp" integer DEFAULT 0 NOT NULL,
    "battlecoin_balance" integer DEFAULT 0 NOT NULL,
    "games_played" integer DEFAULT 0 NOT NULL,
    "games_won" integer DEFAULT 0 NOT NULL,
    "powerups_used" integer DEFAULT 0 NOT NULL,
    "is_anonymous" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category" "public"."question_category" NOT NULL,
    "question_text" "text" NOT NULL,
    "answers" "jsonb" NOT NULL,
    "correct_key" "text" NOT NULL,
    "abundance_answer" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."questions" OWNER TO "postgres";


ALTER TABLE ONLY "public"."lobbies"
    ADD CONSTRAINT "lobbies_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."lobbies"
    ADD CONSTRAINT "lobbies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lobby_players"
    ADD CONSTRAINT "lobby_players_lobby_id_user_id_key" UNIQUE ("lobby_id", "user_id");



ALTER TABLE ONLY "public"."lobby_players"
    ADD CONSTRAINT "lobby_players_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pseudo_key" UNIQUE ("pseudo");



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lobbies"
    ADD CONSTRAINT "lobbies_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lobby_players"
    ADD CONSTRAINT "lobby_players_lobby_id_fkey" FOREIGN KEY ("lobby_id") REFERENCES "public"."lobbies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lobby_players"
    ADD CONSTRAINT "lobby_players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "create own lobby" ON "public"."lobbies" FOR INSERT TO "authenticated" WITH CHECK (("host_id" = "auth"."uid"()));



CREATE POLICY "host updates own lobby" ON "public"."lobbies" FOR UPDATE TO "authenticated" USING (("host_id" = "auth"."uid"())) WITH CHECK (("host_id" = "auth"."uid"()));



CREATE POLICY "join as self" ON "public"."lobby_players" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "leave as self" ON "public"."lobby_players" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."lobbies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lobby_players" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles readable by authenticated" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."questions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "read lobby_players (member or public waiting)" ON "public"."lobby_players" FOR SELECT TO "authenticated" USING (("public"."is_lobby_member"("lobby_id") OR (EXISTS ( SELECT 1
   FROM "public"."lobbies" "l"
  WHERE (("l"."id" = "lobby_players"."lobby_id") AND ("l"."access" = 'public'::"public"."lobby_access") AND ("l"."status" = 'waiting'::"public"."lobby_status"))))));



CREATE POLICY "read public waiting lobbies or own membership" ON "public"."lobbies" FOR SELECT TO "authenticated" USING (((("access" = 'public'::"public"."lobby_access") AND ("status" = 'waiting'::"public"."lobby_status")) OR ("host_id" = "auth"."uid"()) OR "public"."is_lobby_member"("id")));



CREATE POLICY "users update own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."join_lobby_by_code"("p_code" "text") TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."lobbies" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."lobbies" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."lobbies" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."lobby_players" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."lobby_players" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."lobby_players" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "service_role";



GRANT UPDATE("pseudo") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("avatar_url") ON TABLE "public"."profiles" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."questions" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."questions" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."questions" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "service_role";







create table public.game_rounds (
  id           uuid primary key default gen_random_uuid(),
  lobby_id     uuid not null references public.lobbies(id) on delete cascade,
  question_id  uuid not null references public.questions(id),
  round_number int  not null check (round_number between 1 and 10),
  started_at   timestamptz not null default now(),
  status       text not null default 'active' check (status in ('active','finished')),
  unique (lobby_id, round_number)   -- garantit l'idempotence : un seul round N par partie
);

alter table public.game_rounds enable row level security;


create table public.player_answers (
  id           uuid primary key default gen_random_uuid(),
  lobby_id     uuid not null references public.lobbies(id) on delete cascade,
  round_id     uuid not null references public.game_rounds(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  selected_key text not null,
  is_correct   boolean not null,
  answered_at  timestamptz not null default now(),
  unique (round_id, user_id)   -- un joueur ne répond qu'une fois par question
);

alter table public.player_answers enable row level security;

-- Les membres du lobby voient les rounds de leur partie.
create policy "read rounds of my lobby"
  on public.game_rounds for select
  to authenticated
  using (public.is_lobby_member(lobby_id));

-- Les membres voient les réponses de leur partie (pour le classement live).
create policy "read answers of my lobby"
  on public.player_answers for select
  to authenticated
  using (public.is_lobby_member(lobby_id));

grant select on public.game_rounds to authenticated;
grant select on public.player_answers to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'game_rounds'
  ) then
    alter publication supabase_realtime add table public.game_rounds;
  end if;
end $$;

create or replace function public.start_game(p_lobby_id uuid)
returns uuid                        -- renvoie l'id du 1er round créé
language plpgsql
security definer set search_path = public
as $$
declare
  v_lobby     public.lobbies;
  v_question  uuid;
  v_round_id  uuid;
begin
  -- 1. Charger le lobby et vérifier que l'appelant est bien l'hôte
  select * into v_lobby from public.lobbies where id = p_lobby_id;
  if v_lobby.id is null then
    raise exception 'Lobby introuvable';
  end if;
  if v_lobby.host_id <> auth.uid() then
    raise exception 'Seul l''hôte peut lancer la partie';
  end if;
  if v_lobby.status <> 'waiting' then
    raise exception 'La partie a déjà démarré';
  end if;

  -- 2. Passer le lobby en "in_progress"
  update public.lobbies set status = 'in_progress' where id = p_lobby_id;

  -- 3. Tirer une première question au hasard dans le thème du lobby
  select id into v_question
  from public.questions
  where category = v_lobby.category
  order by random()
  limit 1;

  if v_question is null then
    raise exception 'Aucune question disponible pour ce thème';
  end if;

  -- 4. Créer le round 1
  insert into public.game_rounds (lobby_id, question_id, round_number, started_at)
  values (p_lobby_id, v_question, 1, now())
  returning id into v_round_id;

  return v_round_id;
end;
$$;

grant execute on function public.start_game(uuid) to authenticated;


create or replace function public.next_round(p_lobby_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_lobby        public.lobbies;
  v_current_num  int;
  v_question     uuid;
  v_round_id     uuid;
begin
  select * into v_lobby from public.lobbies where id = p_lobby_id;
  if v_lobby.id is null then
    raise exception 'Lobby introuvable';
  end if;

  -- AJOUT : seul l'hôte fait avancer la partie (métronome)
  if v_lobby.host_id <> auth.uid() then
    raise exception 'Seul l''hôte peut passer au round suivant';
  end if;

  select coalesce(max(round_number), 0) into v_current_num
  from public.game_rounds where lobby_id = p_lobby_id;

  update public.game_rounds set status = 'finished'
  where lobby_id = p_lobby_id and round_number = v_current_num;

  if v_current_num >= 10 then
    update public.lobbies set status = 'finished' where id = p_lobby_id;
    return jsonb_build_object('finished', true);
  end if;

  select id into v_question from public.questions
  where category = v_lobby.category
    and id not in (select question_id from public.game_rounds where lobby_id = p_lobby_id)
  order by random() limit 1;

  if v_question is null then
    select id into v_question from public.questions
    where category = v_lobby.category order by random() limit 1;
  end if;

  insert into public.game_rounds (lobby_id, question_id, round_number, started_at)
  values (p_lobby_id, v_question, v_current_num + 1, now())
  returning id into v_round_id;

  return jsonb_build_object('finished', false, 'round_id', v_round_id, 'round_number', v_current_num + 1);
end;
$$;

create or replace function public.get_round_question(p_round_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_round     public.game_rounds;
  v_question  public.questions;
begin
  -- 1. Charger le round demandé
  select * into v_round from public.game_rounds where id = p_round_id;
  if v_round.id is null then
    raise exception 'Round introuvable';
  end if;

  -- 2. Vérifier que l'appelant est bien membre du lobby de ce round
  --    (on ne sert pas les questions d'une partie où on ne joue pas)
  if not public.is_lobby_member(v_round.lobby_id) then
    raise exception 'Accès refusé';
  end if;

  -- 3. Charger la question
  select * into v_question from public.questions where id = v_round.question_id;

  -- 4. Renvoyer l'énoncé + les réponses, MAIS JAMAIS correct_key.
  --    started_at permet au client de calculer le temps restant.
  return jsonb_build_object(
    'round_id',     v_round.id,
    'round_number', v_round.round_number,
    'started_at',   v_round.started_at,
    'status',       v_round.status,
    'category',     v_question.category,
    'question_text', v_question.question_text,
    'answers',      v_question.answers   -- [{key,text}...] sans indication de la bonne
  );
end;
$$;

grant execute on function public.get_round_question(uuid) to authenticated;


grant select on public.game_rounds to service_role;
grant select, insert on public.player_answers to service_role;
grant select, update on public.lobby_players to service_role;
grant select on public.questions to service_role;

-- Active la réplication Realtime pour la table `lobbies` (étape 3c, synchro multi-client).
--
-- Deux usages en dépendent :
--   - redirection automatique des joueurs vers la partie quand `status` passe à
--     'in_progress' (souscription depuis pages/lobby/[id].vue) ;
--   - bascule des non-hôtes sur l'écran de fin quand `status` passe à 'finished'
--     (souscription depuis pages/game/[id].vue).
--
-- `lobby_players` et `game_rounds` étaient déjà publiées (voir schema.sql).
-- Idempotent : n'ajoute la table que si elle n'est pas déjà dans la publication.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'lobbies'
  ) then
    alter publication supabase_realtime add table public.lobbies;
  end if;
end $$;


-- finish_game : crédite l'XP UNIQUEMENT (score × 10), idempotent via `xp_credited`.
-- La réinitialisation du lobby appartient désormais à `reset_lobby` (rejeu), pour
-- que l'écran de résultats puisse lire les scores intacts (voir migration
-- db/migrations/2026-07-22_finish_game_reset_lobby.sql).
create or replace function public.finish_game(p_lobby_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_lobby public.lobbies;
begin
  select * into v_lobby from public.lobbies where id = p_lobby_id;
  if v_lobby.id is null then
    raise exception 'Lobby introuvable';
  end if;
  if v_lobby.host_id <> auth.uid() then
    raise exception 'Seul l''hôte peut clôturer la partie';
  end if;
  if v_lobby.status <> 'finished' then
    raise exception 'La partie n''est pas terminée';
  end if;

  -- Garde-fou anti double-crédit : si l'XP a déjà été créditée, ne rien refaire.
  if v_lobby.xp_credited then
    return;
  end if;

  -- Créditer l'XP (score réel × 10) + games_played à chaque joueur.
  update public.profiles p
  set xp = xp + (lp.score * 10),
      games_played = games_played + 1
  from public.lobby_players lp
  where lp.lobby_id = p_lobby_id and lp.user_id = p.id;

  -- Créditer une victoire au meilleur score (si > 0).
  update public.profiles p
  set games_won = games_won + 1
  from public.lobby_players lp
  where lp.lobby_id = p_lobby_id
    and lp.user_id = p.id
    and lp.score = (select max(score) from public.lobby_players where lobby_id = p_lobby_id)
    and lp.score > 0;

  -- Marquer comme crédité (empêche le double-crédit si rappelée).
  update public.lobbies set xp_credited = true where id = p_lobby_id;
end;
$$;

grant execute on function public.finish_game(uuid) to authenticated;


-- reset_lobby : réinitialise le lobby pour le rejeu (bouton « Rejouer », hôte seul).
create or replace function public.reset_lobby(p_lobby_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_lobby public.lobbies;
begin
  select * into v_lobby from public.lobbies where id = p_lobby_id;
  if v_lobby.id is null then
    raise exception 'Lobby introuvable';
  end if;
  if v_lobby.host_id <> auth.uid() then
    raise exception 'Seul l''hôte peut relancer le salon';
  end if;

  -- Nettoyer les données de la partie précédente.
  delete from public.player_answers where lobby_id = p_lobby_id;
  delete from public.game_rounds   where lobby_id = p_lobby_id;

  -- Réinitialiser scores/séries et remettre le lobby en attente.
  update public.lobby_players set score = 0, streak = 0 where lobby_id = p_lobby_id;
  update public.lobbies
    set status = 'waiting', xp_credited = false
    where id = p_lobby_id;
end;
$$;

grant execute on function public.reset_lobby(uuid) to authenticated;


-- Étape 3d — fin de partie : scinder le crédit d'XP et la réinitialisation du lobby.
--
-- Avant, `finish_game` créditait l'XP ET réinitialisait le lobby d'un bloc, ce qui
-- effaçait les scores avant que l'écran de résultats puisse les afficher. On sépare :
--   - `finish_game`  : crédite l'XP (score × 10), idempotent, laisse `status = 'finished'` ;
--   - `reset_lobby`  : remet le lobby en attente pour le rejeu (scores à 0, rounds purgés).
--
-- L'idempotence du crédit repose sur une nouvelle colonne `lobbies.xp_credited`.

-- 1. Drapeau anti double-crédit (idempotence de finish_game).
alter table public.lobbies
  add column if not exists xp_credited boolean not null default false;

-- 2. finish_game : crédite l'XP UNIQUEMENT (plus de réinitialisation).
create or replace function public.finish_game(p_lobby_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_lobby public.lobbies;
begin
  select * into v_lobby from public.lobbies where id = p_lobby_id;
  if v_lobby.id is null then
    raise exception 'Lobby introuvable';
  end if;
  if v_lobby.host_id <> auth.uid() then
    raise exception 'Seul l''hôte peut clôturer la partie';
  end if;
  if v_lobby.status <> 'finished' then
    raise exception 'La partie n''est pas terminée';
  end if;

  -- Garde-fou anti double-crédit : si l'XP a déjà été créditée pour cette partie,
  -- ne rien refaire (idempotent).
  if v_lobby.xp_credited then
    return;
  end if;

  -- Créditer l'XP (score réel × 10) + games_played à chaque joueur.
  update public.profiles p
  set xp = xp + (lp.score * 10),
      games_played = games_played + 1
  from public.lobby_players lp
  where lp.lobby_id = p_lobby_id and lp.user_id = p.id;

  -- Créditer une victoire au meilleur score (si > 0).
  update public.profiles p
  set games_won = games_won + 1
  from public.lobby_players lp
  where lp.lobby_id = p_lobby_id
    and lp.user_id = p.id
    and lp.score = (select max(score) from public.lobby_players where lobby_id = p_lobby_id)
    and lp.score > 0;

  -- Marquer comme crédité (empêche le double-crédit si rappelée).
  update public.lobbies set xp_credited = true where id = p_lobby_id;
end;
$$;

grant execute on function public.finish_game(uuid) to authenticated;

-- 3. reset_lobby : réinitialise le lobby pour le rejeu (bouton « Rejouer », hôte).
create or replace function public.reset_lobby(p_lobby_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_lobby public.lobbies;
begin
  select * into v_lobby from public.lobbies where id = p_lobby_id;
  if v_lobby.id is null then
    raise exception 'Lobby introuvable';
  end if;
  if v_lobby.host_id <> auth.uid() then
    raise exception 'Seul l''hôte peut relancer le salon';
  end if;

  -- Nettoyer les données de la partie précédente.
  delete from public.player_answers where lobby_id = p_lobby_id;
  delete from public.game_rounds   where lobby_id = p_lobby_id;

  -- Réinitialiser scores/séries et remettre le lobby en attente.
  update public.lobby_players set score = 0, streak = 0 where lobby_id = p_lobby_id;
  update public.lobbies
    set status = 'waiting', xp_credited = false
    where id = p_lobby_id;
end;
$$;

grant execute on function public.reset_lobby(uuid) to authenticated;
