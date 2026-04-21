// Type stubs for Supabase Edge Functions (Deno runtime)
// These files run in Deno, not Node.js. Install the Deno VS Code extension
// for full IntelliSense, or these stubs silence the diagnostics.

declare module 'https://deno.land/std@0.177.0/http/server.ts' {
  export function serve(handler: (req: Request) => Response | Promise<Response>): void;
}

declare module 'https://esm.sh/@supabase/supabase-js@2' {
  export { createClient } from '@supabase/supabase-js';
}

declare namespace Deno {
  interface Env {
    get(key: string): string | undefined;
  }
  const env: Env;
}
