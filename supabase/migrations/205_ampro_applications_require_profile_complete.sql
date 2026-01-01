-- AmPro: require profile completeness to submit applications (RLS)

DROP POLICY IF EXISTS ampro_applications_insert_own ON public.ampro_applications;

create policy "ampro_applications_insert_own"
on public.ampro_applications
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.ampro_programmas p
    where p.id = performance_id and p.is_public = true
  )
  and exists (
    select 1
    from public.ampro_dancer_profiles dp
    where dp.user_id = auth.uid()
      and coalesce(trim(dp.first_name), '') <> ''
      and coalesce(trim(dp.last_name), '') <> ''
      and dp.birth_date is not null
      and coalesce(trim(dp.street), '') <> ''
      and coalesce(trim(dp.house_number), '') <> ''
      and coalesce(trim(dp.postal_code), '') <> ''
      and coalesce(trim(dp.city), '') <> ''
  )
);
