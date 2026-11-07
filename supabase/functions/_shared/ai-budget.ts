// Prospective server contract: deploy only after the reviewed ledger/RPC SQL.
// Every provider request, including candidate retries and fallback, needs a fresh
// reservation. Missing or ambiguous accounting always stops further spending.
export const AI_PROVIDER_TIMEOUT_MS = 25_000;

export class AiBudgetError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "AiBudgetError";
  }
}

type BudgetScope = {
  companyId: string;
  supervisorId: string; // the authenticated actor, not necessarily the record owner
  operation: "analyze-shelf" | "discover-customers";
  recordId: string;
};
type RpcResponse = { data: unknown; error: { code?: string; message?: string } | null };
type RpcClient = { rpc(name: string, parameters: Record<string, unknown>): { abortSignal(signal: AbortSignal): PromiseLike<RpcResponse> } };
const ACCOUNTING_TIMEOUT_MS = 10_000;
async function account(client: RpcClient, name: string, parameters: Record<string, unknown>): Promise<RpcResponse> {
  const start = Date.now();
  const response = await client.rpc(name, parameters).abortSignal(AbortSignal.timeout(ACCOUNTING_TIMEOUT_MS));
  // A stalled event loop must not turn a delayed response into a stale lease.
  if (Date.now() - start >= ACCOUNTING_TIMEOUT_MS) throw new Error("Accounting response exceeded its deadline");
  return response;
}
export type AiBudget = { run<T>(provider: "google-gemini" | "anthropic", request: () => Promise<T>): Promise<T> };

function limit(primary: string, legacy: string, fallback: string): number {
  const raw = Deno.env.get(primary) ?? Deno.env.get(legacy) ?? fallback;
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > 2_147_483_647) {
    throw new AiBudgetError(503, "تعذر التحقق من حدود التحليل. أعد المحاولة لاحقًا.");
  }
  return Number(raw);
}

export function createAiBudget(client: RpcClient, scope: BudgetScope): AiBudget {
  // Project-wide values are shared by both functions. Legacy names remain
  // compatible, but now cap provider attempts across both operations together.
  const limits = {
    p_max_company_day: limit("MAX_AI_ATTEMPTS_PER_DAY", "MAX_AUDITS_PER_DAY", "100"),
    p_max_user_hour: limit("MAX_AI_ATTEMPTS_PER_HOUR_USER", "MAX_AUDITS_PER_HOUR_USER", "20"),
    p_max_concurrent: limit("MAX_CONCURRENT_AI_ATTEMPTS", "MAX_CONCURRENT_AUDITS", "5"),
  };
  return {
    async run<T>(provider: "google-gemini" | "anthropic", request: () => Promise<T>): Promise<T> {
      let reservation;
      try {
        reservation = await account(client, "mdn_claim_ai_attempt_v1", {
          p_company_id: scope.companyId, p_supervisor_id: scope.supervisorId,
          p_operation: scope.operation, p_record_id: scope.recordId, p_provider: provider,
          ...limits,
        });
      } catch {
        throw new AiBudgetError(503, "تعذر حجز محاولة التحليل. أعد المحاولة لاحقًا.");
      }
      if (reservation.error) {
        const code = reservation.error.code;
        const message = reservation.error.message ?? "";
        if (code === "P0001" && /^AI_QUOTA_(COMPANY_DAY|USER_HOUR|CONCURRENT)$/.test(message)) {
          throw new AiBudgetError(429, "تم بلوغ حد محاولات التحليل. أعد المحاولة لاحقًا.");
        }
        if (code === "P0001" && message === "AI_ATTEMPT_IN_PROGRESS") {
          throw new AiBudgetError(409, "توجد محاولة تحليل قيد التنفيذ لهذا السجل.");
        }
        throw new AiBudgetError(503, "تعذر حجز محاولة التحليل. أعد المحاولة لاحقًا.");
      }
      const attemptId = reservation.data;
      if (typeof attemptId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(attemptId)) {
        throw new AiBudgetError(503, "لم يتأكد حجز محاولة التحليل. أعد المحاولة لاحقًا.");
      }
      const finish = async (status: "succeeded" | "failed") => {
        let result;
        try {
          result = await account(client, "mdn_finish_ai_attempt_v1", { p_attempt_id: attemptId, p_status: status, p_company_id: scope.companyId, p_supervisor_id: scope.supervisorId });
        } catch {
          throw new AiBudgetError(503, "تعذر تأكيد تسجيل محاولة التحليل. تحقق من السجل قبل إعادة المحاولة.");
        }
        if (result.error || result.data !== true) {
          throw new AiBudgetError(503, "تعذر تأكيد تسجيل محاولة التحليل. تحقق من السجل قبل إعادة المحاولة.");
        }
      };
      let value: T;
      try {
        value = await request();
      } catch (error) {
        // Failed and timed-out requests still count. If accounting is unavailable,
        // retain its lease and block all fallback instead of spending ambiguously.
        await finish("failed");
        throw error;
      }
      await finish("succeeded");
      return value;
    },
  };
}
