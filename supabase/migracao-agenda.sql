-- =====================================================================
-- Espaço de Escuta — migração: conversa presencial/chat + agenda
-- Rode DEPOIS do schema.sql, no SQL Editor do Supabase. Pode rodar mais de uma vez.
-- =====================================================================

-- ---------- 1) Modo de conversa escolhido pelo liderado ---------------
alter table public.checkins
  add column if not exists mode text not null default 'chat';

alter table public.checkins drop constraint if exists checkins_mode_check;
alter table public.checkins
  add constraint checkins_mode_check check (mode in ('chat','presencial'));

-- ---------- 2) Agenda --------------------------------------------------
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null references public.checkins(id) on delete cascade,
  leader_name text not null
    check (leader_name in ('Thais','Victor','Leiliane','Gabriel','Karen')),
  scheduled_at timestamptz not null,
  location text not null check (char_length(location) between 1 and 200),
  notes text check (char_length(notes) <= 1000),
  status text not null default 'scheduled'
    check (status in ('scheduled','done','cancelled')),
  seen_by_member boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists appointments_leader_idx
  on public.appointments (leader_name, scheduled_at);
create index if not exists appointments_checkin_idx
  on public.appointments (checkin_id, scheduled_at);

alter table public.appointments enable row level security;
revoke all on public.appointments from anon, authenticated;
grant select on public.appointments to authenticated;

-- A liderança só enxerga os próprios agendamentos.
drop policy if exists appointments_leader_select on public.appointments;
create policy appointments_leader_select on public.appointments
  for select to authenticated
  using (leader_name = public.current_leader());

-- ---------- 3) Funções da liderança (escrita controlada) --------------

-- Cria o agendamento + uma mensagem automática no chat (é a "notificação"
-- que o liderado vê ao voltar ao site).
create or replace function public.schedule_appointment(
  p_checkin uuid,
  p_at timestamptz,
  p_location text,
  p_notes text
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_leader text := public.current_leader();
  v_owner text;
  v_id uuid;
  v_loc text := nullif(trim(p_location), '');
  v_notes text := nullif(trim(p_notes), '');
  v_msg text;
begin
  if v_leader is null then raise exception 'sem permissão'; end if;
  select leader_name into v_owner from public.checkins where id = p_checkin;
  if v_owner is distinct from v_leader then raise exception 'conversa não encontrada'; end if;
  if p_at is null or p_at < now() - interval '5 minutes' then
    raise exception 'data inválida';
  end if;
  if v_loc is null then raise exception 'informe o local'; end if;

  insert into public.appointments (checkin_id, leader_name, scheduled_at, location, notes)
  values (p_checkin, v_leader, p_at, left(v_loc, 200), left(v_notes, 1000))
  returning id into v_id;

  v_msg := '📅 Conversa agendada para '
    || to_char(p_at at time zone 'America/Fortaleza', 'DD/MM/YYYY "às" HH24:MI')
    || ' · Local: ' || left(v_loc, 200);
  if v_notes is not null then
    v_msg := v_msg || E'\n' || left(v_notes, 600);
  end if;
  insert into public.messages (checkin_id, sender, body)
  values (p_checkin, 'leader', left(v_msg, 2000));

  return v_id;
end
$$;

-- Marca como concluído ou cancela (e avisa no chat quando cancela).
create or replace function public.set_appointment_status(p_id uuid, p_status text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_leader text := public.current_leader();
  a public.appointments%rowtype;
begin
  if v_leader is null then raise exception 'sem permissão'; end if;
  if p_status not in ('done','cancelled','scheduled') then raise exception 'status inválido'; end if;
  select * into a from public.appointments where id = p_id and leader_name = v_leader;
  if a.id is null then raise exception 'agendamento não encontrado'; end if;

  update public.appointments
     set status = p_status,
         seen_by_member = case when p_status = 'cancelled' then false else seen_by_member end
   where id = p_id;

  if p_status = 'cancelled' then
    insert into public.messages (checkin_id, sender, body)
    values (a.checkin_id, 'leader',
      '❌ O agendamento de '
      || to_char(a.scheduled_at at time zone 'America/Fortaleza', 'DD/MM/YYYY "às" HH24:MI')
      || ' foi cancelado. Vamos combinar um novo horário por aqui.');
  end if;
end
$$;

grant execute on function public.schedule_appointment(uuid, timestamptz, text, text) to authenticated;
grant execute on function public.set_appointment_status(uuid, text) to authenticated;

-- ---------- 4) Funções públicas (liderado, por código) ----------------

-- submit_checkin agora recebe o modo (chat | presencial).
drop function if exists public.submit_checkin(int, text, text, text, text);
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
    v_mode := 'chat';
  end if;

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
grant execute on function public.submit_checkin(int, text, text, text, text, text) to anon, authenticated;

-- get_thread agora devolve também o modo e os agendamentos.
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
      'mode', c.mode,
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
    ), '[]'::json),
    'appointments', coalesce((
      select json_agg(json_build_object(
        'id', a.id,
        'scheduled_at', a.scheduled_at,
        'location', a.location,
        'notes', a.notes,
        'status', a.status,
        'seen', a.seen_by_member
      ) order by a.scheduled_at)
      from public.appointments a
      where a.checkin_id = c.id
    ), '[]'::json)
  )
  from public.checkins c
  where c.token_hash = public._hash(p_token)
$$;
grant execute on function public.get_thread(text) to anon, authenticated;

-- O liderado marca os agendamentos como vistos (some o aviso de "novo").
create or replace function public.mark_appointments_seen(p_token text)
returns void
language sql security definer
set search_path = public
as $$
  update public.appointments a
     set seen_by_member = true
    from public.checkins c
   where c.id = a.checkin_id
     and c.token_hash = public._hash(p_token)
     and a.seen_by_member = false
$$;
grant execute on function public.mark_appointments_seen(text) to anon, authenticated;
