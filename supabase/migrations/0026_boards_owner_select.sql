-- 0026: the owner sees a board directly from the row. can_view_board() looks the board up in the
-- table, which does not yet see a row being inserted, so INSERT ... RETURNING failed for the owner.
drop policy if exists boards_select on public.boards;
create policy boards_select on public.boards for select using (owner_id = auth.uid() or public.can_view_board(id));
