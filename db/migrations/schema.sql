


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
  where code = p_code and status = 'waiting';

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







