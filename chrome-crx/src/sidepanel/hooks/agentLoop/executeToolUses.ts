import type { MutableRefObject } from 'react';
import { filterAndApproveDomains } from '../../../mcpRuntime';
import { checkToolAllowed, getPageType } from '../../conversation/planMode';
import type { PermissionManager } from '@/permissions/PermissionManager';
import type { ApiConversationMessage, ApiToolResultBlock } from '../../../messageTypes';
import type { ChatRole, ToolUseBlock, VisibleChatRole } from '../../types';

const BATCH_REMINDER_ELIGIBLE_TOOLS = new Set([
  'navigate',
  'tabs_context',
  'tabs_context_mcp',
  'upload_image',
  'update_plan',
  'gif_creator',
  'resize_window',
  'upload_file',
  'tabs_create',
  'tabs_create_mcp'
]);

const BATCH_REMINDER_ELIGIBLE_COMPUTER_ACTIONS = new Set([
  'left_click',
  'right_click',
  'double_click',
  'triple_click',
  'type',
  'key',
  'wait',
  'scroll',
  'scroll_to',
  'left_click_drag',
  'hover'
]);

const BROWSER_BATCH_SYSTEM_REMINDER =
  '<system-reminder>You used a single browser tool call this turn. Prefer browser_batch to execute multiple actions in one call — it is significantly faster. Batch your next sequence of clicks, types, navigations, and screenshots together whenever you can predict two or more steps ahead.</system-reminder>';

const NAVIGATION_OBSERVE_SYSTEM_REMINDER = BROWSER_BATCH_SYSTEM_REMINDER;

const BROWSER_BATCH_FAILURE_SYSTEM_REMINDER =
  '<system-reminder>The previous browser_batch failed. Do not retry it unchanged; completed actions may already have run. Continue from the current browser state, and use browser_batch again when you can predict the next sequence.</system-reminder>';

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBrowserBatchReminderEligible(toolUse: ToolUseBlock): boolean {
  if (BATCH_REMINDER_ELIGIBLE_TOOLS.has(toolUse.name)) return true;
  if (toolUse.name !== 'computer' || !isRecordValue(toolUse.input)) return false;
  const action = toolUse.input.action;
  return typeof action === 'string' && BATCH_REMINDER_ELIGIBLE_COMPUTER_ACTIONS.has(action);
}

function appendToolResultText(result: ApiToolResultBlock, text: string): ApiToolResultBlock {
  if (typeof result.content === 'string') {
    return {
      ...result,
      content: result.content
        ? [
            { type: 'text', text: result.content },
            { type: 'text', text }
          ]
        : text
    };
  }
  if (Array.isArray(result.content)) {
    return {
      ...result,
      content: [...result.content, { type: 'text', text }]
    };
  }
  return {
    ...result,
    content: text
  };
}

function appendBrowserBatchReminder(
  result: ApiToolResultBlock,
  reminder: string
): ApiToolResultBlock {
  if (result.is_error) return result;
  return appendToolResultText(result, reminder);
}

function normalizeForSignature(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeForSignature);
  if (!isRecordValue(value)) return value;
  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = normalizeForSignature(value[key]);
      return acc;
    }, {});
}

function getBrowserBatchSignature(toolUse: ToolUseBlock): string | null {
  if (toolUse.name !== 'browser_batch' || !isRecordValue(toolUse.input)) return null;
  try {
    return JSON.stringify(normalizeForSignature(toolUse.input));
  } catch {
    return null;
  }
}

export interface ReminderState {
  navigationObserve: boolean;
  browserBatch: boolean;
  browserBatchFailure: boolean;
}

export interface ExecuteToolUsesParams {
  toolUses: ToolUseBlock[];
  accumulatedText: string;
  workingMessages: ApiConversationMessage[];
  controller: AbortController;
  executionTabId: number | undefined;
  permissionModeRef: MutableRefObject<string>;
  hasApprovedPlanRef: MutableRefObject<boolean>;
  lastFailedBrowserBatchSignatureRef: MutableRefObject<string | null>;
  reminderState: ReminderState;
  executeToolUse: (toolUse: ToolUseBlock) => Promise<ApiToolResultBlock>;
  getPermissionManager: () => PermissionManager;
  pushMessage: (role: ChatRole | VisibleChatRole, text: string) => void;
  setHasInteractiveTools: (v: boolean) => void;
  setCurrentStatus: (v: string) => void;
  generateStatusSummary: (text: string) => Promise<void>;
  setApiMessages: (messages: ApiConversationMessage[]) => void;
}

export async function executeToolUses(
  params: ExecuteToolUsesParams
): Promise<{ workingMessages: ApiConversationMessage[] }> {
  let { workingMessages } = params;
  const { toolUses, accumulatedText } = params;

  const realToolUses = toolUses.filter((t) => t.name !== 'turn_answer_start');
  const answerStartTools = toolUses.filter((t) => t.name === 'turn_answer_start');

  const toolResults: ApiToolResultBlock[] = [];

  for (const toolUse of answerStartTools) {
    toolResults.push({
      type: 'tool_result',
      tool_use_id: toolUse.id,
      content: ''
    });
  }

  if (realToolUses.length > 0) {
    const readonlyTools = ['read_page', 'get_page_text', 'find', 'turn_answer_start'];
    if (realToolUses.some((t) => !readonlyTools.includes(t.name))) {
      params.setHasInteractiveTools(true);
    }

    const toolNames = realToolUses.map((t) => t.name).join(', ');
    params.pushMessage('system', `🔧 ${toolNames}`);

    if (accumulatedText && !accumulatedText.toLowerCase().includes('<answer>')) {
      params.generateStatusSummary(accumulatedText).catch(() => {});
    } else if (accumulatedText && accumulatedText.toLowerCase().includes('<answer>')) {
      params.setCurrentStatus('');
    }

    if (params.controller.signal.aborted) {
      for (const toolUse of realToolUses) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: 'Tool execution cancelled by user',
          is_error: true
        });
      }
    } else {
      let currentPageType = 'regular';
      if (typeof params.executionTabId === 'number') {
        try {
          const tab = await chrome.tabs.get(params.executionTabId);
          currentPageType = getPageType(tab.url);
        } catch {
          // tab may have been closed
        }
      }

      for (const toolUse of realToolUses) {
        if (params.controller.signal.aborted) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: 'Tool execution cancelled by user',
            is_error: true
          });
          continue;
        }

        const toolCheck = checkToolAllowed(
          toolUse.name,
          currentPageType,
          params.permissionModeRef.current,
          params.hasApprovedPlanRef.current,
          toolUse.input
        );
        if (!toolCheck.allowed) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: `${toolCheck.errorMessage}\n\n${toolCheck.suggestedGuidance}`,
            is_error: true
          });
          continue;
        }

        if (toolUse.name === 'update_plan') {
          const { approach, domains } = toolUse.input as {
            approach?: string[];
            domains?: string[];
          };

          if (params.permissionModeRef.current !== 'follow_a_plan') {
            let approvalMessage =
              'User has approved your plan. You can now start executing the plan.';
            if (approach && approach.length > 0) {
              approvalMessage +=
                '\n\nPlan steps:\n' +
                approach.map((step, i) => `${i + 1}. ${step}`).join('\n') +
                '\n\nStart by using the TodoWrite tool to track your progress through these steps.';
            } else {
              approvalMessage += ' Start with updating your todo list if applicable.';
            }
            params.hasApprovedPlanRef.current = true;
            if (domains) {
              const pm = params.getPermissionManager();
              await filterAndApproveDomains(domains, pm);
            }
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: approvalMessage
            });
          } else {
            const result = await params.executeToolUse(toolUse);
            if (!result.is_error) {
              params.hasApprovedPlanRef.current = true;
              if (domains) {
                const pm = params.getPermissionManager();
                await filterAndApproveDomains(domains, pm);
              }
              let approvalMessage =
                'User has approved your plan. You can now start executing the plan.';
              if (approach && approach.length > 0) {
                approvalMessage +=
                  '\n\nPlan steps:\n' +
                  approach.map((step, i) => `${i + 1}. ${step}`).join('\n') +
                  '\n\nStart by using the TodoWrite tool to track your progress through these steps.';
              } else {
                approvalMessage += ' Start with updating your todo list if applicable.';
              }
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: approvalMessage
              });
            } else {
              toolResults.push(result);
            }
          }
          continue;
        }

        const batchSignature = getBrowserBatchSignature(toolUse);
        if (
          batchSignature &&
          batchSignature === params.lastFailedBrowserBatchSignatureRef.current
        ) {
          const content = params.reminderState.browserBatchFailure
            ? 'The previous browser_batch already failed. Observe the current page or run only the failed action separately before retrying.'
            : BROWSER_BATCH_FAILURE_SYSTEM_REMINDER;
          params.reminderState.browserBatchFailure = true;
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content,
            is_error: true
          });
          continue;
        }

        const result = await params.executeToolUse(toolUse);
        if (batchSignature) {
          if (result.is_error) {
            params.lastFailedBrowserBatchSignatureRef.current = batchSignature;
            if (!params.reminderState.browserBatchFailure) {
              params.reminderState.browserBatchFailure = true;
              toolResults.push(appendToolResultText(result, BROWSER_BATCH_FAILURE_SYSTEM_REMINDER));
            } else {
              toolResults.push(result);
            }
          } else {
            params.lastFailedBrowserBatchSignatureRef.current = null;
            toolResults.push(result);
          }
          continue;
        }

        if (
          (toolUse.name === 'read_page' ||
            toolUse.name === 'find' ||
            toolUse.name === 'navigate') &&
          !result.is_error
        ) {
          params.lastFailedBrowserBatchSignatureRef.current = null;
        }
        toolResults.push(result);
      }
    }
  }

  if (realToolUses.length === 1 && realToolUses[0].name === 'navigate') {
    const toolUseId = realToolUses[0].id;
    const resultIndex = toolResults.findIndex((result) => result.tool_use_id === toolUseId);
    if (
      resultIndex >= 0 &&
      !toolResults[resultIndex].is_error &&
      !params.reminderState.navigationObserve
    ) {
      params.reminderState.navigationObserve = true;
      toolResults[resultIndex] = appendToolResultText(
        toolResults[resultIndex],
        NAVIGATION_OBSERVE_SYSTEM_REMINDER
      );
    }
  } else if (realToolUses.length === 1 && isBrowserBatchReminderEligible(realToolUses[0])) {
    const toolUseId = realToolUses[0].id;
    const resultIndex = toolResults.findIndex((result) => result.tool_use_id === toolUseId);
    if (
      resultIndex >= 0 &&
      !toolResults[resultIndex].is_error &&
      !params.reminderState.browserBatch
    ) {
      params.reminderState.browserBatch = true;
      toolResults[resultIndex] = appendBrowserBatchReminder(
        toolResults[resultIndex],
        BROWSER_BATCH_SYSTEM_REMINDER
      );
    }
  }

  const toolResultMessage: ApiConversationMessage = {
    role: 'user',
    content: toolResults
  };
  workingMessages = [...workingMessages, toolResultMessage];
  params.setApiMessages(workingMessages);

  return { workingMessages };
}
