
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oocyvbexigpaqgucqcwc.supabase.co';
const supabaseAnonKey = 'sb_publishable_UE3CY9AkCcnRTPNVyvPQaQ_2DNwzY_w';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
