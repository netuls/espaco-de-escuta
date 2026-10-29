-- =====================================================================
-- Espaço de Escuta — liderança flexível (permite incluir/trocar nomes)
-- Rode no SQL Editor do Supabase DEPOIS do schema.sql e da migracao-agenda.sql.
-- Pode rodar mais de uma vez.
-- =====================================================================

-- 1) Remove a lista fixa de nomes; a lista válida passa a ser a tabela leaders.
alter table public.leaders      drop constraint if exists leaders_name_check;
alter table public.checkins     drop constraint if exists checkins_leader_name_check;
alter table public.appointments drop constraint if exists appointments_leader_name_check;

-- 2) submit_checkin valida a liderança contra a tabela leaders.
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
     and not exists (select 1 from public.leaders where name = v_leader) then
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

-- 3) Para incluir uma liderança nova (exemplo "Teste"):
--    a) Authentication > Users: crie o usuário (e-mail + senha);
--    b) rode a linha abaixo com o e-mail dele;
--    c) adicione o mesmo nome em LEADERS nos dois config.js.
--
-- insert into public.leaders (id, name) select id, 'Teste' from auth.users where email = 'teste@suaempresa.com';
