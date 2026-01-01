-- Add IBAN field to teacher compensation so studios can store payout details per teacher
-- Run this in Supabase SQL editor.

alter table public.teacher_compensation
  add column if not exists iban text;

-- Optional: basic sanity check constraint (kept permissive)
-- Note: this does NOT validate checksum; API also validates.
-- alter table public.teacher_compensation
--   add constraint teacher_compensation_iban_format
--   check (iban is null or iban ~ '^[A-Z]{2}[0-9A-Z]{13,32}$');
