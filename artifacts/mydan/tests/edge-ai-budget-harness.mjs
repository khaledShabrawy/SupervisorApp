import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../../supabase/functions/_shared/ai-budget.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
export function budgetGlobals(environment) {
  const exports = {};
  vm.runInNewContext(compiled, { exports, Deno: { env: { get: name => environment[name] } }, AbortSignal });
  return exports;
}

// Simulates RPC receipts only. PostgreSQL tests separately enforce real quotas,
// tenant checks, atomic company locking and service-role-only authorization.
export function attachLedger(admin, calls, options = {}) {
  calls.claims = []; calls.finishes = []; calls.accountingSignals = [];
  if (options.rpcMissing) return;
  admin.rpc = (name, parameters) => ({
    abortSignal(signal) {
      calls.accountingSignals.push(signal);
      if (name === 'mdn_claim_ai_attempt_v1') {
        const index = calls.claims.push(parameters) - 1;
        if (options.claimRpcReject === index) return Promise.reject(new Error('Synthetic accounting network failure'));
        const error = options.claimRpcErrors?.[index] ?? null;
        const zeroQuota = parameters.p_max_company_day === 0 || parameters.p_max_user_hour === 0 || parameters.p_max_concurrent === 0;
        const data = Object.hasOwn(options, 'claimRpcData') ? options.claimRpcData : `aaaaaaaa-aaaa-4aaa-8aaa-${(index + 1).toString(16).padStart(12, '0')}`;
        return Promise.resolve({ data: error || zeroQuota ? null : data, error: error ?? (zeroQuota ? {code:'P0001',message:'AI_QUOTA_COMPANY_DAY'} : null) });
      }
      if (name === 'mdn_finish_ai_attempt_v1') {
        const index = calls.finishes.push(parameters) - 1;
        if (options.finishRpcReject === index) return Promise.reject(new Error('Synthetic finish network failure'));
        return Promise.resolve({ data: options.finishRpcData ?? true, error: options.finishRpcError ?? null });
      }
      throw new Error('Unexpected RPC name');
    },
  });
}
