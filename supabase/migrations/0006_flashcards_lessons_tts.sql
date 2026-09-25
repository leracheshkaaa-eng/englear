-- ============================================================
-- EngLear — flashcard progress, safe lesson edits, TTS audio cache.
-- Idempotent. Run after 0001-0005. No existing rows are modified.
--
-- 1) record_flashcard_review(): counts reviews on the server (the client
--    used to reset them every time, so a card could never become "known").
--    A card is known after 2 correct answers in total; "Review" puts it
--    back to learning. Cards linked to a dictionary word also update the
--    student's word progress, so a word is learned once, not twice.
-- 2) save_lesson_exercises(): saves a lesson's exercises in ONE transaction
--    and keeps the ids of unchanged / edited exercises, so students' answers
--    and attempts survive lesson edits. Only exercises removed from the text
--    are deleted. With p_dry_run it only reports what would be deleted.
-- 3) tts-audio storage bucket: public, cached MP3s written by the "tts"
--    edge function (service role), read by everyone.
-- ============================================================

-- ---------- 1) flashcard review ----------
create or replace function public.record_flashcard_review(p_card_id uuid, p_known boolean)
returns public.flashcard_progress language plpgsql security invoker set search_path = public as $$
declare
  v public.flashcard_progress;
  v_word uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  -- RLS: only cards of sets the caller can read
  select word_id into v_word from public.flashcards where id = p_card_id;
  if not found then raise exception 'card not found'; end if;

  insert into public.flashcard_progress as fp
    (student_id, flashcard_id, state, repetitions, correct_count, incorrect_count, last_reviewed)
  values (auth.uid(), p_card_id, 'learning', 1, case when p_known then 1 else 0 end, case when p_known then 0 else 1 end, now())
  on conflict (student_id, flashcard_id) do update
    set repetitions = fp.repetitions + 1,
        correct_count = fp.correct_count + case when p_known then 1 else 0 end,
        incorrect_count = fp.incorrect_count + case when p_known then 0 else 1 end,
        state = case when p_known and fp.correct_count + 1 >= 2 then 'known' else 'learning' end,
        last_reviewed = now()
  returning * into v;

  if v_word is not null then
    insert into public.student_word_progress as swp (student_id, word_id, status, last_seen)
    values (auth.uid(), v_word,
            case when not p_known then 'weak' when v.state = 'known' then 'known' else 'learning' end,
            now())
    on conflict (student_id, word_id) do update
      set status = case
                     when not p_known then 'weak'
                     when v.state = 'known' or swp.status = 'known' then 'known'  -- never downgrade on a correct answer
                     else 'learning'
                   end,
          last_seen = now();
  end if;

  return v;
end $$;

-- ---------- 2) safe lesson save ----------
-- p_exercises: jsonb array of {type, prompt, answer, options, explanation, dialogue, data},
-- in lesson order. Returns {deleted, affected_answers, affected_attempts}.
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
               data = coalesce(x->'data', '{}'::jsonb)
         where id = assigned[i + 1];
      else
        insert into public.exercises (lesson_id, type, position, prompt, answer, options, explanation, dialogue, data)
        values (p_lesson_id, x->>'type', i, coalesce(x->>'prompt', ''), coalesce(x->>'answer', ''),
                coalesce(x->'options', '[]'::jsonb), coalesce(x->>'explanation', ''),
                coalesce(x->'dialogue', '[]'::jsonb), coalesce(x->'data', '{}'::jsonb));
      end if;
    end loop;
  end if;

  return jsonb_build_object('deleted', v_deleted, 'affected_answers', v_answers, 'affected_attempts', v_attempts);
end $$;

revoke execute on function public.record_flashcard_review(uuid, boolean) from public, anon;
revoke execute on function public.save_lesson_exercises(uuid, jsonb, boolean) from public, anon;
grant execute on function public.record_flashcard_review(uuid, boolean) to authenticated;
grant execute on function public.save_lesson_exercises(uuid, jsonb, boolean) to authenticated;

-- ---------- 3) TTS audio cache ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tts-audio', 'tts-audio', true, 1048576, array['audio/mpeg'])
on conflict (id) do nothing;
