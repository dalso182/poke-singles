import type { Provider } from '@angular/core';
import { SupabaseService } from '../core/supabase/supabase.service';

/**
 * Hand-rolled SupabaseService fake for specs.
 *
 * Deliberately does NOT import from `vitest`: tsconfig.app.json type-checks
 * every non-spec file under src/, so this helper must compile as app code.
 * Call recording is plain arrays; configure responses with setRpc/setTable.
 */

export interface FakeResult {
  data?: unknown;
  error?: unknown;
  count?: number | null;
}

export interface RpcCall {
  fn: string;
  args: unknown;
}

export interface InvokeCall {
  name: string;
  options: unknown;
}

export interface TableCall {
  table: string;
  method: string;
  args: unknown[];
}

type RpcResponder = FakeResult | ((args: unknown) => FakeResult);

/** Every query-builder method is chainable and recorded; awaiting the chain
 *  resolves the per-table result configured via setTable (or an empty one). */
const BUILDER_METHODS = [
  'select',
  'insert',
  'update',
  'upsert',
  'delete',
  'eq',
  'neq',
  'is',
  'in',
  'gt',
  'gte',
  'lt',
  'lte',
  'or',
  'ilike',
  'order',
  'range',
  'limit',
  'single',
  'maybeSingle',
] as const;

export interface SupabaseFake {
  /** Drop-in DI override: `providers: [fake.provider]`. */
  provider: Provider;
  rpcCalls: RpcCall[];
  invokeCalls: InvokeCall[];
  tableCalls: TableCall[];
  /** Configure the resolved value of `client.rpc(fn, …)`. */
  setRpc(fn: string, result: RpcResponder): void;
  /** Configure the resolved value of any awaited `client.from(table)` chain. */
  setTable(table: string, result: FakeResult): void;
}

export function createSupabaseFake(): SupabaseFake {
  const rpcResults = new Map<string, RpcResponder>();
  const tableResults = new Map<string, FakeResult>();
  const rpcCalls: RpcCall[] = [];
  const invokeCalls: InvokeCall[] = [];
  const tableCalls: TableCall[] = [];

  const makeBuilder = (table: string) => {
    const builder: Record<string, unknown> = {};
    for (const method of BUILDER_METHODS) {
      builder[method] = (...args: unknown[]) => {
        tableCalls.push({ table, method, args });
        return builder;
      };
    }
    // Thenable, so `await client.from(t).select()...` resolves the
    // configured per-table result regardless of chain shape.
    builder['then'] = (
      onFulfilled: (r: FakeResult) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) => {
      const result =
        tableResults.get(table) ?? { data: null, error: null, count: null };
      return Promise.resolve(result).then(onFulfilled, onRejected);
    };
    return builder;
  };

  const client = {
    rpc: (fn: string, args?: unknown) => {
      rpcCalls.push({ fn, args });
      const responder = rpcResults.get(fn);
      const result =
        typeof responder === 'function'
          ? responder(args)
          : responder ?? { data: null, error: null };
      return Promise.resolve(result);
    },
    from: (table: string) => makeBuilder(table),
    functions: {
      invoke: (name: string, options?: unknown) => {
        invokeCalls.push({ name, options });
        return Promise.resolve({ data: null, error: null });
      },
    },
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
      getSession: () =>
        Promise.resolve({ data: { session: null }, error: null }),
    },
  };

  return {
    provider: {
      provide: SupabaseService,
      useValue: { client } as unknown as SupabaseService,
    },
    rpcCalls,
    invokeCalls,
    tableCalls,
    setRpc: (fn, result) => rpcResults.set(fn, result),
    setTable: (table, result) => tableResults.set(table, result),
  };
}
