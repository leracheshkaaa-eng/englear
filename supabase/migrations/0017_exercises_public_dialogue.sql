-- ============================================================
-- EngLear — prepare hiding the answers of exercises. Idempotent; run after 0016.
-- Additive only: nothing existing is changed.
--
-- 1) exercises.dialogue_public: the dialogue without the answers of its gaps
--    ("answer" kept as "" so the app still knows where a gap is). A generated
--    column: it always follows exercises.dialogue.
-- 2) exercise_answer_text(): the correct answer as text, with definer rights —
--    check_exercise() uses it, so it keeps working once students can no longer
--    read the answer columns (0018).
-- 3) save_lesson_exercises() runs with definer rights (it reads the answers to
--    match unchanged exercises); it still checks can_edit_lesson() itself.
-- ============================================================

create or replace function public.strip_dialogue_answers(d jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_agg(case when l ? 'answer' then l || '{"answer": ""}'::jsonb else l end order by n), '[]'::jsonb)
    from jsonb_array_elements(coalesce(d, '[]'::jsonb)) with ordinality t(l, n)
$$;

alter table public.exercises
  add column if not exists dialogue_public jsonb generated always as (public.strip_dialogue_answers(dialogue)) stored;

create or replace function public.exercise_answer_text(p_exercise_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select public.correct_answer_text(e) from public.exercises e
   where e.id = p_exercise_id and public.can_read_lesson(e.lesson_id)
$$;
revoke execute on function public.exercise_answer_text(uuid) from public, anon;
grant execute on function public.exercise_answer_text(uuid) to authenticated;

create or replace function public.check_exercise(p_pass_id uuid, p_exercise_id uuid, p_response jsonb, p_given text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_pass public.lesson_passes;
  a public.exercise_answers;
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
  return jsonb_build_object('answer', to_jsonb(a), 'correct', a.is_correct,
                            'correct_answer', coalesce(public.exercise_answer_text(p_exercise_id), ''));
end $$;

alter function public.save_lesson_exercises(uuid, jsonb, boolean) security definer;
