import { useMemo, useCallback } from 'react';
import { dispatchMessagesClient } from '../../utils/providerClient';
import { resolveShortcutMarkersInMessages } from '../shortcutsMenu/shortcutMarkers';
import { MAX_TOKENS } from '../conversation/messageLimits';
import type { CreateApiMessageParams } from '../../messageTypes';
import type { ModelRequest } from '../session';

export interface UseModelActionsProps {
  selectedModel: string;
  permissionMode: string;
  effectiveMessagesClient: any;
}

/**
 * useModelActions — 模型/provider 相关操作
 * 封装 systemPrompt, createApiMessage, invokeSessionModel
 */
export function useModelActions({
  selectedModel,
  permissionMode,
  effectiveMessagesClient
}: UseModelActionsProps) {
  const systemPrompt = useMemo(() => {
    const isMac = navigator.platform.toUpperCase().includes('MAC');
    const modifier = isMac ? 'cmd' : 'ctrl';
    const platform = isMac ? 'Mac' : 'Windows/Linux';
    return [
      {
        type: 'text' as const,
        text: [
          'You are SuperDuck running in the SuperDuck Chrome sidepanel.',
          `Current model: ${selectedModel || 'default'}.`,
          `Permission mode: ${permissionMode}.`,
          `Platform: ${platform}. Use ${modifier} for shortcut modifier keys.`,
          '',
          'CLICK WORKFLOW (IMPORTANT):',
          '1. Call read_page (filter: interactive) to get element refs (ref_1, ref_2, etc.)',
          '2. Identify the target element by its ref from the accessibility tree',
          '3. Call computer with action: left_click and ref: "ref_N" (NOT coordinate)',
          '4. Refs are invalidated after page navigation — call read_page again after clicks that navigate',
          'NEVER use screenshot coordinates for clicking. ALWAYS use ref from read_page.',
          'Only use coordinate as absolute last resort for canvas/image-map elements that have no ref.',
          '',
          'TAB ISOLATION (IMPORTANT):',
          "SuperDuck's tab group is an isolated workspace. Keep the user's active Chrome tab undisturbed.",
          'When the current page should remain available while opening another page, open the target in a new background tab inside the same group. Use tabs_create with url, or navigate with newTab:true; these tool calls can be standalone or part of browser_batch when the sequence is predictable.',
          'This applies to result pages, detail pages, comparison pages, and site searches that produce a separate results page.',
          '',
          'BROWSER BATCHING (IMPORTANT):',
          'Prefer browser_batch over individual browser tool calls whenever you can predict two or more steps ahead. Batching is significantly faster; use it as your default for click -> type -> key sequences, form fills, and multi-step navigation.',
          'browser_batch executes tool calls sequentially, not in parallel. Each item is {name, input}, and input is the same object you would pass to that tool standalone.',
          'Each child tool still runs its own permission checks. If a batch stops, continue from the current browser state instead of replaying the same batch unchanged.',
          'Screenshots/images returned by browser_batch are results, not inputs for later actions in the same batch. Coordinates used inside a batch must come from the latest screenshot available before the batch call.',
          'Never nest browser_batch.',
          '',
          'Before your final natural-language response, call turn_answer_start once for that turn.'
        ].join('\n')
      }
    ];
  }, [permissionMode, selectedModel]);

  const createApiMessage = useCallback(
    async (params: CreateApiMessageParams, _parentSpan?: unknown, _spanName?: string) => {
      if (!effectiveMessagesClient) throw new Error('Client not initialized');

      // Destructure fields that need special handling (matching compiled Ze)
      const {
        modelClass: _modelClass,
        maxTokens,
        max_tokens: maxTokensSnake,
        model: _paramModel,
        messages: rawMessages,
        ...rest
      } = params;

      // Use camelCase maxTokens from session helpers or snake_case max_tokens from direct callers.
      const effectiveMaxTokens = maxTokens ?? maxTokensSnake ?? MAX_TOKENS;

      // Dispatch to the selected provider (falls back to effectiveMessagesClient).
      const dispatched = await dispatchMessagesClient(selectedModel, effectiveMessagesClient);

      // Resolve [[shortcut:id:name]] markers in messages (matching compiled mi)
      const messages = rawMessages
        ? await resolveShortcutMarkersInMessages(rawMessages)
        : rawMessages;

      return dispatched.runtime.create(
        {
          ...rest,
          messages,
          max_tokens: effectiveMaxTokens,
          model: dispatched.modelId
        },
        undefined
      );
    },
    [effectiveMessagesClient, selectedModel]
  );

  const invokeSessionModel = useCallback(
    async ({ modelClass: _modelClass, ...request }: ModelRequest) => createApiMessage(request),
    [createApiMessage]
  );

  return { systemPrompt, createApiMessage, invokeSessionModel };
}
