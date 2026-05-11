import { DEFAULT_MODEL } from '../../constants/models';
import type { ApiInputContentBlock } from '../../messageTypes';
import { PROMPT_TEMPLATES, WORKFLOW_INPUT_PREFIX, type SupportedLocale } from '../prompts';

export type AssistantRole = 'user' | 'assistant';

export interface ModelTextBlock {
  type: string;
  text?: string;
}

export interface ModelResult {
  content?: ModelTextBlock[];
}

export interface ModelRequest {
  maxTokens?: number;
  messages: Array<{ role: AssistantRole; content: string | ApiInputContentBlock[] }>;
  system?: string;
  modelClass?: 'small_fast' | string;
  model?: string;
}

export type ModelInvoker = (request: ModelRequest) => Promise<ModelResult>;

function readTextBlocks(response: ModelResult): string {
  if (!response.content || response.content.length === 0) return '';
  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('\n')
    .trim();
}

function parseTaggedValue(text: string, tag: string): string {
  const fullTagMatch = text.match(new RegExp(`<${tag}>(.*?)</${tag}>`, 's'));
  if (fullTagMatch?.[1]) return fullTagMatch[1].trim();

  const partialTagMatch = text.match(new RegExp(`^(.*?)</${tag}>`, 's'));
  if (partialTagMatch?.[1]) return partialTagMatch[1].trim();

  return '';
}

export async function generateConversationTitle(
  message: { content: string | Array<{ type: string; text?: string }> },
  invoke: ModelInvoker,
  locale: SupportedLocale = 'en-US'
): Promise<string> {
  try {
    const inputText =
      typeof message.content === 'string'
        ? message.content
        : Array.isArray(message.content)
          ? message.content
              .filter((item) => item.type === 'text')
              .map((item) => item.text ?? '')
              .join('\n')
          : '';

    if (!inputText.trim()) return '';

    const templates = PROMPT_TEMPLATES[locale].conversationTitle;
    const result = await invoke({
      maxTokens: 128,
      messages: [{ role: 'user', content: templates.user(inputText) }],
      system: templates.system,
      modelClass: 'small_fast'
    });

    return parseTaggedValue(readTextBlocks(result), 'title');
  } catch {
    return '';
  }
}

export async function generateShortcutName(
  prompt: string,
  invoke: ModelInvoker,
  locale: SupportedLocale = 'en-US'
): Promise<string> {
  try {
    if (!prompt.trim()) return '';

    const templates = PROMPT_TEMPLATES[locale].shortcutName;
    const result = await invoke({
      maxTokens: 64,
      messages: [
        {
          role: 'user',
          content: templates.user(prompt)
        },
        {
          role: 'assistant',
          content: templates.assistant
        }
      ],
      system: templates.system,
      modelClass: 'small_fast'
    });

    const name = parseTaggedValue(readTextBlocks(result), 'name');
    if (locale === 'zh-CN') {
      return name.trim().replace(/[^\u4e00-\u9fa5a-zA-Z0-9-]/g, '');
    }
    return name.toLowerCase().replace(/[^a-z0-9-]/g, '');
  } catch {
    return '';
  }
}

export async function generateQuote(invoke: ModelInvoker): Promise<string> {
  try {
    const result = await invoke({
      maxTokens: 150,
      messages: [
        {
          role: 'user',
          content:
            'Generate a very short fortune cookie style quote (5-10 words max, one sentence). Be whimsical, diverse, and unexpectedly wise.'
        }
      ],
      system: 'Generate short whimsical quotes that are playful, memorable, and concise.',
      modelClass: 'small_fast'
    });

    return readTextBlocks(result);
  } catch {
    return '';
  }
}

export async function generateDailySummary(
  titles: string[],
  invoke: ModelInvoker,
  locale: SupportedLocale = 'en-US'
): Promise<string> {
  try {
    if (titles.length === 0) return '';

    const deduped = Array.from(new Set(titles.map((title) => title.toLowerCase())))
      .map((normalized) => titles.find((title) => title.toLowerCase() === normalized))
      .filter((title): title is string => Boolean(title));

    const titleList = deduped.map((title, index) => `${index + 1}. ${title}`).join('\n');
    const templates = PROMPT_TEMPLATES[locale].dailySummary;

    const result = await invoke({
      maxTokens: 200,
      messages: [
        {
          role: 'user',
          content: templates.user(titleList)
        }
      ],
      system: templates.system,
      modelClass: 'small_fast'
    });

    const text = readTextBlocks(result);
    if (!text) return '';

    const lowered = text.toLowerCase();
    if (
      text === 'SKIP' ||
      lowered.includes('skip') ||
      lowered.includes('insufficient') ||
      lowered.includes('not enough information') ||
      lowered.includes('unable to')
    ) {
      return '';
    }

    return text;
  } catch {
    return '';
  }
}

export interface WorkflowStepDescriptionInput {
  action?: string;
  tagName: string;
  text?: string;
  attributes: Record<string, string>;
  pageTitle?: string;
  url?: string;
  screenshot?: string;
  speechTranscript?: string;
}

export function detectImageMediaType(
  base64: string
): 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' {
  if (base64.startsWith('iVBORw0KGgo')) return 'image/png';
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  if (base64.startsWith('UklGR')) return 'image/webp';
  if (base64.startsWith('R0lGOD')) return 'image/gif';
  return 'image/png';
}

export async function generateWorkflowStepDescription(
  step: WorkflowStepDescriptionInput,
  userActionText: string,
  invoke: ModelInvoker,
  locale: SupportedLocale = 'en-US'
): Promise<string> {
  try {
    const classes = step.attributes.class || '';
    const semanticClasses = classes
      .split(/\s+/)
      .filter(Boolean)
      .filter((className) =>
        [
          'btn',
          'button',
          'menu',
          'nav',
          'submit',
          'close',
          'icon',
          'toggle',
          'dropdown',
          'modal',
          'search',
          'login',
          'save',
          'delete'
        ].some((keyword) => className.includes(keyword))
      )
      .join(', ');

    const templates = PROMPT_TEMPLATES[locale].stepDescription;
    const narration = step.speechTranscript
      ? templates.fragments.narration(step.speechTranscript)
      : '';

    const elementPrompt = `<element_clicked>
HTML Element: ${step.tagName.toUpperCase()}
Visible Text: "${step.text || ''}"${narration}

Current Page Context:
- Page Title: ${step.pageTitle || 'unknown'}
- Page URL: ${step.url || 'unknown'}

Attributes:
- ID: ${step.attributes.id || 'none'}
- Classes: ${classes || 'none'}
${semanticClasses ? `- Semantic Classes Found: ${semanticClasses}` : ''}
- Name: ${step.attributes.name || 'none'}
- Type: ${step.attributes.type || 'none'}
- Role: ${step.attributes.role || 'none'}
- Href: ${step.attributes.href || 'none'}
- Aria-Label: "${step.attributes['aria-label'] || ''}"
- Title: "${step.attributes.title || ''}"
- Placeholder: "${step.attributes.placeholder || ''}"
- Alt: "${step.attributes.alt || ''}"

User Action: ${userActionText}

Generate an action instruction starting with "Click on" (or "Type"/"Select" when applicable).`;

    const userContent: string | ApiInputContentBlock[] = step.screenshot
      ? [
          {
            type: 'text',
            text: templates.user(elementPrompt)
          },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: detectImageMediaType(step.screenshot),
              data: step.screenshot
            }
          }
        ]
      : elementPrompt;

    const result = await invoke({
      maxTokens: 64,
      messages: [
        { role: 'user', content: userContent },
        {
          role: 'assistant',
          content: templates.assistant
        }
      ],
      system: templates.system,
      modelClass: 'small_fast'
    });

    return parseTaggedValue(readTextBlocks(result), 'description');
  } catch {
    return '';
  }
}

export interface RecordedWorkflowStep {
  description: string;
  speechTranscript?: string;
  screenshot?: string;
}

function buildReusablePrompt(
  parsed: {
    inputs: Array<{ name: string; description: string }>;
    prompt: string;
  },
  locale: SupportedLocale = 'en-US'
): string {
  if (parsed.inputs.length === 0) return parsed.prompt;
  const prefix = WORKFLOW_INPUT_PREFIX[locale];
  return `${prefix}\n${parsed.inputs
    .map((item) => `- ${item.name}: ${item.description}`)
    .join('\n')}\n\n${parsed.prompt}`;
}

export async function generateWorkflowSummary(
  steps: RecordedWorkflowStep[],
  invoke: ModelInvoker,
  includeHighlyDetailedFallback = false,
  locale: SupportedLocale = 'en-US'
): Promise<string> {
  try {
    if (!steps || steps.length === 0) return '';

    const stepList = steps.map((step, index) => `${index + 1}. ${step.description}`).join('\n');
    const spokenNarration = steps
      .map((step) => step.speechTranscript)
      .filter((value): value is string => Boolean(value))
      .join(' ');

    const templates = PROMPT_TEMPLATES[locale].workflowSummary;
    const narrationSection = spokenNarration
      ? templates.fragments.narration(spokenNarration)
      : '';

    const detailHint = includeHighlyDetailedFallback
      ? templates.fragments.detailHint
      : templates.fragments.contextHint;

    const finalUserText = templates.user(stepList, narrationSection, detailHint);

    const userContent: ApiInputContentBlock[] = [
      {
        type: 'text',
        text: finalUserText
      }
    ];

    for (const step of steps) {
      if (!step.screenshot) continue;
      userContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: detectImageMediaType(step.screenshot),
          data: step.screenshot
        }
      });
    }

    const result = await invoke({
      maxTokens: 512,
      messages: [
        { role: 'user', content: userContent },
        {
          role: 'assistant',
          content: templates.assistant
        }
      ],
      system: templates.system,
      model: DEFAULT_MODEL
    });

    const text = readTextBlocks(result);
    if (!text) return '';

    const inputsBlock = text.match(/<inputs>([\s\S]*?)<\/inputs>/)?.[1] || '';
    const promptBlock =
      text.match(/<prompt>([\s\S]*?)<\/prompt>/)?.[1]?.trim() ||
      text.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.trim() ||
      text.replace(/<inputs>[\s\S]*?<\/inputs>/g, '').replace(/<\/?prompt>/g, '').trim();

    const inputs = inputsBlock
      .split('\n')
      .filter((line) => line.trim().startsWith('-'))
      .map((line) => line.match(/-\s*([^:]+):\s*(.*)/))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .map((match) => ({ name: match[1].trim(), description: match[2].trim() }));

    return buildReusablePrompt({ inputs, prompt: promptBlock }, locale);
  } catch {
    return '';
  }
}

export const workflowGeneration = Object.freeze({
  generateConversationTitle,
  generateDailySummary,
  generateQuote,
  generateShortcutName,
  generateWorkflowStepDescription,
  generateWorkflowSummary
});
