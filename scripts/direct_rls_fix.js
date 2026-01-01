#!/usr/bin/env node

// Direct SQL execution for RLS policy fixes
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function executeSQL(sql) {
  try {
    const { data, error } = await supabase.rpc('exec_sql', { query: sql });
    if (error) {
      console.error('SQL Error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Execution error:', err);
    return false;
  }
}

async function fixRLSPolicies() {
  console.log('Starting RLS policy fixes...');

  // Drop existing policies one by one
  const dropQueries = [
    'DROP POLICY IF EXISTS "user_profiles_select_own" ON public.user_profiles;',
    'DROP POLICY IF EXISTS "user_profiles_update_own" ON public.user_profiles;',
    'DROP POLICY IF EXISTS "user_profiles_insert_own" ON public.user_profiles;'
  ];

  for (const query of dropQueries) {
    console.log('Executing:', query);
    const success = await executeSQL(query);
    if (!success) {
      console.log('Failed to drop policy, continuing...');
    }
  }

  // Create new policies
  const createQueries = [
    `CREATE POLICY "user_profiles_select_own" ON public.user_profiles FOR SELECT USING (auth.uid() = user_id);`,
    `CREATE POLICY "user_profiles_insert_own" ON public.user_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);`,
    `CREATE POLICY "user_profiles_update_own" ON public.user_profiles FOR UPDATE USING (auth.uid() = user_id);`
  ];

  for (const query of createQueries) {
    console.log('Executing:', query);
    const success = await executeSQL(query);
    if (!success) {
      console.error('Failed to create policy');
      process.exit(1);
    }
  }

  console.log('RLS policies updated successfully!');
}

fixRLSPolicies().catch(console.error);