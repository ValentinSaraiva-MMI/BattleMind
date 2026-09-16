


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


CREATE OR REPLACE FUNCTION "public"."apply_powerup"("p_instance_id" "uuid", "p_target_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_inst    public.player_powerups;
  v_powerup public.powerups;
  v_target  uuid;
begin
  select * into v_inst from public.player_powerups where id = p_instance_id;
  if v_inst.id is null then
    raise exception 'Power-up introuvable';
  end if;

  if v_inst.owner_id <> auth.uid() then
    raise exception 'Ce power-up ne vous appartient pas';
  end if;

  if v_inst.status <> 'drawn' then
    raise exception 'Power-up déjà utilisé';
  end if;

  select * into v_powerup from public.powerups where id = v_inst.powerup_id;

  if v_powerup.target = 'self' then
    v_target := auth.uid();
  else
    if p_target_id is null or p_target_id = auth.uid() then
      raise exception 'Ce malus doit viser un adversaire';
    end if;
    if not exists (
      select 1 from public.lobby_players
      where lobby_id = v_inst.lobby_id and user_id = p_target_id
    ) then
      raise exception 'Cible hors de la partie';
    end if;
    v_target := p_target_id;
  end if;

  update public.player_powerups
    set target_id = v_target, status = 'applied', applied_at = now()
    where id = p_instance_id;

  update public.profiles set powerups_used = powerups_used + 1 where id = auth.uid();

  return jsonb_build_object('applied', true, 'target_id', v_target);
end;
$$;


ALTER FUNCTION "public"."apply_powerup"("p_instance_id" "uuid", "p_target_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."draw_powerup"("p_lobby_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_lobby    public.lobbies;
  v_streak   int;
  v_room     int;
  v_powerup  public.powerups;
  v_existing public.player_powerups;
begin
  select * into v_lobby from public.lobbies where id = p_lobby_id;
  if v_lobby.id is null then
    raise exception 'Lobby introuvable';
  end if;

  if not public.is_lobby_member(p_lobby_id) then
    raise exception 'Accès refusé';
  end if;

  if v_lobby.phase <> 'powerup' then
    raise exception 'La salle de power-up n''est pas ouverte';
  end if;

  select coalesce(max(round_number), 0) into v_room
  from public.game_rounds where lobby_id = p_lobby_id;

  select streak into v_streak from public.lobby_players
  where lobby_id = p_lobby_id and user_id = auth.uid();
  v_streak := coalesce(v_streak, 0);

  select * into v_existing from public.player_powerups
  where lobby_id = p_lobby_id and owner_id = auth.uid() and room_number = v_room;

  if v_existing.id is null then
    if v_streak < 3 then
      return jsonb_build_object('granted', false, 'streak', v_streak);
    end if;

    select * into v_powerup from public.powerups where is_active order by random() limit 1;
    if v_powerup.id is null then
      raise exception 'Aucun power-up disponible';
    end if;

    insert into public.player_powerups
      (lobby_id, owner_id, powerup_id, room_number, effective_round)
    values (p_lobby_id, auth.uid(), v_powerup.id, v_room, v_room + 1)
    returning * into v_existing;
  else
    select * into v_powerup from public.powerups where id = v_existing.powerup_id;
  end if;

  return jsonb_build_object(
    'granted', true,
    'streak',  v_streak,
    'powerup', jsonb_build_object(
      'instance_id', v_existing.id,
      'code',        v_powerup.code,
      'kind',        v_powerup.kind,
      'target',      v_powerup.target,
      'name',        v_powerup.name,
      'description', v_powerup.description,
      'status',      v_existing.status
    )
  );
end;
$$;


ALTER FUNCTION "public"."draw_powerup"("p_lobby_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finish_game"("p_lobby_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."finish_game"("p_lobby_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_active_powerups"("p_lobby_id" "uuid", "p_round_number" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_result jsonb;
begin
  if not public.is_lobby_member(p_lobby_id) then
    raise exception 'Accès refusé';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'instance_id', pp.id, 'code', p.code, 'kind', p.kind,
    'name', p.name, 'duration_s', p.duration_s
  )), '[]'::jsonb)
  into v_result
  from public.player_powerups pp
  join public.powerups p on p.id = pp.powerup_id
  where pp.lobby_id = p_lobby_id
    and pp.target_id = auth.uid()
    and pp.effective_round = p_round_number
    and pp.status = 'applied';

  return v_result;
end;
$$;


ALTER FUNCTION "public"."get_active_powerups"("p_lobby_id" "uuid", "p_round_number" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_round_question"("p_round_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_round     public.game_rounds;
  v_question  public.questions;
  v_disabled  text[] := '{}';
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

  -- 4. AJOUT : 50/50. Si le joueur a activé ce bonus pour cette manche, on
  --    désigne deux mauvaises réponses à masquer. Le tri par empreinte rend le
  --    choix déterministe : un rechargement de page renvoie les mêmes clés.
  --    correct_key sert au calcul mais ne sort jamais de la fonction.
  if exists (
    select 1 from public.player_powerups pp
    join public.powerups p on p.id = pp.powerup_id
    where pp.lobby_id = v_round.lobby_id
      and pp.target_id = auth.uid()
      and pp.effective_round = v_round.round_number
      and pp.status = 'applied'
      and p.code = 'fifty_fifty'
  ) then
    select array_agg(k order by md5(v_round.id::text || auth.uid()::text || k))
      into v_disabled
    from (
      select a->>'key' as k
      from jsonb_array_elements(v_question.answers) a
      where a->>'key' <> v_question.correct_key
    ) wrong;
    v_disabled := v_disabled[1:2];
  end if;

  -- 5. Renvoyer l'énoncé + les réponses, MAIS JAMAIS correct_key.
  --    started_at permet au client de calculer le temps restant.
  return jsonb_build_object(
    'round_id',      v_round.id,
    'round_number',  v_round.round_number,
    'started_at',    v_round.started_at,
    'status',        v_round.status,
    'category',      v_question.category,
    'question_text', v_question.question_text,
    'answers',       v_question.answers,   -- [{key,text}...] sans indication de la bonne
    'disabled_keys', to_jsonb(v_disabled)  -- AJOUT : [] si aucun 50/50 actif
  );
end;
$$;


ALTER FUNCTION "public"."get_round_question"("p_round_id" "uuid") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."health_check"() RETURNS json
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select json_build_object(
    'status', 'ok',
    'questions', (select count(*) from public.questions),
    'checked_at', now()
  );
$$;


ALTER FUNCTION "public"."health_check"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_lobby_member"("p_lobby_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.lobby_players
    where lobby_id = p_lobby_id and user_id = auth.uid()
  );
$$;


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


CREATE OR REPLACE FUNCTION "public"."next_round"("p_lobby_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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

  -- AJOUT : sortie de salle de power-up.
  -- La manche courante a déjà été clôturée à l'entrée ; on reprend simplement
  -- le cours des questions sans toucher au numéro de manche.
  if v_lobby.phase = 'powerup' then
    update public.lobbies
      set phase = 'question', phase_started_at = null
      where id = p_lobby_id;
  else
    update public.game_rounds set status = 'finished'
    where lobby_id = p_lobby_id and round_number = v_current_num;

    if v_current_num >= 10 then
      update public.lobbies set status = 'finished' where id = p_lobby_id;
      return jsonb_build_object('finished', true);
    end if;

    -- AJOUT : entrée en salle après les manches 3, 6 et 9.
    -- On rend la main sans créer la manche suivante : elle sera créée au
    -- prochain appel, à la sortie de la salle. Aucune question n'est sautée.
    if v_lobby.powerups_enabled and v_current_num in (3, 6, 9) then
      update public.lobbies
        set phase = 'powerup', phase_started_at = now()
        where id = p_lobby_id;
      return jsonb_build_object(
        'finished', false,
        'phase', 'powerup',
        'room_number', v_current_num
      );
    end if;
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

  return jsonb_build_object(
    'finished', false,
    'phase', 'question',
    'round_id', v_round_id,
    'round_number', v_current_num + 1
  );
end;
$$;


ALTER FUNCTION "public"."next_round"("p_lobby_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_lobby"("p_lobby_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."reset_lobby"("p_lobby_id" "uuid") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."start_game"("p_lobby_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."start_game"("p_lobby_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."game_rounds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lobby_id" "uuid" NOT NULL,
    "question_id" "uuid" NOT NULL,
    "round_number" integer NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    CONSTRAINT "game_rounds_round_number_check" CHECK ((("round_number" >= 1) AND ("round_number" <= 10))),
    CONSTRAINT "game_rounds_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'finished'::"text"])))
);


ALTER TABLE "public"."game_rounds" OWNER TO "postgres";


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
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "xp_credited" boolean DEFAULT false NOT NULL,
    "phase" "text" DEFAULT 'question'::"text" NOT NULL,
    "phase_started_at" timestamp with time zone,
    CONSTRAINT "lobbies_max_players_check" CHECK ((("max_players" >= 2) AND ("max_players" <= 6))),
    CONSTRAINT "lobbies_phase_check" CHECK (("phase" = ANY (ARRAY['question'::"text", 'powerup'::"text"])))
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


CREATE TABLE IF NOT EXISTS "public"."player_answers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lobby_id" "uuid" NOT NULL,
    "round_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "selected_key" "text" NOT NULL,
    "is_correct" boolean NOT NULL,
    "answered_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."player_answers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."player_powerups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lobby_id" "uuid" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "powerup_id" "uuid" NOT NULL,
    "room_number" integer NOT NULL,
    "effective_round" integer NOT NULL,
    "target_id" "uuid",
    "status" "text" DEFAULT 'drawn'::"text" NOT NULL,
    "drawn_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "applied_at" timestamp with time zone,
    CONSTRAINT "player_powerups_room_number_check" CHECK (("room_number" = ANY (ARRAY[3, 6, 9]))),
    CONSTRAINT "player_powerups_status_check" CHECK (("status" = ANY (ARRAY['drawn'::"text", 'applied'::"text", 'consumed'::"text", 'blocked'::"text"])))
);


ALTER TABLE "public"."player_powerups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."powerups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "target" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" NOT NULL,
    "duration_s" integer,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "powerups_kind_check" CHECK (("kind" = ANY (ARRAY['bonus'::"text", 'malus'::"text"]))),
    CONSTRAINT "powerups_target_check" CHECK (("target" = ANY (ARRAY['self'::"text", 'opponent'::"text"])))
);


ALTER TABLE "public"."powerups" OWNER TO "postgres";


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


ALTER TABLE ONLY "public"."game_rounds"
    ADD CONSTRAINT "game_rounds_lobby_id_round_number_key" UNIQUE ("lobby_id", "round_number");



ALTER TABLE ONLY "public"."game_rounds"
    ADD CONSTRAINT "game_rounds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lobbies"
    ADD CONSTRAINT "lobbies_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."lobbies"
    ADD CONSTRAINT "lobbies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lobby_players"
    ADD CONSTRAINT "lobby_players_lobby_id_user_id_key" UNIQUE ("lobby_id", "user_id");



ALTER TABLE ONLY "public"."lobby_players"
    ADD CONSTRAINT "lobby_players_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."player_answers"
    ADD CONSTRAINT "player_answers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."player_answers"
    ADD CONSTRAINT "player_answers_round_id_user_id_key" UNIQUE ("round_id", "user_id");



ALTER TABLE ONLY "public"."player_powerups"
    ADD CONSTRAINT "player_powerups_lobby_id_owner_id_room_number_key" UNIQUE ("lobby_id", "owner_id", "room_number");



ALTER TABLE ONLY "public"."player_powerups"
    ADD CONSTRAINT "player_powerups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."powerups"
    ADD CONSTRAINT "powerups_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."powerups"
    ADD CONSTRAINT "powerups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pseudo_key" UNIQUE ("pseudo");



ALTER TABLE ONLY "public"."questions"
    ADD CONSTRAINT "questions_pkey" PRIMARY KEY ("id");



CREATE INDEX "player_powerups_lobby_round_idx" ON "public"."player_powerups" USING "btree" ("lobby_id", "effective_round");



ALTER TABLE ONLY "public"."game_rounds"
    ADD CONSTRAINT "game_rounds_lobby_id_fkey" FOREIGN KEY ("lobby_id") REFERENCES "public"."lobbies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_rounds"
    ADD CONSTRAINT "game_rounds_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id");



ALTER TABLE ONLY "public"."lobbies"
    ADD CONSTRAINT "lobbies_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lobby_players"
    ADD CONSTRAINT "lobby_players_lobby_id_fkey" FOREIGN KEY ("lobby_id") REFERENCES "public"."lobbies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lobby_players"
    ADD CONSTRAINT "lobby_players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_answers"
    ADD CONSTRAINT "player_answers_lobby_id_fkey" FOREIGN KEY ("lobby_id") REFERENCES "public"."lobbies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_answers"
    ADD CONSTRAINT "player_answers_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "public"."game_rounds"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_answers"
    ADD CONSTRAINT "player_answers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_powerups"
    ADD CONSTRAINT "player_powerups_lobby_id_fkey" FOREIGN KEY ("lobby_id") REFERENCES "public"."lobbies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_powerups"
    ADD CONSTRAINT "player_powerups_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_powerups"
    ADD CONSTRAINT "player_powerups_powerup_id_fkey" FOREIGN KEY ("powerup_id") REFERENCES "public"."powerups"("id");



ALTER TABLE ONLY "public"."player_powerups"
    ADD CONSTRAINT "player_powerups_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "create own lobby" ON "public"."lobbies" FOR INSERT TO "authenticated" WITH CHECK (("host_id" = "auth"."uid"()));



ALTER TABLE "public"."game_rounds" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "host updates own lobby" ON "public"."lobbies" FOR UPDATE TO "authenticated" USING (("host_id" = "auth"."uid"())) WITH CHECK (("host_id" = "auth"."uid"()));



CREATE POLICY "join as self" ON "public"."lobby_players" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "leave as self" ON "public"."lobby_players" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."lobbies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lobby_players" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."player_answers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."player_powerups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "player_powerups_select" ON "public"."player_powerups" FOR SELECT TO "authenticated" USING ("public"."is_lobby_member"("lobby_id"));



ALTER TABLE "public"."powerups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "powerups_select" ON "public"."powerups" FOR SELECT TO "authenticated" USING ("is_active");



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles readable by authenticated" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."questions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "read answers of my lobby" ON "public"."player_answers" FOR SELECT TO "authenticated" USING ("public"."is_lobby_member"("lobby_id"));



CREATE POLICY "read lobby_players (member or public waiting)" ON "public"."lobby_players" FOR SELECT TO "authenticated" USING (("public"."is_lobby_member"("lobby_id") OR (EXISTS ( SELECT 1
   FROM "public"."lobbies" "l"
  WHERE (("l"."id" = "lobby_players"."lobby_id") AND ("l"."access" = 'public'::"public"."lobby_access") AND ("l"."status" = 'waiting'::"public"."lobby_status"))))));



CREATE POLICY "read public waiting lobbies or own membership" ON "public"."lobbies" FOR SELECT TO "authenticated" USING (((("access" = 'public'::"public"."lobby_access") AND ("status" = 'waiting'::"public"."lobby_status")) OR ("host_id" = "auth"."uid"()) OR "public"."is_lobby_member"("id")));



CREATE POLICY "read rounds of my lobby" ON "public"."game_rounds" FOR SELECT TO "authenticated" USING ("public"."is_lobby_member"("lobby_id"));



CREATE POLICY "users update own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_powerup"("p_instance_id" "uuid", "p_target_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."draw_powerup"("p_lobby_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."finish_game"("p_lobby_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_active_powerups"("p_lobby_id" "uuid", "p_round_number" integer) TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_round_question"("p_round_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."health_check"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."health_check"() TO "anon";
GRANT ALL ON FUNCTION "public"."health_check"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."join_lobby_by_code"("p_code" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."next_round"("p_lobby_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."reset_lobby"("p_lobby_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."start_game"("p_lobby_id" "uuid") TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."game_rounds" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."game_rounds" TO "authenticated";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."game_rounds" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."lobbies" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."lobbies" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."lobbies" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."lobby_players" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."lobby_players" TO "authenticated";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."lobby_players" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."player_answers" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."player_answers" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."player_answers" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."player_powerups" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."player_powerups" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."player_powerups" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."powerups" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."powerups" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."powerups" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "service_role";



GRANT UPDATE("pseudo") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("avatar_url") ON TABLE "public"."profiles" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."questions" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."questions" TO "authenticated";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."questions" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "service_role";







