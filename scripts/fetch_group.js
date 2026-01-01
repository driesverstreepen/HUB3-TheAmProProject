const { createClient } = require('@supabase/supabase-js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || process.env.SUPABASE_URL_LOCAL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in the environment.');
  process.exit(1);
}

const supabase = createClient(url, key);

(async () => {
  try {
    const groupId = '487d2d2a-e83b-44f5-8b41-6979eaf8ead6';
    console.log('Fetching group_details for id', groupId);
    const { data, error } = await supabase.from('group_details').select('*').eq('id', groupId).maybeSingle();
    if (error) {
      console.error('Supabase error:', error);
      process.exit(1);
    }
    console.log('Row result:');
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Unexpected error:', err);
    process.exit(1);
  }
})();
