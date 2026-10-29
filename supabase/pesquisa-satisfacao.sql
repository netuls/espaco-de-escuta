-- =====================================================================
-- Espaço de Escuta — pesquisa de satisfação ao encerrar a conversa
-- Rode DEPOIS da migracao-agenda.sql. Pode rodar mais de uma vez.
-- O liderado responde: como está agora (1 a 5), nota da conversa (1 a 5)
-- e um comentário opcional. A liderança só vê as respostas das próprias conversas.
-- =====================================================================

create table if not exists public.feedbacks (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null unique references public.checkins(id) on delete cascade,
  leader_name text not null,
  mood_after smallint not null check (mood_after between 1 and 5),
  rating smallint not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists feedbacks_leader_idx on public.feedbacks (leader_name, created_at desc);

alter table public.feedbacks enable row level security;
revoke all on public.feedbacks from anon, authenticated;
grant select on public.feedbacks to authenticated;

drop policy if exists feedbacks_leader_select on public.feedbacks;
create policy feedbacks_leader_select on public.feedbacks
  for select to authenticated
  using (leader_name = public.current_leader());

-- O liderado responde usando o código da conversa (só depois de encerrada, uma vez).
create or replace function public.submit_feedback(
  p_token text,
  p_mood_after int,
  p_rating int,
  p_comment text
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  c public.checkins%rowtype;
  v_comment text := nullif(trim(p_comment), '');
begin
  if p_mood_after is null or p_mood_after not between 1 and 5 then raise exception 'humor inválido'; end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'nota inválida'; end if;
  select * into c from public.checkins where token_hash = public._hash(p_token);
  if c.id is null then raise exception 'código não encontrado'; end if;
  if c.leader_name is null then raise exception 'este check-in não tem conversa'; end if;
  if c.status <> 'closed' then raise exception 'a conversa ainda não foi encerrada'; end if;

  insert into public.feedbacks (checkin_id, leader_name, mood_after, rating, comment)
  values (c.id, c.leader_name, p_mood_after, p_rating, left(v_comment, 1000))
  on conflict (checkin_id) do nothing;
end
$$;
grant execute on function public.submit_feedback(text, int, int, text) to anon, authenticated;

-- get_thread passa a devolver também a resposta da pesquisa (ou null).
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
    ), '[]'::json),
    'feedback', (
      select json_build_object('mood_after', f.mood_after, 'rating', f.rating, 'created_at', f.created_at)
      from public.feedbacks f where f.checkin_id = c.id
    )
  )
  from public.checkins c
  where c.token_hash = public._hash(p_token)
$$;
grant execute on function public.get_thread(text) to anon, authenticated;
