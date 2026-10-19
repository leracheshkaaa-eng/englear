-- 2026-10-19: IELTS categories for words that were already in the dictionary (only where the
-- category was empty — nothing was overwritten). Run once; idempotent.
with tag(word, cat) as (values
 ('accommodation','Travel'),('landmark','Travel'),('jet lag','Travel'),
 ('multicultural','Culture'),('globalization','Culture'),
 ('work-life balance','Work'),('qualification','Work'),('remote work','Work'),
 ('poverty','Global Issues'),('inequality','Global Issues'),('refugee','Global Issues'),('sustainability','Global Issues'),('overpopulation','Global Issues'),('life expectancy','Global Issues'),('corruption','Global Issues'),
 ('fake news','Media'),('headline','Media'),('broadcast','Media'),('censorship','Media'),('viral','Media'),('biased','Media'),('journalist','Media')
)
update public.dictionary_words d set ielts_category = t.cat
from tag t where d.language = 'en' and lower(d.word) = t.word and d.ielts_category is null;
