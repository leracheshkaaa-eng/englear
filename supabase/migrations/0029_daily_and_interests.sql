-- 0029: "Lean of the day" feed and the learner's interests. Additive only: new tables, no changes to existing data.
--
-- user_interests: what the learner likes (keys from src/lib/interests.ts), collected by Lean's short questions.
--   asked = { "<question>": "YYYY-MM-DD" (answered) | "skip:YYYY-MM-DD" (skipped) }
--
-- daily_posts: the daily feed. AI (or the admin) writes drafts, the admin approves them; approved posts
-- become visible on their day. content by kind:
--   meme: { pose, top, bottom, note }                       (Lean pose + caption, note explains the joke/slang)
--   word: { word, meaning, example, slang }
--   poll: { question, options: [text, ...] }               (2–4 options)
--   news: { title, easy, medium, hard, words: [{word, meaning}], question, source_name }

create table public.user_interests (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  interests text[] not null default '{}' check (cardinality(interests) <= 80),
  asked jsonb not null default '{}'::jsonb check (jsonb_typeof(asked) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.user_interests enable row level security;
create policy ui_select on public.user_interests for select using (user_id = auth.uid() or public.is_admin());
create policy ui_insert on public.user_interests for insert with check (user_id = auth.uid());
create policy ui_update on public.user_interests for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ui_delete on public.user_interests for delete using (user_id = auth.uid());
grant select, insert, update, delete on public.user_interests to authenticated;
create trigger trg_updated_user_interests before update on public.user_interests
  for each row execute function public.set_updated_at();

create table public.daily_posts (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  kind text not null check (kind in ('meme', 'news', 'word', 'poll')),
  status text not null default 'draft' check (status in ('draft', 'approved', 'rejected')),
  content jsonb not null default '{}'::jsonb check (jsonb_typeof(content) = 'object'),
  source_url text check (source_url is null or source_url ~ '^https?://'),
  origin text not null default 'manual' check (origin in ('manual', 'ai')),
  created_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'poll' or (jsonb_typeof(content -> 'options') = 'array' and jsonb_array_length(content -> 'options') between 2 and 4))
);
-- one approved post of each kind per day
create unique index daily_posts_one_per_day on public.daily_posts (day, kind) where status = 'approved';
create index daily_posts_day on public.daily_posts (day desc);

alter table public.daily_posts enable row level security;
create policy dp_select on public.daily_posts for select
  using ((status = 'approved' and day <= current_date) or public.is_admin());
create policy dp_insert on public.daily_posts for insert with check (public.is_admin());
create policy dp_update on public.daily_posts for update using (public.is_admin()) with check (public.is_admin());
create policy dp_delete on public.daily_posts for delete using (public.is_admin());
grant select on public.daily_posts to anon, authenticated;
grant insert, update, delete on public.daily_posts to authenticated;
create trigger trg_updated_daily_posts before update on public.daily_posts
  for each row execute function public.set_updated_at();

-- poll votes: one per learner; totals only through daily_poll_results
create table public.daily_poll_votes (
  post_id uuid not null references public.daily_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  choice smallint not null check (choice between 0 and 3),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.daily_poll_votes enable row level security;
create policy dpv_select on public.daily_poll_votes for select using (user_id = auth.uid());
create policy dpv_insert on public.daily_poll_votes for insert with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.daily_posts p
    where p.id = post_id and p.kind = 'poll' and p.status = 'approved' and p.day <= current_date
      and choice < jsonb_array_length(p.content -> 'options')
  )
);
grant select, insert on public.daily_poll_votes to authenticated;

create or replace function public.daily_poll_results(p_post uuid)
returns table (choice smallint, votes bigint)
language sql stable security definer set search_path = public as $$
  select v.choice, count(*)::bigint
  from public.daily_poll_votes v
  join public.daily_posts p on p.id = v.post_id
  where v.post_id = p_post and ((p.status = 'approved' and p.day <= current_date) or public.is_admin())
  group by v.choice
$$;
revoke all on function public.daily_poll_results(uuid) from public;
grant execute on function public.daily_poll_results(uuid) to authenticated;
