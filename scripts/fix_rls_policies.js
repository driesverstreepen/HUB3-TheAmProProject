#!/usr/bin/env node

// Script to fix user_profiles RLS policies
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function fixRLSPolicies() {
  try {
    console.log('Fixing user_profiles RLS policies...');

    // Drop existing policies
    await supabase.rpc('exec_sql', {
      query: `
        DROP POLICY IF EXISTS "user_profiles_select_own" ON public.user_profiles;
        DROP POLICY IF EXISTS "user_profiles_update_own" ON public.user_profiles;
        DROP POLICY IF EXISTS "user_profiles_insert_own" ON public.user_profiles;
      `
    });

    // Create new policies
    await supabase.rpc('exec_sql', {
      query: `
        CREATE POLICY "user_profiles_select_own" ON public.user_profiles
          FOR SELECT USING (auth.uid() = user_id);

        CREATE POLICY "user_profiles_insert_own" ON public.user_profiles
          FOR INSERT WITH CHECK (auth.uid() = user_id);

        CREATE POLICY "user_profiles_update_own" ON public.user_profiles
          FOR UPDATE USING (auth.uid() = user_id);
      `
    });

    console.log('RLS policies updated successfully!');
  } catch (error) {
    console.error('Error updating RLS policies:', error);
    process.exit(1);
  }
}

fixRLSPolicies();