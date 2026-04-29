import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ybcqckpfbrziryhqscpu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InliY3Fja3BmYnJ6aXJ5aHFzY3B1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxNDczMjAsImV4cCI6MjA5MjcyMzMyMH0.kilVKcdwHzladbA5J7xxMxi-bOobXT_IYsxgdkTIvWs';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);