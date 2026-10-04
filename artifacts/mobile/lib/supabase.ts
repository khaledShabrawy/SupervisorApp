import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { validateSupabaseConfiguration } from './supabase-config';

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

export const supabaseConfiguration = validateSupabaseConfiguration(supabaseUrl, supabaseAnonKey);
export const isSupabaseConfigured = supabaseConfiguration.isValid;

// Only create the client when credentials are present — createClient throws
// if supabaseUrl is an empty string.
export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        storage: AsyncStorage as any,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : (null as unknown as SupabaseClient);
