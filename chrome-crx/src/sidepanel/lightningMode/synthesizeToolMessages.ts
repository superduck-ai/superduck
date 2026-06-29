import type { MutableRefObject } from 'react';
import { getUpdatedTabContext, pushTiming } from './runtime';
import { getLightningScreenshotReminder } from '../sidepanelGuards';
import type { LightningMessage } from './commands';
import type { CommandExecutionResult, LightningContentArray } from '../types';
import type { ApiToolResultContentBlock } from '../../messageTypes';
import type { Phases } from './streamResponse';
import type { LightningConfigController } from './config';

export interface SynthesizeToolMessagesParams {
  cmdResults: CommandExecutionResult[];
  screenshotBase64: string;
  screenshotWidth: number;
  screenshotHeight: number;
  allMessages: LightningMessage[];
  setLnMessages: (messages: LightningMessage[]) => void;
  config: LightningConfigController;
  activeTabId: number;
  tabContextHashRef: MutableRefObject<string | null>;
  iterationStart: number;
  phases: Phases;
  commandCount: number;
  didSwitchTab: boolean;
  maybeCompactLightningMessages: (messages: LightningMessage[]) => Promise<LightningMessage[]>;
  cancelledRef: MutableRefObject<boolean>;
}

export interface SynthesizeToolMessagesResult {
  shouldReturn: boolean;
  continueLoop: boolean;
}

export async function synthesizeToolMessages(
  params: SynthesizeToolMessagesParams
): Promise<SynthesizeToolMessagesResult> {
  for (let i = 0; i < params.cmdResults.length; i++) {
    const result = params.cmdResults[i];
    const isLast = i === params.cmdResults.length - 1;
    const syntheticId = `synthetic_cmd_${Date.now()}_${i}`;
    const syntheticToolName =
      result.action === 'plan'
        ? 'update_plan'
        : result.action === 'navigate'
          ? 'navigate'
          : result.action === 'execute_javascript'
            ? 'execute_javascript'
            : 'computer';

    params.allMessages.push({
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: syntheticId,
          name: syntheticToolName,
          input:
            syntheticToolName === 'computer'
              ? { action: result.action, ...result.input }
              : result.input
        }
      ],
      _synthetic: true
    });

    const resultContent: ApiToolResultContentBlock[] = [{ type: 'text', text: result.output }];
    if (isLast && params.screenshotBase64) {
      resultContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: `image/${params.config.imageFormat}`,
          data: params.screenshotBase64
        }
      });
    }
    params.allMessages.push({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: syntheticId, content: resultContent }],
      _synthetic: true
    });
  }

  const nextUserContent: LightningContentArray = [];

  const tabContextUpdate = await getUpdatedTabContext(
    params.activeTabId,
    params.activeTabId,
    params.tabContextHashRef
  );
  if (tabContextUpdate) {
    nextUserContent.push({
      type: 'text',
      text: `<system-reminder>${tabContextUpdate}</system-reminder>`
    });
  }

  const notableActions = new Set([
    'execute_javascript',
    'error',
    'list_tabs',
    'new_tab',
    'select_tab',
    'plan'
  ]);
  const textOutputs = params.cmdResults
    .filter((r) => notableActions.has(r.action) || r.output.startsWith('Error'))
    .map((r) => r.output);

  nextUserContent.push({
    type: 'text',
    text: textOutputs.length > 0 ? textOutputs.join('\n') : 'Done.'
  });

  if (params.screenshotBase64) {
    if (params.screenshotWidth > 0 && params.screenshotHeight > 0) {
      nextUserContent.push({
        type: 'text',
        text: getLightningScreenshotReminder(params.screenshotWidth, params.screenshotHeight)
      });
    }
    nextUserContent.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: `image/${params.config.imageFormat}`,
        data: params.screenshotBase64
      }
    });
  }

  params.allMessages.push({ role: 'user', content: nextUserContent, _syntheticResult: true });
  params.setLnMessages([...params.allMessages]);

  pushTiming({
    mode: 'lightning',
    durationMs: Math.round(performance.now() - params.iterationStart),
    phases: params.phases
  });

  if (params.commandCount > 0 || params.didSwitchTab) {
    const compactedMessages = await params.maybeCompactLightningMessages(params.allMessages);
    if (params.cancelledRef.current) return { shouldReturn: true, continueLoop: false };
    if (
      compactedMessages.length !== params.allMessages.length ||
      compactedMessages !== params.allMessages
    ) {
      params.allMessages.splice(0, params.allMessages.length, ...compactedMessages);
      params.setLnMessages([...params.allMessages]);
    }
    return { shouldReturn: false, continueLoop: true };
  }

  return { shouldReturn: false, continueLoop: false };
}
