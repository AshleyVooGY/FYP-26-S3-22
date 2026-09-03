import { createClient } from
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = "https://xqcastmsficshjnwyqmk.supabase.co";
const supabasePublishableKey = "sb_publishable_QHMFKYuGU2cfox4RC4GShg_9I4uGJcE";

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey
);