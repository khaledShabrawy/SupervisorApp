// Shared with local regression tests; no database or browser dependencies.
export type ManagerTaskDraft = {
  visitId: string; taskId: string; title: string;
  kind: 'shelf_audit' | 'competitor_check' | 'survey' | 'other'; mandatory: boolean;
};
export function managerTaskInput(draft: ManagerTaskDraft) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(draft.visitId) || !uuid.test(draft.taskId)
    || !['shelf_audit','competitor_check','survey','other'].includes(draft.kind)
    || typeof draft.title !== 'string' || draft.title.trim().length < 1 || draft.title.trim().length > 200
    || typeof draft.mandatory !== 'boolean') throw new Error('Invalid manager task fields');
  return {p_visit_id:draft.visitId,p_task_id:draft.taskId,p_title_ar:draft.title.trim(),p_task_type:draft.kind,p_is_mandatory:draft.mandatory};
}
