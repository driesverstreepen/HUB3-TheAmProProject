#!/usr/bin/env node

// Check current RLS policies for user_profiles
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function checkPolicies() {
  try {
    console.log('Checking current RLS policies for user_profiles...');

    // Try to query the policies (this might not work, but let's try)
    const { data, error } = await supabase
      .from('pg_policies')
      .select('*')
      .eq('tablename', 'user_profiles');

    if (error) {
      console.error('Could not query policies:', error.message);
    } else {
      console.log('Current policies:');
      console.log(JSON.stringify(data, null, 2));
    }

    // Try a simple test query to see if RLS is working
    console.log('\nTesting profile access...');
    const { data: profileData, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .limit(1);

    if (profileError) {
      console.log('Profile query error:', profileError.message);
    } else {
      console.log('Profile query successful');
    }

  } catch (err) {
    console.error('Error:', err);
  }
}

checkPolicies();