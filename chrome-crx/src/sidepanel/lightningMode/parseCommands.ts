import type { MutableRefObject } from 'react';
import type { Span } from '@opentelemetry/api';
import { tabGroupManager } from '../../mcpRuntime';
import { shouldShowPlanMode } from '../../mcpRuntime/pageToolsSupport/helpers';
import { parseCompactCommands, type LightningMessage, type ParsedCommand } from './commands';
import { getPageType } from '../conversation/planMode';
import { pushTiming } from './runtime';
import type { Phases } from './streamResponse';

export type StError = {
  action: 'error';
  input: ParsedCommand['args'] | Record<string, never>;
  output: string;
  durationMs: number;
};

export type PageType = 'system' | 'non-script' | 'regular';

export interface ParseCommandsParams {
  fullText: string;
  allMessages: LightningMessage[];
  setLnMessages: (messages: LightningMessage[]) => void;
  setLnCurrentStatus: (status: string) => void;
  permissionMode: string;
  planApprovedRef: MutableRefObject<boolean>;
  activeTabId: number;
  span: Span;
  iterationStart: number;
  phases: Phases;
}

export interface ParseCommandsResult {
  shouldReturn: boolean;
  continueLoop: boolean;
  commands: ParsedCommand[];
  activeTabId: number;
  didSwitchTab: boolean;
  stError: StError | null;
  stIndex: number;
  pageType: PageType;
}

export async function parseCommands(params: ParseCommandsParams): Promise<ParseCommandsResult> {
  const { commands, description } = parseCompactCommands(params.fullText);
  if (description) params.setLnCurrentStatus(description);

  params.span.setAttribute('command_count', commands.length);

  if (commands.length === 0) {
    params.setLnCurrentStatus('');
    pushTiming({
      mode: 'lightning',
      durationMs: Math.round(performance.now() - params.iterationStart),
      phases: params.phases
    });
    return {
      shouldReturn: true,
      continueLoop: false,
      commands,
      activeTabId: params.activeTabId,
      didSwitchTab: false,
      stError: null,
      stIndex: -1,
      pageType: 'regular'
    };
  }

  if (
    shouldShowPlanMode(params.permissionMode, params.planApprovedRef.current) &&
    !commands.some((c) => c.type === 'plan')
  ) {
    params.allMessages.push({
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'You must present a plan using the PL command before executing other commands.'
        }
      ],
      _syntheticResult: true
    });
    params.setLnMessages([...params.allMessages]);
    return {
      shouldReturn: true,
      continueLoop: true,
      commands,
      activeTabId: params.activeTabId,
      didSwitchTab: false,
      stError: null,
      stIndex: -1,
      pageType: 'regular'
    };
  }

  let activeTabId = params.activeTabId;
  const stIndex = commands.findIndex((c) => c.type === 'select_tab');
  let stError: StError | null = null;
  if (stIndex > 0) {
    commands.splice(stIndex);
    stError = {
      action: 'error',
      input: {},
      output: 'ST must be the first command. Commands after ST were not executed.',
      durationMs: 0
    };
  } else if (stIndex === 0) {
    const selectTabCommand = commands[0];
    const tabs = await tabGroupManager.getValidTabsWithMetadata(activeTabId);
    const tabIds = new Set(
      tabs.map((tab) => tab.id).filter((tabId): tabId is number => typeof tabId === 'number')
    );
    if (selectTabCommand?.type === 'select_tab' && tabIds.has(selectTabCommand.args.tabId)) {
      activeTabId = selectTabCommand.args.tabId;
    } else if (selectTabCommand?.type === 'select_tab') {
      stError = {
        action: 'error',
        input: selectTabCommand.args,
        output: `Tab ${selectTabCommand.args.tabId} is not in the current tab group.`,
        durationMs: 0
      };
    }
    commands.shift();
  }
  const didSwitchTab = stIndex === 0 && !stError;

  let pageType: PageType = 'regular';
  try {
    const tab = await chrome.tabs.get(activeTabId);
    pageType = getPageType(tab.url);
  } catch {
    /* ignore */
  }

  return {
    shouldReturn: false,
    continueLoop: false,
    commands,
    activeTabId,
    didSwitchTab,
    stError,
    stIndex,
    pageType
  };
}
