-- 0023: teacher mode — classes (groups), invite links/codes, homework with due dates.
--
-- * A teacher has a personal invite code and one code per class. A student opens /join/<CODE>
--   (or types the code) and becomes the teacher's student (and a class member).
-- * Work can be assigned to a whole class: a class_assignments row is the source, and every
--   member gets an ordinary lesson/set assignment row (class_assignment_id points back).
--   New members receive the class's existing assignments when they join.
-- * Assignments get an optional due date. Teachers may now assign published library lessons too.
-- Existing assignments and teacher–student links are not changed.

-- ---------------- codes ----------------
create or replace function public.gen_join_code()
returns text language plpgsql volatile set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- no 0/O, 1/I/L
  c text;
begin
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.classes where join_code = c)
          and not exists (select 1 from public.teacher_invites where code = c);
  end loop;
  return c;
end $$;

create table public.teacher_invites (
  teacher_id uuid primary key references public.profiles(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  join_code text not null unique,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index classes_teacher on public.classes (teacher_id);

create table public.class_members (
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (class_id, student_id)
);
create index class_members_student on public.class_members (student_id);

create table public.class_assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid references public.lessons(id) on delete cascade,
  flashcard_set_id uuid references public.flashcard_sets(id) on delete cascade,
  due_at timestamptz,
  created_at timestamptz not null default now(),
  check ((lesson_id is null) <> (flashcard_set_id is null))
);
create index class_assignments_class on public.class_assignments (class_id);

alter table public.lesson_assignments
  add column if not exists due_at timestamptz,
  add column if not exists class_assignment_id uuid references public.class_assignments(id) on delete cascade;
alter table public.flashcard_set_assignments
  add column if not exists due_at timestamptz,
  add column if not exists class_assignment_id uuid references public.class_assignments(id) on delete cascade;

-- ---------------- row level security ----------------
alter table public.teacher_invites enable row level security;
alter table public.classes enable row level security;
alter table public.class_members enable row level security;
alter table public.class_assignments enable row level security;

-- helpers used by the policies (definer: no policy recursion between classes and members)
create or replace function public.is_class_teacher(p_class uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.classes where id = p_class and teacher_id = auth.uid())
$$;
create or replace function public.is_class_member(p_class uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.class_members where class_id = p_class and student_id = auth.uid())
$$;

create policy ti_select on public.teacher_invites for select using (teacher_id = auth.uid() or public.is_admin());
create policy classes_select on public.classes for select using (teacher_id = auth.uid() or public.is_admin() or public.is_class_member(id));
create policy classes_update on public.classes for update using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy classes_delete on public.classes for delete using (teacher_id = auth.uid() or public.is_admin());
create policy cm_select on public.class_members for select using (student_id = auth.uid() or public.is_admin() or public.is_class_teacher(class_id));
create policy ca_select on public.class_assignments for select using (teacher_id = auth.uid() or public.is_admin() or public.is_class_member(class_id));
create policy ca_delete on public.class_assignments for delete using (teacher_id = auth.uid() or public.is_admin());

-- class name/archive may change; the code only through regenerate_code()
revoke update on public.classes from anon, authenticated;
grant update (name, archived) on public.classes to authenticated;
grant select on public.teacher_invites, public.classes, public.class_members, public.class_assignments to authenticated;
grant delete on public.classes, public.class_assignments to authenticated;
revoke insert on public.teacher_invites, public.classes, public.class_members, public.class_assignments from anon, authenticated;

-- teachers may also assign published library lessons
drop policy if exists la_insert on public.lesson_assignments;
create policy la_insert on public.lesson_assignments for insert with check (
  public.is_admin() or (
    teacher_id = auth.uid() and public.is_teacher_of(student_id)
    and (public.can_edit_lesson(lesson_id)
         or exists (select 1 from public.lessons l where l.id = lesson_id and l.scope = 'library' and l.status = 'published'))
  )
);
-- the due date of an individual assignment can be changed by its teacher
drop policy if exists la_update on public.lesson_assignments;
create policy la_update on public.lesson_assignments for update using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
drop policy if exists fsa_update on public.flashcard_set_assignments;
create policy fsa_update on public.flashcard_set_assignments for update using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
revoke update on public.lesson_assignments, public.flashcard_set_assignments from anon, authenticated;
grant update (due_at) on public.lesson_assignments, public.flashcard_set_assignments to authenticated;

-- ---------------- helpers ----------------
create or replace function public.is_teacher_role()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('teacher', 'admin') from public.profiles where id = auth.uid()), false)
$$;

-- may the current teacher hand this lesson / set to students?
create or replace function public.can_assign(p_lesson uuid, p_set uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_lesson is not null then public.can_edit_lesson(p_lesson)
      or exists (select 1 from public.lessons l where l.id = p_lesson and l.scope = 'library' and l.status = 'published')
    else public.can_edit_set(p_set)
  end
$$;

-- give one class assignment to the class members that do not have it yet
create or replace function public.materialize_class_assignment(p_ca uuid, p_student uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare ca public.class_assignments;
begin
  select * into ca from public.class_assignments where id = p_ca;
  if not found then return; end if;
  if ca.lesson_id is not null then
    insert into public.lesson_assignments (lesson_id, teacher_id, student_id, due_at, class_assignment_id)
    select ca.lesson_id, ca.teacher_id, m.student_id, ca.due_at, ca.id
    from public.class_members m
    where m.class_id = ca.class_id and (p_student is null or m.student_id = p_student)
    on conflict (lesson_id, student_id) do nothing;   -- an existing individual assignment stays as it is
  else
    insert into public.flashcard_set_assignments (flashcard_set_id, teacher_id, student_id, due_at, class_assignment_id)
    select ca.flashcard_set_id, ca.teacher_id, m.student_id, ca.due_at, ca.id
    from public.class_members m
    where m.class_id = ca.class_id and (p_student is null or m.student_id = p_student)
    on conflict (flashcard_set_id, student_id) do nothing;
  end if;
end $$;
revoke all on function public.materialize_class_assignment(uuid, uuid) from public, anon, authenticated;

-- ---------------- teacher actions ----------------
create or replace function public.my_invite_code()
returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.is_teacher_role() then raise exception 'teachers only' using errcode = '42501'; end if;
  select code into c from public.teacher_invites where teacher_id = auth.uid();
  if c is null then
    c := public.gen_join_code();
    insert into public.teacher_invites (teacher_id, code) values (auth.uid(), c);
  end if;
  return c;
end $$;

create or replace function public.create_class(p_name text)
returns public.classes language plpgsql security definer set search_path = public as $$
declare r public.classes;
begin
  if not public.is_teacher_role() then raise exception 'teachers only' using errcode = '42501'; end if;
  insert into public.classes (teacher_id, name, join_code) values (auth.uid(), btrim(p_name), public.gen_join_code())
  returning * into r;
  return r;
end $$;

-- a new code for a class (or for the personal invite when p_class is null); the old one stops working
create or replace function public.regenerate_code(p_class uuid default null)
returns text language plpgsql security definer set search_path = public as $$
declare c text := public.gen_join_code();
begin
  if not public.is_teacher_role() then raise exception 'teachers only' using errcode = '42501'; end if;
  if p_class is null then
    insert into public.teacher_invites (teacher_id, code) values (auth.uid(), c)
    on conflict (teacher_id) do update set code = excluded.code, created_at = now();
  else
    update public.classes set join_code = c where id = p_class and teacher_id = auth.uid();
    if not found then raise exception 'not your class' using errcode = '42501'; end if;
  end if;
  return c;
end $$;

-- add an existing student of mine to a class (or move between classes from the UI)
create or replace function public.add_to_class(p_class uuid, p_student uuid)
returns void language plpgsql security definer set search_path = public as $$
declare ca uuid;
begin
  if not exists (select 1 from public.classes where id = p_class and teacher_id = auth.uid()) then
    raise exception 'not your class' using errcode = '42501';
  end if;
  if not public.is_teacher_of(p_student) then raise exception 'not your student' using errcode = '42501'; end if;
  insert into public.class_members (class_id, student_id) values (p_class, p_student) on conflict do nothing;
  for ca in select id from public.class_assignments where class_id = p_class loop
    perform public.materialize_class_assignment(ca, p_student);
  end loop;
end $$;

-- remove from a class: the class's homework not yet started is taken back; results stay
create or replace function public.remove_from_class(p_class uuid, p_student uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.classes where id = p_class and (teacher_id = auth.uid() or public.is_admin())) then
    raise exception 'not your class' using errcode = '42501';
  end if;
  delete from public.class_members where class_id = p_class and student_id = p_student;
  delete from public.lesson_assignments a
  using public.class_assignments ca
  where a.class_assignment_id = ca.id and ca.class_id = p_class and a.student_id = p_student
    and not exists (select 1 from public.lesson_passes p where p.lesson_id = a.lesson_id and p.student_id = p_student);
  delete from public.flashcard_set_assignments a
  using public.class_assignments ca
  where a.class_assignment_id = ca.id and ca.class_id = p_class and a.student_id = p_student;
end $$;

-- assign a lesson or a card set to a whole class
create or replace function public.assign_to_class(p_class uuid, p_lesson uuid, p_set uuid, p_due timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not exists (select 1 from public.classes where id = p_class and teacher_id = auth.uid()) then
    raise exception 'not your class' using errcode = '42501';
  end if;
  if (p_lesson is null) = (p_set is null) then raise exception 'give a lesson or a set'; end if;
  if not public.can_assign(p_lesson, p_set) then raise exception 'cannot assign this' using errcode = '42501'; end if;
  select id into v_id from public.class_assignments
  where class_id = p_class and lesson_id is not distinct from p_lesson and flashcard_set_id is not distinct from p_set;
  if v_id is null then
    insert into public.class_assignments (class_id, teacher_id, lesson_id, flashcard_set_id, due_at)
    values (p_class, auth.uid(), p_lesson, p_set, p_due) returning id into v_id;
  else
    update public.class_assignments set due_at = p_due where id = v_id;
    update public.lesson_assignments set due_at = p_due where class_assignment_id = v_id;
    update public.flashcard_set_assignments set due_at = p_due where class_assignment_id = v_id;
  end if;
  perform public.materialize_class_assignment(v_id);
  return v_id;
end $$;

-- ---------------- student actions ----------------
-- who is behind a code (shown before joining; works for guests too)
create or replace function public.join_preview(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('teacher', p.full_name, 'teacher_avatar', p.avatar, 'class', c.name)
       from public.classes c join public.profiles p on p.id = c.teacher_id
      where c.join_code = upper(btrim(p_code)) and not c.archived and p.role in ('teacher', 'admin')),
    (select jsonb_build_object('teacher', p.full_name, 'teacher_avatar', p.avatar, 'class', null)
       from public.teacher_invites i join public.profiles p on p.id = i.teacher_id
      where i.code = upper(btrim(p_code)) and p.role in ('teacher', 'admin'))
  )
$$;

create or replace function public.join_by_code(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_code text := upper(btrim(p_code));
  v_teacher uuid;
  v_class uuid;
  ca uuid;
begin
  if uid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select c.teacher_id, c.id into v_teacher, v_class from public.classes c where c.join_code = v_code and not c.archived;
  if v_teacher is null then
    select teacher_id into v_teacher from public.teacher_invites where code = v_code;
  end if;
  if v_teacher is null or not exists (select 1 from public.profiles where id = v_teacher and role in ('teacher', 'admin')) then
    raise exception 'no such code' using hint = 'bad_code';
  end if;
  if v_teacher = uid then raise exception 'this is your own code' using hint = 'own_code'; end if;
  if not public.is_student(uid) then raise exception 'only students can join' using hint = 'not_student'; end if;

  insert into public.teacher_students (teacher_id, student_id) values (v_teacher, uid) on conflict (teacher_id, student_id) do nothing;
  if v_class is not null then
    insert into public.class_members (class_id, student_id) values (v_class, uid) on conflict do nothing;
    for ca in select id from public.class_assignments where class_id = v_class loop
      perform public.materialize_class_assignment(ca, uid);
    end loop;
  end if;
  return public.join_preview(v_code);
end $$;

revoke all on function public.gen_join_code() from public, anon, authenticated;
revoke all on function public.my_invite_code(), public.create_class(text), public.regenerate_code(uuid),
  public.add_to_class(uuid, uuid), public.remove_from_class(uuid, uuid),
  public.assign_to_class(uuid, uuid, uuid, timestamptz), public.join_by_code(text) from public, anon;
grant execute on function public.my_invite_code(), public.create_class(text), public.regenerate_code(uuid),
  public.add_to_class(uuid, uuid), public.remove_from_class(uuid, uuid),
  public.assign_to_class(uuid, uuid, uuid, timestamptz), public.join_by_code(text) to authenticated;
grant execute on function public.join_preview(text) to anon, authenticated;
