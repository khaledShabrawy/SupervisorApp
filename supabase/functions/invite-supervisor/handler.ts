import { verifiedTokenSession } from '../_shared/encoding.ts';
import { canManageCredentials, canProvision, requestedCompany } from '../_shared/authorization.ts';
// The entrypoint supplies the server client; tests supply a synthetic client. No client credentials here.
export function invitationHandler(admin: any, origin: string) {
  const headers={ 'Access-Control-Allow-Origin':origin, 'Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type', 'Content-Type':'application/json' };
  const reply=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{status,headers});
  const err=(status:number,error_ar:string)=>reply(status,{error_ar});
  const redirect=(value:unknown)=>{
    if (typeof value!=='string') return `${origin}/set-password`;
    try { const url=new URL(value); return url.origin===new URL(origin).origin && url.pathname.endsWith('/set-password') ? url.href : null; }
    catch { return null; }
  };
  const handle=async (req:Request):Promise<Response>=>{
    if(req.method==='OPTIONS') return new Response(null,{headers});
    if(req.method!=='POST') return err(405,'طريقة غير مسموحة.');
    const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');
    const auth=token ? await admin.auth.getUser(token) : {data:{user:null}};
    if(!auth.data.user) return err(401,'يلزم تسجيل الدخول.');
    const callerRes=await admin.from('supervisors').select('id,company_id,role,is_active,force_password_change').eq('user_id',auth.data.user.id).maybeSingle();
    const caller=callerRes.data;
    if(callerRes.error || !canProvision(caller)) return err(403,'هذه العملية لمسؤول شركة نشط فقط.');
    const company=await admin.from('companies').select('is_active,expires_at').eq('id',caller.company_id).maybeSingle();
    if(company.error || !company.data || (caller.role!=='super_admin' && (!company.data.is_active || (company.data.expires_at && Date.parse(company.data.expires_at)<=Date.now())))) return err(403,'الشركة غير متاحة.');
    let body:Record<string,unknown>;
    try { body=await req.json(); if(!body || Array.isArray(body)) throw new Error(); } catch { return err(400,'طلب غير صالح.'); }
    const action=String(body.action??'invite');
    if(!['invite','resend_invite','set_password'].includes(action)) return err(400,'إجراء غير معروف.');
    const companyId=requestedCompany(caller,body.company_id);
    if(!companyId) return err(403,'لا يمكنك إدارة شركة أخرى.');
    const redirectTo=redirect(body.redirect_to);
    if(!redirectTo) return err(400,'عنوان إعادة التوجيه غير مصرح به.');
    // Reject before creating or changing any Auth account if the reviewed server contract is absent.
    const contract=await admin.rpc('mdn_security_contract_version_v1');
    if(contract.error || contract.data!==1) return err(503,'تحديث الأمان المطلوب غير متاح. تواصل مع مسؤول النظام.');
    const sid=verifiedTokenSession(token!);
    if(!sid) return err(403,'معرف الجلسة غير متاح. أعد تسجيل الدخول.');
    const ready=await admin.rpc('mdn_identity_ready_v1',{p_user_id:auth.data.user.id,p_session_id:sid});
    if(ready.error || ready.data!==true) return err(403,'يلزم تحديث كلمة المرور أو اعتماد جلسة الحساب.');
    if(action==='resend_invite' || action==='set_password') {
      const targetRes=await admin.from('supervisors').select('id,user_id,company_id,role').eq('id',body.supervisor_id).eq('company_id',companyId).maybeSingle();
      const target=targetRes.data;
      if(targetRes.error || !target) return err(404,'المستخدم غير موجود.');
      if(!canManageCredentials(caller,target)) return err(403,'لا تملك صلاحية إدارة بيانات دخول هذا الحساب.');
      if(action==='resend_invite') {
        const user=await admin.auth.admin.getUserById(target.user_id);
        if(user.error || !user.data.user?.email) return err(400,'البريد الإلكتروني غير متوفر.');
        const result=await admin.auth.resetPasswordForEmail(user.data.user.email,{redirectTo});
        if(result.error) return err(502,'تعذر إرسال رابط الاستعادة. لم يُؤكد الإرسال؛ أعد المحاولة لاحقاً.');
        return reply(200,{success:true,message:'أُرسل طلب استعادة كلمة المرور عبر البريد.'});
      }
      const password=body.new_password;
      if(typeof password!=='string' || password.length<8 || password.length>128) return err(400,'كلمة المرور يجب أن تكون من 8 إلى 128 حرفاً.');
      const user=await admin.auth.admin.getUserById(target.user_id);
      if(user.error || !user.data.user) return err(404,'حساب الدخول غير موجود.');
      // Only Auth admins can write app_metadata. The Auth trigger consumes this marker atomically,
      // forces a subsequent password change and revokes registered device sessions.
      const result=await admin.auth.admin.updateUserById(target.user_id,{password,app_metadata:{
        ...user.data.user.app_metadata,mdn_admin_password_reset:true,mdn_password_reset_actor:auth.data.user.id,
      }});
      if(result.error) return err(502,'تعذر تعيين كلمة المرور.');
      return reply(200,{success:true,message:'تم تعيين كلمة مرور مؤقتة. يجب على المستخدم تغييرها عند الدخول.'});
    }
    const email=typeof body.email==='string' ? body.email.trim().toLowerCase() : '';
    const name=typeof body.full_name==='string' ? body.full_name.trim() : '';
    const role=typeof body.role==='string' ? body.role : 'supervisor';
    const branch=typeof body.branch_id==='string' && body.branch_id ? body.branch_id : null;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name || name.length>120) return err(400,'الاسم والبريد الإلكتروني غير صالحين.');
    if(!['supervisor','senior_supervisor','branch_manager','manager','admin'].includes(role)) return err(400,'دور غير مسموح.');
    const reservation=await admin.rpc('mdn_reserve_invitation_v1',{
      p_caller_user_id:auth.data.user.id,p_company_id:companyId,p_email:email,p_role:role,p_branch_id:branch,
    });
    if(reservation.error || !reservation.data) return err(409,'تعذر حجز مقعد الدعوة. تحقق من الشركة والفرع والحد المتاح.');
    const reservationId=reservation.data;
    const invited=await admin.auth.admin.inviteUserByEmail(email,{redirectTo,data:{full_name:name}});
    if(invited.error || !invited.data.user) {
      await admin.rpc('mdn_cancel_invitation_v1',{p_reservation_id:reservationId});
      return err(409,'تعذر إنشاء الدعوة. قد يكون البريد مسجلاً بالفعل؛ لم يتم إسناد حساب موجود لشركة أخرى.');
    }
    const permissions=body.permissions && typeof body.permissions==='object' && !Array.isArray(body.permissions) ? body.permissions : {};
    const profile=await admin.rpc('mdn_complete_invitation_v1',{p_reservation_id:reservationId,p_user_id:invited.data.user.id,
      p_full_name:name,p_phone:typeof body.phone==='string' ? body.phone.trim() : null,p_permissions:permissions});
    if(profile.error || !profile.data) {
      const removed=await admin.auth.admin.deleteUser(invited.data.user.id);
      await admin.rpc('mdn_cancel_invitation_v1',{p_reservation_id:reservationId});
      return err(500,removed.error ? 'لم تكتمل الدعوة. يلزم مراجعة حساب الدخول المحجوز مع المسؤول.' : 'تعذر إنشاء الملف والصلاحيات. لم تكتمل الدعوة.');
    }
    return reply(200,{supervisor_id:profile.data});
  };
  return async(req:Request)=>{try{return await handle(req);}catch{return err(500,'تعذر إتمام الطلب. تحقق من حالته قبل إعادة المحاولة.');}};
}
