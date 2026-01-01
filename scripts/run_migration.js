#!/usr/bin/env node

// Script to execute SQL migration via Supabase REST API
const fs = require('fs');
const path = require('path');

// Read environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

// Read the SQL file
const sqlFile = path.join(__dirname, '..', 'supabase', 'migrations', '034_allow_studio_admin_read_user_roles.sql');
const sql = fs.readFileSync(sqlFile, 'utf8');

console.log('Executing migration: 034_allow_studio_admin_read_user_roles.sql');
console.log('SQL:', sql);

// Execute via Supabase REST API using service role key
fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  },
  body: JSON.stringify({ query: sql })
})
.then(response => {
  console.log('Response status:', response.status);
  return response.text();
})
.then(text => {
  console.log('Response:', text);
  console.log('Migration completed!');
})
.catch(error => {
  console.error('Error executing migration:', error);
  process.exit(1);
});
