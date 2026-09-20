-- ============================================================
-- EngLear — open registration, nicknames + animal avatars,
-- teacher-approval flow, single hard-coded admin.
-- Safe & idempotent. Run after 0001_init.sql.
-- ============================================================

-- ---------- new profile columns ----------
alter table public.profiles add column if not exists avatar text not null default 'cat';
alter table public.profiles add column if not exists teacher_request text not null default 'none'
  check (teacher_request in ('none','pending'));

-- ---------- who is the admin ----------
-- The one and only admin is identified by email. Everyone else self-registers
-- as a student and can later REQUEST teacher status (admin approves).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role text := 'student';
begin
  if lower(new.email) = 'leracheshkaaa@gmail.com' then
    v_role := 'admin';
  end if;

  insert into public.profiles (id, full_name, role, avatar)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name',''), split_part(new.email,'@',1)),
    v_role,
    coalesce(nullif(new.raw_user_meta_data->>'avatar',''), 'cat')
  )
  on conflict (id) do nothing;

  insert into public.user_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end $$;

-- If the admin account already exists, promote it now (service role -> allowed).
update public.profiles p
   set role = 'admin'
  from auth.users u
 where u.id = p.id
   and lower(u.email) = 'leracheshkaaa@gmail.com'
   and p.role <> 'admin';

-- protect_role already blocks self role changes for non-admins; a student may
-- still flip their own teacher_request to 'pending' (covered by profiles_update).
