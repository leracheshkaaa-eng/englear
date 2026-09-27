-- ============================================================
-- EngLear — inline translation hints for ONE lesson. Idempotent; run after 0013.
-- lesson_hints(words, lang): hints only for the words that occur in a lesson
-- (a few KB), instead of dictionary_hints() for the whole dictionary, which
-- grows with every word package. dictionary_hints() stays for older clients.
-- No data is changed.
-- ============================================================

create or replace function public.lesson_hints(p_words text[], p_lang text)
returns table (id uuid, word text, translation text, definition text, example text)
language sql stable security invoker set search_path = public as $$
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
         coalesce(nullif(d.example, ''), d.examples->>0)
  from w
  join public.dictionary_words d on d.language = 'en' and lower(d.word) = w.key
  left join public.word_translations t on t.word_id = d.id and t.lang = p_lang;
$$;

grant execute on function public.lesson_hints(text[], text) to anon, authenticated;
