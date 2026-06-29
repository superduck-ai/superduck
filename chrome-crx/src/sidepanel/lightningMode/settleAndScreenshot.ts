import type { Span } from '@opentelemetry/api';
import { withTracing, SpanStatusCode } from '../../observability';
import { cdpDebugger } from '../../mcpRuntime';
import { getSettleTimes, type ParsedCommand } from './commands';
import { getRuntimeEvaluateValue } from '../sidepanelGuards';
import type { Phases } from './streamResponse';
import type { LightningConfigController } from './config';

export interface SettleAndScreenshotParams {
  commands: ParsedCommand[];
  didSwitchTab: boolean;
  activeTabId: number;
  span: Span;
  phases: Phases;
  config: LightningConfigController;
}

export interface SettleAndScreenshotResult {
  screenshotBase64: string;
  screenshotWidth: number;
  screenshotHeight: number;
}

export async function settleAndScreenshot(
  params: SettleAndScreenshotParams
): Promise<SettleAndScreenshotResult> {
  const { minMs, maxMs } = getSettleTimes(params.commands);
  const effectiveMaxMs = params.didSwitchTab ? Math.max(maxMs, 500) : maxMs;
  const settleStart = performance.now();

  if (minMs > 0) await new Promise((r) => setTimeout(r, minMs));
  if (effectiveMaxMs > 0) {
    await withTracing(
      'lightning_page_settle',
      async (settleSpan: Span) => {
        if (!params.activeTabId) return;
        const startTime = Date.now();
        const remainingMs = Math.max(0, effectiveMaxMs - minMs);
        let polls = 0;
        while (Date.now() - startTime < remainingMs) {
          polls++;
          const timeLeft = remainingMs - (Date.now() - startTime);
          if (timeLeft <= 0) break;
          try {
            const evalResult = await Promise.race([
              cdpDebugger.sendCommand(params.activeTabId, 'Runtime.evaluate', {
                expression:
                  "document.readyState === 'complete' && document.getAnimations().length === 0",
                returnByValue: true
              }),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), timeLeft))
            ]);
            if (getRuntimeEvaluateValue(evalResult)) break;
          } catch {
            break;
          }
          await new Promise((r) => setTimeout(r, 50));
        }
        settleSpan.setAttribute('settle_ms', Date.now() - startTime);
        settleSpan.setAttribute('polls', polls);
      },
      params.span
    );
  }
  params.phases.pageSettleMs = Math.round(performance.now() - settleStart);

  const screenshotStart = performance.now();
  let screenshotBase64 = '';
  let screenshotWidth = 0;
  let screenshotHeight = 0;
  await withTracing(
    'lightning_screenshot',
    async (ssSpan: Span) => {
      if (!params.activeTabId) return;
      try {
        const ss = await cdpDebugger.screenshot(
          params.activeTabId,
          {
            pxPerToken: 28,
            maxTargetPx: params.config.maxImageDimension,
            maxTargetTokens: 1568
          },
          { skipIndicator: true }
        );
        screenshotBase64 = ss.base64;
        screenshotWidth = ss.width;
        screenshotHeight = ss.height;
        ssSpan.setAttribute('screenshot_bytes', ss.base64.length);
        ssSpan.setAttribute('screenshot_dimensions', `${ss.width}x${ss.height}`);
      } catch (err) {
        ssSpan.setStatus({
          code: SpanStatusCode.ERROR,
          message: err instanceof Error ? err.message : 'Screenshot failed'
        });
      }
    },
    params.span
  );
  params.phases.screenshotMs = Math.round(performance.now() - screenshotStart);

  return { screenshotBase64, screenshotWidth, screenshotHeight };
}
