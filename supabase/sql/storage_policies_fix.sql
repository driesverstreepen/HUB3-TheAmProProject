-- Storage policies voor user_avatars bucket
DROP POLICY IF EXISTS "user_avatars_authenticated_upload" ON storage.objects;
DROP POLICY IF EXISTS "user_avatars_own_update" ON storage.objects;
DROP POLICY IF EXISTS "user_avatars_own_delete" ON storage.objects;
DROP POLICY IF EXISTS "user_avatars_public_select" ON storage.objects;

-- Upload policy (vereenvoudigd)
CREATE POLICY "user_avatars_authenticated_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'user_avatars' AND
    auth.role() = 'authenticated'
  );

-- Update policy (vereenvoudigd)  
CREATE POLICY "user_avatars_own_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'user_avatars' AND
    auth.role() = 'authenticated'
  );

-- Delete policy (vereenvoudigd)
CREATE POLICY "user_avatars_own_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'user_avatars' AND
    auth.role() = 'authenticated'
  );

-- Select policy (blijft hetzelfde)
CREATE POLICY "user_avatars_public_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'user_avatars');
