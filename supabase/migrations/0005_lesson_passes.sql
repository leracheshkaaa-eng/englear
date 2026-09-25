-- ============================================================
-- EngLear — lesson passes + saved answers.
-- Idempotent. Run after 0001-0004. Additive only: no existing rows
-- are modified.
--
-- lesson_passes     one row per attempt at a whole lesson ("pass");
--                   history is kept, at most one pass is in progress.
-- exercise_answers  the student's current answer per exercise in a pass,
--                   saved whether or not "Проверить" was pressed.
-- exercise_attempts unchanged log of checks, now linked to a pass.
-- lesson_progress   keeps its meaning: status + score of the LAST pass.
-- ============================================================

-- ---------- lesson_passes ----------
create table if not exists public.lesson_passes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  pass_number int not null,
  status text not null default 'in_progress' check (status in ('in_progress','completed')),
  current_index int not null default 0,
  correct_count int,
  total_count int,
  time_spent_sec int not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (student_id, lesson_id, pass_number)
);
-- at most one open pass per student and lesson
create unique index if not exists uq_lesson_passes_open
  on public.lesson_passes(student_id, lesson_id) where status = 'in_progress';
create index if not exists idx_lpass_lesson on public.lesson_passes(lesson_id);

-- ---------- exercise_answers ----------
create table if not exists public.exercise_answers (
  id uuid primary key default gen_random_uuid(),
  pass_id uuid not null references public.lesson_passes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  response jsonb not null default '{}'::jsonb,       -- raw input, to restore the UI
  given_answer text not null default '',             -- human-readable answer
  is_correct boolean not null default false,         -- correctness of the saved answer
  checked boolean not null default false,            -- was "Проверить" pressed
  first_check_correct boolean,                       -- result of the first check
  attempts_count int not null default 0,             -- number of checks
  last_checked_response jsonb,                       -- response at the last check
  updated_at timestamptz not null default now(),
  unique (pass_id, exercise_id)
);
create index if not exists idx_ans_student on public.exercise_answers(student_id);
create index if not exists idx_ans_exercise on public.exercise_answers(exercise_id);

-- ---------- exercise_attempts: link a check to its pass (old rows stay NULL) ----------
alter table public.exercise_attempts
  add column if not exists pass_id uuid references public.lesson_passes(id) on delete set null;
create index if not exists idx_ea_pass on public.exercise_attempts(pass_id);

-- ---------- updated_at ----------
drop trigger if exists trg_updated_lesson_passes on public.lesson_passes;
create trigger trg_updated_lesson_passes before update on public.lesson_passes
  for each row execute function public.set_updated_at();
drop trigger if exists trg_updated_exercise_answers on public.exercise_answers;
create trigger trg_updated_exercise_answers before update on public.exercise_answers
  for each row execute function public.set_updated_at();

-- ============================================================
-- RLS: student owns their rows; linked teacher reads; admin all.
-- Answers can only be written into the student's own OPEN pass, for an
-- exercise of that pass's lesson. Nobody but cascades deletes history.
-- ============================================================
alter table public.lesson_passes enable row level security;
alter table public.exercise_answers enable row level security;

drop policy if exists lpass_select on public.lesson_passes;
create policy lpass_select on public.lesson_passes for select
  using (student_id = auth.uid() or public.is_admin() or public.is_teacher_of(student_id));
drop policy if exists lpass_insert on public.lesson_passes;
create policy lpass_insert on public.lesson_passes for insert
  with check (student_id = auth.uid() and public.can_read_lesson(lesson_id));
drop policy if exists lpass_update on public.lesson_passes;
create policy lpass_update on public.lesson_passes for update
  using (student_id = auth.uid() or public.is_admin())
  with check (student_id = auth.uid() or public.is_admin());

drop policy if exists ans_select on public.exercise_answers;
create policy ans_select on public.exercise_answers for select
  using (student_id = auth.uid() or public.is_admin() or public.is_teacher_of(student_id));
drop policy if exists ans_insert on public.exercise_answers;
create policy ans_insert on public.exercise_answers for insert
  with check (
    student_id = auth.uid()
    and exists (select 1 from public.lesson_passes p
                where p.id = exercise_answers.pass_id and p.student_id = auth.uid()
                  and p.lesson_id = exercise_answers.lesson_id and p.status = 'in_progress')
    and exists (select 1 from public.exercises e
                where e.id = exercise_answers.exercise_id and e.lesson_id = exercise_answers.lesson_id)
  );
drop policy if exists ans_update on public.exercise_answers;
create policy ans_update on public.exercise_answers for update
  using (
    student_id = auth.uid()
    and exists (select 1 from public.lesson_passes p
                where p.id = exercise_answers.pass_id and p.student_id = auth.uid() and p.status = 'in_progress')
  )
  with check (
    student_id = auth.uid()
    and exists (select 1 from public.lesson_passes p
                where p.id = exercise_answers.pass_id and p.student_id = auth.uid()
                  and p.lesson_id = exercise_answers.lesson_id and p.status = 'in_progress')
    and exists (select 1 from public.exercises e
                where e.id = exercise_answers.exercise_id and e.lesson_id = exercise_answers.lesson_id)
  );

-- ============================================================
-- RPCs (SECURITY INVOKER: every statement runs under the caller's RLS)
-- ============================================================

-- Get the caller's open pass for a lesson, or start a new one.
create or replace function public.start_lesson_pass(p_lesson_id uuid)
returns public.lesson_passes language plpgsql security invoker set search_path = public as $$
declare v public.lesson_passes;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select * into v from public.lesson_passes
   where student_id = auth.uid() and lesson_id = p_lesson_id and status = 'in_progress';
  if found then return v; end if;

  begin
    insert into public.lesson_passes (student_id, lesson_id, pass_number)
    values (auth.uid(), p_lesson_id,
            coalesce((select max(pass_number) from public.lesson_passes
                      where student_id = auth.uid() and lesson_id = p_lesson_id), 0) + 1)
    returning * into v;
  exception when unique_violation then
    -- a concurrent call created it first
    select * into v from public.lesson_passes
     where student_id = auth.uid() and lesson_id = p_lesson_id and status = 'in_progress';
  end;

  -- first start of the lesson: mark it in progress (a completed lesson stays completed)
  insert into public.lesson_progress (student_id, lesson_id, status, started_at)
  values (auth.uid(), p_lesson_id, 'in_progress', now())
  on conflict (student_id, lesson_id) do nothing;

  return v;
end $$;

-- "Проверить": save the answer, and log one attempt unless this exact
-- answer was already checked (so repeated clicks create no duplicates).
create or replace function public.record_exercise_check(
  p_pass_id uuid, p_exercise_id uuid, p_response jsonb, p_given text, p_is_correct boolean)
returns public.exercise_answers language plpgsql security invoker set search_path = public as $$
declare
  v_pass public.lesson_passes;
  a public.exercise_answers;
begin
  select * into v_pass from public.lesson_passes
   where id = p_pass_id and student_id = auth.uid() and status = 'in_progress';
  if not found then raise exception 'pass is not open'; end if;

  insert into public.exercise_answers (pass_id, student_id, lesson_id, exercise_id, response, given_answer, is_correct)
  values (p_pass_id, auth.uid(), v_pass.lesson_id, p_exercise_id, p_response, coalesce(p_given, ''), p_is_correct)
  on conflict (pass_id, exercise_id) do update
    set response = excluded.response, given_answer = excluded.given_answer, is_correct = excluded.is_correct
  returning * into a;

  if a.checked and a.last_checked_response is not distinct from p_response then
    return a;
  end if;

  update public.exercise_answers
     set checked = true,
         first_check_correct = coalesce(first_check_correct, p_is_correct),
         attempts_count = attempts_count + 1,
         last_checked_response = p_response
   where id = a.id
  returning * into a;

  insert into public.exercise_attempts
    (student_id, lesson_id, exercise_id, attempt_number, given_answer, is_correct, pass_id)
  values (auth.uid(), v_pass.lesson_id, p_exercise_id, a.attempts_count, coalesce(p_given, ''), p_is_correct, p_pass_id);

  return a;
end $$;

-- "Завершить": score the pass on the server and store it as the lesson's
-- last result. Per exercise: first check if it was checked, otherwise the
-- saved answer; no answer = wrong. Calling it twice is harmless.
create or replace function public.complete_lesson_pass(p_pass_id uuid, p_time_spent_sec int)
returns public.lesson_passes language plpgsql security invoker set search_path = public as $$
declare
  v public.lesson_passes;
  v_total int;
  v_correct int;
begin
  select * into v from public.lesson_passes
   where id = p_pass_id and student_id = auth.uid()
   for update;
  if not found then raise exception 'pass not found'; end if;
  if v.status = 'completed' then return v; end if;

  select count(*) into v_total from public.exercises where lesson_id = v.lesson_id;
  select count(*) into v_correct
    from public.exercise_answers a
    join public.exercises e on e.id = a.exercise_id and e.lesson_id = v.lesson_id
   where a.pass_id = p_pass_id
     and case when a.checked then coalesce(a.first_check_correct, false) else a.is_correct end;

  update public.lesson_passes
     set status = 'completed',
         correct_count = v_correct,
         total_count = v_total,
         time_spent_sec = time_spent_sec + greatest(coalesce(p_time_spent_sec, 0), 0),
         completed_at = now()
   where id = p_pass_id
  returning * into v;

  insert into public.lesson_progress (student_id, lesson_id, status, score, started_at, completed_at, time_spent_sec)
  values (auth.uid(), v.lesson_id, 'completed',
          case when v_total > 0 then round(100.0 * v_correct / v_total)::int else 0 end,
          v.started_at, v.completed_at, v.time_spent_sec)
  on conflict (student_id, lesson_id) do update
    set status = 'completed',
        score = excluded.score,
        completed_at = excluded.completed_at,
        time_spent_sec = excluded.time_spent_sec;

  return v;
end $$;

revoke execute on function public.start_lesson_pass(uuid) from public, anon;
revoke execute on function public.record_exercise_check(uuid, uuid, jsonb, text, boolean) from public, anon;
revoke execute on function public.complete_lesson_pass(uuid, int) from public, anon;
grant execute on function public.start_lesson_pass(uuid) to authenticated;
grant execute on function public.record_exercise_check(uuid, uuid, jsonb, text, boolean) to authenticated;
grant execute on function public.complete_lesson_pass(uuid, int) to authenticated;
