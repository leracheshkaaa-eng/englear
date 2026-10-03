-- 0022: AI features — subscriptions, usage accounting, free allowances, paying with coins,
-- tutor chat history and writing checks.
--
-- Who pays for an AI request (decided on the server by ai_charge, never by the client):
--   1. a Plus/Family subscriber within the plan allowance  -> mode 'plus'
--   2. anyone within the free taste                          -> mode 'free'
--   3. otherwise coins (tutor message 10, writing check 40)  -> mode 'coins'
-- If the model call fails, ai_refund gives the coins back and the request does not count.

-- ---------------- subscriptions ----------------
create table public.subscriptions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  plan text not null check (plan in ('plus', 'family')),
  status text not null default 'active' check (status in ('active', 'canceled', 'past_due', 'expired')),
  current_period_end timestamptz not null,
  source text not null default 'manual' check (source in ('manual', 'paddle')),
  external_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
create policy subscriptions_select on public.subscriptions for select
  using (user_id = auth.uid() or public.is_admin());
-- no insert/update/delete policies: written only by definer functions (admin grant, payment webhook)

-- a cancelled subscription still works until the end of the paid period
create or replace function public.has_plus(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.subscriptions
    where user_id = p_user and status in ('active', 'canceled') and current_period_end > now()
  )
$$;
revoke all on function public.has_plus(uuid) from public, anon, authenticated;

-- Admin: give a user Plus/Family for N days (family members, testing, gifts); 0 days ends it.
create or replace function public.admin_set_subscription(p_user uuid, p_plan text, p_days int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  if p_days <= 0 then
    update public.subscriptions set status = 'expired', current_period_end = now(), updated_at = now()
    where user_id = p_user and source = 'manual';
    return;
  end if;
  insert into public.subscriptions (user_id, plan, status, current_period_end, source)
  values (p_user, p_plan, 'active', now() + make_interval(days => p_days), 'manual')
  on conflict (user_id) do update
    set plan = excluded.plan, status = 'active', current_period_end = excluded.current_period_end,
        source = 'manual', updated_at = now()
    where public.subscriptions.source = 'manual';  -- never overwrite a paid subscription
end $$;
revoke all on function public.admin_set_subscription(uuid, text, int) from public, anon;
grant execute on function public.admin_set_subscription(uuid, text, int) to authenticated;

-- ---------------- usage ----------------
create table public.ai_usage (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('tutor', 'writing', 'plan', 'lesson', 'placement')),
  mode text not null check (mode in ('free', 'plus', 'coins', 'refunded')),
  coins int not null default 0,
  model text,
  input_tokens int,
  output_tokens int,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index ai_usage_user_kind_time on public.ai_usage (user_id, kind, created_at desc);
alter table public.ai_usage enable row level security;
create policy ai_usage_select on public.ai_usage for select using (user_id = auth.uid() or public.is_admin());

-- Allowances. Free: 3 tutor messages per UTC day, 1 writing check per 7 days.
-- Plus: 100 tutor messages per UTC day, 30 writing checks per 30 days. Prices in coins.
create or replace function public.ai_limits()
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'tutor',   jsonb_build_object('price', 10, 'free', 3, 'free_window', 'day',  'plus', 100, 'plus_window', 'day'),
    'writing', jsonb_build_object('price', 40, 'free', 1, 'free_window', 'week', 'plus', 30,  'plus_window', 'month')
  )
$$;

-- how many requests of this kind and mode count against the window that starts at p_since
create or replace function public.ai_used(p_user uuid, p_kind text, p_mode text, p_window text)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.ai_usage
  where user_id = p_user and kind = p_kind and mode = p_mode
    and created_at >= case p_window
      when 'day' then date_trunc('day', now() at time zone 'utc') at time zone 'utc'
      when 'week' then now() - interval '7 days'
      else now() - interval '30 days' end
$$;
revoke all on function public.ai_used(uuid, text, text, text) from public, anon, authenticated;

-- What the signed-in user can do right now (shown next to the buttons).
create or replace function public.ai_status()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  lim jsonb := public.ai_limits();
  plus boolean;
  sub public.subscriptions;
  res jsonb := '{}'::jsonb;
  k text;
  l jsonb;
begin
  if uid is null then return null; end if;
  plus := public.has_plus(uid);
  select * into sub from public.subscriptions where user_id = uid;
  res := jsonb_build_object(
    'plus', plus,
    'plan', case when plus then sub.plan end,
    'period_end', case when plus then sub.current_period_end end,
    'canceled', plus and sub.status = 'canceled',
    'balance', coalesce((select balance from public.wallets where user_id = uid), 0)
  );
  for k in select jsonb_object_keys(lim) loop
    l := lim -> k;
    res := res || jsonb_build_object(k, jsonb_build_object(
      'price', (l ->> 'price')::int,
      'free_left', greatest(0, (l ->> 'free')::int - public.ai_used(uid, k, 'free', l ->> 'free_window')),
      'free_window', l ->> 'free_window',
      'plus_left', case when plus then greatest(0, (l ->> 'plus')::int - public.ai_used(uid, k, 'plus', l ->> 'plus_window')) end
    ));
  end loop;
  return res;
end $$;
revoke all on function public.ai_status() from public, anon;
grant execute on function public.ai_status() to authenticated;

-- Decide who pays and record the request. Called by the `ai` edge function (service role) BEFORE the model call.
create or replace function public.ai_charge(p_user uuid, p_kind text, p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  l jsonb := public.ai_limits() -> p_kind;
  v_price int;
  v_id bigint;
  v_balance int;
begin
  if l is null then raise exception 'unknown ai kind %', p_kind; end if;
  v_price := (l ->> 'price')::int;
  -- serialize this user's requests so two tabs cannot both take the last free message
  insert into public.wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  select balance into v_balance from public.wallets where user_id = p_user for update;

  if public.has_plus(p_user) and public.ai_used(p_user, p_kind, 'plus', l ->> 'plus_window') < (l ->> 'plus')::int then
    insert into public.ai_usage (user_id, kind, mode) values (p_user, p_kind, 'plus') returning id into v_id;
    return jsonb_build_object('usage_id', v_id, 'mode', 'plus', 'coins', 0);
  end if;

  if public.ai_used(p_user, p_kind, 'free', l ->> 'free_window') < (l ->> 'free')::int then
    insert into public.ai_usage (user_id, kind, mode) values (p_user, p_kind, 'free') returning id into v_id;
    return jsonb_build_object('usage_id', v_id, 'mode', 'free', 'coins', 0);
  end if;

  if v_balance < v_price then
    raise exception 'not enough coins' using errcode = 'P0001', hint = 'not_enough_coins';
  end if;
  insert into public.ai_usage (user_id, kind, mode, coins) values (p_user, p_kind, 'coins', v_price) returning id into v_id;
  perform public.coins_add(p_user, -v_price, 'spend', 'spent', 'ai:' || p_key, null,
                           jsonb_build_object('ai', p_kind, 'usage_id', v_id));
  return jsonb_build_object('usage_id', v_id, 'mode', 'coins', 'coins', v_price);
end $$;

-- after the model answered: remember tokens and the model (for cost tracking)
create or replace function public.ai_finish(p_usage bigint, p_model text, p_in int, p_out int)
returns void language sql security definer set search_path = public as $$
  update public.ai_usage set model = p_model, input_tokens = p_in, output_tokens = p_out where id = p_usage
$$;

-- the model call failed: give the coins back, do not count the request
create or replace function public.ai_refund(p_usage bigint)
returns void language plpgsql security definer set search_path = public as $$
declare u public.ai_usage;
begin
  select * into u from public.ai_usage where id = p_usage for update;
  if not found or u.mode = 'refunded' then return; end if;
  if u.mode = 'coins' and u.coins > 0 then
    perform public.coins_add(u.user_id, u.coins, 'refund', 'spent', 'ai-refund:' || p_usage, null,
                             jsonb_build_object('ai', u.kind, 'usage_id', p_usage));
  end if;
  update public.ai_usage set mode = 'refunded' where id = p_usage;
end $$;

revoke all on function public.ai_charge(uuid, text, text) from public, anon, authenticated;
revoke all on function public.ai_finish(bigint, text, int, int) from public, anon, authenticated;
revoke all on function public.ai_refund(bigint) from public, anon, authenticated;
grant execute on function public.ai_charge(uuid, text, text) to service_role;
grant execute on function public.ai_finish(bigint, text, int, int) to service_role;
grant execute on function public.ai_refund(bigint) to service_role;

-- ---------------- tutor chat ----------------
create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_conversations_user on public.ai_conversations (user_id, updated_at desc);
alter table public.ai_conversations enable row level security;
create policy ai_conversations_select on public.ai_conversations for select using (user_id = auth.uid());
create policy ai_conversations_delete on public.ai_conversations for delete using (user_id = auth.uid());

create table public.ai_messages (
  id bigserial primary key,
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 8000),
  created_at timestamptz not null default now()
);
create index ai_messages_conv on public.ai_messages (conversation_id, id);
alter table public.ai_messages enable row level security;
create policy ai_messages_select on public.ai_messages for select using (user_id = auth.uid());

-- ---------------- writing checks ----------------
create table public.writing_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  task text not null default '',
  text text not null check (char_length(text) <= 5000),
  level text,
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index writing_checks_user on public.writing_checks (user_id, created_at desc);
alter table public.writing_checks enable row level security;
create policy writing_checks_select on public.writing_checks for select using (user_id = auth.uid());
create policy writing_checks_delete on public.writing_checks for delete using (user_id = auth.uid());

grant select on public.subscriptions, public.ai_usage, public.ai_conversations, public.ai_messages, public.writing_checks to authenticated;
grant delete on public.ai_conversations, public.writing_checks to authenticated;
