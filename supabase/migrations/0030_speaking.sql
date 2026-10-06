-- 0030: speaking practice with Lean (voice role-plays). Additive: a new AI kind and a sessions table.
--
-- One session = one charge (ai_charge kind 'speaking'): free 1 a week, Plus 5 a day, otherwise 50 coins.
-- Inside a session the learner gets up to 16 turns within 60 minutes, then a feedback report (no extra charge).
-- Sessions are written only by the `ai` edge function (service role); learners can read their own.

-- allow the new kind in the usage log (only widens the list; existing rows are unaffected)
alter table public.ai_usage drop constraint ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check
  check (kind in ('tutor', 'writing', 'plan', 'lesson', 'placement', 'speaking'));

create or replace function public.ai_limits()
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'tutor',    jsonb_build_object('price', 10, 'free', 3, 'free_window', 'day',   'plus', 100, 'plus_window', 'day'),
    'writing',  jsonb_build_object('price', 40, 'free', 1, 'free_window', 'week',  'plus', 30,  'plus_window', 'month'),
    'lesson',   jsonb_build_object('price', 30, 'free', 5, 'free_window', 'month', 'plus', 30,  'plus_window', 'month'),
    'speaking', jsonb_build_object('price', 50, 'free', 1, 'free_window', 'week',  'plus', 5,   'plus_window', 'day')
  )
$$;

create table public.speaking_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  scenario text not null,
  level text not null,
  usage_id bigint references public.ai_usage(id) on delete set null,
  mode text not null check (mode in ('free', 'plus', 'coins')),
  turns int not null default 0 check (turns between 0 and 40),
  transcript jsonb not null default '[]'::jsonb check (jsonb_typeof(transcript) = 'array'),
  feedback jsonb,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create index speaking_sessions_user on public.speaking_sessions (user_id, created_at desc);
alter table public.speaking_sessions enable row level security;
create policy ss_select on public.speaking_sessions for select using (user_id = auth.uid() or public.is_admin());
grant select on public.speaking_sessions to authenticated;
