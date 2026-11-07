import { withMutationReceipt, sameInstant } from './mutation-receipt.ts';

export type ActorScope = {companyId:string;supervisorId:string};
type Completion = {id:string;visit_id:string;company_id:string;is_completed:boolean;completed_at?:string|null};
/** Scope proof shared by task completion and visit checkout; never accepts a colleague receipt. */
async function verifiedOwnVisit(client:any, actor:ActorScope, visitId:string) {
  const failure = () => Object.assign(new Error('تعذر التحقق من ملكية مهمة الزيارة.'),{code:'42501'});
  const {data:auth,error:authError}=await client.auth.getUser();
  if(authError || !auth?.user?.id) throw authError ?? failure();
  const {data:profile,error:profileError}=await client.from('supervisors').select('id,user_id,company_id,is_active,role')
    .eq('id',actor.supervisorId).eq('company_id',actor.companyId).eq('user_id',auth.user.id).single();
  if(profileError || !profile || profile.id!==actor.supervisorId || profile.user_id!==auth.user.id
    || profile.company_id!==actor.companyId || profile.is_active!==true
    || !['supervisor','senior_supervisor','branch_manager','admin','super_admin'].includes(profile.role)) throw profileError ?? failure();
  const {data:visit,error:visitError}=await client.from('visits').select('id,company_id,supervisor_id,status,check_out_time')
    .eq('id',visitId).eq('company_id',actor.companyId).eq('supervisor_id',actor.supervisorId).single();
  if(visitError || !visit || visit.id!==visitId || visit.company_id!==actor.companyId || visit.supervisor_id!==actor.supervisorId) throw visitError ?? failure();
  return visit;
}

/** A task receipt is meaningful only for the current authenticated owner of its visit. */
export async function completeVisitTaskOnce(client:any, actor:ActorScope, taskId:string, visitId:string):Promise<Completion> {
  const visit=await verifiedOwnVisit(client,actor,visitId);
  const read=()=>client.from('visit_tasks').select('id,visit_id,company_id,is_completed,completed_at')
    .eq('id',taskId).eq('visit_id',visitId).eq('company_id',actor.companyId).maybeSingle();
  const matches=(row:Completion)=>row.id===taskId && row.visit_id===visitId && row.company_id===actor.companyId && row.is_completed===true;
  if(visit.status!=='in_progress') {
    // A lost response may be replayed after checkout. Read the original result;
    // never overwrite timestamps or pretend an incomplete task was completed.
    const receipt=await read();
    if(!receipt.error && receipt.data && matches(receipt.data)) return receipt.data;
    throw receipt.error ?? Object.assign(new Error('لا يمكن إنجاز مهمة بعد إغلاق الزيارة.'),{code:'22023'});
  }
  return withMutationReceipt<Completion>(
    async()=>{
      const result=await client.from('visit_tasks').update({is_completed:true,completed_at:new Date().toISOString()})
        .eq('id',taskId).eq('visit_id',visitId).eq('company_id',actor.companyId).eq('is_completed',false)
        .select('id,visit_id,company_id,is_completed,completed_at').single();
      return !result.error && result.data && !matches(result.data)
        ? {data:null,error:new Error('لم يتأكد إيصال إنجاز المهمة.')} : result;
    },
    read,matches,
  );
}

/** Stable checkout timestamps reconcile a lost response even after the visit closed. */
export async function finishVisitOnce(client:any,actor:ActorScope,visitId:string,status:'completed'|'skipped',checkOut:string|null) {
  const visit=await verifiedOwnVisit(client,actor,visitId);
  if(!['completed','skipped'].includes(status) || (status==='completed' && (!checkOut || !Number.isFinite(Date.parse(checkOut))))) {
    throw Object.assign(new Error('Invalid visit status payload'),{code:'22023'});
  }
  const matches=(row:any)=>row.id===visitId && row.company_id===actor.companyId && row.supervisor_id===actor.supervisorId
    && row.status===status && (status!=='completed'||sameInstant(row.check_out_time,checkOut));
  if(!['pending','in_progress'].includes(visit.status)) {
    if(matches(visit)) return visit;
    throw Object.assign(new Error('Closed visit does not match this queued action'),{code:'22023'});
  }
  const columns='id,company_id,supervisor_id,status,check_out_time';
  return withMutationReceipt<any>(
    async()=>{
      const result=await client.from('visits').update(status==='completed'?{status,check_out_time:checkOut}:{status})
        .eq('id',visitId).eq('company_id',actor.companyId).eq('supervisor_id',actor.supervisorId)
        .in('status',['pending','in_progress']).select(columns).single();
      return !result.error && result.data && !matches(result.data)?{data:null,error:new Error('Visit status receipt is incomplete')}:result;
    },
    ()=>client.from('visits').select(columns).eq('id',visitId).eq('company_id',actor.companyId)
      .eq('supervisor_id',actor.supervisorId).maybeSingle(),matches,
  );
}
