const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Environment variables not set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

(async () => {
  const { data, error } = await supabase.from('user_roles').insert({
    user_id: 'aac9dd28-3b67-4f17-a093-dfa4947a73fa',
    studio_id: 'd517cb28-f65f-4785-a2d6-18c62cd3d115',
    role: 'studio_admin'
  });
  if (error) {
    console.error('Error inserting role:', error);
  } else {
    console.log('Role inserted successfully:', data);
  }
  process.exit(0);
})();