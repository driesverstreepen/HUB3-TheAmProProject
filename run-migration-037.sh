#!/bin/bash

# Helper script to copy migration 037 to clipboard
cat supabase/migrations/037_create_timesheet_payroll_tables.sql | pbcopy
echo "✓ Migration 037 SQL is gekopieerd naar je clipboard!"
echo ""
echo "Volgende stappen:"
echo "1. Ga naar Supabase Dashboard → SQL Editor"
echo "2. Plak de SQL (Cmd+V)"
echo "3. Klik op 'Run' om de migratie uit te voeren"
echo ""
echo "Deze migratie creëert:"
echo "  • teacher_compensation tabel"
echo "  • timesheets tabel"
echo "  • timesheet_entries tabel"
echo "  • payrolls tabel"
echo "  • timesheet_comments tabel"
echo "  • Alle RLS policies"
