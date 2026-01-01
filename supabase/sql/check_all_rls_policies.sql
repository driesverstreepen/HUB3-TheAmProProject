-- Check ALL RLS policies on the relevant tables to find blockers
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies 
WHERE tablename IN ('teacher_programs', 'programs', 'studios', 'lessons')
ORDER BY tablename, policyname;
