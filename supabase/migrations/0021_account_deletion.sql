-- 0021: a user can delete their own account (GDPR "right to erasure").
-- Deleting auth.users cascades to profiles and from there to every per-user table
-- (settings, progress, answers, passes, flashcards, assignments, wallet, items, ledger).
-- Lessons written by a teacher keep existing with author_id = null (FK is ON DELETE SET NULL).
-- Admin accounts cannot delete themselves from the app.

-- The coin ledger stays append-only, except for rows of the account being deleted
-- by delete_my_account() in the same transaction.
create or replace function public.coin_ledger_immutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and current_setting('englear.deleting_user', true) = old.user_id::text then
    return old;
  end if;
  raise exception 'coin_ledger is append-only';
end $$;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where id = uid and role = 'admin') then
    raise exception 'admin accounts cannot be deleted from the app' using errcode = '42501', hint = 'admin_cannot_delete';
  end if;
  perform set_config('englear.deleting_user', uid::text, true);
  delete from auth.users where id = uid;
  perform set_config('englear.deleting_user', '', true);
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
