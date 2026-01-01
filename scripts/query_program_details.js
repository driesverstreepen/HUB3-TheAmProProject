const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const programId = process.argv[2] || '05adf30a-5839-458e-9fd4-f6c66585c960';

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

(async function() {
  console.log('Querying details for program:', programId);

  const { data: group, error: gErr } = await supabase
    .from('group_details')
    .select('*')
    .eq('program_id', programId);
  if (gErr) console.error('group_details error:', gErr.message || gErr);
  else console.log('group_details:', JSON.stringify(group, null, 2));

  const { data: workshop, error: wErr } = await supabase
    .from('workshop_details')
    .select('*')
    .eq('program_id', programId);
  if (wErr) console.error('workshop_details error:', wErr.message || wErr);
  else console.log('workshop_details:', JSON.stringify(workshop, null, 2));

  process.exit(0);
})();
