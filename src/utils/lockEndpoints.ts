import { Application } from "express";

/**
 * lockEndpoints - Disables dynamic endpoint creation at runtime.
 * When enabled, any subsequent calls to app.VERB(...) will throw.
 * Intended to be called AFTER all intended routes are registered.
 */
export function lockEndpoints(app: Application): void {
  const methods: Array<keyof Application> = [
    'get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'all'
  ] as any;

  methods.forEach((m) => {
    const original = (app as any)[m];
    if (typeof original === 'function') {
      (app as any)[m] = function lockedEndpointWrapper() {
        throw new Error(`Dynamic endpoint creation is disabled by security policy (method: ${String(m)})`);
      };
    }
  });
}

/**
 * lockEndpointsIfEnabled - Convenience helper controlled by env flag.
 * Set DISABLE_DYNAMIC_ENDPOINTS=true to enforce.
 */
export function lockEndpointsIfEnabled(app: Application): void {
  if (String(process.env.DISABLE_DYNAMIC_ENDPOINTS).toLowerCase() === 'true') {
    lockEndpoints(app);
    console.log('🔒 Security: Dynamic endpoint creation is now disabled.');
  }
}


