-- 0025: whiteboards (Excalidraw) — lesson boards for teachers, notes for everyone.
--
-- * A board belongs to its owner. kind 'lesson' boards can be attached to a lesson; 'notes' are a notebook.
-- * The owner can share a board with a class or a student, read-only or with the right to draw.
--   A lesson board is also visible to students who have that lesson assigned by the board's owner.
-- * The scene (elements + a few view settings) is stored as JSON; pictures go to the private
--   storage bucket "board-files" at <board_id>/<file_id>, with the same access rules.
-- * save_board() saves with a version check, so two editors cannot silently overwrite each other.

create table public.boards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default '' check (char_length(title) <= 120),
  kind text not null default 'notes' check (kind in ('notes', 'lesson')),
  folder text not null default '' check (char_length(folder) <= 60),
  lesson_id uuid references public.lessons(id) on delete set null,
  scene jsonb not null default '{"elements": [], "appState": {}}'::jsonb,
  version int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (pg_column_size(scene) < 8000000)
);
create index boards_owner on public.boards (owner_id, updated_at desc);
create index boards_lesson on public.boards (lesson_id) where lesson_id is not null;

create table public.board_shares (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  class_id uuid references public.classes(id) on delete cascade,
  student_id uuid references public.profiles(id) on delete cascade,
  can_edit boolean not null default false,
  created_at timestamptz not null default now(),
  check ((class_id is null) <> (student_id is null)),
  unique (board_id, class_id),
  unique (board_id, student_id)
);
create index board_shares_board on public.board_shares (board_id);

-- ---------------- access ----------------
create or replace function public.can_view_board(p_board uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.boards b
    where b.id = p_board and (
      b.owner_id = auth.uid() or public.is_admin()
      or exists (select 1 from public.board_shares s
                 where s.board_id = b.id
                   and (s.student_id = auth.uid()
                        or exists (select 1 from public.class_members m where m.class_id = s.class_id and m.student_id = auth.uid())))
      or (b.kind = 'lesson' and b.lesson_id is not null and exists (
            select 1 from public.lesson_assignments a
            where a.lesson_id = b.lesson_id and a.student_id = auth.uid() and a.teacher_id = b.owner_id))
    )
  )
$$;

create or replace function public.can_edit_board(p_board uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.boards b
    where b.id = p_board and (
      b.owner_id = auth.uid()
      or exists (select 1 from public.board_shares s
                 where s.board_id = b.id and s.can_edit
                   and (s.student_id = auth.uid()
                        or exists (select 1 from public.class_members m where m.class_id = s.class_id and m.student_id = auth.uid())))
    )
  )
$$;

alter table public.boards enable row level security;
alter table public.board_shares enable row level security;

create policy boards_select on public.boards for select using (public.can_view_board(id));
create policy boards_insert on public.boards for insert with check (owner_id = auth.uid());
create policy boards_update on public.boards for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy boards_delete on public.boards for delete using (owner_id = auth.uid() or public.is_admin());

-- the owner changes title/kind/folder/lesson; the scene only through save_board()
revoke insert, update on public.boards from anon, authenticated;
grant insert (owner_id, title, kind, folder, lesson_id) on public.boards to authenticated;
grant update (title, kind, folder, lesson_id) on public.boards to authenticated;
grant select, delete on public.boards to authenticated;

-- a lesson can be attached only by someone who may edit or assign it
create or replace function public.boards_check_lesson()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.lesson_id is not null
     and (tg_op = 'INSERT' or new.lesson_id is distinct from old.lesson_id)
     and not public.can_assign(new.lesson_id, null) then
    raise exception 'cannot attach this lesson' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger boards_check_lesson before insert or update of lesson_id on public.boards
  for each row execute function public.boards_check_lesson();

create policy bs_select on public.board_shares for select using (
  student_id = auth.uid()
  or exists (select 1 from public.boards b where b.id = board_id and (b.owner_id = auth.uid() or public.is_admin()))
  or (class_id is not null and public.is_class_member(class_id))
);
create policy bs_insert on public.board_shares for insert with check (
  exists (select 1 from public.boards b where b.id = board_id and b.owner_id = auth.uid())
  and ((student_id is not null and public.is_teacher_of(student_id))
       or (class_id is not null and public.is_class_teacher(class_id)))
);
create policy bs_update on public.board_shares for update
  using (exists (select 1 from public.boards b where b.id = board_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from public.boards b where b.id = board_id and b.owner_id = auth.uid()));
create policy bs_delete on public.board_shares for delete using (
  exists (select 1 from public.boards b where b.id = board_id and b.owner_id = auth.uid())
);
revoke update on public.board_shares from anon, authenticated;
grant select, insert, delete on public.board_shares to authenticated;
grant update (can_edit) on public.board_shares to authenticated;

-- ---------------- saving ----------------
-- Saves the scene if nobody saved in between; returns the new version.
create or replace function public.save_board(p_board uuid, p_scene jsonb, p_version int)
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if not public.can_edit_board(p_board) then raise exception 'cannot edit this board' using errcode = '42501'; end if;
  if jsonb_typeof(p_scene -> 'elements') is distinct from 'array' then raise exception 'bad scene'; end if;
  update public.boards set scene = p_scene, version = version + 1, updated_at = now()
  where id = p_board and version = p_version
  returning version into v;
  if v is null then raise exception 'the board was changed by someone else' using hint = 'conflict'; end if;
  return v;
end $$;
revoke all on function public.save_board(uuid, jsonb, int) from public, anon;
grant execute on function public.save_board(uuid, jsonb, int) to authenticated;
revoke all on function public.can_view_board(uuid), public.can_edit_board(uuid) from public, anon;
grant execute on function public.can_view_board(uuid), public.can_edit_board(uuid) to authenticated;

-- ---------------- pictures ----------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('board-files', 'board-files', false, 5242880, array['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

create or replace function public.board_of_object(p_name text)
returns uuid language sql immutable as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f-]{36}$' then split_part(p_name, '/', 1)::uuid end
$$;

create policy board_files_read on storage.objects for select to authenticated
  using (bucket_id = 'board-files' and public.can_view_board(public.board_of_object(name)));
create policy board_files_write on storage.objects for insert to authenticated
  with check (bucket_id = 'board-files' and public.can_edit_board(public.board_of_object(name)));
create policy board_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'board-files' and exists (select 1 from public.boards b where b.id = public.board_of_object(name) and b.owner_id = auth.uid()));
