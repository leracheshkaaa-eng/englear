-- ============================================================
-- EngLear — initial relational schema, RLS, helpers, indexes
-- Safe to run on a fresh Supabase project. Idempotent-ish:
-- uses IF NOT EXISTS / CREATE OR REPLACE where possible.
-- Does NOT touch the existing kv_store table or any auth data.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- generic updated_at helper ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ============================================================
-- TABLES
-- ============================================================

-- profiles: 1:1 with auth.users
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'student' check (role in ('student','teacher','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- teacher <-> student link
create table if not exists public.teacher_students (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (teacher_id, student_id)
);

-- per-user settings (translations, future levels)
create table if not exists public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  translations_enabled boolean not null default true,
  translation_mode text not null default 'on',
  extra jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- lessons
create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text default '',
  level text default 'Начальный',
  position int not null default 0,
  visibility text not null default 'private' check (visibility in ('public','private')),
  is_published boolean not null default false,
  author_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- exercises (structured, but keep raw fields to preserve the parser format)
create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  type text not null check (type in ('choice','fill','listen','dialogue')),
  position int not null default 0,
  prompt text default '',
  answer text default '',
  options jsonb not null default '[]'::jsonb,
  explanation text default '',
  dialogue jsonb not null default '[]'::jsonb,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- global dictionary: one word stored once
create table if not exists public.dictionary_words (
  id uuid primary key default gen_random_uuid(),
  word text not null unique,
  translation text default '',
  part_of_speech text default '',
  example text default '',
  pronunciation text default '',
  audio_url text default '',
  cefr_level text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lesson_words (
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  word_id uuid not null references public.dictionary_words(id) on delete cascade,
  primary key (lesson_id, word_id)
);

-- flashcard sets (teacher sets or student personal)
create table if not exists public.flashcard_sets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text default '',
  owner_id uuid not null references public.profiles(id) on delete cascade,
  is_personal boolean not null default false,
  lesson_id uuid references public.lessons(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.flashcard_sets(id) on delete cascade,
  word_id uuid references public.dictionary_words(id) on delete set null,
  front text not null,
  back text default '',
  example text default '',
  image_url text default '',
  audio_url text default '',
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- assignments (explicit FK tables, not polymorphic)
create table if not exists public.lesson_assignments (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unique (lesson_id, student_id)
);

create table if not exists public.flashcard_set_assignments (
  id uuid primary key default gen_random_uuid(),
  flashcard_set_id uuid not null references public.flashcard_sets(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unique (flashcard_set_id, student_id)
);

-- progress
create table if not exists public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  status text not null default 'not_started' check (status in ('not_started','in_progress','completed')),
  score int default 0,
  started_at timestamptz,
  completed_at timestamptz,
  time_spent_sec int not null default 0,
  updated_at timestamptz not null default now(),
  unique (student_id, lesson_id)
);

create table if not exists public.exercise_attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  attempt_number int not null default 1,
  given_answer text default '',
  is_correct boolean not null default false,
  answered_at timestamptz not null default now()
);

create table if not exists public.flashcard_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  flashcard_id uuid not null references public.flashcards(id) on delete cascade,
  state text not null default 'new' check (state in ('new','learning','known')),
  repetitions int not null default 0,
  correct_count int not null default 0,
  incorrect_count int not null default 0,
  last_reviewed timestamptz,
  next_review timestamptz,
  unique (student_id, flashcard_id)
);

create table if not exists public.student_word_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  word_id uuid not null references public.dictionary_words(id) on delete cascade,
  status text not null default 'learning' check (status in ('learning','known','weak')),
  last_seen timestamptz not null default now(),
  unique (student_id, word_id)
);

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_lessons_author on public.lessons(author_id);
create index if not exists idx_lessons_visibility on public.lessons(visibility);
create index if not exists idx_lessons_published on public.lessons(is_published);
create index if not exists idx_exercises_lesson on public.exercises(lesson_id);
create index if not exists idx_ts_teacher on public.teacher_students(teacher_id);
create index if not exists idx_ts_student on public.teacher_students(student_id);
create index if not exists idx_la_student on public.lesson_assignments(student_id);
create index if not exists idx_la_teacher on public.lesson_assignments(teacher_id);
create index if not exists idx_fsa_student on public.flashcard_set_assignments(student_id);
create index if not exists idx_fsa_teacher on public.flashcard_set_assignments(teacher_id);
create index if not exists idx_lp_student on public.lesson_progress(student_id);
create index if not exists idx_lp_lesson on public.lesson_progress(lesson_id);
create index if not exists idx_ea_student on public.exercise_attempts(student_id);
create index if not exists idx_ea_exercise on public.exercise_attempts(exercise_id);
create index if not exists idx_fp_student on public.flashcard_progress(student_id);
create index if not exists idx_swp_student on public.student_word_progress(student_id);
create index if not exists idx_dict_word on public.dictionary_words(lower(word));
create index if not exists idx_flashcards_set on public.flashcards(set_id);
create index if not exists idx_lesson_words_lesson on public.lesson_words(lesson_id);

-- ============================================================
-- HELPER FUNCTIONS (SECURITY DEFINER -> bypass RLS, no recursion)
-- ============================================================
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_teacher_of(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.teacher_students
    where teacher_id = auth.uid() and student_id = sid
  );
$$;

create or replace function public.can_read_lesson(lid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.lessons l
    where l.id = lid and (
      (l.visibility = 'public' and l.is_published)
      or l.author_id = auth.uid()
      or public.is_admin()
      or exists(select 1 from public.lesson_assignments a
                where a.lesson_id = lid and a.student_id = auth.uid())
    )
  );
$$;

create or replace function public.can_edit_lesson(lid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.lessons l
    where l.id = lid and (l.author_id = auth.uid() or public.is_admin())
  );
$$;

create or replace function public.can_read_set(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.flashcard_sets s
    where s.id = sid and (
      s.owner_id = auth.uid()
      or public.is_admin()
      or exists(select 1 from public.flashcard_set_assignments a
                where a.flashcard_set_id = sid and a.student_id = auth.uid())
    )
  );
$$;

create or replace function public.can_edit_set(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.flashcard_sets s
    where s.id = sid and (s.owner_id = auth.uid() or public.is_admin())
  );
$$;

-- ---------- new user -> profile + settings ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    coalesce(new.raw_user_meta_data->>'role', 'student')
  )
  on conflict (id) do nothing;

  insert into public.user_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- prevent self role change (service role: auth.uid() is null -> allowed) ----------
create or replace function public.protect_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.role is distinct from old.role and not public.is_admin() then
    new.role := old.role;
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_role on public.profiles;
create trigger trg_protect_role
  before update on public.profiles
  for each row execute function public.protect_role();

-- ---------- updated_at triggers ----------
do $$
declare t text;
begin
  foreach t in array array['profiles','lessons','dictionary_words','flashcard_sets','user_settings','lesson_progress']
  loop
    execute format('drop trigger if exists trg_updated_%1$s on public.%1$s;', t);
    execute format('create trigger trg_updated_%1$s before update on public.%1$s
                    for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- ============================================================
-- ENABLE RLS
-- ============================================================
alter table public.profiles                enable row level security;
alter table public.teacher_students        enable row level security;
alter table public.user_settings           enable row level security;
alter table public.lessons                 enable row level security;
alter table public.exercises               enable row level security;
alter table public.dictionary_words        enable row level security;
alter table public.lesson_words            enable row level security;
alter table public.flashcard_sets          enable row level security;
alter table public.flashcards              enable row level security;
alter table public.lesson_assignments      enable row level security;
alter table public.flashcard_set_assignments enable row level security;
alter table public.lesson_progress         enable row level security;
alter table public.exercise_attempts       enable row level security;
alter table public.flashcard_progress      enable row level security;
alter table public.student_word_progress   enable row level security;

-- ============================================================
-- POLICIES  (drop-if-exists then create, so re-runs are safe)
-- ============================================================

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (
    id = auth.uid() or public.is_admin() or public.is_teacher_of(id)
    or exists(select 1 from public.teacher_students ts
              where ts.student_id = auth.uid() and ts.teacher_id = profiles.id)
  );
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- teacher_students
drop policy if exists ts_select on public.teacher_students;
create policy ts_select on public.teacher_students for select
  using (teacher_id = auth.uid() or student_id = auth.uid() or public.is_admin());
drop policy if exists ts_insert on public.teacher_students;
create policy ts_insert on public.teacher_students for insert
  with check (public.is_admin() or teacher_id = auth.uid());
drop policy if exists ts_delete on public.teacher_students;
create policy ts_delete on public.teacher_students for delete
  using (public.is_admin() or teacher_id = auth.uid());

-- user_settings
drop policy if exists us_all on public.user_settings;
create policy us_all on public.user_settings for all
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- lessons
drop policy if exists lessons_select on public.lessons;
create policy lessons_select on public.lessons for select
  using (
    (visibility = 'public' and is_published)
    or author_id = auth.uid()
    or public.is_admin()
    or exists(select 1 from public.lesson_assignments a
              where a.lesson_id = lessons.id and a.student_id = auth.uid())
  );
drop policy if exists lessons_insert on public.lessons;
create policy lessons_insert on public.lessons for insert
  with check (
    public.is_admin()
    or (public.my_role() = 'teacher' and author_id = auth.uid() and visibility = 'private')
  );
drop policy if exists lessons_update on public.lessons;
create policy lessons_update on public.lessons for update
  using (author_id = auth.uid() or public.is_admin())
  with check (public.is_admin() or (author_id = auth.uid() and visibility = 'private'));
drop policy if exists lessons_delete on public.lessons;
create policy lessons_delete on public.lessons for delete
  using (author_id = auth.uid() or public.is_admin());

-- exercises
drop policy if exists ex_select on public.exercises;
create policy ex_select on public.exercises for select
  using (public.can_read_lesson(lesson_id));
drop policy if exists ex_write on public.exercises;
create policy ex_write on public.exercises for all
  using (public.can_edit_lesson(lesson_id))
  with check (public.can_edit_lesson(lesson_id));

-- dictionary_words (readable by everyone incl anon; write teacher/admin)
drop policy if exists dict_select on public.dictionary_words;
create policy dict_select on public.dictionary_words for select using (true);
drop policy if exists dict_insert on public.dictionary_words;
create policy dict_insert on public.dictionary_words for insert
  with check (public.my_role() in ('teacher','admin'));
drop policy if exists dict_update on public.dictionary_words;
create policy dict_update on public.dictionary_words for update
  using (public.my_role() in ('teacher','admin'))
  with check (public.my_role() in ('teacher','admin'));
drop policy if exists dict_delete on public.dictionary_words;
create policy dict_delete on public.dictionary_words for delete using (public.is_admin());

-- lesson_words
drop policy if exists lw_select on public.lesson_words;
create policy lw_select on public.lesson_words for select using (public.can_read_lesson(lesson_id));
drop policy if exists lw_write on public.lesson_words;
create policy lw_write on public.lesson_words for all
  using (public.can_edit_lesson(lesson_id)) with check (public.can_edit_lesson(lesson_id));

-- flashcard_sets
drop policy if exists fs_select on public.flashcard_sets;
create policy fs_select on public.flashcard_sets for select
  using (
    owner_id = auth.uid() or public.is_admin()
    or exists(select 1 from public.flashcard_set_assignments a
              where a.flashcard_set_id = flashcard_sets.id and a.student_id = auth.uid())
  );
drop policy if exists fs_insert on public.flashcard_sets;
create policy fs_insert on public.flashcard_sets for insert
  with check (
    owner_id = auth.uid() and (
      public.is_admin() or public.my_role() = 'teacher'
      or (public.my_role() = 'student' and is_personal = true)
    )
  );
drop policy if exists fs_update on public.flashcard_sets;
create policy fs_update on public.flashcard_sets for update
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());
drop policy if exists fs_delete on public.flashcard_sets;
create policy fs_delete on public.flashcard_sets for delete
  using (owner_id = auth.uid() or public.is_admin());

-- flashcards
drop policy if exists fc_select on public.flashcards;
create policy fc_select on public.flashcards for select using (public.can_read_set(set_id));
drop policy if exists fc_write on public.flashcards;
create policy fc_write on public.flashcards for all
  using (public.can_edit_set(set_id)) with check (public.can_edit_set(set_id));

-- lesson_assignments
drop policy if exists la_select on public.lesson_assignments;
create policy la_select on public.lesson_assignments for select
  using (student_id = auth.uid() or teacher_id = auth.uid() or public.is_admin());
drop policy if exists la_insert on public.lesson_assignments;
create policy la_insert on public.lesson_assignments for insert
  with check (
    public.is_admin()
    or (teacher_id = auth.uid() and public.is_teacher_of(student_id) and public.can_edit_lesson(lesson_id))
  );
drop policy if exists la_delete on public.lesson_assignments;
create policy la_delete on public.lesson_assignments for delete
  using (teacher_id = auth.uid() or public.is_admin());

-- flashcard_set_assignments
drop policy if exists fsa_select on public.flashcard_set_assignments;
create policy fsa_select on public.flashcard_set_assignments for select
  using (student_id = auth.uid() or teacher_id = auth.uid() or public.is_admin());
drop policy if exists fsa_insert on public.flashcard_set_assignments;
create policy fsa_insert on public.flashcard_set_assignments for insert
  with check (
    public.is_admin()
    or (teacher_id = auth.uid() and public.is_teacher_of(student_id) and public.can_edit_set(flashcard_set_id))
  );
drop policy if exists fsa_delete on public.flashcard_set_assignments;
create policy fsa_delete on public.flashcard_set_assignments for delete
  using (teacher_id = auth.uid() or public.is_admin());

-- progress tables: student owns; teacher of student reads; admin all
drop policy if exists lp_select on public.lesson_progress;
create policy lp_select on public.lesson_progress for select
  using (student_id = auth.uid() or public.is_admin() or public.is_teacher_of(student_id));
drop policy if exists lp_write on public.lesson_progress;
create policy lp_write on public.lesson_progress for all
  using (student_id = auth.uid() or public.is_admin())
  with check (student_id = auth.uid() or public.is_admin());

drop policy if exists ea_select on public.exercise_attempts;
create policy ea_select on public.exercise_attempts for select
  using (student_id = auth.uid() or public.is_admin() or public.is_teacher_of(student_id));
drop policy if exists ea_insert on public.exercise_attempts;
create policy ea_insert on public.exercise_attempts for insert
  with check (student_id = auth.uid() or public.is_admin());

drop policy if exists fp_select on public.flashcard_progress;
create policy fp_select on public.flashcard_progress for select
  using (student_id = auth.uid() or public.is_admin() or public.is_teacher_of(student_id));
drop policy if exists fp_write on public.flashcard_progress;
create policy fp_write on public.flashcard_progress for all
  using (student_id = auth.uid() or public.is_admin())
  with check (student_id = auth.uid() or public.is_admin());

drop policy if exists swp_select on public.student_word_progress;
create policy swp_select on public.student_word_progress for select
  using (student_id = auth.uid() or public.is_admin() or public.is_teacher_of(student_id));
drop policy if exists swp_write on public.student_word_progress;
create policy swp_write on public.student_word_progress for all
  using (student_id = auth.uid() or public.is_admin())
  with check (student_id = auth.uid() or public.is_admin());

-- ============================================================
-- SEED: a few dictionary words (safe, no owner needed)
-- ============================================================
insert into public.dictionary_words (word, translation, part_of_speech, example, cefr_level) values
  ('cat','кот','noun','It is a cat.','A1'),
  ('dog','собака','noun','The dog is big.','A1'),
  ('pen','ручка','noun','You write with a pen.','A1'),
  ('bag','сумка','noun','I have a bag.','A1'),
  ('door','дверь','noun','Open the door, please.','A1'),
  ('house','дом','noun','This is my house.','A1'),
  ('water','вода','noun','I drink water.','A1'),
  ('happy','счастливый','adjective','We are a happy family.','A1')
on conflict (word) do nothing;
