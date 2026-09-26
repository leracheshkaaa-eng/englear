-- ============================================================
-- EngLear — approved fixes for the original 139 dictionary words.
-- Run after 0009. Idempotent (every update matches the word case-insensitively
-- and sets final values). Word ids never change, so flashcards, word progress
-- and set snapshots keep pointing at the same words. Students' own flashcard
-- texts (copies) are NOT touched.
--
-- A) 8 starter words: IPA, definition, topic, examples.
-- B) weekdays: capitalised, topic Time, lowercase Russian names, IPA,
--    definitions, fixed examples.
-- C) IPA in American English (Cambridge US style: ɑː, oʊ, ɝː, ɚ, ɔː).
-- D) definition of "strong economy"; academic verbs word_type verb -> word.
-- E) clearer Russian translations; American spelling (neighbor, analyze, emphasize).
-- The legacy translation column and word_translations(ru) are kept in sync.
-- ============================================================

-- ---------- A) starter words ----------
update public.dictionary_words d set
  pronunciation = v.ipa,
  definition = v.def,
  topic = v.topic,
  examples = case when jsonb_array_length(d.examples) = 0 and coalesce(d.example, '') <> '' then jsonb_build_array(d.example) else d.examples end
from (values
  ('bag',   '/bæɡ/',    'A container for carrying things.',            'Daily Life'),
  ('cat',   '/kæt/',    'A small animal often kept as a pet.',         'Animals'),
  ('dog',   '/dɔːɡ/',   'A common animal kept as a pet.',              'Animals'),
  ('door',  '/dɔːr/',   'A movable part you open to enter a room.',    'Home'),
  ('happy', '/ˈhæpi/',  'Feeling or showing pleasure.',                'Emotions'),
  ('house', '/haʊs/',   'A building where people live.',               'Home'),
  ('pen',   '/pen/',    'A tool for writing with ink.',                'School'),
  ('water', '/ˈwɑːtɚ/', 'A clear liquid that you drink.',              'Food')
) as v(w, ipa, def, topic)
where d.language = 'en' and lower(d.word) = v.w;

-- ---------- B) weekdays ----------
update public.dictionary_words d set
  word = v.word,
  topic = 'Time',
  pronunciation = v.ipa,
  definition = v.def,
  examples = jsonb_build_array(v.ex),
  example = v.ex
from (values
  ('monday',    'Monday',    '/ˈmʌndeɪ/',   'The day after Sunday and before Tuesday.',    'I have a meeting on Monday.'),
  ('tuesday',   'Tuesday',   '/ˈtuːzdeɪ/',  'The day after Monday and before Wednesday.',  'We will meet at eight on Tuesday.'),
  ('wednesday', 'Wednesday', '/ˈwenzdeɪ/',  'The day after Tuesday and before Thursday.',  'The museum is closed on Wednesdays.'),
  ('thursday',  'Thursday',  '/ˈθɝːzdeɪ/',  'The day after Wednesday and before Friday.',  'The shop is closed on Thursdays.'),
  ('friday',    'Friday',    '/ˈfraɪdeɪ/',  'The day after Thursday and before Saturday.', 'We watch a film together every Friday.'),
  ('saturday',  'Saturday',  '/ˈsætɚdeɪ/',  'The day after Friday and before Sunday.',     'We don''t go to school on Saturday.'),
  ('sunday',    'Sunday',    '/ˈsʌndeɪ/',   'The day after Saturday and before Monday.',   'They go to church on Sundays.')
) as v(w, word, ipa, def, ex)
where d.language = 'en' and lower(d.word) = v.w;

with v(w, ru) as (values
  ('monday', 'понедельник'), ('tuesday', 'вторник'), ('wednesday', 'среда'), ('thursday', 'четверг'),
  ('friday', 'пятница'), ('saturday', 'суббота'), ('sunday', 'воскресенье')
)
update public.dictionary_words d set translation = v.ru from v where d.language = 'en' and lower(d.word) = v.w;

with v(w, ru) as (values
  ('monday', 'понедельник'), ('tuesday', 'вторник'), ('wednesday', 'среда'), ('thursday', 'четверг'),
  ('friday', 'пятница'), ('saturday', 'суббота'), ('sunday', 'воскресенье')
)
insert into public.word_translations (word_id, lang, translation)
select d.id, 'ru', v.ru from public.dictionary_words d join v on d.language = 'en' and lower(d.word) = v.w
on conflict (word_id, lang) do update set translation = excluded.translation;

-- ---------- C) American IPA ----------
update public.dictionary_words d set pronunciation = v.ipa
from (values
  ('bird', '/bɝːd/'), ('heart', '/hɑːrt/'), ('customer', '/ˈkʌstəmɚ/'), ('profit', '/ˈprɑːfɪt/'),
  ('shirt', '/ʃɝːt/'), ('come across', '/kʌm əˈkrɑːs/'), ('make progress', '/meɪk ˈprɑːɡres/'),
  ('consequence', '/ˈkɑːnsəkwens/'), ('brother', '/ˈbrʌðɚ/'), ('father', '/ˈfɑːðɚ/'), ('mother', '/ˈmʌðɚ/'),
  ('sister', '/ˈsɪstɚ/'), ('parent', '/ˈperənt/'), ('look after', '/lʊk ˈæftɚ/'), ('doctor', '/ˈdɑːktɚ/'),
  ('medicine', '/ˈmedɪsn/'), ('obesity', '/oʊˈbiːsəti/'), ('furniture', '/ˈfɝːnɪtʃɚ/'), ('turn off', '/tɝːn ɑːf/'),
  ('window', '/ˈwɪndoʊ/'), ('download', '/ˈdaʊnloʊd/'), ('afford', '/əˈfɔːrd/'), ('forest', '/ˈfɔːrɪst/'),
  ('river', '/ˈrɪvɚ/'), ('colleague', '/ˈkɑːliːɡ/'), ('grow up', '/ɡroʊ ʌp/'), ('neighbour', '/ˈneɪbɚ/'),
  ('homework', '/ˈhoʊmwɝːk/'), ('teacher', '/ˈtiːtʃɚ/'), ('hypothesis', '/haɪˈpɑːθəsɪs/'),
  ('phenomenon', '/fəˈnɑːmənɑːn/'), ('theory', '/ˈθɪri/'), ('shop', '/ʃɑːp/'), ('economy', '/ɪˈkɑːnəmi/'),
  ('furthermore', '/ˈfɝːðɚmɔːr/'), ('government', '/ˈɡʌvɚnmənt/'), ('infrastructure', '/ˈɪnfrəstrʌktʃɚ/'),
  ('law', '/lɑː/'), ('nevertheless', '/ˌnevɚðəˈles/'), ('strong economy', '/strɔːŋ ɪˈkɑːnəmi/'),
  ('computer', '/kəmˈpjuːtɚ/'), ('phone', '/foʊn/'), ('software', '/ˈsɑːftwer/'), ('early', '/ˈɝːli/'),
  ('morning', '/ˈmɔːrnɪŋ/'), ('airport', '/ˈerpɔːrt/'), ('journey', '/ˈdʒɝːni/'), ('tourism', '/ˈtʊrɪzəm/'),
  ('research', '/rɪˈsɝːtʃ/'), ('do research', '/duː rɪˈsɝːtʃ/'), ('cold', '/koʊld/'), ('carry on', '/ˈkæri ɑːn/'),
  ('job', '/dʒɑːb/'), ('office', '/ˈɑːfɪs/'), ('put off', '/pʊt ɑːf/')
) as v(w, ipa)
where d.language = 'en' and lower(d.word) = v.w;

-- ---------- D) definition + word_type ----------
update public.dictionary_words set definition = 'An economy that is growing and stable.'
where language = 'en' and lower(word) = 'strong economy';

update public.dictionary_words set word_type = 'word'
where language = 'en' and lower(word) in ('analyse', 'analyze', 'demonstrate', 'emphasise', 'emphasize') and word_type = 'verb';

-- ---------- E) Russian translations + American spelling ----------
with v(w, ru) as (values
  ('father', 'отец'), ('mother', 'мать'), ('set up', 'основать, создать'), ('come across', 'наткнуться'),
  ('look after', 'присматривать, заботиться'), ('deal with', 'справляться (с), иметь дело (с)'),
  ('degree', 'учёная степень, диплом'), ('afraid', 'боящийся, испуганный')
)
update public.dictionary_words d set translation = v.ru from v where d.language = 'en' and lower(d.word) = v.w;

with v(w, ru) as (values
  ('father', 'отец'), ('mother', 'мать'), ('set up', 'основать, создать'), ('come across', 'наткнуться'),
  ('look after', 'присматривать, заботиться'), ('deal with', 'справляться (с), иметь дело (с)'),
  ('degree', 'учёная степень, диплом'), ('afraid', 'боящийся, испуганный')
)
insert into public.word_translations (word_id, lang, translation)
select d.id, 'ru', v.ru from public.dictionary_words d join v on d.language = 'en' and lower(d.word) = v.w
on conflict (word_id, lang) do update set translation = excluded.translation;

update public.dictionary_words d set word = v.us, examples = v.examples::jsonb, example = v.examples::jsonb->>0
from (values
  ('neighbour', 'neighbor',  '["Our neighbors are very friendly."]'),
  ('analyse',   'analyze',   '["Scientists analyze the samples carefully."]'),
  ('emphasise', 'emphasize', '["The report emphasizes the need for change."]')
) as v(w, us, examples)
where d.language = 'en' and lower(d.word) = v.w;

update public.dictionary_words set examples = '["My room is small but cozy."]', example = 'My room is small but cozy.'
where language = 'en' and lower(word) = 'room';
update public.dictionary_words set examples = '["Immigration affects the labor market."]', example = 'Immigration affects the labor market.'
where language = 'en' and lower(word) = 'immigration';
update public.dictionary_words set definition = 'An act of traveling from one place to another.'
where language = 'en' and lower(word) = 'journey';
