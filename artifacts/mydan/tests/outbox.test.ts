import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {putAction,listActions,acknowledgeAction,migrateLegacyQueue,type OfflineAction} from '../src/lib/outbox-store.ts';
import {replayActions} from '../src/lib/outbox-replay.ts';
const make=(id:string):OfflineAction=>({id,type:'create_visit',companyId:'A',supervisorId:'S',userId:'U',createdAt:new Date().toISOString(),payload:{notes:`private-${id}`}});
test('encrypted records, concurrent append and per-action acknowledgement preserve newer work',async()=>{
 await Promise.all([putAction(make('first')),putAction(make('second'))]);
 const snapshot=await listActions('A','S');assert.equal(snapshot.length,2);
 await putAction(make('third'));await acknowledgeAction('first','other-company','S');assert.equal((await listActions('A','S')).length,3);
 await acknowledgeAction('first','A','S');assert.deepEqual((await listActions('A','S')).map(a=>a.id).sort(),['second','third']);
 assert.deepEqual(await listActions('B','S'),[]);
 await assert.rejects(putAction({...make('second'),payload:{notes:'overwrite'}}));
 assert.equal((await listActions('A','S')).find(a=>a.id==='second')?.payload.notes,'private-second');
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const req=indexedDB.open('mydan-local-work-v2',1);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
 const records=await new Promise<any[]>(resolve=>{const req=db.transaction('actions').objectStore('actions').getAll();req.onsuccess=()=>resolve(req.result);});db.close();
 assert.ok(records.every(r=>r.ciphertext && !r.payload));assert.ok(!JSON.stringify(records).includes('private-'));
});
test('legacy conversion retains other accounts and refuses malformed data',async()=>{
 const values=new Map<string,string>();const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)} as Storage;
 values.set('mydan_offline_queue_v1',JSON.stringify([make('legacy'),{...make('foreign'),companyId:'B'}]));
 assert.equal(await migrateLegacyQueue('A','S','U',storage),1);assert.equal(JSON.parse(values.get('mydan_offline_queue_v1')!).length,1);
 values.set('mydan_offline_queue_A_S','{corrupt');await assert.rejects(migrateLegacyQueue('A','S','U',storage));assert.equal(values.get('mydan_offline_queue_A_S'),'{corrupt');
});
test('lost response and session changes never acknowledge unconfirmed work',async()=>{
 const actions=[make('one'),make('two')],acked:string[]=[];
 const result=await replayActions({actions,userId:'U',companyId:'A',supervisorId:'S',assertIdentity:async()=>{},execute:async a=>{if(a.id==='one')throw new Error('response lost');},acknowledge:async a=>{acked.push(a.id);}});
 assert.equal(result.failedCount,1);assert.deepEqual(acked,['two']);
 let changed=false;acked.length=0;
 await assert.rejects(replayActions({actions,userId:'U',companyId:'A',supervisorId:'S',assertIdentity:async()=>{if(changed)throw new Error('session changed');},execute:async()=>{changed=true;},acknowledge:async a=>{acked.push(a.id);}}),/session changed/);
 assert.deepEqual(acked,[]);
});
