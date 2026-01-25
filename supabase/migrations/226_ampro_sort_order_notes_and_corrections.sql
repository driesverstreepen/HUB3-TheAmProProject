-- AmPro: manual ordering for notes + corrections (admin-defined)

-- Add sort_order to ampro_notes and backfill using created_at (newest first).
do $$
begin
  if to_regclass('public.ampro_notes') is not null then
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'ampro_notes'
        and column_name = 'sort_order'
    ) then
      alter table public.ampro_notes
        add column sort_order integer not null default 0;

      create index if not exists ampro_notes_performance_sort_order_idx
        on public.ampro_notes(performance_id, sort_order);

      with ranked as (
        select id,
               row_number() over (partition by performance_id order by created_at desc, id asc) as rn
        from public.ampro_notes
      )
      update public.ampro_notes n
      set sort_order = ranked.rn
      from ranked
      where ranked.id = n.id;
    end if;
  end if;
end$$;

-- Add sort_order to ampro_corrections if the table exists and column missing.
-- (225 migration may already include it; this keeps things safe.)
do $$
begin
  if to_regclass('public.ampro_corrections') is not null then
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'ampro_corrections'
        and column_name = 'sort_order'
    ) then
      alter table public.ampro_corrections
        add column sort_order integer not null default 0;

      create index if not exists ampro_corrections_performance_sort_order_idx
        on public.ampro_corrections(performance_id, sort_order);

      with ranked as (
        select id,
               row_number() over (partition by performance_id order by correction_date desc, created_at desc, id asc) as rn
        from public.ampro_corrections
      )
      update public.ampro_corrections c
      set sort_order = ranked.rn
      from ranked
      where ranked.id = c.id;
    end if;
  end if;
end$$;
