-- Check for programs without details
SELECT 
  p.id,
  p.title,
  p.program_type,
  CASE 
    WHEN p.program_type = 'group' THEN (SELECT COUNT(*) FROM group_details WHERE program_id = p.id)
    WHEN p.program_type = 'workshop' THEN (SELECT COUNT(*) FROM workshop_details WHERE program_id = p.id)
  END as details_count
FROM programs p
WHERE is_public = true;

-- Add missing group_details for group programs (example - adjust times as needed)
INSERT INTO group_details (program_id, weekday, start_time, end_time, season_start, season_end)
SELECT 
  p.id,
  1, -- Monday (adjust as needed)
  '19:00:00'::time, -- Default start time
  '20:30:00'::time, -- Default end time
  '2025-09-01'::date, -- Season start
  '2026-06-30'::date  -- Season end
FROM programs p
WHERE p.program_type = 'group'
  AND NOT EXISTS (SELECT 1 FROM group_details WHERE program_id = p.id);

-- Add missing workshop_details for workshop programs (example - adjust dates as needed)
INSERT INTO workshop_details (program_id, date, start_time, end_time)
SELECT 
  p.id,
  '2025-11-15'::date, -- Workshop date
  '14:00:00'::time, -- Workshop start time
  '16:00:00'::time  -- Workshop end time
FROM programs p
WHERE p.program_type = 'workshop'
  AND NOT EXISTS (SELECT 1 FROM workshop_details WHERE program_id = p.id);
