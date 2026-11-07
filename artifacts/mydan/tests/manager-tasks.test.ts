import test from 'node:test';
import assert from 'node:assert/strict';
import { managerTaskInput } from '../src/lib/manager-task-input.ts';
const id = '11111111-1111-4111-8111-111111111111';
test('manager task payload preserves stable identity and excludes worker-completion fields', () => {
  assert.deepEqual(managerTaskInput({ visitId:id,taskId:id,title:'  مراجعة التوزيع  ',kind:'other',mandatory:true,is_completed:true } as any), {
    p_visit_id:id,p_task_id:id,p_title_ar:'مراجعة التوزيع',p_task_type:'other',p_is_mandatory:true,
  });
});
test('manager task payload rejects financial types, invalid identities and malformed fields', () => {
  const valid={visitId:id,taskId:id,title:'مراجعة التوزيع',kind:'other',mandatory:false};
  for (const patch of [{kind:'order'},{kind:'unknown'},{title:'  '},{title:'x'.repeat(201)},{visitId:'not-an-id'},{taskId:''},{mandatory:'true'}]) {
    assert.throws(()=>managerTaskInput({...valid,...patch} as any));
  }
});
