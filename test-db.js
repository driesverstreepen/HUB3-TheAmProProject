import { supabase } from '@/lib/supabase';

async function testGroupDetails() {
  console.log('Testing group_details data...');

  // Check if there are any group_details
  const { data: groupDetails, error: gdError } = await supabase
    .from('group_details')
    .select('*')
    .limit(10);

  console.log('Group details found:', groupDetails);
  console.log('Group details error:', gdError);

  // Check group programs
  const { data: programs, error: progError } = await supabase
    .from('programs')
    .select('id, title, program_type')
    .eq('program_type', 'group')
    .limit(10);

  console.log('Group programs found:', programs);
  console.log('Programs error:', progError);

  // Check enrollments
  const { data: enrollments, error: enrollError } = await supabase
    .from('inschrijvingen')
    .select('id, program:programs(id, title, program_type)')
    .limit(10);

  console.log('Enrollments found:', enrollments);
  console.log('Enrollments error:', enrollError);
}

testGroupDetails();