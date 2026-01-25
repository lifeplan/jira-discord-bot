import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

// Supabase 클라이언트 생성
export const supabase = createClient(config.supabase.url, config.supabase.anonKey);

console.log('Supabase client initialized');
