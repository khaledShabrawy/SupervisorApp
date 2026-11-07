import test from 'node:test';
import assert from 'node:assert/strict';
import { completeVisitTaskOnce, finishVisitOnce } from '../src/lib/visit-task-completion.ts';

const actor={companyId:'company-a',supervisorId:'worker'};
function fixture(options:{lostResponse?:boolean;lostRead?:boolean;closed?:boolean;foreignOwner?:boolean;foreignCompany?:boolean;lostCheckout?:boolean;lostCheckoutRead?:boolean}={}) {
  const task={id:'task',visit_id:'visit',company_id:'company-a',is_completed:!!options.closed,completed_at:options.closed?'2026-11-06T10:00:00Z':null as string|null};
  const visit={id:'visit',company_id:options.foreignCompany?'company-b':'company-a',supervisor_id:options.foreignOwner?'colleague':'worker',status:options.closed?'completed':'in_progress',check_out_time:options.closed?'2026-11-06T10:00:00Z':null as string|null};
  const profile={id:'worker',user_id:'auth-user',company_id:'company-a',is_active:true,role:options.foreignOwner?'admin':'supervisor'};
  let writes=0,taskReads=0,lost=options.lostResponse,readLost=options.lostRead,checkoutLost=options.lostCheckout,checkoutReadLost=options.lostCheckoutRead;
  const client={
    auth:{getUser:async()=>({data:{user:{id:'auth-user'}},error:null})},
    from(table:string){
      const filters:Record<string,unknown>={};let patch:Record<string,unknown>|undefined;
      const q={
        select(){return q;},eq(name:string,value:unknown){filters[name]=value;return q;},
        update(values:Record<string,unknown>){patch=values;return q;},in(name:string,values:unknown[]){filters[name]=values;return q;},
        async single(){return run();},async maybeSingle(){return run();},
      };
      async function run(){
        const row=table==='supervisors'?profile:table==='visits'?visit:task;
        if(table==='visit_tasks'&&!patch){taskReads++;if(readLost){readLost=false;return{data:null,error:new Error('Synthetic offline receipt')};}}
        if(table==='visits'&&!patch&&visit.status==='completed'&&checkoutReadLost){checkoutReadLost=false;return{data:null,error:new Error('Synthetic checkout receipt lost')};}
        if(!Object.entries(filters).every(([key,value])=>Array.isArray(value)?value.includes(row[key as keyof typeof row]):row[key as keyof typeof row]===value))return{data:null,error:null};
        if(table==='visits'&&patch){writes++;Object.assign(visit,patch);if(checkoutLost){checkoutLost=false;return{data:null,error:new Error('Synthetic committed checkout response lost')};}}
        if(table==='visit_tasks'&&patch){
          writes++;task.is_completed=true;task.completed_at='2026-11-06T09:30:00Z';
          if(lost){lost=false;return{data:null,error:new Error('Synthetic lost committed response')};}
        }
        return{data:{...row},error:null};
      }
      return q;
    },
  };
  return{client,task,visit,stats:()=>({writes,taskReads})};
}

test('task completion recovers a lost committed response without replacing the server timestamp',async()=>{
  const f=fixture({lostResponse:true});const result=await completeVisitTaskOnce(f.client,actor,'task','visit');
  assert.equal(result.is_completed,true);assert.equal(result.completed_at,'2026-11-06T09:30:00Z');assert.equal(f.stats().writes,1);
});
test('a retained completion can be acknowledged after visit checkout without a second write',async()=>{
  const f=fixture({lostResponse:true,lostRead:true});
  await assert.rejects(completeVisitTaskOnce(f.client,actor,'task','visit'),/lost committed/);
  f.visit.status='completed';
  const result=await completeVisitTaskOnce(f.client,actor,'task','visit');
  assert.equal(result.is_completed,true);assert.equal(f.stats().writes,1);assert.equal(result.completed_at,'2026-11-06T09:30:00Z');
});
test('even an admin cannot acknowledge a completed colleague task as their own offline action',async()=>{
  const f=fixture({closed:true,foreignOwner:true});
  await assert.rejects(completeVisitTaskOnce(f.client,actor,'task','visit'));
  assert.deepEqual(f.stats(),{writes:0,taskReads:0});
});
test('task receipts from a foreign company or an unfinished closed visit are rejected',async()=>{
  const foreign=fixture({closed:true,foreignCompany:true});
  await assert.rejects(completeVisitTaskOnce(foreign.client,actor,'task','visit'));
  const unfinished=fixture({closed:true});unfinished.task.is_completed=false;
  await assert.rejects(completeVisitTaskOnce(unfinished.client,actor,'task','visit'),/إغلاق/);
  assert.equal(unfinished.stats().writes,0);
});

test('checkout replay recovers the exact original closed visit after both acknowledgements were lost',async()=>{
  const f=fixture({lostCheckout:true,lostCheckoutRead:true});
  await assert.rejects(finishVisitOnce(f.client,actor,'visit','completed','2026-11-06T10:00:00Z'),/committed checkout/);
  const result=await finishVisitOnce(f.client,actor,'visit','completed','2026-11-06T12:00:00+02:00');
  assert.equal(result.status,'completed');assert.equal(result.check_out_time,'2026-11-06T10:00:00Z');assert.equal(f.stats().writes,1);
  await assert.rejects(finishVisitOnce(f.client,actor,'visit','completed','2026-11-06T11:00:00Z'),/does not match/);
});
