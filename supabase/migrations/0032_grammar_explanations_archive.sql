-- 0032: backup of the first version of the grammar explanations, taken before they were regenerated
-- with the new "when and why" block (2026-10-13). Readable only by the service role / dashboard.
create table public.grammar_explanations_archive as
  select topic_id, lang, content, model, created_at, updated_at, now() as archived_at from public.grammar_explanations;
alter table public.grammar_explanations_archive enable row level security;
