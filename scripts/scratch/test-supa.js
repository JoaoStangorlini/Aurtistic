require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  console.log("Fetching...");
  try {
    const { data, error } = await supabase.from('tasks').select('*').limit(1);
    console.log("Data:", data, "Error:", error);
  } catch (err) {
    console.error("Crash:", err);
  }
}
test();
