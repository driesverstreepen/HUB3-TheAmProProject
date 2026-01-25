-- AmPro: rename updates -> notes (admin-created notes shown to accepted dancers)

do $$
begin
  if to_regclass('public.ampro_updates') is not null and to_regclass('public.ampro_notes') is null then
    alter table public.ampro_updates rename to ampro_notes;

    -- Rename trigger (optional, for clarity)
    begin
      alter trigger ampro_updates_set_updated_at on public.ampro_notes rename to ampro_notes_set_updated_at;
    exception when undefined_object then
      -- If trigger does not exist, ignore
      null;
    end;

    -- Recreate policies with clearer names (existing policies survive rename, but keep old names)
    begin
      drop policy if exists "ampro_updates_select_accepted" on public.ampro_notes;
      drop policy if exists "ampro_updates_admin_all" on public.ampro_notes;
    exception when undefined_object then
      null;
    end;

    drop policy if exists "ampro_notes_select_accepted" on public.ampro_notes;
    create policy "ampro_notes_select_accepted"
    on public.ampro_notes
    for select
    to authenticated
    using (
      exists (
        select 1 from public.ampro_roster r
        where r.performance_id = performance_id
          and r.user_id = auth.uid()
      )
    );

    drop policy if exists "ampro_notes_admin_all" on public.ampro_notes;
    create policy "ampro_notes_admin_all"
    on public.ampro_notes
    for all
    to authenticated
    using (
      exists (select 1 from public.ampro_user_roles r where r.user_id = auth.uid() and r.role = 'admin')
    )
    with check (
      exists (select 1 from public.ampro_user_roles r where r.user_id = auth.uid() and r.role = 'admin')
    );
  end if;
end $$;

-- Ensure grants still exist under the new table name (renames keep privileges, but this is safe/idempotent).
do $$
begin
  if to_regclass('public.ampro_notes') is not null then
    grant select on table public.ampro_notes to authenticated;
  end if;
end $$;
