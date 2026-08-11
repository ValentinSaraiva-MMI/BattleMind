-- Sonde de disponibilité de la base.
-- Exposée au rôle anonyme sans accorder aucun privilège sur les tables :
-- la fonction s'exécute avec les droits de son propriétaire, lit une table
-- de référence, et ne renvoie qu'un décompte. Aucune donnée de jeu ne sort.
-- Marquée stable pour que PostgREST accepte l'appel en GET.

create or replace function public.health_check()
returns json
language sql
security definer
set search_path = public
stable
as $$
  select json_build_object(
    'status', 'ok',
    'questions', (select count(*) from public.questions),
    'checked_at', now()
  );
$$;

revoke all on function public.health_check() from public;
grant execute on function public.health_check() to anon, authenticated;
