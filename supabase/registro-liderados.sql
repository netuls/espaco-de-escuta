-- =====================================================================
-- Espaço de Escuta — cadastro e login dos liderados
-- Rode DEPOIS do schema.sql, da migracao-agenda.sql e do lideranca-flexivel.sql.
-- No cadastro o liderado escolhe a equipe (uma das lideranças cadastradas).
-- Pode rodar mais de uma vez.
--
-- Privacidade: o login só LIBERA O ACESSO ao site. Os check-ins continuam
-- sem nenhuma ligação com a conta (checkins não guarda user_id), então a
-- liderança só vê o nome se o liderado escolher se identificar.
-- =====================================================================

-- ---------- 1) Código da equipe: removido ----------------------------------
-- (se você rodou a versão anterior, isto limpa o que sobrou)
drop function if exists public.check_team_code(text);
drop table if exists public.team_settings;

-- ---------- 2) Liderados cadastrados (com a equipe escolhida) ---------------
create table if not exists public.members (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 80),
  team text,
  created_at timestamptz not null default now()
);
alter table public.members add column if not exists team text;
alter table public.members enable row level security;
revoke all on public.members from anon, authenticated;

create or replace function public.is_member()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.members where id = auth.uid())
$$;
grant execute on function public.is_member() to authenticated;

create or replace function public.get_member()
returns json
language sql stable security definer
set search_path = public
as $$
  select json_build_object('id', m.id, 'full_name', m.full_name, 'team', m.team)
    from public.members m where m.id = auth.uid()
$$;
grant execute on function public.get_member() to authenticated;

-- ---------- 3) Ao criar a conta, vira "liderado" da equipe escolhida --------
-- A equipe precisa ser uma liderança cadastrada (tabela leaders).
create or replace function public._on_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_name text := nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), '');
  v_team text := nullif(trim(coalesce(new.raw_user_meta_data->>'team', '')), '');
begin
  if v_name is not null and v_team is not null
     and exists (select 1 from public.leaders where name = v_team) then
    insert into public.members (id, full_name, team)
    values (new.id, left(v_name, 80), v_team)
    on conflict (id) do nothing;
  end if;
  return new;
end
$$;
revoke all on function public._on_new_user() from public, anon, authenticated;

drop trigger if exists trg_on_new_user on auth.users;
create trigger trg_on_new_user
  after insert on auth.users
  for each row execute function public._on_new_user();

-- ---------- 4) Só liderado logado cria check-in -----------------------------
create or replace function public.submit_checkin(
  p_mood int,
  p_leader text,
  p_name text,
  p_message text,
  p_token text,
  p_mode text default 'chat'
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_leader text := nullif(trim(p_leader), '');
  v_name text := nullif(trim(p_name), '');
  v_msg text := nullif(trim(p_message), '');
  v_mode text := case when p_mode = 'presencial' then 'presencial' else 'chat' end;
begin
  if not public.is_member() then
    raise exception 'faça login para continuar';
  end if;
  if p_mood is null or p_mood not between 1 and 5 then
    raise exception 'humor inválido';
  end if;
  if char_length(regexp_replace(coalesce(p_token,''), '[^A-Za-z0-9]', '', 'g')) < 12 then
    raise exception 'código inválido';
  end if;
  if v_leader is not null
     and not exists (select 1 from public.leaders where name = v_leader) then
    raise exception 'liderança inválida';
  end if;
  if v_leader is null then
    v_name := null;
    v_msg := null;
    v_mode := 'chat';
  end if;

  -- Nenhum dado da conta (auth.uid) é gravado aqui: o anonimato é preservado.
  insert into public.checkins (mood, leader_name, display_name, token_hash, mode)
  values (p_mood, v_leader, left(v_name, 60), public._hash(p_token), v_mode)
  returning id into v_id;

  if v_msg is not null then
    insert into public.messages (checkin_id, sender, body)
    values (v_id, 'member', left(v_msg, 2000));
  end if;

  return v_id;
end
$$;
revoke execute on function public.submit_checkin(int, text, text, text, text, text) from public, anon;
grant execute on function public.submit_checkin(int, text, text, text, text, text) to authenticated;
