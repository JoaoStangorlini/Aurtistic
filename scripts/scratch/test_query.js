const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const userId = 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e';
  
  let query = supabase.from('tasks').select('*');
  query = query.or(`user_id.eq.${userId},is_personal.is.null,is_personal.eq.false`);
  
  const { data, error } = await query;
  
  console.log("Total tasks fetched:", data ? data.length : 0);
  if (error) console.error("Error:", error);
  
  if (data) {
    const ortega = data.find(t => t.nome === 'Reunião com o ortega');
    console.log("Found Ortega:", ortega);
  }
}

run();
