-- 2026-10-19: the nine new practices from supabase/seed/lessons/practice-3.json are attached to the
-- full lessons that had no text: a 10-minute "practice" stage before "production"; production
-- loses 5 minutes, the lesson duration is the sum of the stages (max 60). Idempotent: a lesson that
-- already has the stage title is skipped. The previous versions are kept in
-- public.study_lessons_backup_20261019 (created once by hand: same columns as study_lessons, RLS on).
with map(lesson_title, practice_title, stage_title, teacher, body) as (values
  ('If I were you…', 'Ask Jo: advice for teens', 'Reading: Ask Jo', 'Read the advice blog. Students underline every “If I were you” and second-conditional sentence and say whether they agree with Jo.', 'Read the advice blog and answer the questions.'),
  ('Made in…: the passive', 'From bean to bar: how chocolate is made', 'Reading: From bean to bar', 'Read the article. Students list the steps of chocolate production in the passive and compare with the order exercise.', 'Read how chocolate is made and answer the questions.'),
  ('I enjoy doing, I want to do', 'Podcast: learning to skate at 19', 'Listening: Learning to skate at 19', 'Play the podcast twice. Students write down every verb followed by -ing or to + verb (wanted to learn, kept falling, enjoy learning…).', 'Listen to the podcast and answer the questions.'),
  ('It must be true', 'Dialogue: the missing painting', 'Listening: The missing painting', 'Play the dialogue twice. Pause before the ending and ask students what must / might / can’t have happened; then play the ending.', 'Listen to two students solving a small mystery and answer the questions.'),
  ('It is being done', 'The bridge that was printed', 'Reading: The bridge that was printed', 'Read the article. Students find one example of each passive tense (was printed, was being printed, had been tested, will be analysed…).', 'Read the news article and answer the questions.'),
  ('I wish I could', 'Things I wish I''d known at fifteen', 'Reading: Things I wish I’d known at fifteen', 'Read the blog post. Students sort the wishes into past regrets, present wishes and annoying habits, then add one of their own.', 'Read the blog post and answer the questions.'),
  ('Never have I ever…', 'The night the lights went out', 'Reading: The night the lights went out', 'Read the story. Students find every inversion and say the neutral version aloud; discuss how inversion changes the mood.', 'Read the story and answer the questions.'),
  ('What I really mean is…', 'Interview: a video game sound designer', 'Listening: A video game sound designer', 'Play the interview twice. Students note every cleft sentence (What most people imagine is…, It was a bag of frozen peas that…, All I did was…).', 'Listen to the interview and answer the questions.'),
  ('I insist that he be on time', 'A proposal to the city council', 'Reading: A proposal to the city council', 'Read the letter. Students underline every subjunctive (remain, consider, be recorded, be trained, be discussed) and the formal phrases around them.', 'Read the formal letter and answer the questions.')
), targets as (
  select s.id, s.content, m.stage_title, m.teacher, m.body,
         (select l.id from public.lessons l where l.scope = 'library' and l.kind = 'practice' and l.status = 'published' and l.title = m.practice_title) task_id
  from public.study_lessons s join map m on m.lesson_title = s.title
  where s.scope = 'library'
    and not exists (select 1 from jsonb_array_elements(s.content->'stages') st where st->>'title' = m.stage_title)
), rebuilt as (
  select t.id,
    (select jsonb_agg(x.v order by x.ord, x.sub)
       from (
         select st.ord, 1 sub,
                case when st.v->>'kind' = 'production' then jsonb_set(st.v, '{minutes}', to_jsonb(greatest(6, (st.v->>'minutes')::int - 5))) else st.v end v
         from jsonb_array_elements(t.content->'stages') with ordinality st(v, ord)
         union all
         select (select min(o) from jsonb_array_elements(t.content->'stages') with ordinality p(v, o) where p.v->>'kind' = 'production'), 0,
                jsonb_build_object('kind', 'practice', 'title', t.stage_title, 'minutes', 10, 'teacher', t.teacher, 'body', t.body, 'examples', '[]'::jsonb, 'task_id', t.task_id::text)
       ) x) stages
  from targets t where t.task_id is not null
)
update public.study_lessons s
set content = jsonb_set(s.content, '{stages}', r.stages),
    duration_min = least(60, (select sum((e->>'minutes')::int) from jsonb_array_elements(r.stages) e))
from rebuilt r where s.id = r.id;
