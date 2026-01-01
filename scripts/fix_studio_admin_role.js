// Fix studio_admin role for user
// This script adds the studio_admin role to the user_roles table

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const userId = 'aac9dd28-3b67-4f17-a093-dfa4947a73fa';
const studioId = 'd517cb28-f65f-4785-a2d6-18c62cd3d115';

async function fixStudioAdminRole() {
  console.log('Checking current role for user:', userId);
  
  // Check current role
  const { data: currentRole, error: checkError } = await supabase
    .from('user_roles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (checkError) {
    console.error('Error checking current role:', checkError);
    return;
  }

  console.log('Current role:', currentRole);

  // Insert or update the role
  const { data: updatedRole, error: upsertError } = await supabase
    .from('user_roles')
    .upsert({
      user_id: userId,
      role: 'studio_admin',
      studio_id: studioId,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id'
    })
    .select()
    .single();

  if (upsertError) {
    console.error('Error upserting role:', upsertError);
    return;
  }

  console.log('✅ Role updated successfully:', updatedRole);

  // Verify the change
  const { data: verifyRole, error: verifyError } = await supabase
    .from('user_roles')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (verifyError) {
    console.error('Error verifying role:', verifyError);
    return;
  }

  console.log('✅ Verified role:', verifyRole);
}

fixStudioAdminRole().catch(console.error);
