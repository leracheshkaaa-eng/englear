-- ============================================================
-- EngLear — students and guests can no longer read the answers of exercises.
-- Run after 0017 AND after the app that reads exercises.dialogue_public is live.
-- No data is changed: only who may read which columns.
--
-- Readable: id, lesson_id, type, position, prompt, options, explanation, data,
-- dialogue_public, created_at. Not readable: answer, solution, dialogue.
-- Answers reach the app only through the server: check_exercise() after a check,
-- grade_answers() for guests, lesson_solutions() for editors / after completion.
-- Writes are unchanged (lessons are saved through save_lesson_exercises()).
-- ============================================================

revoke select on public.exercises from anon, authenticated;
grant select (id, lesson_id, type, position, prompt, options, explanation, data, dialogue_public, created_at)
  on public.exercises to anon, authenticated;
