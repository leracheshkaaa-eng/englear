-- 0031: grammar explanations (free for everyone). Additive only: one new table.
--
-- One explanation per grammar topic and interface language, written by the AI the first time someone
-- opens the topic in that language and reused after that (so at most 48 topics × 11 languages are ever
-- generated). How much of it is in the learner's language depends on the topic level:
-- A1–A2 in their language, B1 mixed, B2 mostly English, C1–C2 English.
-- content = { title, summary, sections: [{heading, text, examples: [{en, tr}]}],
--             table: {headers: [], rows: [[]]} | null, mistakes: [{wrong, right, why}],
--             tip, check: [{question, options: [], answer, why}] }
-- Written only by the `ai` edge function (service role); readable by everyone, guests included.

create table public.grammar_explanations (
  topic_id uuid not null references public.grammar_topics(id) on delete cascade,
  lang text not null check (lang in ('en', 'uk', 'ru', 'de', 'fr', 'es', 'it', 'pt', 'pl', 'zh', 'ja')),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (topic_id, lang)
);
alter table public.grammar_explanations enable row level security;
create policy ge_select on public.grammar_explanations for select using (true);
grant select on public.grammar_explanations to anon, authenticated;
create trigger trg_updated_grammar_explanations before update on public.grammar_explanations
  for each row execute function public.set_updated_at();
