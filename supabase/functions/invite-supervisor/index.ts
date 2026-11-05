import { withClientCors } from '../_shared/client-cors.ts';
import { corsHeaders as sdkCorsHeaders } from 'npm:@supabase/supabase-js@2.117.2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { invitationHandler } from './handler.ts';
const origin=Deno.env.get('ALLOWED_ORIGIN') ?? 'https://mydan.digityoucan.com';
Deno.serve(withClientCors(invitationHandler(createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{
  auth:{persistSession:false,autoRefreshToken:false},
}),origin),origin,sdkCorsHeaders));
