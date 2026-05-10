import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../extensionServices';

export interface AccountSettings {
  enabled_mcp_tools?: Record<string, boolean>;
  [key: string]: unknown;
}

export function useAccountSettingsQuery(enabled = true) {
  return useQuery<AccountSettings>({
    queryKey: ['account-settings'],
    queryFn: async () =>
      apiClient.fetch('/api/oauth/account/settings', {
        headers: { 'anthropic-beta': 'oauth-2025-04-20' }
      }),
    enabled
  });
}

export async function updateAccountSettings(payload: Record<string, unknown>) {
  return apiClient.fetch('/api/oauth/account/settings', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-beta': 'oauth-2025-04-20'
    },
    body: JSON.stringify(payload)
  });
}

export function useMcpToolToggles() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      await updateAccountSettings(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account-settings'] });
    }
  });

  const toggleMcpToolEnabled = useCallback(
    (toolKeys: string | string[], enabled: boolean) => {
      const keys = Array.isArray(toolKeys) ? toolKeys : [toolKeys];
      const updates: Record<string, boolean> = {};
      for (const key of keys) updates[key] = enabled;

      queryClient.setQueryData<AccountSettings | undefined>(['account-settings'], (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          enabled_mcp_tools: {
            ...(prev.enabled_mcp_tools ?? {}),
            ...updates
          }
        };
      });

      mutation.mutate({ enabled_mcp_tools: updates });
    },
    [mutation, queryClient]
  );

  return { toggleMcpToolEnabled };
}
