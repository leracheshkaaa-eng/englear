-- ============================================================
-- EngLear — secure teacher <-> student links.
-- Idempotent. Run after 0001, 0002 and 0003.
-- Does NOT touch existing rows in teacher_students or any user data.
--
-- 1) Only an admin, or a teacher linking a STUDENT to themself, may
--    create a teacher_students row (students can no longer do it).
-- 2) is_teacher_of() only grants access while the linked "teacher"
--    still has the teacher (or admin) role, so a demoted teacher loses
--    access to former students' profiles and progress.
-- ============================================================

-- ---------- helper: is the given user a student? ----------
-- SECURITY DEFINER so the check works even though profiles RLS hides
-- other users' rows from a teacher. Only signed-in users may call it.
create or replace function public.is_student(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'student' from public.profiles where id = uid), false);
$$;
revoke execute on function public.is_student(uuid) from public, anon;
grant execute on function public.is_student(uuid) to authenticated;

-- ---------- teacher_students: who may create a link ----------
drop policy if exists ts_insert on public.teacher_students;
create policy ts_insert on public.teacher_students for insert
  with check (
    public.is_admin()
    or (
      teacher_id = auth.uid()
      and public.my_role() = 'teacher'
      and student_id <> auth.uid()
      and public.is_student(student_id)
    )
  );

-- ---------- access through a link requires a current teacher/admin role ----------
create or replace function public.is_teacher_of(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1
    from public.teacher_students ts
    join public.profiles p on p.id = ts.teacher_id
    where ts.teacher_id = auth.uid()
      and ts.student_id = sid
      and p.role in ('teacher', 'admin')
  );
$$;
