-- ============================================================
-- EngLear — multilingual dictionary infrastructure. Idempotent; run after 0001-0008.
-- Additive: existing words are not modified (their Russian translation is
-- COPIED into word_translations; the old column stays for compatibility).
--
-- 1) dictionary_words.language: the language being learned (English for now);
--    a word is unique per language, case-insensitively ("Monday" = "monday").
-- 2) word_translations: one row per word and translation language; adding a
--    language is just more rows (no schema change).
-- 3) import_dictionary_words(words, dry_run): bulk import for topic packages.
--    New word -> added. Existing word -> only EMPTY fields are filled and
--    missing translations added; a different non-empty value is reported as a
--    conflict and never overwritten. dry_run (default) writes nothing.
-- 4) search_dictionary(): search by word, definition or any translation,
--    with LIKE wildcards escaped (commas/brackets no longer break search).
-- ============================================================

-- ---------- 1) learning language + case-insensitive uniqueness ----------
alter table public.dictionary_words add column if not exists language text not null default 'en';
create unique index if not exists uq_dict_language_word on public.dictionary_words(language, lower(word));

-- ---------- 2) translations ----------
create table if not exists public.word_translations (
  id uuid primary key default gen_random_uuid(),
  word_id uuid not null references public.dictionary_words(id) on delete cascade,
  lang text not null check (lang ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$'),
  translation text not null check (length(btrim(translation)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (word_id, lang)
);
create index if not exists idx_wt_lang on public.word_translations(lang);

do $$
declare ext_schema text;
begin
  select n.nspname into ext_schema
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pg_trgm';
  if ext_schema is not null then
    execute format(
      'create index if not exists idx_wt_translation_trgm on public.word_translations using gin (translation %I.gin_trgm_ops)',
      ext_schema);
  end if;
end $$;

drop trigger if exists trg_updated_word_translations on public.word_translations;
create trigger trg_updated_word_translations before update on public.word_translations
  for each row execute function public.set_updated_at();

alter table public.word_translations enable row level security;
drop policy if exists wt_select on public.word_translations;
create policy wt_select on public.word_translations for select using (true);          -- readable by everyone, like the dictionary
drop policy if exists wt_insert on public.word_translations;
create policy wt_insert on public.word_translations for insert with check (public.is_admin());
drop policy if exists wt_update on public.word_translations;
create policy wt_update on public.word_translations for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists wt_delete on public.word_translations;
create policy wt_delete on public.word_translations for delete using (public.is_admin());

-- existing Russian translations (copy, the source column is left as is)
insert into public.word_translations (word_id, lang, translation)
select id, 'ru', btrim(translation) from public.dictionary_words
where coalesce(btrim(translation), '') <> ''
on conflict (word_id, lang) do nothing;

-- ---------- 3) safe bulk import ----------
-- p_words: [{ word, part_of_speech, cefr, topic, ipa, definition, examples: [...],
--             translations: { uk: "...", ru: "...", ... }, word_type, ielts_category, language? }]
create or replace function public.import_dictionary_words(p_words jsonb, p_dry_run boolean default true)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  x jsonb;
  w public.dictionary_words;
  v_word text;
  v_lang text;
  v_id uuid;
  v_old text;
  v_new text;
  v_changed boolean;
  v_seen text[] := '{}';
  f record;
  tr record;
  v_existing_tr text;
  c_new int := 0;
  c_updated int := 0;
  c_unchanged int := 0;
  c_tr_added int := 0;
  conflicts jsonb := '[]';
  invalid jsonb := '[]';
  new_words jsonb := '[]';
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'only admins can import words' using errcode = '42501';
  end if;
  if jsonb_typeof(p_words) is distinct from 'array' then
    raise exception 'expected a JSON array of words';
  end if;

  for x in select value from jsonb_array_elements(p_words) loop
    v_word := btrim(coalesce(x->>'word', ''));
    v_lang := coalesce(nullif(btrim(x->>'language'), ''), 'en');

    -- ---- validation (invalid entries are skipped and reported) ----
    if v_word = '' then
      invalid := invalid || jsonb_build_object('word', x->>'word', 'reason', 'empty word'); continue;
    end if;
    if lower(v_lang || ':' || v_word) = any(v_seen) then
      invalid := invalid || jsonb_build_object('word', v_word, 'reason', 'duplicate in this package'); continue;
    end if;
    v_seen := v_seen || lower(v_lang || ':' || v_word);
    if coalesce(x->>'cefr', '') <> '' and x->>'cefr' not in ('A1','A2','B1','B2','C1','C2') then
      invalid := invalid || jsonb_build_object('word', v_word, 'reason', 'invalid cefr: ' || (x->>'cefr')); continue;
    end if;
    if coalesce(nullif(x->>'word_type', ''), 'word') not in ('word','collocation','phrasal_verb','verb') then
      invalid := invalid || jsonb_build_object('word', v_word, 'reason', 'invalid word_type: ' || (x->>'word_type')); continue;
    end if;
    if x ? 'translations' and jsonb_typeof(x->'translations') <> 'object' then
      invalid := invalid || jsonb_build_object('word', v_word, 'reason', 'translations must be an object'); continue;
    end if;
    if x ? 'examples' and jsonb_typeof(x->'examples') <> 'array' then
      invalid := invalid || jsonb_build_object('word', v_word, 'reason', 'examples must be an array'); continue;
    end if;

    select * into w from public.dictionary_words d where d.language = v_lang and lower(d.word) = lower(v_word);

    -- ---- new word ----
    if not found then
      c_new := c_new + 1;
      new_words := new_words || to_jsonb(v_word);
      c_tr_added := c_tr_added + (select count(*) from jsonb_each_text(coalesce(x->'translations', '{}')) t where btrim(t.value) <> '');
      if not p_dry_run then
        insert into public.dictionary_words
          (word, language, part_of_speech, cefr_level, topic, pronunciation, definition, examples, example,
           word_type, ielts_category, translation)
        values
          (v_word, v_lang, coalesce(btrim(x->>'part_of_speech'), ''), coalesce(x->>'cefr', ''),
           coalesce(nullif(btrim(x->>'topic'), ''), 'Other'), coalesce(btrim(x->>'ipa'), ''),
           coalesce(btrim(x->>'definition'), ''), coalesce(x->'examples', '[]'::jsonb), coalesce(x->'examples'->>0, ''),
           coalesce(nullif(x->>'word_type', ''), 'word'), nullif(btrim(x->>'ielts_category'), ''),
           coalesce(btrim(x->'translations'->>'ru'), ''))
        returning id into v_id;
        insert into public.word_translations (word_id, lang, translation)
        select v_id, t.key, btrim(t.value) from jsonb_each_text(coalesce(x->'translations', '{}')) t where btrim(t.value) <> '';
      end if;
      continue;
    end if;

    -- ---- existing word: fill empty fields only, report differences ----
    v_changed := false;
    for f in select * from (values
        ('part_of_speech', 'part_of_speech'), ('cefr', 'cefr_level'), ('topic', 'topic'), ('ipa', 'pronunciation'),
        ('definition', 'definition'), ('word_type', 'word_type'), ('ielts_category', 'ielts_category')
      ) as m(src, col)
    loop
      v_new := nullif(btrim(x->>f.src), '');
      continue when v_new is null;
      v_old := to_jsonb(w)->>f.col;
      if coalesce(v_old, '') = '' or (f.col = 'topic' and v_old = 'Other') then
        v_changed := true;
        if not p_dry_run then
          execute format('update public.dictionary_words set %I = $1 where id = $2', f.col) using v_new, w.id;
        end if;
      elsif v_old is distinct from v_new then
        conflicts := conflicts || jsonb_build_object('word', w.word, 'field', f.src, 'current', v_old, 'proposed', v_new);
      end if;
    end loop;

    if jsonb_typeof(x->'examples') = 'array' and jsonb_array_length(x->'examples') > 0 then
      if jsonb_array_length(w.examples) = 0 then
        v_changed := true;
        if not p_dry_run then
          update public.dictionary_words
             set examples = x->'examples',
                 example = case when coalesce(example, '') = '' then x->'examples'->>0 else example end
           where id = w.id;
        end if;
      elsif w.examples is distinct from x->'examples' then
        conflicts := conflicts || jsonb_build_object('word', w.word, 'field', 'examples', 'current', w.examples, 'proposed', x->'examples');
      end if;
    end if;

    for tr in select t.key, btrim(t.value) as value from jsonb_each_text(coalesce(x->'translations', '{}')) t where btrim(t.value) <> '' loop
      select translation into v_existing_tr from public.word_translations where word_id = w.id and lang = tr.key;
      if not found then
        v_changed := true;
        c_tr_added := c_tr_added + 1;
        if not p_dry_run then
          insert into public.word_translations (word_id, lang, translation) values (w.id, tr.key, tr.value);
          if tr.key = 'ru' and coalesce(w.translation, '') = '' then
            update public.dictionary_words set translation = tr.value where id = w.id;
          end if;
        end if;
      elsif v_existing_tr is distinct from tr.value then
        conflicts := conflicts || jsonb_build_object('word', w.word, 'field', 'translation.' || tr.key, 'current', v_existing_tr, 'proposed', tr.value);
      end if;
    end loop;

    if v_changed then c_updated := c_updated + 1; else c_unchanged := c_unchanged + 1; end if;
  end loop;

  return jsonb_build_object(
    'dry_run', p_dry_run,
    'new', c_new,
    'updated', c_updated,
    'unchanged', c_unchanged,
    'translations_added', c_tr_added,
    'conflicts', conflicts,
    'invalid', invalid,
    'new_words', new_words
  );
end $$;

revoke execute on function public.import_dictionary_words(jsonb, boolean) from public, anon;
grant execute on function public.import_dictionary_words(jsonb, boolean) to authenticated;

-- ---------- 4) search ----------
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
         or exists (select 1 from public.word_translations t where t.word_id = d.id and t.translation ilike q.pat))
    and (p_levels is null or d.cefr_level = any(p_levels))
    and (p_topic is null or d.topic = p_topic)
    and (p_pos is null or d.part_of_speech = p_pos)
    and (p_type is null or d.word_type = p_type)
    and (p_ielts is null or d.ielts_category = p_ielts)
  order by case when p_sort = 'cefr' then d.cefr_level end, lower(d.word)
  limit least(greatest(coalesce(p_limit, 300), 1), 1000);
$$;
