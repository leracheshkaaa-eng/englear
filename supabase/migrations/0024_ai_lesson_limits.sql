-- 0024: allowance and price of the AI lesson generator (teachers).
-- Free: 5 lessons per 30 days; Plus: 30 per 30 days; then 30 coins each.
create or replace function public.ai_limits()
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'tutor',   jsonb_build_object('price', 10, 'free', 3, 'free_window', 'day',   'plus', 100, 'plus_window', 'day'),
    'writing', jsonb_build_object('price', 40, 'free', 1, 'free_window', 'week',  'plus', 30,  'plus_window', 'month'),
    'lesson',  jsonb_build_object('price', 30, 'free', 5, 'free_window', 'month', 'plus', 30,  'plus_window', 'month')
  )
$$;
