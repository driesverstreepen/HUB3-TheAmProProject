-- Policies for replacement_requests

-- Enable select for studio_admins and the requester
REVOKE ALL ON TABLE public.replacement_requests FROM public;

-- Allow studio_admins to select/insert/update/delete
CREATE POLICY replacement_requests_admin_select ON public.replacement_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'studio_admin' AND ur.studio_id = public.replacement_requests.studio_id
    )
  );

CREATE POLICY replacement_requests_admin_modify ON public.replacement_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'studio_admin' AND ur.studio_id = public.replacement_requests.studio_id
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'studio_admin' AND ur.studio_id = public.replacement_requests.studio_id
    )
  );

-- Separate DELETE policy: DELETE policies do not support WITH CHECK, so we define delete-only policy
CREATE POLICY replacement_requests_admin_delete ON public.replacement_requests
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'studio_admin' AND ur.studio_id = public.replacement_requests.studio_id
    )
  );

-- Allow teachers/requesters to insert their own request if they are assigned to the program (or are studio_admin)
CREATE POLICY replacement_requests_insert ON public.replacement_requests
  FOR INSERT WITH CHECK (
    (
      -- requester must be the authenticated user
      requested_by = auth.uid()
    ) AND (
      -- either a studio_admin for the studio OR a teacher assigned to program_id
      EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'studio_admin' AND ur.studio_id = studio_id)
      OR (
        program_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.teacher_programs tp WHERE tp.teacher_id = auth.uid() AND tp.program_id = program_id)
      )
    )
  );

-- Allow requester to select their own requests
CREATE POLICY replacement_requests_requester_select ON public.replacement_requests
  FOR SELECT USING (requested_by = auth.uid());

-- Allow requester to delete their pending request
CREATE POLICY replacement_requests_requester_delete ON public.replacement_requests
  FOR DELETE USING (requested_by = auth.uid() AND status = 'pending');

-- Note: admin approval/decline should be performed via a server-side route that verifies studio_admin role
