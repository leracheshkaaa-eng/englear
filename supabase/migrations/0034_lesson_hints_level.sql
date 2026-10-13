-- Word hints with the word's CEFR level, so a lesson underlines only the words at the
-- learner's level and above (A1: almost everything; B2: only B2–C2). Every word still
-- shows its translation on click.
-- Additive: a new function next to lesson_hints (which stays for older clients).

create or replace function public.lesson_hints_v2(p_words text[], p_lang text)
returns table(id uuid, word text, translation text, definition text, example text, cefr text)
language sql
stable
set search_path to 'public'
as $$
  with w as (
    select distinct lower(btrim(x)) as key
    from unnest(coalesce(p_words, '{}'::text[])) x
    where btrim(x) <> ''
    limit 3000
  )
  select d.id, d.word,
         case when p_lang = 'en' then null
              else coalesce(t.translation, case when p_lang = 'ru' then nullif(d.translation, '') end) end,
         d.definition,
         coalesce(nullif(d.example, ''), d.examples->>0),
         d.cefr_level
  from w
  join public.dictionary_words d on d.language = 'en' and lower(d.word) = w.key
  left join public.word_translations t on t.word_id = d.id and t.lang = p_lang;
$$;

grant execute on function public.lesson_hints_v2(text[], text) to anon, authenticated;
