import { callOpenSRF } from "./client";

function withAtomicSuffix(method: string) {
  return method.endsWith(".atomic") ? method : `${method}.atomic`;
}

/**
 * Prefer pcrud `*.atomic` methods to avoid manual transaction management.
 * Falls back to the non-atomic method when the atomic variant is unavailable.
 */
export async function callPcrud<T = any>(method: string, params: any[] = []) {
  // Never append `.atomic` to CRUD mutations. Most Evergreen installs only ship
  // atomic variants for reads, and StacksOS reroutes pcrud writes to
  // `open-ils.permacrud` for stateless safety.
  if (method.match(/^open-ils\.pcrud\.(create|update|delete)\./)) {
    return await callOpenSRF<T>("open-ils.pcrud", method.replace(/\.atomic$/, ""), params);
  }

  const atomicMethod = withAtomicSuffix(method);
  try {
    return await callOpenSRF<T>("open-ils.pcrud", atomicMethod, params);
  } catch (err) {
    if (err && typeof err === "object" && (err as any).code === "OSRF_METHOD_NOT_FOUND") {
      return await callOpenSRF<T>("open-ils.pcrud", method, params);
    }
    throw err;
  }
}
