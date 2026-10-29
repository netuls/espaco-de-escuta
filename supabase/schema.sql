-- =====================================================================
-- Espaço de Escuta — schema do Supabase
-- Rode este arquivo inteiro no SQL Editor do Supabase (uma vez).
-- =====================================================================

-- ---------- Tabelas ---------------------------------------------------

-- Cada usuário do Supabase Auth que é liderança tem uma linha aqui.
create table if not exists public.leaders (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null unique
    check (name in ('Thais','Victor','Leiliane','Gabriel','Karen')),
  created_at timestamptz not null default now()
);

-- Um check-in = humor (1 a 5) + (opcional) pedido de conversa com uma liderança.
-- token_hash guarda o HASH do código de acesso do liderado (nunca o código).
create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  mood smallint not null check (mood between 1 and 5),
  leader_name text
    check (leader_name in ('Thais','Victor','Leiliane','Gabriel','Karen')),
  display_name text check (char_length(display_name) <= 60),
  token_hash text not null unique,
  status text not null default 'open' check (status in ('open','closed')),
  last_sender text check (last_sender in ('member','leader')),
  created_at timestamptz not null default now(),
  last_activity timestamptz not null default now()
);
create index if not exists checkins_leader_idx
  on public.checkins (leader_name, last_activity desc);
create index if not exists checkins_created_idx
  on public.checkins (created_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null references public.checkins(id) on delete cascade,
  sender text not null check (sender in ('member','leader')),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists messages_thread_idx
  on public.messages (checkin_id, created_at);

-- ---------- Funções auxiliares ---------------------------------------

-- Nome da liderança logada (ou null se o usuário não for liderança).
create or replace function public.current_leader()
returns text
language sql stable security definer
set search_path = public
as $$
  select name from public.leaders where id = auth.uid()
$$;

-- Hash do código de acesso (ignora hífens/caixa).
create or replace function public._hash(p text)
returns text
language sql immutable
as $$
  select encode(
    sha256(convert_to(upper(regexp_replace(coalesce(p,''), '[^A-Za-z0-9]', '', 'g')), 'UTF8')),
    'hex')
$$;
revoke all on function public._hash(text) from public, anon, authenticated;

-- Mantém checkins.last_sender / last_activity / status em dia.
create or replace function public._on_message()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  update public.checkins
     set last_sender = new.sender,
         last_activity = now(),
         status = case when new.sender = 'member' then 'open' else status end
   where id = new.checkin_id;
  return new;
end
$$;
revoke all on function public._on_message() from public, anon, authenticated;

drop trigger if exists trg_on_message on public.messages;
create trigger trg_on_message
  after insert on public.messages
  for each row execute function public._on_message();

-- ---------- RLS -------------------------------------------------------

alter table public.leaders  enable row level security;
alter table public.checkins enable row level security;
alter table public.messages enable row level security;

-- Ninguém anônimo toca nas tabelas diretamente (só pelas funções abaixo).
revoke all on public.leaders  from anon, authenticated;
revoke all on public.checkins from anon, authenticated;
revoke all on public.messages from anon, authenticated;

grant select on public.leaders  to authenticated;
grant select on public.checkins to authenticated;
grant update (status) on public.checkins to authenticated;
grant select on public.messages to authenticated;
grant insert (checkin_id, sender, body) on public.messages to authenticated;

drop policy if exists leaders_self on public.leaders;
create policy leaders_self on public.leaders
  for select to authenticated
  using (id = auth.uid());

-- A liderança vê: seus check-ins + os check-ins sem conversa (clima geral).
drop policy if exists checkins_leader_select on public.checkins;
create policy checkins_leader_select on public.checkins
  for select to authenticated
  using (
    public.current_leader() is not null
    and (leader_name is null or leader_name = public.current_leader())
  );

drop policy if exists checkins_leader_update on public.checkins;
create policy checkins_leader_update on public.checkins
  for update to authenticated
  using (leader_name = public.current_leader())
  with check (leader_name = public.current_leader());

drop policy if exists messages_leader_select on public.messages;
create policy messages_leader_select on public.messages
  for select to authenticated
  using (exists (
    select 1 from public.checkins c
    where c.id = messages.checkin_id
      and c.leader_name = public.current_leader()
  ));

drop policy if exists messages_leader_insert on public.messages;
create policy messages_leader_insert on public.messages
  for insert to authenticated
  with check (
    sender = 'leader'
    and exists (
      select 1 from public.checkins c
      where c.id = messages.checkin_id
        and c.leader_name = public.current_leader()
    )
  );

-- ---------- Funções públicas (acesso anônimo por código) --------------

-- Cria um check-in. Se não houver liderança escolhida, só o humor é salvo
-- (sem nome e sem mensagem), de forma totalmente anônima.
create or replace function public.submit_checkin(
  p_mood int,
  p_leader text,
  p_name text,
  p_message text,
  p_token text
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_leader text := nullif(trim(p_leader), '');
  v_name text := nullif(trim(p_name), '');
  v_msg text := nullif(trim(p_message), '');
begin
  if p_mood is null or p_mood not between 1 and 5 then
    raise exception 'humor inválido';
  end if;
  if char_length(regexp_replace(coalesce(p_token,''), '[^A-Za-z0-9]', '', 'g')) < 12 then
    raise exception 'código inválido';
  end if;
  if v_leader is not null
     and v_leader not in ('Thais','Victor','Leiliane','Gabriel','Karen') then
    raise exception 'liderança inválida';
  end if;
  if v_leader is null then
    v_name := null;
    v_msg := null;
  end if;

  insert into public.checkins (mood, leader_name, display_name, token_hash)
  values (p_mood, v_leader, left(v_name, 60), public._hash(p_token))
  returning id into v_id;

  if v_msg is not null then
    insert into public.messages (checkin_id, sender, body)
    values (v_id, 'member', left(v_msg, 2000));
  end if;

  return v_id;
end
$$;

-- Devolve a conversa de quem tem o código.
create or replace function public.get_thread(p_token text)
returns json
language sql stable security definer
set search_path = public
as $$
  select json_build_object(
    'checkin', json_build_object(
      'id', c.id,
      'mood', c.mood,
      'leader_name', c.leader_name,
      'display_name', c.display_name,
      'status', c.status,
      'created_at', c.created_at
    ),
    'messages', coalesce((
      select json_agg(json_build_object(
        'sender', m.sender,
        'body', m.body,
        'created_at', m.created_at
      ) order by m.created_at)
      from public.messages m
      where m.checkin_id = c.id
    ), '[]'::json)
  )
  from public.checkins c
  where c.token_hash = public._hash(p_token)
$$;

-- O liderado envia uma nova mensagem usando o código.
create or replace function public.send_member_message(p_token text, p_body text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_leader text;
  v_body text := nullif(trim(p_body), '');
begin
  if v_body is null then raise exception 'mensagem vazia'; end if;
  select id, leader_name into v_id, v_leader
    from public.checkins where token_hash = public._hash(p_token);
  if v_id is null then raise exception 'código não encontrado'; end if;
  if v_leader is null then raise exception 'este check-in não tem conversa'; end if;
  insert into public.messages (checkin_id, sender, body)
  values (v_id, 'member', left(v_body, 2000));
end
$$;

grant execute on function public.submit_checkin(int, text, text, text, text) to anon, authenticated;
grant execute on function public.get_thread(text) to anon, authenticated;
grant execute on function public.send_member_message(text, text) to anon, authenticated;

-- ---------- Cadastro das lideranças ----------------------------------
-- 1) Em Authentication > Users, crie um usuário (e-mail + senha) para cada liderança.
-- 2) Troque os e-mails abaixo pelos reais e rode estas linhas:
--
-- insert into public.leaders (id, name) select id, 'Thais'    from auth.users where email = 'thais@suaempresa.com';
-- insert into public.leaders (id, name) select id, 'Victor'   from auth.users where email = 'victor@suaempresa.com';
-- insert into public.leaders (id, name) select id, 'Leiliane' from auth.users where email = 'leiliane@suaempresa.com';
-- insert into public.leaders (id, name) select id, 'Gabriel'  from auth.users where email = 'gabriel@suaempresa.com';
-- insert into public.leaders (id, name) select id, 'Karen'    from auth.users where email = 'karen@suaempresa.com';
