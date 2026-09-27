-- ============================================================
-- EngLear — page through dictionary search results. Idempotent; run after 0012.
-- search_dictionary(..., p_limit => null) now returns ALL matches, so the
-- client can read them page by page (PostgREST range) and get the real total
-- (count=exact). Any non-null p_limit behaves exactly as before (1..1000),
-- so older clients are not affected. No data is changed.
-- ============================================================

create or replace function public.search_dictionary(
  p_q text default '',
  p_levels text[] default null,
  p_topic text default null,
  p_pos text default null,
  p_type text default null,
  p_ielts text default null,
  p_sort text default 'word',
  p_limit int default 300)
returns setof public.dictionary_words language sql stable security invoker set search_path = public as $$
  with q as (
    select btrim(coalesce(p_q, '')) = '' as empty,
           '%' || replace(replace(replace(btrim(coalesce(p_q, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat
  )
  select d.*
  from public.dictionary_words d, q
  where d.language = 'en'
    and (q.empty
         or d.word ilike q.pat
         or d.definition ilike q.pat
         or d.translation ilike q.pat
         or exists (select 1 from public.word_translations t where t.word_id = d.id and t.translation ilike q.pat)
         or exists (select 1 from jsonb_array_elements(d.meanings) m
                    where m->>'definition' ilike q.pat
                       or exists (select 1 from jsonb_each_text(case when jsonb_typeof(m->'translations') = 'object' then m->'translations' else '{}' end) mt
                                  where mt.value ilike q.pat)))
    and (p_levels is null or d.cefr_level = any(p_levels))
    and (p_topic is null or d.topic = p_topic)
    and (p_pos is null or d.part_of_speech = p_pos)
    and (p_type is null or d.word_type = p_type)
    and (p_ielts is null or d.ielts_category = p_ielts)
  order by case when p_sort = 'cefr' then d.cefr_level end, lower(d.word), d.id
  limit case when p_limit is null then null else least(greatest(p_limit, 1), 1000) end;
$$;
