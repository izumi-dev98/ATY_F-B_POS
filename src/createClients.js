import { createClient } from "@supabase/supabase-js";

// Test Server 
// https://gtvfahmaygedbdbzylxy.supabase.c
// sb_publishable_Z3rNkQLisZQe7kio7tzKfA_vaQKrc-z
const supabase = createClient("https://gtvfahmaygedbdbzylxy.supabase.co",
    "sb_publishable_Z3rNkQLisZQe7kio7tzKfA_vaQKrc-z"
);

export default supabase;