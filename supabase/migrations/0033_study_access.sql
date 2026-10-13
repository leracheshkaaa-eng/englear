-- 0033: full lessons are a Plus feature. Additive: new columns/tables/functions; the only change to an
-- existing object is that the `content` column of study_lessons is no longer readable directly
-- (it is served by get_study_lesson(), which checks access). Existing rows are not changed.
--
-- Who can open a full lesson (its content):
--   admin, the lesson's author, Plus / Family subscribers — every lesson;
--   everyone else — the lessons they unlocked: 1 for a learner (a trial), 3 for a teacher.
-- The list of lessons (title, level, length…) stays visible to everyone.

alter table public.study_lessons add column position int not null default 0;
create index study_lessons_plan on public.study_lessons (cefr, position) where scope = 'library' and status = 'published';

create table public.study_unlocks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.study_lessons(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
alter table public.study_unlocks enable row level security;
create policy su_select on public.study_unlocks for select using (user_id = auth.uid() or public.is_admin());
grant select on public.study_unlocks to authenticated;

create table public.study_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.study_lessons(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
alter table public.study_progress enable row level security;
create policy sp_select on public.study_progress for select using (user_id = auth.uid() or public.is_admin());
create policy sp_insert on public.study_progress for insert with check (user_id = auth.uid());
create policy sp_delete on public.study_progress for delete using (user_id = auth.uid());
grant select, insert, delete on public.study_progress to authenticated;

-- free unlocks: a trial lesson for learners, three for teachers
create or replace function public.study_unlock_limit(p_user uuid)
returns int language sql stable security definer set search_path = public as $$
  select case when (select role from public.profiles where id = p_user) in ('teacher', 'admin') then 3 else 1 end
$$;

create or replace function public.study_can_open(p_user uuid, p_lesson uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user is not null and (
    exists (select 1 from public.profiles where id = p_user and role = 'admin')
    or exists (select 1 from public.study_lessons where id = p_lesson and author_id = p_user)
    or public.has_plus(p_user)
    or exists (select 1 from public.study_unlocks where user_id = p_user and lesson_id = p_lesson)
  )
$$;

-- what the signed-in user can do in the Lessons section
create or replace function public.study_access()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then jsonb_build_object('signed_in', false, 'plus', false, 'used', 0, 'limit', 0, 'unlocked', '[]'::jsonb)
  else jsonb_build_object(
    'signed_in', true,
    'plus', public.has_plus(auth.uid()) or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'),
    'used', (select count(*) from public.study_unlocks where user_id = auth.uid()),
    'limit', public.study_unlock_limit(auth.uid()),
    'unlocked', coalesce((select jsonb_agg(lesson_id) from public.study_unlocks where user_id = auth.uid()), '[]'::jsonb)
  ) end
$$;

-- open a lesson with a free unlock (no-op when it is already open)
create or replace function public.unlock_study_lesson(p_lesson uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'sign in required' using errcode = 'P0001', hint = 'sign_in_required'; end if;
  if not exists (select 1 from public.study_lessons where id = p_lesson and scope = 'library' and status = 'published') then
    raise exception 'lesson not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  if public.study_can_open(uid, p_lesson) then return; end if;
  -- one at a time per user, so two quick clicks cannot both pass the count
  perform pg_advisory_xact_lock(hashtext('study_unlock:' || uid::text));
  if (select count(*) from public.study_unlocks where user_id = uid) >= public.study_unlock_limit(uid) then
    raise exception 'no free lessons left' using errcode = 'P0001', hint = 'no_unlocks_left';
  end if;
  insert into public.study_unlocks (user_id, lesson_id) values (uid, p_lesson) on conflict do nothing;
end $$;

-- the lesson with its content, only for those who may open it
create or replace function public.get_study_lesson(p_lesson uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare l public.study_lessons;
begin
  select * into l from public.study_lessons where id = p_lesson;
  if l.id is null then return null; end if;
  -- the row itself must be visible to the caller (published library lesson, own lesson, admin)
  if not ((l.scope = 'library' and l.status = 'published') or l.author_id = auth.uid() or public.is_admin()) then return null; end if;
  if not public.study_can_open(auth.uid(), p_lesson) then
    raise exception 'locked' using errcode = 'P0001', hint = 'locked';
  end if;
  return to_jsonb(l);
end $$;

revoke all on function public.study_unlock_limit(uuid), public.study_can_open(uuid, uuid) from public, anon, authenticated;
grant execute on function public.study_access() to anon, authenticated;
grant execute on function public.unlock_study_lesson(uuid) to authenticated;
grant execute on function public.get_study_lesson(uuid) to anon, authenticated;

-- the content is read only through get_study_lesson()
revoke select on public.study_lessons from anon, authenticated;
grant select (id, author_id, scope, status, title, description, cefr, topic, grammar_topic_id, duration_min, source, created_at, updated_at, position)
  on public.study_lessons to anon, authenticated;
