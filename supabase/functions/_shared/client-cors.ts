/** Native WebViews use a local origin even though their API endpoint is remote. */
export function withClientCors(
  handler: (request: Request) => Response | Promise<Response>,
  webOrigins: string,
  sdkHeaders: Record<string, string>,
): (request: Request) => Promise<Response> {
  const allowed = new Set(['https://localhost', 'capacitor://localhost',
    ...webOrigins.split(',').map(value => value.trim().replace(/\/$/, '')).filter(value => value && value !== '*')]);
  return async request => {
    const origin = request.headers.get('Origin');
    const headers = new Headers(sdkHeaders);
    headers.delete('Access-Control-Allow-Origin');
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Vary', 'Origin');
    if (origin && !allowed.has(origin)) return new Response(JSON.stringify({error:'Origin not allowed'}), {
      status:403, headers:{'Content-Type':'application/json','Vary':'Origin'},
    });
    if (origin) headers.set('Access-Control-Allow-Origin', origin);
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers});
    const response = await handler(request);
    const merged = new Headers(response.headers);
    const vary = new Set((merged.get('Vary') ?? '').split(',').map(value=>value.trim()).filter(Boolean));
    vary.add('Origin');
    merged.delete('Access-Control-Allow-Origin');
    headers.forEach((value,key)=>merged.set(key,value));
    merged.set('Vary',[...vary].join(', '));
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers:merged});
  };
}
