-- Optional RLS policies to allow studio owner/admin to manage timesheet entries
-- ONLY while the related timesheet is in status = 'draft'.
--
-- This is NOT required if you keep using the server API routes (service role).
-- Apply only if you explicitly want to allow client-side insert/update/delete.

ALTER TABLE public.timesheet_entries ENABLE ROW LEVEL SECURITY;

-- Studio owner/admin can insert manual entries on draft timesheets
DROP POLICY IF EXISTS timesheet_entries_admin_insert_draft ON public.timesheet_entries;
CREATE POLICY timesheet_entries_admin_insert_draft
ON public.timesheet_entries
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.timesheets t
    JOIN public.studio_members sm ON sm.studio_id = t.studio_id
    WHERE t.id = timesheet_entries.timesheet_id
      AND t.status = 'draft'
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'admin')
  )
);

-- Studio owner/admin can update entries on draft timesheets
DROP POLICY IF EXISTS timesheet_entries_admin_update_draft ON public.timesheet_entries;
CREATE POLICY timesheet_entries_admin_update_draft
ON public.timesheet_entries
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.timesheets t
    JOIN public.studio_members sm ON sm.studio_id = t.studio_id
    WHERE t.id = timesheet_entries.timesheet_id
      AND t.status = 'draft'
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.timesheets t
    JOIN public.studio_members sm ON sm.studio_id = t.studio_id
    WHERE t.id = timesheet_entries.timesheet_id
      AND t.status = 'draft'
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'admin')
  )
);

-- Studio owner/admin can delete entries on draft timesheets
DROP POLICY IF EXISTS timesheet_entries_admin_delete_draft ON public.timesheet_entries;
CREATE POLICY timesheet_entries_admin_delete_draft
ON public.timesheet_entries
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.timesheets t
    JOIN public.studio_members sm ON sm.studio_id = t.studio_id
    WHERE t.id = timesheet_entries.timesheet_id
      AND t.status = 'draft'
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'admin')
  )
);
