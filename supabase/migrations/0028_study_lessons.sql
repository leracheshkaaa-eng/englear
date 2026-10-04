-- 0028: full lessons ("Lessons", 40–60 min): warm-up → presentation → tasks → practice → production → homework.
-- What used to be called lessons are now "Tasks" in the interface (the lessons table is unchanged).
-- A stage can point to a task set (lessons.kind = 'lesson') or a practice (lessons.kind = 'practice').
--
-- content = { "stages": [ { "kind": "warmup"|"presentation"|"tasks"|"practice"|"production"|"homework",
--                           "title": text, "minutes": int, "teacher": notes for the teacher,
--                           "body": text for the learner, "examples": [text],
--                           "task_id": uuid | null } ] }

create table public.study_lessons (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles(id) on delete set null,
  scope text not null default 'teacher' check (scope in ('library', 'teacher')),
  status text not null default 'draft' check (status in ('draft', 'published')),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  description text not null default '',
  cefr text not null check (cefr in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  topic text,
  grammar_topic_id uuid references public.grammar_topics(id) on delete set null,
  duration_min int not null default 45 check (duration_min between 10 and 120),
  content jsonb not null default '{"stages": []}'::jsonb,
  source text not null default 'manual' check (source in ('manual', 'ai')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(content -> 'stages') = 'array')
);
create index study_lessons_catalog on public.study_lessons (scope, status, cefr);
create index study_lessons_author on public.study_lessons (author_id);

alter table public.study_lessons enable row level security;
create policy sl_select on public.study_lessons for select
  using ((scope = 'library' and status = 'published') or author_id = auth.uid() or public.is_admin());
create policy sl_insert on public.study_lessons for insert
  with check (author_id = auth.uid() and public.is_teacher_role() and (scope = 'teacher' or public.is_admin()));
create policy sl_update on public.study_lessons for update
  using (public.is_admin() or (author_id = auth.uid() and scope = 'teacher'))
  with check (public.is_admin() or (author_id = auth.uid() and scope = 'teacher'));
create policy sl_delete on public.study_lessons for delete using (public.is_admin() or author_id = auth.uid());

grant select on public.study_lessons to anon, authenticated;
grant insert, update, delete on public.study_lessons to authenticated;

create trigger trg_updated_study_lessons before update on public.study_lessons
  for each row execute function public.set_updated_at();
