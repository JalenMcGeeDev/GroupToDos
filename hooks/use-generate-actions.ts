import { useMutation } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { GenerateActionsResponse } from '../lib/types';

export function useGenerateActions() {
  return useMutation({
    mutationFn: async (goalTitle: string): Promise<GenerateActionsResponse> => {
      const { data, error } = await supabase.functions.invoke('generate-actions', {
        body: { goalTitle },
      });

      if (error) {
        // In supabase-js v2, error.context is the parsed JSON body from the edge function
        console.error('generate-actions error:', JSON.stringify(error, null, 2));
        console.error('error.context:', JSON.stringify(error.context, null, 2));
        const ctx = error.context;
        const message =
          (ctx && typeof ctx === 'object' && ctx.error) ||
          error.message ||
          'Failed to generate actions';
        throw new Error(message);
      }

      return data as GenerateActionsResponse;
    },
  });
}
