import {supabase} from '../../src/lib/supabase';
import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AuthProvider, useAuth} from '../../src/contexts/AuthContext';
import {useDeviceBinding} from '../../src/lib/device-binding';
function Harness(){
 const auth=useAuth(); const binding=useDeviceBinding(auth.supervisor);
 return <><output data-testid="identity">{auth.isLoading?'loading':auth.supervisor?`${auth.supervisor.full_name}:${auth.supervisor.force_password_change}`:'signed-out'}</output>
 <output data-testid="error">{auth.error}</output><output data-testid="binding">{binding.status}</output>
 <button onClick={()=>auth.signIn('fixture@example.test','synthetic-password').catch(()=>{})}>sign in</button>
 <button onClick={()=>auth.signOut().catch(()=>{})}>sign out</button>
 <button onClick={()=>supabase.auth.refreshSession()}>refresh token</button>
 <button onClick={()=>auth.retryProfile()}>revalidate</button></>;
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient()}><AuthProvider><Harness/></AuthProvider></QueryClientProvider>);
