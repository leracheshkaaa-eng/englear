-- ============================================================
-- EngLear — per-user language settings. Idempotent; run after 0001-0007.
-- Additive: existing rows keep their data (new columns are NULL = "not chosen yet").
--
-- Four separate settings, never mixed:
--   interface_language  language of the site UI (NULL -> detect from the browser)
--   native_language     language of word translations (defaults to the UI language at sign-up)
--   learning_language   language being learned (English for now)
--   accent              pronunciation/voice of the learning language (en-US for now)
-- Language codes are validated by format only, so adding a language needs no migration.
-- ============================================================

alter table public.user_settings add column if not exists interface_language text;
alter table public.user_settings add column if not exists native_language text;
alter table public.user_settings add column if not exists learning_language text not null default 'en';
alter table public.user_settings add column if not exists accent text not null default 'en-US';

do $$ begin
  alter table public.user_settings add constraint user_settings_lang_format_chk check (
    (interface_language is null or interface_language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$')
    and (native_language is null or native_language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$')
    and learning_language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$'
    and accent ~ '^[a-z]{2,3}-[A-Z]{2}$'
  );
exception when duplicate_object then null; end $$;

-- Sign-up: store the interface language chosen in the registration form
-- (sent as user metadata); the native language starts out the same.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role text := 'student';
  v_lang text := nullif(new.raw_user_meta_data->>'interface_language', '');
begin
  if lower(new.email) = public.admin_email() then
    v_role := 'admin';
  end if;
  if v_lang is not null and v_lang !~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$' then
    v_lang := null;
  end if;

  insert into public.profiles (id, full_name, role, avatar)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name',''), split_part(new.email,'@',1)),
    v_role,
    coalesce(nullif(new.raw_user_meta_data->>'avatar',''), 'cat')
  )
  on conflict (id) do nothing;

  insert into public.user_settings (user_id, interface_language, native_language)
  values (new.id, v_lang, v_lang)
  on conflict (user_id) do nothing;
  return new;
end $$;
