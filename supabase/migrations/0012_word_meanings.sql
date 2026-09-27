-- ============================================================
-- EngLear — several meanings per word, lightweight lesson hints.
-- Idempotent; run after 0011. Additive: no existing row is modified
-- (all words have empty meanings; existing flashcards get meaning_key = null,
-- which means "the main meaning", i.e. exactly what they are today).
--
-- 1) dictionary_words.meanings: extra meanings of a word, each with a stable key:
--      [{ key, part_of_speech, cefr, definition, examples: [...],
--         translations: { uk: "...", ru: "...", ... } }]
--    The main meaning stays in the word's own columns + word_translations.
-- 2) flashcards.meaning_key: which meaning a card was made from (null = main).
-- 3) record_flashcard_review(): a card of an extra meaning counts only as a
--    card; it no longer marks the whole dictionary word (= its main meaning)
--    as known.
-- 4) import_dictionary_words(): also imports meanings with the same rules:
--    a new meaning (by key) is added; an existing one only gets its empty
--    fields / missing translations filled; different values are conflicts.
-- 5) search_dictionary(): also finds a word by an extra meaning's
--    definition or translation.
-- 6) dictionary_hints(): word + translation only (for inline lesson hints),
--    paged, so the whole dictionary is not downloaded with every column.
-- ============================================================

-- ---------- 1) + 2) ----------
alter table public.dictionary_words drop constraint if exists dictionary_words_meanings_array;
alter table public.dictionary_words add constraint dictionary_words_meanings_array check (jsonb_typeof(meanings) = 'array');

alter table public.flashcards add column if not exists meaning_key text;
alter table public.flashcards drop constraint if exists flashcards_meaning_key_check;
alter table public.flashcards add constraint flashcards_meaning_key_check
  check (meaning_key is null or (word_id is not null and meaning_key ~ '^[a-z0-9][a-z0-9_-]{0,31}$'));

-- ---------- 3) flashcard review ----------
create or replace function public.record_flashcard_review(p_card_id uuid, p_known boolean)
returns public.flashcard_progress language plpgsql security invoker set search_path = public as $$
declare
  v public.flashcard_progress;
  v_word uuid;
  v_meaning text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  -- RLS: only cards of sets the caller can read
  select word_id, meaning_key into v_word, v_meaning from public.flashcards where id = p_card_id;
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

  -- word progress = the word's main meaning, so only main-meaning cards update it
  if v_word is not null and v_meaning is null then
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

-- ---------- 4) import (with meanings) ----------
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
  -- meanings
  m jsonb;
  v_bad text;
  v_keys text[];
  v_meanings jsonb;
  v_idx int;
  v_cur jsonb;
  v_mchanged boolean;
  v_fld text;
  c_new int := 0;
  c_updated int := 0;
  c_unchanged int := 0;
  c_tr_added int := 0;
  c_meanings_added int := 0;
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

    v_bad := null;
    if x ? 'meanings' then
      if jsonb_typeof(x->'meanings') <> 'array' then
        v_bad := 'meanings must be an array';
      else
        v_keys := '{}';
        for m in select value from jsonb_array_elements(x->'meanings') loop
          if jsonb_typeof(m) <> 'object' then v_bad := 'each meaning must be an object'; exit; end if;
          if coalesce(m->>'key', '') !~ '^[a-z0-9][a-z0-9_-]{0,31}$' then v_bad := 'invalid meaning key: ' || coalesce(m->>'key', '(none)'); exit; end if;
          if m->>'key' = any(v_keys) then v_bad := 'duplicate meaning key: ' || (m->>'key'); exit; end if;
          v_keys := v_keys || (m->>'key');
          if coalesce(m->>'cefr', '') <> '' and m->>'cefr' not in ('A1','A2','B1','B2','C1','C2') then v_bad := 'invalid meaning cefr: ' || (m->>'cefr'); exit; end if;
          if m ? 'translations' and jsonb_typeof(m->'translations') <> 'object' then v_bad := 'meaning translations must be an object'; exit; end if;
          if m ? 'examples' and jsonb_typeof(m->'examples') <> 'array' then v_bad := 'meaning examples must be an array'; exit; end if;
        end loop;
      end if;
    end if;
    if v_bad is not null then
      invalid := invalid || jsonb_build_object('word', v_word, 'reason', v_bad); continue;
    end if;

    select * into w from public.dictionary_words d where d.language = v_lang and lower(d.word) = lower(v_word);

    -- ---- new word ----
    if not found then
      c_new := c_new + 1;
      new_words := new_words || to_jsonb(v_word);
      c_tr_added := c_tr_added + (select count(*) from jsonb_each_text(coalesce(x->'translations', '{}')) t where btrim(t.value) <> '');
      c_meanings_added := c_meanings_added + jsonb_array_length(coalesce(x->'meanings', '[]'));
      if not p_dry_run then
        insert into public.dictionary_words
          (word, language, part_of_speech, cefr_level, topic, pronunciation, definition, examples, example,
           word_type, ielts_category, translation, meanings)
        values
          (v_word, v_lang, coalesce(btrim(x->>'part_of_speech'), ''), coalesce(x->>'cefr', ''),
           coalesce(nullif(btrim(x->>'topic'), ''), 'Other'), coalesce(btrim(x->>'ipa'), ''),
           coalesce(btrim(x->>'definition'), ''), coalesce(x->'examples', '[]'::jsonb), coalesce(x->'examples'->>0, ''),
           coalesce(nullif(x->>'word_type', ''), 'word'), nullif(btrim(x->>'ielts_category'), ''),
           coalesce(btrim(x->'translations'->>'ru'), ''), coalesce(x->'meanings', '[]'::jsonb))
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
      ) as mm(src, col)
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

    -- meanings, matched by key
    v_meanings := w.meanings;
    for m in select value from jsonb_array_elements(coalesce(x->'meanings', '[]')) loop
      v_idx := null;
      select e.ord - 1 into v_idx from jsonb_array_elements(v_meanings) with ordinality e(val, ord) where e.val->>'key' = m->>'key';
      if v_idx is null then
        v_meanings := v_meanings || jsonb_build_array(m);
        c_meanings_added := c_meanings_added + 1;
        continue;
      end if;
      v_cur := v_meanings->v_idx;
      v_mchanged := false;
      foreach v_fld in array array['part_of_speech', 'cefr', 'definition'] loop
        v_new := nullif(btrim(m->>v_fld), '');
        continue when v_new is null;
        v_old := nullif(btrim(v_cur->>v_fld), '');
        if v_old is null then
          v_cur := jsonb_set(v_cur, array[v_fld], to_jsonb(v_new));
          v_mchanged := true;
        elsif v_old <> v_new then
          conflicts := conflicts || jsonb_build_object('word', w.word, 'field', 'meanings.' || (m->>'key') || '.' || v_fld, 'current', v_old, 'proposed', v_new);
        end if;
      end loop;
      if jsonb_typeof(m->'examples') = 'array' and jsonb_array_length(m->'examples') > 0 then
        if jsonb_array_length(coalesce(v_cur->'examples', '[]')) = 0 then
          v_cur := jsonb_set(v_cur, '{examples}', m->'examples');
          v_mchanged := true;
        elsif v_cur->'examples' is distinct from m->'examples' then
          conflicts := conflicts || jsonb_build_object('word', w.word, 'field', 'meanings.' || (m->>'key') || '.examples', 'current', v_cur->'examples', 'proposed', m->'examples');
        end if;
      end if;
      for tr in select t.key, btrim(t.value) as value from jsonb_each_text(coalesce(m->'translations', '{}')) t where btrim(t.value) <> '' loop
        v_old := nullif(btrim(v_cur->'translations'->>tr.key), '');
        if v_old is null then
          v_cur := jsonb_set(v_cur, '{translations}', coalesce(v_cur->'translations', '{}') || jsonb_build_object(tr.key, tr.value));
          v_mchanged := true;
        elsif v_old <> tr.value then
          conflicts := conflicts || jsonb_build_object('word', w.word, 'field', 'meanings.' || (m->>'key') || '.translation.' || tr.key, 'current', v_old, 'proposed', tr.value);
        end if;
      end loop;
      if v_mchanged then
        v_meanings := jsonb_set(v_meanings, array[v_idx::text], v_cur);
      end if;
    end loop;
    if v_meanings is distinct from w.meanings then
      v_changed := true;
      if not p_dry_run then
        update public.dictionary_words set meanings = v_meanings where id = w.id;
      end if;
    end if;

    if v_changed then c_updated := c_updated + 1; else c_unchanged := c_unchanged + 1; end if;
  end loop;

  return jsonb_build_object(
    'dry_run', p_dry_run,
    'new', c_new,
    'updated', c_updated,
    'unchanged', c_unchanged,
    'translations_added', c_tr_added,
    'meanings_added', c_meanings_added,
    'conflicts', conflicts,
    'invalid', invalid,
    'new_words', new_words
  );
end $$;

revoke execute on function public.import_dictionary_words(jsonb, boolean) from public, anon;
grant execute on function public.import_dictionary_words(jsonb, boolean) to authenticated;

-- ---------- 5) search (also by extra meanings) ----------
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
  order by case when p_sort = 'cefr' then d.cefr_level end, lower(d.word)
  limit least(greatest(coalesce(p_limit, 300), 1), 1000);
$$;

-- ---------- 6) lesson hints ----------
create or replace function public.dictionary_hints(p_lang text, p_offset int default 0, p_limit int default 1000)
returns table (id uuid, word text, translation text, definition text, example text)
language sql stable security invoker set search_path = public as $$
  select d.id, d.word,
         case when p_lang = 'en' then null
              else coalesce(t.translation, case when p_lang = 'ru' then nullif(d.translation, '') end) end,
         d.definition,
         coalesce(nullif(d.example, ''), d.examples->>0)
  from public.dictionary_words d
  left join public.word_translations t on t.word_id = d.id and t.lang = p_lang
  where d.language = 'en'
  order by lower(d.word), d.id
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 1000), 1), 1000);
$$;

grant execute on function public.dictionary_hints(text, int, int) to anon, authenticated;
