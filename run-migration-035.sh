#!/bin/bash

# Dit script past de RLS policies toe voor teachers en program_locations
# 
# Gebruik:
# 1. Ga naar Supabase Dashboard -> SQL Editor
# 2. Kopieer de inhoud van supabase/migrations/035_add_teacher_access_policies.sql
# 3. Plak en run de query
#
# Of run dit script na supabase login:
# chmod +x run-migration-035.sh
# ./run-migration-035.sh

echo "============================================"
echo "RLS Policies voor Teachers toepassen"
echo "============================================"
echo ""
echo "Ga naar: https://supabase.com/dashboard/project/_/sql"
echo ""
echo "Kopieer en plak de volgende SQL:"
echo ""
cat supabase/migrations/035_add_teacher_access_policies.sql
echo ""
echo "============================================"
echo "Druk op ENTER om de SQL naar clipboard te kopiëren..."
read
cat supabase/migrations/035_add_teacher_access_policies.sql | pbcopy
echo "✓ SQL gekopieerd naar clipboard!"
echo "Plak nu in Supabase SQL Editor en klik op 'Run'"
