-- Add optional extra metadata to AmPro performances

ALTER TABLE public.ampro_programmas
  ADD COLUMN IF NOT EXISTS rehearsal_period_start date,
  ADD COLUMN IF NOT EXISTS rehearsal_period_end date,
  ADD COLUMN IF NOT EXISTS performance_dates date[],
  ADD COLUMN IF NOT EXISTS region text;
