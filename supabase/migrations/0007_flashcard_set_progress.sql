-- ============================================================
-- EngLear — progress through flashcard sets. Idempotent; run after 0001-0006.
-- Additive only: no existing rows are modified.
--
-- One row per student and set, created when the student first opens it
-- (no row = "not started"). Works for every kind of set:
--   set_id       own / teacher sets (flashcard_sets), items = flashcard ids
--   library_key  auto-generated library sets, items = dictionary word ids,
--                snapshotted at start so the set never shifts under the student
-- The set is passed when every item was marked "I know it"; it then offers a
-- practice lesson (status practice_available) and becomes completed after it.
-- ============================================================

create table if not exists public.flashcard_set_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  set_id uuid references public.flashcard_sets(id) on delete cascade,
  library_key text,
  title text not null,
  item_kind text not null check (item_kind in ('card', 'word')),
  items jsonb not null default '[]'::jsonb,     -- all item ids, in set order
  statuses jsonb not null default '{}'::jsonb,  -- item id -> 'known' | 'review'
  queue jsonb not null default '[]'::jsonb,     -- item ids of the current round
  position int not null default 0,              -- index in queue of the current card
  round int not null default 1,
  known_count int not null default 0,
  total_count int not null default 0,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'practice_available', 'completed')),
  practice jsonb,                               -- generated practice exercises
  practice_correct int,
  practice_total int,
  started_at timestamptz not null default now(),
  flashcards_completed_at timestamptz,
  practice_completed_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((set_id is not null) <> (library_key is not null))
);
create unique index if not exists uq_fsp_set on public.flashcard_set_progress(student_id, set_id) where set_id is not null;
create unique index if not exists uq_fsp_library on public.flashcard_set_progress(student_id, library_key) where library_key is not null;
create index if not exists idx_fsp_set on public.flashcard_set_progress(set_id);

drop trigger if exists trg_updated_flashcard_set_progress on public.flashcard_set_progress;
create trigger trg_updated_flashcard_set_progress before update on public.flashcard_set_progress
  for each row execute function public.set_updated_at();

-- RLS: student owns their rows; linked teacher reads; admin all. No deletes (history).
alter table public.flashcard_set_progress enable row level security;

drop policy if exists fsp_select on public.flashcard_set_progress;
create policy fsp_select on public.flashcard_set_progress for select
  using (student_id = auth.uid() or public.is_admin() or public.is_teacher_of(student_id));
drop policy if exists fsp_insert on public.flashcard_set_progress;
create policy fsp_insert on public.flashcard_set_progress for insert
  with check (student_id = auth.uid() and (set_id is null or public.can_read_set(set_id)));
drop policy if exists fsp_update on public.flashcard_set_progress;
create policy fsp_update on public.flashcard_set_progress for update
  using (student_id = auth.uid())
  with check (student_id = auth.uid() and (set_id is null or public.can_read_set(set_id)));
