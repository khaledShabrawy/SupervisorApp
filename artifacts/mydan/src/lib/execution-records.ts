export type CountTargetInput = {
  supervisor_id: string; month: number; year: number;
  visits_target: number; audit_target: number;
};
export function countTargetRecord(input: CountTargetInput) {
  if (!input.supervisor_id?.trim() || !Number.isInteger(input.month) || input.month < 1 || input.month > 12
    || !Number.isInteger(input.year) || input.year < 2000 || input.year > 9999
    || ![input.visits_target, input.audit_target]
      .every(n => Number.isSafeInteger(n) && n >= 0 && n <= 2_147_483_647)) {
    throw new Error('قيم الأهداف غير صالحة.');
  }
  return {
    supervisor_id: input.supervisor_id, month: input.month, year: input.year,
    visits_target: input.visits_target, audit_target: input.audit_target,
  };
}