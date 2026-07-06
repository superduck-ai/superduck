import type { MutableRefObject } from 'react';
import type { Span } from '@opentelemetry/api';
import { PermissionManager } from '@/permissions/PermissionManager';
import { withTracing } from '../../observability';
import { formatTabsOutput } from '../../mcpRuntime/core/urlUtils';
import { computerTool } from '../../mcpRuntime/inputTools/computerTool';
import { javascriptTool } from '../../mcpRuntime/pageTools/javascriptTool';
import { navigateTool } from '../../mcpRuntime/pageTools/navigateTool';
import { filterDomainsByCategory } from '../../mcpRuntime/pageToolsSupport/helpers';
import type { ToolContext } from '../../mcpRuntime/pageToolsSupport/types';
import { DEFAULT_BROWSER_SESSION_ID } from '../../mcpRuntime/sessionScope';
import { tabGroupManager } from '../../mcpRuntime/tabState';
import { PermissionActionType } from '../../extensionServices';
import { commandTypeToToolName, type ParsedCommand } from './commands';
import { executeWithPermission } from './runtime';
import { checkToolAllowed, parsePlanJson, getPageType } from '../conversation/planMode';
import type { CommandExecutionResult } from '../types';
import type { Phases } from './streamResponse';
import type { StError, PageType } from './parseCommands';

export interface ExecuteCommandsParams {
  commands: ParsedCommand[];
  stError: StError | null;
  stIndex: number;
  activeTabId: number;
  pageType: PageType;
  permissionMode: string;
  planApprovedRef: MutableRefObject<boolean>;
  cancelledRef: MutableRefObject<boolean>;
  onPermissionRequired: ((result: Record<string, unknown>) => Promise<boolean>) | undefined;
  permissionManager: PermissionManager;
  trackToolCall: (toolName: string, success: boolean, extra?: Record<string, unknown>) => void;
  span: Span;
  phases: Phases;
}

export interface ExecuteCommandsResult {
  cmdResults: CommandExecutionResult[];
  commandCount: number;
  shouldReturn: boolean;
}

function createLightningToolContext(
  params: ExecuteCommandsParams,
  tabId: number,
  toolUseId: string
): ToolContext {
  const browserSessionScope = { sessionId: DEFAULT_BROWSER_SESSION_ID };
  return {
    tabId,
    permissionManager: params.permissionManager,
    toolUseId,
    skipIndicator: true,
    browserSessionScope,
    tabAccess: 'write',
    resolveTabId: async (requestedTabId, options) =>
      await tabGroupManager.resolveTabForContext(requestedTabId, tabId, {
        browserSessionScope,
        tabAccess: options?.tabAccess ?? 'write'
      })
  };
}

export async function executeCommands(
  params: ExecuteCommandsParams
): Promise<ExecuteCommandsResult> {
  const commandCount = params.commands.length;
  const cmdExecStart = performance.now();
  const cmdResults = await withTracing(
    'lightning_command_execution',
    async (cmdSpan: Span) => {
      cmdSpan.setAttribute('command_count', params.commands.length);
      const results: CommandExecutionResult[] = [];

      if (params.stError && params.stIndex === 0) {
        results.push(params.stError);
        return results;
      }

      let pageType = params.pageType;

      for (const cmd of params.commands) {
        if (params.cancelledRef.current) break;
        const cmdStart = performance.now();

        if (results.length > 0) {
          try {
            const tabInfo = await chrome.tabs.get(params.activeTabId);
            const newPageType = getPageType(tabInfo.url);
            if (newPageType !== pageType) pageType = newPageType;
          } catch {
            /* ignore */
          }
        }

        const toolName = commandTypeToToolName(cmd.type);
        if (toolName) {
          const check = checkToolAllowed(
            toolName,
            pageType,
            params.permissionMode,
            params.planApprovedRef.current
          );
          if (!check.allowed) {
            const errMsg =
              check.errorMessage?.replace(/update_plan/g, 'PL') ?? 'Command not allowed.';
            const guidance = check.suggestedGuidance?.replace(/update_plan/g, 'PL') ?? '';
            params.trackToolCall(toolName, false, { failureReason: 'permission_denied' });
            results.push({
              action: cmd.type,
              input: cmd.args,
              output: `Error: ${errMsg}${guidance ? ` ${guidance}` : ''}`,
              durationMs: Math.round(performance.now() - cmdStart)
            });
            continue;
          }
        }

        if (cmd.type === 'error') {
          results.push({
            action: 'error',
            input: {},
            output: cmd.args.text + ' Remaining commands were not executed.',
            durationMs: Math.round(performance.now() - cmdStart)
          });
          break;
        }

        if (cmd.type === 'wait') {
          results.push({
            action: 'wait',
            input: {},
            output: 'Waited.',
            durationMs: Math.round(performance.now() - cmdStart)
          });
          continue;
        }

        if (cmd.type === 'plan') {
          const planData = parsePlanJson(cmd.args.text);
          if (!planData) {
            params.trackToolCall('update_plan', false);
            results.push({
              action: 'plan',
              input: {},
              output: 'Invalid plan JSON. Must contain domains and approach arrays.',
              durationMs: Math.round(performance.now() - cmdStart)
            });
            break;
          }
          const domainStrings = planData.domains.map((d) => (typeof d === 'string' ? d : d.domain));
          const { approved, filtered } = await filterDomainsByCategory(domainStrings);
          if (approved.length === 0) {
            params.trackToolCall('update_plan', false);
            results.push({
              action: 'plan',
              input: planData,
              output:
                'All domains in the plan are blocked. Revise the plan with different domains.',
              durationMs: Math.round(performance.now() - cmdStart)
            });
            break;
          }

          const isApproved =
            params.permissionMode !== 'follow_a_plan' || !params.onPermissionRequired
              ? true
              : await params.onPermissionRequired({
                  type: 'permission_required',
                  tool: PermissionActionType.PLAN_APPROVAL,
                  url: '',
                  actionData: { plan: { domains: approved, approach: planData.approach } }
                });

          if (isApproved) {
            params.planApprovedRef.current = true;
            params.permissionManager.setTurnApprovedDomains(approved);
            const blockedNote =
              filtered.length > 0
                ? ` Blocked domains removed from plan: ${filtered.join(', ')}.`
                : '';
            params.trackToolCall('update_plan', true);
            results.push({
              action: 'plan',
              input: planData,
              output: `Plan approved. Proceed with execution.${blockedNote}`,
              durationMs: Math.round(performance.now() - cmdStart)
            });
          } else {
            params.trackToolCall('update_plan', false, { failureReason: 'permission_denied' });
            results.push({
              action: 'plan',
              input: planData,
              output: 'Plan rejected by user. Ask the user how they would like to change the plan.',
              durationMs: Math.round(performance.now() - cmdStart)
            });
          }
          break;
        }

        if (cmd.type === 'new_tab') {
          const url = cmd.args.url;
          try {
            const newTab = await chrome.tabs.create({
              url: 'chrome://newtab',
              active: false
            });
            if (!newTab.id) throw new Error('Failed to create tab — no tab ID returned');

            const mainTabId = await tabGroupManager.getMainTabId(params.activeTabId);
            if (mainTabId) {
              await tabGroupManager.addTabToGroup(mainTabId, newTab.id, {
                origin: 'agent',
                sessionId: DEFAULT_BROWSER_SESSION_ID
              });
            }

            const toolContext = createLightningToolContext(
              params,
              newTab.id,
              `lightning_newtab_${Date.now()}`
            );
            const navResult = await executeWithPermission(
              () => navigateTool.execute({ url, tabId: newTab.id! }, toolContext),
              params.onPermissionRequired
            );
            if (navResult.denied) {
              await chrome.tabs.remove(newTab.id);
              params.trackToolCall('navigate', false, { failureReason: 'permission_denied' });
              results.push({
                action: 'new_tab',
                input: { url },
                output: 'Permission denied by user.',
                durationMs: Math.round(performance.now() - cmdStart)
              });
              continue;
            }
            const { result: navOutput } = navResult;
            if (navOutput && 'error' in navOutput && navOutput.error) {
              await chrome.tabs.remove(newTab.id);
              params.trackToolCall('navigate', false);
              results.push({
                action: 'new_tab',
                input: { url },
                output: `Error: ${navOutput.error}`,
                durationMs: Math.round(performance.now() - cmdStart)
              });
            } else {
              params.trackToolCall('navigate', true);
              results.push({
                action: 'new_tab',
                input: { url },
                output: `Created tab ${newTab.id} with ${url}`,
                durationMs: Math.round(performance.now() - cmdStart)
              });
            }
          } catch (err) {
            params.trackToolCall('navigate', false, { failureReason: 'exception' });
            results.push({
              action: 'new_tab',
              input: { url },
              output: `Error creating tab: ${err instanceof Error ? err.message : 'Unknown error'}`,
              durationMs: Math.round(performance.now() - cmdStart)
            });
          }
          continue;
        }

        if (cmd.type === 'list_tabs') {
          try {
            const toolContext = createLightningToolContext(
              params,
              params.activeTabId,
              `lightning_tabs_${Date.now()}`
            );
            const tabs = await tabGroupManager.getValidTabsWithMetadataForContext(
              params.activeTabId,
              toolContext
            );
            const tabsOutput = formatTabsOutput(tabs, undefined, params.activeTabId);
            params.trackToolCall('tabs_context', true);
            results.push({
              action: 'list_tabs',
              input: {},
              output: tabsOutput,
              durationMs: Math.round(performance.now() - cmdStart)
            });
          } catch (err) {
            params.trackToolCall('tabs_context', false, { failureReason: 'exception' });
            results.push({
              action: 'list_tabs',
              input: {},
              output: `Error listing tabs: ${err instanceof Error ? err.message : 'Unknown error'}`,
              durationMs: Math.round(performance.now() - cmdStart)
            });
          }
          continue;
        }

        if (cmd.type === 'navigate') {
          const url = cmd.args.url;
          try {
            const toolContext = createLightningToolContext(
              params,
              params.activeTabId,
              `lightning_nav_${Date.now()}`
            );
            const navResult = await executeWithPermission(
              () => navigateTool.execute({ url, tabId: params.activeTabId }, toolContext),
              params.onPermissionRequired
            );
            if (navResult.denied) {
              params.trackToolCall('navigate', false, { failureReason: 'permission_denied' });
              results.push({
                action: 'navigate',
                input: { url },
                output: 'Permission denied by user.',
                durationMs: Math.round(performance.now() - cmdStart)
              });
              continue;
            }
            const { result: navOutput } = navResult;
            if (navOutput && 'error' in navOutput && navOutput.error) {
              params.trackToolCall('navigate', false);
              results.push({
                action: 'navigate',
                input: { url },
                output: `Error: ${navOutput.error}`,
                durationMs: Math.round(performance.now() - cmdStart)
              });
            } else {
              params.trackToolCall('navigate', true);
              results.push({
                action: 'navigate',
                input: { url },
                output:
                  (navOutput && 'output' in navOutput ? navOutput.output : `Navigated to ${url}`) ||
                  '',
                durationMs: Math.round(performance.now() - cmdStart)
              });
            }
          } catch (err) {
            params.trackToolCall('navigate', false, { failureReason: 'exception' });
            results.push({
              action: 'navigate',
              input: { url },
              output: `Error navigating: ${err instanceof Error ? err.message : 'Unknown error'}`,
              durationMs: Math.round(performance.now() - cmdStart)
            });
          }
          continue;
        }

        if (cmd.type === 'js') {
          try {
            const toolContext = createLightningToolContext(
              params,
              params.activeTabId,
              `lightning_js_${Date.now()}`
            );
            const jsResult = await executeWithPermission(
              () =>
                javascriptTool.execute(
                  { action: 'javascript_exec', text: cmd.args.text, tabId: params.activeTabId },
                  toolContext
                ),
              params.onPermissionRequired
            );
            if (jsResult.denied) {
              params.trackToolCall('execute_javascript', false, {
                failureReason: 'permission_denied'
              });
              results.push({
                action: 'execute_javascript',
                input: { code: cmd.args.text },
                output: 'Permission denied by user.',
                durationMs: Math.round(performance.now() - cmdStart)
              });
              continue;
            }
            const { result: jsOutput } = jsResult;
            if (jsOutput && 'error' in jsOutput && jsOutput.error) {
              params.trackToolCall('execute_javascript', false);
              results.push({
                action: 'execute_javascript',
                input: { code: cmd.args.text },
                output: `Error: ${jsOutput.error}`,
                durationMs: Math.round(performance.now() - cmdStart)
              });
            } else {
              params.trackToolCall('execute_javascript', true);
              let outputText = '';
              if (jsOutput && 'output' in jsOutput) outputText = jsOutput.output ?? '';
              results.push({
                action: 'execute_javascript',
                input: { code: cmd.args.text },
                output: `<command-result>${outputText}</command-result>`,
                durationMs: Math.round(performance.now() - cmdStart)
              });
            }
          } catch (err) {
            params.trackToolCall('execute_javascript', false, { failureReason: 'exception' });
            results.push({
              action: 'execute_javascript',
              input: { code: cmd.args.text },
              output: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
              durationMs: Math.round(performance.now() - cmdStart)
            });
          }
          continue;
        }

        const commandInput = { ...cmd.args };
        try {
          const toolContext = createLightningToolContext(
            params,
            params.activeTabId,
            `lightning_${Date.now()}`
          );
          const compResult = await executeWithPermission(
            () =>
              computerTool.execute(
                { action: cmd.type, ...commandInput, tabId: params.activeTabId },
                toolContext
              ),
            params.onPermissionRequired
          );
          if (compResult.denied) {
            params.trackToolCall('computer', false, {
              action: cmd.type,
              failureReason: 'permission_denied'
            });
            results.push({
              action: cmd.type,
              input: commandInput,
              output: 'Permission denied by user.',
              durationMs: Math.round(performance.now() - cmdStart)
            });
            continue;
          }
          const { result: compOutput } = compResult;
          if (compOutput && 'error' in compOutput && compOutput.error) {
            params.trackToolCall('computer', false, { action: cmd.type });
            results.push({
              action: cmd.type,
              input: commandInput,
              output: `Error: ${compOutput.error}`,
              durationMs: Math.round(performance.now() - cmdStart)
            });
          } else {
            params.trackToolCall('computer', true, { action: cmd.type });
            if (compOutput && 'output' in compOutput && compOutput.output) {
              results.push({
                action: cmd.type,
                input: commandInput,
                output: compOutput.output,
                durationMs: Math.round(performance.now() - cmdStart)
              });
            }
          }
        } catch (err) {
          params.trackToolCall('computer', false, {
            action: cmd.type,
            failureReason: 'exception'
          });
          results.push({
            action: cmd.type,
            input: commandInput,
            output: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
            durationMs: Math.round(performance.now() - cmdStart)
          });
        }
      }

      if (params.stError) results.push(params.stError);
      return results;
    },
    params.span
  );

  params.phases.commandExecutionMs = Math.round(performance.now() - cmdExecStart);

  if (params.cancelledRef.current) {
    return { cmdResults, commandCount, shouldReturn: true };
  }
  return { cmdResults, commandCount, shouldReturn: false };
}
