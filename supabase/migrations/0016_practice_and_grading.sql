-- ============================================================
-- EngLear — practice materials, new exercise types, server-side grading.
-- Idempotent; run after 0015. Additive: no existing lesson, exercise,
-- answer or progress row is changed (only new columns get defaults).
--
-- 1) lessons.kind: 'lesson' (grammar / vocabulary lessons) or 'practice'
--    (a reading or listening material followed by questions). Both use the
--    same passes, answers, progress and catalog.
-- 2) lesson_materials: the text of a reading material, or the script of a
--    listening one (segments with speakers; audio_url for recorded audio later).
-- 3) New exercise types: truefalse, order, match. exercises.solution (jsonb)
--    holds what a new type needs to be checked (accepted answers, the right
--    order, the right pairs).
-- 4) Grading on the server: grade_exercise() checks a response; a trigger sets
--    exercise_answers.is_correct from it, whatever the browser sent.
--    check_exercise() = "Check" button: saves, grades, logs the attempt and
--    returns the correct answer. record_exercise_check() keeps its signature
--    for the deployed app but ignores the browser's verdict.
-- 5) lesson_solutions(): correct answers of a lesson for its editors, and for
--    a student only after they completed a pass of it (review screen).
--    grade_answers(): grades without saving (guests; readable lessons only).
-- 6) lesson_catalog(): + p_kind, p_skills; returns kind and material info.
-- Hiding the answer columns from students comes in a later migration, after
-- the app no longer reads them.
-- ============================================================

-- ---------- 1) lesson kind ----------
alter table public.lessons add column if not exists kind text not null default 'lesson';
alter table public.lessons drop constraint if exists lessons_kind_check;
alter table public.lessons add constraint lessons_kind_check check (kind in ('lesson','practice'));
-- practice is always a skill: reading / listening (writing / speaking later)
alter table public.lessons drop constraint if exists lessons_practice_skill_check;
alter table public.lessons add constraint lessons_practice_skill_check
  check (kind = 'lesson' or skill in ('reading','listening','writing','speaking'));
drop index if exists public.idx_lessons_catalog;
create index if not exists idx_lessons_catalog2 on public.lessons (kind, scope, status, cefr, skill, sequence);

-- ---------- 2) materials ----------
create table if not exists public.lesson_materials (
  lesson_id uuid primary key references public.lessons(id) on delete cascade,
  material_type text not null default 'article' check (material_type in (
    'article','story','blog','email','letter','notice','advert','review','interview_text',
    'podcast','dialogue','interview','announcement','monologue','radio')),
  body text not null default '',                     -- reading: paragraphs separated by blank lines
  segments jsonb not null default '[]'::jsonb        -- listening: [{speaker, text}]
    check (jsonb_typeof(segments) = 'array'),
  audio_url text not null default '',
  word_count int not null default 0,
  duration_sec int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.lesson_materials enable row level security;
drop policy if exists lm_select on public.lesson_materials;
create policy lm_select on public.lesson_materials for select using (public.can_read_lesson(lesson_id));
drop policy if exists lm_write on public.lesson_materials;
create policy lm_write on public.lesson_materials for all
  using (public.can_edit_lesson(lesson_id)) with check (public.can_edit_lesson(lesson_id));
drop trigger if exists trg_updated_lesson_materials on public.lesson_materials;
create trigger trg_updated_lesson_materials before update on public.lesson_materials
  for each row execute function public.set_updated_at();

-- ---------- 3) exercise types + solution ----------
alter table public.exercises add column if not exists solution jsonb not null default '{}'::jsonb;
alter table public.exercises drop constraint if exists exercises_type_check;
alter table public.exercises add constraint exercises_type_check
  check (type in ('choice','fill','listen','dialogue','truefalse','order','match'));

-- save_lesson_exercises(): same as 0006, plus the solution column
create or replace function public.save_lesson_exercises(p_lesson_id uuid, p_exercises jsonb, p_dry_run boolean default false)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  n int := coalesce(jsonb_array_length(p_exercises), 0);
  assigned uuid[] := array_fill(null::uuid, array[greatest(n, 1)]);
  used uuid[] := '{}';
  x jsonb;
  m uuid;
  v_deleted int;
  v_answers int;
  v_attempts int;
begin
  if not public.can_edit_lesson(p_lesson_id) then
    raise exception 'not allowed to edit this lesson' using errcode = '42501';
  end if;

  -- pass 1: an exercise with identical content keeps its id (even if it moved)
  for i in 0 .. n - 1 loop
    x := p_exercises -> i;
    select e.id into m from public.exercises e
     where e.lesson_id = p_lesson_id and not (e.id = any(used))
       and e.type = x->>'type'
       and coalesce(e.prompt, '') = coalesce(x->>'prompt', '')
       and coalesce(e.answer, '') = coalesce(x->>'answer', '')
       and e.options = coalesce(x->'options', '[]'::jsonb)
       and e.dialogue = coalesce(x->'dialogue', '[]'::jsonb)
       and e.data = coalesce(x->'data', '{}'::jsonb)
       and e.solution = coalesce(x->'solution', '{}'::jsonb)
       and coalesce(e.explanation, '') = coalesce(x->>'explanation', '')
     order by abs(e.position - i), e.id
     limit 1;
    if m is not null then
      assigned[i + 1] := m;
      used := used || m;
    end if;
  end loop;

  -- pass 2: an edited exercise (same type, same place) keeps its id
  for i in 0 .. n - 1 loop
    continue when assigned[i + 1] is not null;
    x := p_exercises -> i;
    select e.id into m from public.exercises e
     where e.lesson_id = p_lesson_id and not (e.id = any(used))
       and e.position = i and e.type = x->>'type'
     limit 1;
    if m is not null then
      assigned[i + 1] := m;
      used := used || m;
    end if;
  end loop;

  select count(*) into v_deleted from public.exercises e
   where e.lesson_id = p_lesson_id and not (e.id = any(used));
  select count(*) into v_answers from public.exercise_answers a
    join public.exercises e on e.id = a.exercise_id
   where e.lesson_id = p_lesson_id and not (e.id = any(used));
  select count(*) into v_attempts from public.exercise_attempts a
    join public.exercises e on e.id = a.exercise_id
   where e.lesson_id = p_lesson_id and not (e.id = any(used));

  if not p_dry_run then
    delete from public.exercises e where e.lesson_id = p_lesson_id and not (e.id = any(used));

    for i in 0 .. n - 1 loop
      x := p_exercises -> i;
      if assigned[i + 1] is not null then
        update public.exercises
           set type = x->>'type',
               position = i,
               prompt = coalesce(x->>'prompt', ''),
               answer = coalesce(x->>'answer', ''),
               options = coalesce(x->'options', '[]'::jsonb),
               explanation = coalesce(x->>'explanation', ''),
               dialogue = coalesce(x->'dialogue', '[]'::jsonb),
               data = coalesce(x->'data', '{}'::jsonb),
               solution = coalesce(x->'solution', '{}'::jsonb)
         where id = assigned[i + 1];
      else
        insert into public.exercises (lesson_id, type, position, prompt, answer, options, explanation, dialogue, data, solution)
        values (p_lesson_id, x->>'type', i, coalesce(x->>'prompt', ''), coalesce(x->>'answer', ''),
                coalesce(x->'options', '[]'::jsonb), coalesce(x->>'explanation', ''),
                coalesce(x->'dialogue', '[]'::jsonb), coalesce(x->'data', '{}'::jsonb),
                coalesce(x->'solution', '{}'::jsonb));
      end if;
    end loop;
  end if;

  return jsonb_build_object('deleted', v_deleted, 'affected_answers', v_answers, 'affected_attempts', v_attempts);
end $$;

-- ---------- 4) grading ----------
-- Same normalisation as norm() in the app: trim, lower case, no trailing
-- punctuation; also curly apostrophes and repeated spaces.
create or replace function public.norm_answer(s text)
returns text language sql immutable set search_path = public as $$
  select regexp_replace(regexp_replace(replace(lower(btrim(coalesce(s, ''))), '’', ''''), '\s+', ' ', 'g'), '[.,!?;:]+$', '')
$$;

create or replace function public.grade_exercise(e public.exercises, r jsonb)
returns boolean language plpgsql immutable set search_path = public as $$
declare
  v_text text := public.norm_answer(r->>'text');
  line jsonb;
  i int := 0;
  k text;
begin
  r := coalesce(r, '{}'::jsonb);
  case e.type
    when 'fill' then
      return v_text <> '' and (
        v_text = public.norm_answer(e.answer)
        or exists (select 1 from jsonb_array_elements_text(coalesce(e.solution->'accept', '[]'::jsonb)) a
                   where public.norm_answer(a) = v_text));
    when 'listen' then
      return v_text <> '' and v_text = public.norm_answer(coalesce(e.data->>'text', e.answer));
    when 'choice', 'truefalse' then
      return r->>'picked' is not null and r->>'picked' = e.answer;
    when 'dialogue' then
      for line in select * from jsonb_array_elements(e.dialogue) loop
        if coalesce(line->>'answer', '') <> ''
           and public.norm_answer(r->'blanks'->>(i::text)) is distinct from public.norm_answer(line->>'answer') then
          return false;
        end if;
        i := i + 1;
      end loop;
      return true;
    when 'order' then
      return jsonb_typeof(r->'order') = 'array'
         and jsonb_typeof(e.solution->'order') = 'array' and jsonb_array_length(e.solution->'order') > 0
         and (select coalesce(array_agg(public.norm_answer(x) order by n), '{}') from jsonb_array_elements_text(r->'order') with ordinality t(x, n))
           = (select coalesce(array_agg(public.norm_answer(x) order by n), '{}') from jsonb_array_elements_text(e.solution->'order') with ordinality t(x, n));
    when 'match' then
      if jsonb_typeof(r->'pairs') is distinct from 'object' or jsonb_typeof(e.solution->'pairs') is distinct from 'object'
         or e.solution->'pairs' = '{}'::jsonb then
        return false;
      end if;
      for k in select jsonb_object_keys(e.solution->'pairs') loop
        if (r->'pairs'->>k) is distinct from (e.solution->'pairs'->>k) then return false; end if;
      end loop;
      return true;
    else
      return false;
  end case;
end $$;

-- the expected answer as text (shown after a wrong check and on the review screen)
create or replace function public.correct_answer_text(e public.exercises)
returns text language sql immutable set search_path = public as $$
  select case e.type
    when 'listen' then coalesce(e.data->>'text', e.answer)
    when 'dialogue' then (select string_agg(l->>'answer', ', ') from jsonb_array_elements(e.dialogue) l where coalesce(l->>'answer', '') <> '')
    when 'order' then (select string_agg(x, case when coalesce(e.data->>'unit', 'word') = 'word' then ' ' else ' → ' end order by n)
                         from jsonb_array_elements_text(e.solution->'order') with ordinality t(x, n))
    when 'match' then (select string_agg(p.key || ' — ' || p.value, '; ') from jsonb_each_text(e.solution->'pairs') p)
    else e.answer
  end
$$;

-- is_correct is always computed here, never taken from the browser
create or replace function public.exercise_answers_grade()
returns trigger language plpgsql security definer set search_path = public as $$
declare e public.exercises;
begin
  select * into e from public.exercises where id = new.exercise_id;
  new.is_correct := coalesce(public.grade_exercise(e, new.response), false);
  return new;
end $$;
drop trigger if exists trg_exercise_answers_grade on public.exercise_answers;
create trigger trg_exercise_answers_grade before insert or update of response, is_correct on public.exercise_answers
  for each row execute function public.exercise_answers_grade();

-- "Check": save + grade + log the attempt; returns the verdict and the right answer.
create or replace function public.check_exercise(p_pass_id uuid, p_exercise_id uuid, p_response jsonb, p_given text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_pass public.lesson_passes;
  a public.exercise_answers;
  v_answer text;
begin
  select * into v_pass from public.lesson_passes
   where id = p_pass_id and student_id = auth.uid() and status = 'in_progress';
  if not found then raise exception 'pass is not open'; end if;

  insert into public.exercise_answers (pass_id, student_id, lesson_id, exercise_id, response, given_answer)
  values (p_pass_id, auth.uid(), v_pass.lesson_id, p_exercise_id, coalesce(p_response, '{}'::jsonb), coalesce(p_given, ''))
  on conflict (pass_id, exercise_id) do update
    set response = excluded.response, given_answer = excluded.given_answer
  returning * into a;                                   -- is_correct set by the trigger

  if not (a.checked and a.last_checked_response is not distinct from a.response) then
    update public.exercise_answers
       set checked = true,
           first_check_correct = coalesce(first_check_correct, a.is_correct),
           attempts_count = attempts_count + 1,
           last_checked_response = a.response
     where id = a.id
    returning * into a;

    insert into public.exercise_attempts
      (student_id, lesson_id, exercise_id, attempt_number, given_answer, is_correct, pass_id)
    values (auth.uid(), v_pass.lesson_id, p_exercise_id, a.attempts_count, coalesce(p_given, ''), a.is_correct, p_pass_id);
  end if;

  -- the answer is read with definer rights (students will lose direct access to it)
  select public.correct_answer_text(e) into v_answer from public.exercises e where e.id = p_exercise_id;
  return jsonb_build_object('answer', to_jsonb(a), 'correct', a.is_correct, 'correct_answer', coalesce(v_answer, ''));
end $$;

-- the deployed app's "Check": same signature, the browser's verdict is ignored
create or replace function public.record_exercise_check(
  p_pass_id uuid, p_exercise_id uuid, p_response jsonb, p_given text, p_is_correct boolean)
returns public.exercise_answers language plpgsql security invoker set search_path = public as $$
declare r jsonb;
begin
  r := public.check_exercise(p_pass_id, p_exercise_id, p_response, p_given);
  return jsonb_populate_record(null::public.exercise_answers, r->'answer');
end $$;

-- ---------- 5) solutions for editors / after completion ----------
create or replace function public.lesson_solutions(p_lesson_id uuid)
returns table (exercise_id uuid, correct_answer text, answer text, solution jsonb, dialogue jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.can_edit_lesson(p_lesson_id)
          or exists (select 1 from public.lesson_passes p
                     where p.lesson_id = p_lesson_id and p.student_id = auth.uid() and p.status = 'completed')) then
    raise exception 'solutions are available after completing the lesson' using errcode = '42501';
  end if;
  return query
    select e.id, public.correct_answer_text(e), e.answer, e.solution, e.dialogue
      from public.exercises e where e.lesson_id = p_lesson_id order by e.position;
end $$;

-- Grade without saving: guests (who practise without an account) and the
-- final count of a guest's unchecked answers. Only exercises the caller may read.
create or replace function public.grade_answers(p_items jsonb)
returns table (exercise_id uuid, correct boolean, correct_answer text)
language sql stable security definer set search_path = public as $$
  select e.id, coalesce(public.grade_exercise(e, it->'response'), false), public.correct_answer_text(e)
    from (select value as it from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) limit 200) items
    join public.exercises e on e.id = (it->>'exercise_id')::uuid
   where public.can_read_lesson(e.lesson_id)
$$;
revoke execute on function public.grade_answers(jsonb) from public;
grant execute on function public.grade_answers(jsonb) to anon, authenticated;

revoke execute on function public.check_exercise(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.check_exercise(uuid, uuid, jsonb, text) to authenticated;
revoke execute on function public.lesson_solutions(uuid) from public, anon;
grant execute on function public.lesson_solutions(uuid) to authenticated;
revoke execute on function public.exercise_answers_grade() from public, anon, authenticated;

-- ---------- 6) catalog ----------
drop function if exists public.lesson_catalog(text, text[], text, text, uuid, text, int, int);
create or replace function public.lesson_catalog(
  p_scope text default 'library',
  p_cefr text[] default null,
  p_skill text default null,
  p_topic text default null,
  p_grammar uuid default null,
  p_q text default '',
  p_limit int default 30,
  p_offset int default 0,
  p_kind text default 'lesson',
  p_skills text[] default null)
returns table (
  id uuid, title text, description text, cefr text, skill text, topic text,
  grammar_topic_id uuid, sequence int, status text, scope text, author_id uuid,
  exercise_count int, level text, "position" int, updated_at timestamptz,
  kind text, material_type text, word_count int, duration_sec int, total bigint)
language sql stable security invoker set search_path = public as $$
  with q as (
    select '%' || replace(replace(replace(btrim(coalesce(p_q, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat,
           btrim(coalesce(p_q, '')) = '' as empty
  )
  select l.id, l.title, l.description, l.cefr, l.skill, l.topic, l.grammar_topic_id, l.sequence,
         l.status, l.scope, l.author_id, l.exercise_count, l.level, l.position, l.updated_at,
         l.kind, m.material_type, coalesce(m.word_count, 0), coalesce(m.duration_sec, 0),
         count(*) over () as total
  from public.lessons l
  left join public.lesson_materials m on m.lesson_id = l.id,
  q
  where l.scope = coalesce(p_scope, 'library')
    and l.kind = coalesce(p_kind, 'lesson')
    and (p_cefr is null or l.cefr = any(p_cefr))
    and (p_skill is null or l.skill = p_skill)
    and (p_skills is null or l.skill = any(p_skills))
    and (p_topic is null or l.topic = p_topic)
    and (p_grammar is null or l.grammar_topic_id = p_grammar)
    and (q.empty or l.title ilike q.pat or l.description ilike q.pat)
  order by l.cefr nulls last, l.sequence, l.position, l.title, l.id
  limit least(greatest(coalesce(p_limit, 30), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
$$;
grant execute on function public.lesson_catalog(text, text[], text, text, uuid, text, int, int, text, text[]) to anon, authenticated;
