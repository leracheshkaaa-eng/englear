-- ============================================================
-- EngLear — coins: ledger, wallet, rewards, day streaks, shop. Idempotent; run after 0019.
-- Additive: no existing row is changed. Rewards start from now (nothing retroactive).
--
-- 1) coin_ledger: append-only journal (never updated or deleted). Every entry has a
--    unique idempotency_key, so the same reward can never be given twice.
--    wallets: the balance (always = sum of the ledger), today's earnings, the day
--    streak and streak freezes. Only server functions write both tables.
-- 2) Rewards (server-side, when a pass is completed; first completion only):
--      library lesson: 10, +5 if >= 80%, +5 more if 100%
--      teacher lesson (assigned to the student): 5 if >= 80%
--      flashcard set (practice passed >= 50%, >= 5 real cards, own sets >= 10): 5
--    A pass counts only if at least half of its exercises were answered.
--    Earned coins: at most 60 a day (UTC). Streak: +2 a day, +10 every 7th day;
--    a freeze covers a missed day.
-- 3) Result fields can no longer be written by the browser: passes are started and
--    completed, answers are checked only through the server functions
--    (start/complete/check now run with definer rights and check the caller).
-- 4) Shop: items for coins (streak freeze, avatars, frames), owned items,
--    buy_item(); a paid avatar / frame can only be worn when owned.
--    store_products: coin packs and subscriptions in EUR (payments come later).
-- ============================================================

-- ---------- 1) ledger + wallet ----------
create table if not exists public.coin_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount int not null check (amount <> 0),
  kind text not null check (kind in ('lesson','lesson_bonus','teacher_lesson','flashcards','streak_day','streak_week',
                                     'purchase','subscription','refund','spend','admin')),
  source text not null check (source in ('earned','bonus','purchased','spent')),
  idempotency_key text not null unique,
  ref_id uuid,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_coin_ledger_user on public.coin_ledger(user_id, created_at desc);

create table if not exists public.wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance int not null default 0 check (balance >= 0),
  earned_day date,
  earned_today int not null default 0,
  streak int not null default 0,
  best_streak int not null default 0,
  last_active_day date,
  freezes int not null default 0 check (freezes between 0 and 2),
  updated_at timestamptz not null default now()
);

alter table public.coin_ledger enable row level security;
alter table public.wallets enable row level security;
drop policy if exists cl_select on public.coin_ledger;
create policy cl_select on public.coin_ledger for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists w_select on public.wallets;
create policy w_select on public.wallets for select
  using (user_id = auth.uid() or public.is_admin() or public.is_teacher_of(user_id));
-- no insert / update / delete policies: only the functions below write
revoke insert, update, delete, truncate on public.coin_ledger, public.wallets from anon, authenticated;

-- the journal is append-only
create or replace function public.coin_ledger_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'coin_ledger is append-only';
end $$;
drop trigger if exists trg_coin_ledger_immutable on public.coin_ledger;
create trigger trg_coin_ledger_immutable before update or delete on public.coin_ledger
  for each row execute function public.coin_ledger_immutable();

create or replace function public.coins_today() returns date
language sql stable as $$ select (now() at time zone 'utc')::date $$;

-- Add (or take, amount < 0) coins once per key. Returns the amount added, 0 if the key was used.
create or replace function public.coins_add(p_user uuid, p_amount int, p_kind text, p_source text,
                                            p_key text, p_ref uuid default null, p_meta jsonb default '{}'::jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if p_amount = 0 then return 0; end if;
  insert into public.wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  perform 1 from public.wallets where user_id = p_user for update;
  insert into public.coin_ledger (user_id, amount, kind, source, idempotency_key, ref_id, meta)
  values (p_user, p_amount, p_kind, p_source, p_key, p_ref, coalesce(p_meta, '{}'::jsonb))
  on conflict (idempotency_key) do nothing
  returning id into v_id;
  if v_id is null then return 0; end if;
  update public.wallets set balance = balance + p_amount, updated_at = now() where user_id = p_user;  -- check: balance >= 0
  return p_amount;
end $$;

-- Earned coins: the same, within the daily limit (60, UTC day).
create or replace function public.coins_earn(p_user uuid, p_amount int, p_kind text, p_key text,
                                             p_ref uuid default null, p_meta jsonb default '{}'::jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  w public.wallets;
  v_allowed int;
  v_today date := public.coins_today();
begin
  if exists (select 1 from public.coin_ledger where idempotency_key = p_key) then return 0; end if;
  insert into public.wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  select * into w from public.wallets where user_id = p_user for update;
  if w.earned_day is distinct from v_today then
    update public.wallets set earned_day = v_today, earned_today = 0 where user_id = p_user;
    w.earned_today := 0;
  end if;
  v_allowed := least(p_amount, 60 - w.earned_today);
  if v_allowed <= 0 then return 0; end if;
  v_allowed := public.coins_add(p_user, v_allowed, p_kind, 'earned', p_key, p_ref,
                                coalesce(p_meta, '{}'::jsonb) || case when v_allowed < p_amount then jsonb_build_object('capped_from', p_amount) else '{}'::jsonb end);
  update public.wallets set earned_today = earned_today + v_allowed where user_id = p_user;
  return v_allowed;
end $$;

-- A day with learning: keeps the streak going (+2 a day, +10 every 7th day).
create or replace function public.streak_touch(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  w public.wallets;
  v_today date := public.coins_today();
  v_missed int;
  v_streak int;
begin
  insert into public.wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  select * into w from public.wallets where user_id = p_user for update;
  if w.last_active_day = v_today then return; end if;
  v_missed := case when w.last_active_day is null then null else v_today - w.last_active_day - 1 end;
  if v_missed = 0 then
    v_streak := w.streak + 1;
  elsif v_missed is not null and v_missed <= w.freezes then
    v_streak := w.streak + 1;                               -- the freezes cover the missed days
    update public.wallets set freezes = freezes - v_missed where user_id = p_user;
  else
    v_streak := 1;
  end if;
  update public.wallets set streak = v_streak, best_streak = greatest(best_streak, v_streak),
                            last_active_day = v_today, updated_at = now()
   where user_id = p_user;
  perform public.coins_add(p_user, 2, 'streak_day', 'bonus', 'streak:' || p_user || ':' || v_today,
                           null, jsonb_build_object('streak', v_streak));
  if v_streak % 7 = 0 then
    perform public.coins_add(p_user, 10, 'streak_week', 'bonus', 'streak7:' || p_user || ':' || v_today,
                             null, jsonb_build_object('streak', v_streak));
  end if;
end $$;

-- ---------- 2) rewards ----------
create or replace function public.reward_lesson_pass()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  l public.lessons;
  v_total int;
  v_answered int;
  v_correct int;
  v_pct int;
  v_first boolean;
  v_key text := new.lesson_id || ':' || new.student_id;
begin
  if not (new.status = 'completed' and old.status is distinct from 'completed') then return new; end if;
  select * into l from public.lessons where id = new.lesson_id;
  select count(*) into v_total from public.exercises where lesson_id = new.lesson_id;
  if v_total = 0 then return new; end if;
  -- the score is computed from the answers (server-graded), not taken from the pass
  select count(*) filter (where a.checked or a.response <> '{}'::jsonb),
         count(*) filter (where case when a.checked then coalesce(a.first_check_correct, false) else a.is_correct end)
    into v_answered, v_correct
    from public.exercise_answers a join public.exercises e on e.id = a.exercise_id and e.lesson_id = new.lesson_id
   where a.pass_id = new.id;
  if v_answered * 2 < v_total then return new; end if;       -- skipped through: no coins, no streak
  v_pct := floor(100.0 * v_correct / v_total);

  perform public.streak_touch(new.student_id);

  select not exists (select 1 from public.lesson_passes p
                      where p.student_id = new.student_id and p.lesson_id = new.lesson_id
                        and p.status = 'completed' and p.id <> new.id) into v_first;
  if not v_first then return new; end if;

  if l.scope = 'library' and l.status = 'published' then
    perform public.coins_earn(new.student_id, 10, 'lesson', 'lesson:' || v_key, new.lesson_id, jsonb_build_object('pct', v_pct));
    if v_pct >= 80 then
      perform public.coins_earn(new.student_id, 5, 'lesson_bonus', 'lesson80:' || v_key, new.lesson_id, jsonb_build_object('pct', v_pct));
    end if;
    if v_pct = 100 then
      perform public.coins_earn(new.student_id, 5, 'lesson_bonus', 'lesson100:' || v_key, new.lesson_id, jsonb_build_object('pct', v_pct));
    end if;
  elsif l.scope = 'teacher' and v_pct >= 80
        and exists (select 1 from public.lesson_assignments a where a.lesson_id = new.lesson_id and a.student_id = new.student_id) then
    perform public.coins_earn(new.student_id, 5, 'teacher_lesson', 'tlesson:' || v_key, new.lesson_id, jsonb_build_object('pct', v_pct));
  end if;
  return new;
end $$;
drop trigger if exists trg_reward_lesson_pass on public.lesson_passes;
create trigger trg_reward_lesson_pass after update of status on public.lesson_passes
  for each row execute function public.reward_lesson_pass();

create or replace function public.reward_flashcards()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_cards int;
  v_need int := 5;
  s public.flashcard_sets;
begin
  if not (new.status = 'completed' and old.status is distinct from 'completed') then return new; end if;
  if coalesce(new.practice_total, 0) = 0 or new.practice_correct * 2 < new.practice_total then return new; end if;
  -- the real size of the set, not the list the browser saved
  if new.set_id is not null then
    select * into s from public.flashcard_sets where id = new.set_id;
    select count(*) into v_cards from public.flashcards where set_id = new.set_id;
    if s.owner_id = new.student_id then v_need := 10; end if;     -- own sets
  else
    select count(*) into v_cards from public.dictionary_words
     where id in (select value::uuid from jsonb_array_elements_text(new.items) where value ~ '^[0-9a-f-]{36}$');
  end if;
  if v_cards < v_need then return new; end if;
  perform public.streak_touch(new.student_id);
  perform public.coins_earn(new.student_id, 5, 'flashcards',
                            'cards:' || new.student_id || ':' || coalesce(new.set_id::text, new.library_key),
                            new.set_id, jsonb_build_object('title', new.title));
  return new;
end $$;
drop trigger if exists trg_reward_flashcards on public.flashcard_set_progress;
create trigger trg_reward_flashcards after update of status on public.flashcard_set_progress
  for each row execute function public.reward_flashcards();

-- ---------- 3) results are written by the server only ----------
-- passes: the browser may only move the current position
revoke insert, update on public.lesson_passes from anon, authenticated;
grant update (current_index) on public.lesson_passes to authenticated;
-- answers: the browser may autosave its input; checks and verdicts come from the server
revoke insert, update on public.exercise_answers from anon, authenticated;
grant insert (pass_id, student_id, lesson_id, exercise_id, response, given_answer, is_correct) on public.exercise_answers to authenticated;
-- (the key columns too: an autosave is an upsert that rewrites them with the same values; RLS keeps them consistent)
grant update (pass_id, student_id, lesson_id, exercise_id, response, given_answer, is_correct) on public.exercise_answers to authenticated;

create or replace function public.start_lesson_pass(p_lesson_id uuid)
returns public.lesson_passes language plpgsql security definer set search_path = public as $$
declare v public.lesson_passes;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not public.can_read_lesson(p_lesson_id) then raise exception 'lesson not available' using errcode = '42501'; end if;

  select * into v from public.lesson_passes
   where student_id = auth.uid() and lesson_id = p_lesson_id and status = 'in_progress';
  if found then return v; end if;

  begin
    insert into public.lesson_passes (student_id, lesson_id, pass_number)
    values (auth.uid(), p_lesson_id,
            coalesce((select max(pass_number) from public.lesson_passes
                      where student_id = auth.uid() and lesson_id = p_lesson_id), 0) + 1)
    returning * into v;
  exception when unique_violation then
    select * into v from public.lesson_passes
     where student_id = auth.uid() and lesson_id = p_lesson_id and status = 'in_progress';
  end;

  insert into public.lesson_progress (student_id, lesson_id, status, started_at)
  values (auth.uid(), p_lesson_id, 'in_progress', now())
  on conflict (student_id, lesson_id) do nothing;
  return v;
end $$;

create or replace function public.check_exercise(p_pass_id uuid, p_exercise_id uuid, p_response jsonb, p_given text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_pass public.lesson_passes;
  a public.exercise_answers;
begin
  select * into v_pass from public.lesson_passes
   where id = p_pass_id and student_id = auth.uid() and status = 'in_progress';
  if not found then raise exception 'pass is not open'; end if;
  if not exists (select 1 from public.exercises where id = p_exercise_id and lesson_id = v_pass.lesson_id) then
    raise exception 'exercise is not in this lesson';
  end if;
  insert into public.exercise_answers (pass_id, student_id, lesson_id, exercise_id, response, given_answer)
  values (p_pass_id, auth.uid(), v_pass.lesson_id, p_exercise_id, coalesce(p_response, '{}'::jsonb), coalesce(p_given, ''))
  on conflict (pass_id, exercise_id) do update
    set response = excluded.response, given_answer = excluded.given_answer
  returning * into a;
  if not (a.checked and a.last_checked_response is not distinct from a.response) then
    update public.exercise_answers
       set checked = true,
           first_check_correct = coalesce(first_check_correct, a.is_correct),
           attempts_count = attempts_count + 1,
           last_checked_response = a.response
     where id = a.id
    returning * into a;
    insert into public.exercise_attempts
      (student_id, lesson_id, exercise_id, attempt_number, given_answer, is_correct, pass_id)
    values (auth.uid(), v_pass.lesson_id, p_exercise_id, a.attempts_count, coalesce(p_given, ''), a.is_correct, p_pass_id);
  end if;
  return jsonb_build_object('answer', to_jsonb(a), 'correct', a.is_correct,
                            'correct_answer', coalesce(public.exercise_answer_text(p_exercise_id), ''));
end $$;

alter function public.complete_lesson_pass(uuid, int) security definer;   -- it checks student_id = auth.uid() itself

-- ---------- 4) shop ----------
create table if not exists public.shop_items (
  code text primary key check (code ~ '^[a-z0-9_-]{2,40}$'),
  kind text not null check (kind in ('streak_freeze','avatar','frame')),
  price int not null check (price > 0),
  active boolean not null default true,
  position int not null default 0,
  data jsonb not null default '{}'::jsonb
);
create table if not exists public.user_items (
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_code text not null references public.shop_items(code),
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_code)
);
alter table public.shop_items enable row level security;
alter table public.user_items enable row level security;
drop policy if exists si_select on public.shop_items;
create policy si_select on public.shop_items for select using (true);
drop policy if exists si_write on public.shop_items;
create policy si_write on public.shop_items for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists ui_select on public.user_items;
create policy ui_select on public.user_items for select using (user_id = auth.uid() or public.is_admin());
revoke insert, update, delete, truncate on public.user_items from anon, authenticated;

insert into public.shop_items (code, kind, price, position) values
  ('streak_freeze', 'streak_freeze', 50, 10),
  ('avatar_unicorn', 'avatar', 150, 20),
  ('avatar_dragon', 'avatar', 200, 30),
  ('avatar_tiger', 'avatar', 150, 40),
  ('avatar_whale', 'avatar', 150, 50),
  ('frame_gold', 'frame', 300, 60),
  ('frame_rainbow', 'frame', 250, 70),
  ('frame_stars', 'frame', 100, 80)
on conflict (code) do nothing;

alter table public.profiles add column if not exists frame text;

-- a paid avatar / frame can only be worn by its owner
create or replace function public.profiles_check_items()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.avatar is distinct from old.avatar
     and exists (select 1 from public.shop_items where code = 'avatar_' || new.avatar)
     and not exists (select 1 from public.user_items where user_id = new.id and item_code = 'avatar_' || new.avatar) then
    raise exception 'this avatar is not yours yet' using errcode = '42501';
  end if;
  if new.frame is distinct from old.frame and new.frame is not null
     and not exists (select 1 from public.user_items where user_id = new.id and item_code = new.frame) then
    raise exception 'this frame is not yours yet' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists trg_profiles_check_items on public.profiles;
create trigger trg_profiles_check_items before update of avatar, frame on public.profiles
  for each row execute function public.profiles_check_items();

create or replace function public.buy_item(p_code text)
returns public.wallets language plpgsql security definer set search_path = public as $$
declare
  it public.shop_items;
  w public.wallets;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into it from public.shop_items where code = p_code and active;
  if not found then raise exception 'no such item'; end if;
  insert into public.wallets (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select * into w from public.wallets where user_id = auth.uid() for update;
  if w.balance < it.price then raise exception 'not enough coins' using errcode = 'P0001', hint = 'not_enough_coins'; end if;
  if it.kind = 'streak_freeze' then
    if w.freezes >= 2 then raise exception 'you already have the maximum of freezes' using hint = 'max_freezes'; end if;
    perform public.coins_add(auth.uid(), -it.price, 'spend', 'spent', 'buy:' || gen_random_uuid(), null, jsonb_build_object('item', it.code));
    update public.wallets set freezes = freezes + 1 where user_id = auth.uid();
  else
    if exists (select 1 from public.user_items where user_id = auth.uid() and item_code = it.code) then
      raise exception 'already owned' using hint = 'owned';
    end if;
    perform public.coins_add(auth.uid(), -it.price, 'spend', 'spent', 'buy:' || auth.uid() || ':' || it.code, null, jsonb_build_object('item', it.code));
    insert into public.user_items (user_id, item_code) values (auth.uid(), it.code);
  end if;
  select * into w from public.wallets where user_id = auth.uid();
  return w;
end $$;

-- products for real money (shown in the shop; payments are connected later)
create table if not exists public.store_products (
  code text primary key,
  kind text not null check (kind in ('coins','subscription')),
  coins int not null default 0,
  price_cents int not null check (price_cents > 0),
  currency text not null default 'EUR',
  interval text check (interval in ('month','year')),
  active boolean not null default true,
  position int not null default 0,
  data jsonb not null default '{}'::jsonb
);
alter table public.store_products enable row level security;
drop policy if exists sp_select on public.store_products;
create policy sp_select on public.store_products for select using (true);
drop policy if exists sp_write on public.store_products;
create policy sp_write on public.store_products for all using (public.is_admin()) with check (public.is_admin());

insert into public.store_products (code, kind, coins, price_cents, interval, position, data) values
  ('coins_1000', 'coins', 1000, 499, null, 10, '{}'),
  ('coins_2500', 'coins', 2500, 999, null, 20, '{"bonus_pct": 25}'),
  ('coins_6000', 'coins', 6000, 1999, null, 30, '{"bonus_pct": 50}'),
  ('plus_month', 'subscription', 300, 699, 'month', 40, '{"plan": "plus"}'),
  ('plus_year', 'subscription', 300, 4999, 'year', 50, '{"plan": "plus"}'),
  ('family_month', 'subscription', 300, 1199, 'month', 60, '{"plan": "family", "members": 5}')
on conflict (code) do nothing;

revoke execute on function public.coins_add(uuid, int, text, text, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.coins_earn(uuid, int, text, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.streak_touch(uuid) from public, anon, authenticated;
revoke execute on function public.buy_item(text) from public, anon;
grant execute on function public.buy_item(text) to authenticated;
