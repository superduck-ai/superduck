import { shouldShowPlanMode } from '../mcpRuntime';

export interface PlanStructure {
  domains: (string | { domain: string; category?: string })[];
  approach: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPlanDomainEntry(
  value: unknown
): value is string | { domain: string; category?: string } {
  if (typeof value === 'string') return true;
  return isRecord(value) && typeof value.domain === 'string';
}

function getFirstBatchActionName(toolInput: unknown): string | undefined {
  if (!isRecord(toolInput) || !Array.isArray(toolInput.actions)) return undefined;
  const firstAction = toolInput.actions[0];
  if (!isRecord(firstAction)) return undefined;
  if (typeof firstAction.name === 'string') return firstAction.name;
  return typeof firstAction.tool === 'string' ? firstAction.tool : undefined;
}

export function getPageType(url: string | undefined): 'system' | 'non-script' | 'regular' {
  if (!url) return 'regular';
  if (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge://') ||
    url.startsWith('brave://') ||
    url === 'about:blank'
  ) {
    return 'system';
  }
  if (url.startsWith('https://chromewebstore.google.com/')) {
    return 'non-script';
  }
  return 'regular';
}

export function checkToolAllowed(
  toolName: string,
  pageType: string,
  permMode: string,
  hasApprovedPlan: boolean,
  toolInput?: unknown
): { allowed: boolean; errorMessage?: string; suggestedGuidance?: string } {
  if (pageType === 'system' || pageType === 'non-script') {
    const allowedTools = ['navigate', 'update_plan', 'TodoWrite', 'turn_answer_start'];
    const isNavigateFirstBatch =
      toolName === 'browser_batch' && getFirstBatchActionName(toolInput) === 'navigate';
    if (!allowedTools.includes(toolName) && !isNavigateFirstBatch) {
      return {
        allowed: false,
        errorMessage:
          toolName === 'browser_batch'
            ? `browser_batch cannot run on ${pageType} pages.`
            : `Tool ${toolName} is not available on ${pageType} pages.`,
        suggestedGuidance:
          toolName === 'browser_batch'
            ? 'On system pages, use navigate by itself to go to a regular webpage. After navigation completes, observe with read_page/find before using browser_batch.'
            : `Available tools: ${allowedTools.join(', ')}. Use navigate to go to a regular webpage first.`
      };
    }
  }
  if (toolName === 'update_plan' && permMode !== 'follow_a_plan') {
    return { allowed: true };
  }
  if (
    shouldShowPlanMode(permMode, hasApprovedPlan) &&
    toolName !== 'update_plan' &&
    toolName !== 'turn_answer_start'
  ) {
    return {
      allowed: false,
      errorMessage: 'You must use update_plan to create and get approval for a plan first.',
      suggestedGuidance:
        'Use update_plan to present your approach and get user approval before using other tools.'
    };
  }
  return { allowed: true };
}

export function parsePlanJson(text: string): PlanStructure | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) return null;
    const domainRegex = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const domains = Array.isArray(parsed.domains)
      ? parsed.domains
          .filter((d): d is string | { domain: string; category?: string } => {
            if (!isPlanDomainEntry(d)) return false;
            const name = typeof d === 'string' ? d : d?.domain;
            if (!name || typeof name !== 'string') return false;
            if (!name.includes('.')) return false;
            if (/\s/.test(name)) return false;
            return domainRegex.test(name);
          })
          .map((d) => {
            if (typeof d === 'string') {
              return d
                .toLowerCase()
                .replace(/^(https?:\/\/)?(www\.)?/, '')
                .replace(/\/.*$/, '');
            }
            return {
              ...d,
              domain: d.domain
                .toLowerCase()
                .replace(/^(https?:\/\/)?(www\.)?/, '')
                .replace(/\/.*$/, '')
            };
          })
      : [];
    const approach = Array.isArray(parsed.approach)
      ? parsed.approach.filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
      : [];
    if (approach.length === 0) return null;
    return { domains, approach };
  } catch {
    return null;
  }
}

export function getDomainDisplayName(
  domain: string | { domain: string; category?: string }
): string {
  return typeof domain === 'string' ? domain : domain.domain;
}

export function ensureArray<T>(value: T[] | undefined, _key: string): T[] {
  return Array.isArray(value) ? value : [];
}
