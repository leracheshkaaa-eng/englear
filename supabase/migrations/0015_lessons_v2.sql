-- ============================================================
-- EngLear — lessons v2: metadata for a large lesson library. Idempotent; run after 0014.
--
-- 1) New lesson fields:
--      cefr (A1–C2), scope ('library' = public lessons of the site, created only
--      by admins; 'teacher' = a teacher's own lessons, seen only by the author,
--      the students they are assigned to, and admins), skill, topic,
--      grammar_topic_id, sequence (order in the library), status
--      (draft / review / published), source (manual / import / ai),
--      exercise_count (kept up to date automatically).
-- 2) grammar_topics: structure only (filled in stage 2).
-- 3) scope/status are the source of truth; the old columns visibility and
--    is_published are kept in sync both ways, so the currently deployed app
--    keeps working. Only admins can put a lesson into the library.
-- 4) Read access: library lessons when published (everyone, incl. guests);
--    teacher lessons: author, assigned students, admins.
-- 5) lesson_catalog(): one page of lessons (no exercises) + total, filtered.
-- 6) The existing lessons get: scope from visibility (all are 'teacher'),
--    status from is_published, cefr from the old level, source 'manual',
--    exercise_count. Assignments and student progress are not touched.
-- ============================================================

-- ---------- 2) grammar topics ----------
create table if not exists public.grammar_topics (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  cefr text check (cefr in ('A1','A2','B1','B2','C1','C2')),
  titles jsonb not null default '{}'::jsonb check (jsonb_typeof(titles) = 'object'),
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.grammar_topics enable row level security;
drop policy if exists gt_select on public.grammar_topics;
create policy gt_select on public.grammar_topics for select using (true);
drop policy if exists gt_write on public.grammar_topics;
create policy gt_write on public.grammar_topics for all using (public.is_admin()) with check (public.is_admin());
drop trigger if exists trg_updated_grammar_topics on public.grammar_topics;
create trigger trg_updated_grammar_topics before update on public.grammar_topics
  for each row execute function public.set_updated_at();

-- ---------- 1) lesson fields ----------
alter table public.lessons add column if not exists cefr text;
alter table public.lessons add column if not exists scope text;
alter table public.lessons add column if not exists skill text;
alter table public.lessons add column if not exists topic text;
alter table public.lessons add column if not exists grammar_topic_id uuid references public.grammar_topics(id) on delete set null;
alter table public.lessons add column if not exists sequence int not null default 0;
alter table public.lessons add column if not exists status text;
alter table public.lessons add column if not exists source text;
alter table public.lessons add column if not exists exercise_count int not null default 0;

-- ---------- 6) fill the existing lessons (before constraints/triggers) ----------
update public.lessons l set
  scope = coalesce(l.scope, case when l.visibility = 'public' then 'library' else 'teacher' end),
  status = coalesce(l.status, case when l.is_published then 'published' else 'draft' end),
  cefr = coalesce(l.cefr, case l.level
           when 'Начальный' then 'A1' when 'beginner' then 'A1'
           when 'Средний' then 'B1' when 'intermediate' then 'B1'
           when 'Продвинутый' then 'C1' when 'advanced' then 'C1'
           else 'A1' end),
  skill = coalesce(l.skill, 'grammar'),
  source = coalesce(l.source, 'manual'),
  exercise_count = (select count(*) from public.exercises e where e.lesson_id = l.id)
where l.scope is null or l.status is null or l.cefr is null or l.skill is null or l.source is null;

alter table public.lessons alter column scope set default 'teacher';
alter table public.lessons alter column scope set not null;
alter table public.lessons alter column status set default 'draft';
alter table public.lessons alter column status set not null;
alter table public.lessons alter column skill set default 'mixed';
alter table public.lessons alter column skill set not null;
alter table public.lessons alter column source set default 'manual';
alter table public.lessons alter column source set not null;

alter table public.lessons drop constraint if exists lessons_scope_check;
alter table public.lessons add constraint lessons_scope_check check (scope in ('library','teacher'));
alter table public.lessons drop constraint if exists lessons_status_check;
alter table public.lessons add constraint lessons_status_check check (status in ('draft','review','published'));
alter table public.lessons drop constraint if exists lessons_source_check;
alter table public.lessons add constraint lessons_source_check check (source in ('manual','import','ai'));
alter table public.lessons drop constraint if exists lessons_cefr_check;
alter table public.lessons add constraint lessons_cefr_check check (cefr is null or cefr in ('A1','A2','B1','B2','C1','C2'));
alter table public.lessons drop constraint if exists lessons_skill_check;
alter table public.lessons add constraint lessons_skill_check
  check (skill in ('vocabulary','grammar','listening','reading','writing','speaking','mixed'));

create index if not exists idx_lessons_catalog on public.lessons (scope, status, cefr, skill, sequence);
create index if not exists idx_lessons_author on public.lessons (author_id);

-- ---------- 3) keep old/new columns in sync; library is admin-only ----------
create or replace function public.lessons_sync_v2()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.scope := coalesce(new.scope, case when new.visibility = 'public' then 'library' else 'teacher' end);
    new.status := coalesce(new.status, case when new.is_published then 'published' else 'draft' end);
  else
    -- whichever side the client changed wins (new app: scope/status, old app: visibility/is_published)
    if new.scope is not distinct from old.scope and new.visibility is distinct from old.visibility then
      new.scope := case when new.visibility = 'public' then 'library' else 'teacher' end;
    end if;
    if new.status is not distinct from old.status and new.is_published is distinct from old.is_published then
      new.status := case when new.is_published then 'published'
                         when old.status = 'review' then 'review' else 'draft' end;
    end if;
  end if;
  new.visibility := case when new.scope = 'library' then 'public' else 'private' end;
  new.is_published := new.status = 'published';

  if new.scope = 'library' and (tg_op = 'INSERT' or old.scope is distinct from 'library')
     and auth.uid() is not null and not public.is_admin() then
    raise exception 'only admins can put lessons into the library' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_lessons_sync_v2 on public.lessons;
create trigger trg_lessons_sync_v2 before insert or update on public.lessons
  for each row execute function public.lessons_sync_v2();

-- exercise_count follows the exercises of a lesson
create or replace function public.lessons_exercise_count()
returns trigger language plpgsql security definer set search_path = public as $$
declare lid uuid;
begin
  for lid in select distinct x from unnest(array[
      case when tg_op in ('INSERT','UPDATE') then new.lesson_id end,
      case when tg_op in ('DELETE','UPDATE') then old.lesson_id end]) x where x is not null
  loop
    update public.lessons set exercise_count = (select count(*) from public.exercises where lesson_id = lid)
    where id = lid and exercise_count is distinct from (select count(*) from public.exercises where lesson_id = lid);
  end loop;
  return null;
end $$;

drop trigger if exists trg_exercises_count on public.exercises;
create trigger trg_exercises_count after insert or delete or update of lesson_id on public.exercises
  for each row execute function public.lessons_exercise_count();

-- ---------- 4) read access by scope/status ----------
create or replace function public.can_read_lesson(lid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.lessons l
    where l.id = lid and (
      (l.scope = 'library' and l.status = 'published')
      or l.author_id = auth.uid()
      or public.is_admin()
      or exists(select 1 from public.lesson_assignments a
                where a.lesson_id = lid and a.student_id = auth.uid())
    )
  );
$$;

drop policy if exists lessons_select on public.lessons;
create policy lessons_select on public.lessons for select
  using (
    (scope = 'library' and status = 'published')
    or author_id = auth.uid()
    or public.is_admin()
    or exists(select 1 from public.lesson_assignments a
              where a.lesson_id = lessons.id and a.student_id = auth.uid())
  );

drop policy if exists lessons_insert on public.lessons;
create policy lessons_insert on public.lessons for insert
  with check (
    public.is_admin()
    or (public.my_role() = 'teacher' and author_id = auth.uid() and scope = 'teacher')
  );
drop policy if exists lessons_update on public.lessons;
create policy lessons_update on public.lessons for update
  using (author_id = auth.uid() or public.is_admin())
  with check (public.is_admin() or (author_id = auth.uid() and scope = 'teacher'));

-- ---------- 5) catalog ----------
-- p_scope 'library': the site's lessons (published; admins also see drafts);
-- p_scope 'teacher': teacher lessons the caller may read (a student: assigned
-- ones; a teacher: own ones; an admin: all). RLS applies (security invoker).
create or replace function public.lesson_catalog(
  p_scope text default 'library',
  p_cefr text[] default null,
  p_skill text default null,
  p_topic text default null,
  p_grammar uuid default null,
  p_q text default '',
  p_limit int default 30,
  p_offset int default 0)
returns table (
  id uuid, title text, description text, cefr text, skill text, topic text,
  grammar_topic_id uuid, sequence int, status text, scope text, author_id uuid,
  exercise_count int, level text, "position" int, updated_at timestamptz, total bigint)
language sql stable security invoker set search_path = public as $$
  with q as (
    select '%' || replace(replace(replace(btrim(coalesce(p_q, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat,
           btrim(coalesce(p_q, '')) = '' as empty
  )
  select l.id, l.title, l.description, l.cefr, l.skill, l.topic, l.grammar_topic_id, l.sequence,
         l.status, l.scope, l.author_id, l.exercise_count, l.level, l.position, l.updated_at,
         count(*) over () as total
  from public.lessons l, q
  where l.scope = coalesce(p_scope, 'library')
    and (p_cefr is null or l.cefr = any(p_cefr))
    and (p_skill is null or l.skill = p_skill)
    and (p_topic is null or l.topic = p_topic)
    and (p_grammar is null or l.grammar_topic_id = p_grammar)
    and (q.empty or l.title ilike q.pat or l.description ilike q.pat)
  order by l.cefr nulls last, l.sequence, l.position, l.title, l.id
  limit least(greatest(coalesce(p_limit, 30), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function public.lesson_catalog(text, text[], text, text, uuid, text, int, int) to anon, authenticated;
