import React from 'react';
import { Camera, Code } from 'lucide-react';
import type { IntlShape } from 'react-intl';
import {
  FlowIcon,
  CircleArrowDownIcon,
  CircleArrowLeftIcon,
  CircleArrowRightIcon,
  CircleArrowUpIcon,
  HorizontalResizeIcon,
  EyeIcon,
  SearchIcon,
  BracketsIcon,
  GlobeIcon,
  UploadIcon,
  CodeBracketsIcon,
  TerminalPromptIcon,
  ChecklistIcon,
  MonitorIcon,
  TabsIcon,
  VerticalResizeIcon,
  KeyboardIcon,
  StopwatchIcon,
  BookIcon,
  FileDocumentIcon,
  LightbulbIcon,
  InboxIcon,
  RetryIcon
} from './icons';

type FormatMessageValues = Record<string, string | number | boolean | null | undefined>;
type ToolDisplayInput = Record<string, unknown>;

interface ToolDisplayResult {
  content?: string | unknown[];
}

function getStringField(input: ToolDisplayInput, key: string): string | undefined {
  const value = input[key];
  return typeof value === 'string' ? value : undefined;
}

function getNumberField(input: ToolDisplayInput, key: string): number | undefined {
  const value = input[key];
  return typeof value === 'number' ? value : undefined;
}

function getPrimitiveField(
  input: ToolDisplayInput,
  key: string
): string | number | boolean | undefined {
  const value = input[key];
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? value
    : undefined;
}

function isTextResultBlock(block: unknown): block is { type: 'text'; text: string } {
  return (
    typeof block === 'object' &&
    block !== null &&
    'type' in block &&
    'text' in block &&
    (block as { type?: unknown }).type === 'text' &&
    typeof (block as { text?: unknown }).text === 'string'
  );
}

export type FormatMessageLike = (
  descriptor: { id: string; defaultMessage: string },
  values?: FormatMessageValues
) => string;

export function asFormatMessageLike(intl: Pick<IntlShape, 'formatMessage'>): FormatMessageLike {
  return (descriptor, values) => intl.formatMessage(descriptor, values);
}

function formatWithFallback(
  formatMessage: FormatMessageLike | undefined,
  descriptor: { id: string; defaultMessage: string },
  values?: FormatMessageValues
): string {
  if (formatMessage) {
    return formatMessage(descriptor, values);
  }

  return descriptor.defaultMessage.replace(/\{(\w+)\}/g, (_, key) => String(values?.[key] ?? ''));
}

export function formatStepCountLabel(
  formatMessage: FormatMessageLike | undefined,
  count: number
): string {
  if (!formatMessage) {
    return `${count} step${count === 1 ? '' : 's'}`;
  }

  return formatMessage(
    {
      id: 'tool_step_count',
      defaultMessage: '{count, plural, one {# step} other {# steps}}'
    },
    { count }
  );
}

export function getToolDisplayName(toolName: string): string {
  const parts = toolName.split('__');
  const baseName = parts.length >= 3 ? parts[2] : toolName;
  const colonParts = baseName.split(':');
  const finalName = colonParts.length >= 2 ? colonParts[colonParts.length - 1] : baseName;
  return finalName
    .split('_')
    .map((word, i) =>
      i === 0 ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word.toLowerCase()
    )
    .join(' ');
}

export function getToolDisplayInfo(
  toolName: string,
  input?: ToolDisplayInput,
  toolResult?: ToolDisplayResult,
  formatMessage?: FormatMessageLike
): { text: string; icon: string } {
  const parts = toolName.split('__');
  const baseName = parts.length >= 3 ? parts[2] : toolName;
  const o: ToolDisplayInput = input ?? {};
  const t = (id: string, defaultMessage: string, values?: FormatMessageValues) =>
    formatWithFallback(formatMessage, { id, defaultMessage }, values);

  if (baseName === 'computer') {
    const action = getStringField(o, 'action');
    switch (action) {
      case 'screenshot':
        return { text: t('take_screenshot', 'Take screenshot'), icon: 'camera' };
      case 'left_click':
        return { text: t('click', 'Click'), icon: 'click' };
      case 'right_click':
        return { text: t('right_click', 'Right-click'), icon: 'click' };
      case 'double_click':
        return { text: t('double_click', 'Double-click'), icon: 'click' };
      case 'triple_click':
        return { text: t('tripleclick', 'Triple-click'), icon: 'click' };
      case 'type': {
        const text = getStringField(o, 'text');
        if (text) {
          const preview = text.length > 30 ? `${text.slice(0, 30)}...` : text;
          return { text: t('type', 'Type: "{text}"', { text: preview }), icon: 'keyboard' };
        }
        return { text: t('type_text', 'Type text'), icon: 'keyboard' };
      }
      case 'wait': {
        const duration = getNumberField(o, 'duration');
        if (duration) {
          return {
            text: t('wait_duration', 'Wait {duration} seconds', { duration }),
            icon: 'timer'
          };
        }
        return { text: t('wait', 'Wait'), icon: 'timer' };
      }
      case 'scroll': {
        const dir = getStringField(o, 'scroll_direction');
        if (dir === 'up') return { text: t('scroll_up', 'Scroll up'), icon: 'scroll-up' };
        if (dir === 'left') return { text: t('scroll_left', 'Scroll left'), icon: 'scroll-left' };
        if (dir === 'right')
          return { text: t('scroll_right', 'Scroll right'), icon: 'scroll-right' };
        return { text: t('scroll_down', 'Scroll down'), icon: 'scroll-down' };
      }
      case 'key': {
        const keys = getStringField(o, 'text');
        return {
          text: keys
            ? t('press_key', 'Press key: {keys}', { keys })
            : t('press_key_label', 'Press key'),
          icon: 'keyboard'
        };
      }
      case 'left_click_drag':
        return { text: t('drag', 'Drag'), icon: 'drag' };
      case 'zoom':
        return { text: t('zoom', 'Zoom'), icon: 'zoom' };
      case 'hover':
        return { text: t('hover', 'Hover'), icon: 'computer' };
      case 'scroll_to':
        return { text: t('scroll_to_element', 'Scroll to element'), icon: 'scroll-down' };
      default:
        return {
          text: t('computer_action_unknown', 'Computer action: {action}', {
            action: action || 'Unknown'
          }),
          icon: 'computer'
        };
    }
  }

  switch (baseName) {
    case 'screenshot':
      return { text: t('take_screenshot', 'Take screenshot'), icon: 'camera' };
    case 'read_page': {
      const filter = getStringField(o, 'filter');
      if (filter === 'interactive') {
        return { text: t('read_page_interactive', 'Read page (interactive)'), icon: 'eye' };
      }
      if (filter === 'all') {
        return { text: t('read_page_all', 'Read page (all)'), icon: 'eye' };
      }
      return { text: t('read_page', 'Read page'), icon: 'eye' };
    }
    case 'find': {
      const query = getStringField(o, 'query');
      if (query) {
        const preview = query.length > 30 ? `${query.slice(0, 30)}...` : query;
        return { text: t('find', 'Find: "{query}"', { query: preview }), icon: 'search' };
      }
      return { text: t('find_element', 'Find element'), icon: 'search' };
    }
    case 'get_page_text':
      return { text: t('extract_page_text', 'Extract page text'), icon: 'eye' };
    case 'form_input': {
      const value = getPrimitiveField(o, 'value');
      if (value) {
        const preview = String(value).length > 20 ? `${String(value).slice(0, 20)}...` : value;
        return {
          text: t('set_input_to', 'Set input to "{value}"', { value: preview }),
          icon: 'form'
        };
      }
      return { text: t('set_form_value', 'Set form value'), icon: 'form' };
    }
    case 'click': {
      const target = getStringField(o, 'text');
      if (target) {
        const preview = target.length > 30 ? `${target.slice(0, 30)}...` : target;
        return {
          text: t('click_with_target', 'Click: "{target}"', { target: preview }),
          icon: 'click'
        };
      }
      return { text: t('click', 'Click'), icon: 'click' };
    }
    case 'navigate': {
      const url = getStringField(o, 'url');
      const preview = url ? (url.length > 30 ? `${url.slice(0, 30)}...` : url) : '';
      return { text: t('navigate_to', 'Navigate to {url}', { url: preview }), icon: 'navigate' };
    }
    case 'type': {
      const text = getStringField(o, 'text');
      if (text) {
        const preview = text.length > 30 ? `${text.slice(0, 30)}...` : text;
        return { text: t('type', 'Type: "{text}"', { text: preview }), icon: 'keyboard' };
      }
      return { text: t('type_text', 'Type text'), icon: 'keyboard' };
    }
    case 'wait': {
      const duration = getNumberField(o, 'duration');
      if (duration) {
        return {
          text: t('wait_duration', 'Wait {duration} seconds', { duration }),
          icon: 'timer'
        };
      }
      return { text: t('wait', 'Wait'), icon: 'timer' };
    }
    case 'tabs_create':
      return { text: t('create_new_tab', 'Create new tab'), icon: 'tabs' };
    case 'tabs_context':
    case 'tabs_context_mcp':
      return { text: t('get_tabs', 'Get tabs'), icon: 'tabs' };
    case 'upload_image':
      return { text: t('upload_image', 'Upload image'), icon: 'upload' };
    case 'javascript_tool':
    case 'execute_js':
    case 'execute_javascript':
      return { text: t('execute_javascript', 'Execute JavaScript'), icon: 'code' };
    case 'read_console_messages':
      return { text: t('read_console_messages', 'Read console messages'), icon: 'console' };
    case 'read_network_requests':
      return { text: t('read_network_requests', 'Read network requests'), icon: 'network' };
    case 'resize_window':
      return { text: t('resize_window', 'Resize window'), icon: 'resize' };
    case 'gif_creator':
      return { text: t('create_gif', 'Create GIF'), icon: 'gif' };
    case 'update_plan': {
      const resultText = Array.isArray(toolResult?.content)
        ? toolResult.content
            .filter(isTextResultBlock)
            .map((c) => c.text)
            .join('')
        : typeof toolResult?.content === 'string'
          ? toolResult.content
          : '';
      if (resultText.includes('rejected') || resultText.includes('Permission denied')) {
        return { icon: 'plan', text: t('plan_rejected', 'Plan rejected') };
      }
      if (resultText.includes('approved your plan') || resultText.includes('User has approved')) {
        return { icon: 'plan', text: t('created_a_plan', 'Created a plan') };
      }
      return { icon: 'plan', text: t('ask_before_acting', 'Ask before acting') };
    }
    case 'WebSearch':
      return { text: t('web_search', 'Web search'), icon: 'web-search' };
    case 'WebFetch': {
      const url = getStringField(o, 'url');
      if (url) {
        try {
          const hostname = new URL(url).hostname;
          return {
            text: t('fetching_from', 'Fetching from {hostname}', { hostname }),
            icon: 'web-fetch'
          };
        } catch {
          const preview = url.length > 30 ? `${url.slice(0, 30)}...` : url;
          return { text: t('fetch', 'Fetch {url}', { url: preview }), icon: 'web-fetch' };
        }
      }
      return { text: t('web_fetch', 'Web fetch'), icon: 'web-fetch' };
    }
    case 'switch_browser':
      return { text: t('switching_browser', 'Switching browser'), icon: 'shuffle' };
    default: {
      const displayName = getToolDisplayName(toolName);
      return { text: displayName, icon: 'computer' };
    }
  }
}

export const BROWSER_TOOLS = new Set([
  'computer',
  'click',
  'navigate',
  'read_page',
  'find',
  'screenshot',
  'get_page_text',
  'form_input',
  'type',
  'wait',
  'tabs_create',
  'tabs_context',
  'tabs_context_mcp',
  'upload_image',
  'file_upload',
  'read_console_messages',
  'read_network_requests',
  'resize_window',
  'gif_creator',
  'execute_js',
  'execute_javascript',
  'javascript_tool'
]);

export const MCP_TOOL_REGEX = /^mcp__[0-9a-f-]+__.+$/;

export function resolveToolIcon(iconName: string, size: number = 12): React.ReactNode {
  switch (iconName) {
    case 'camera':
    case 'gif':
      return <Camera size={size} className="text-text-300" />;
    case 'click':
    case 'drag':
      return <MonitorIcon size={size} className="text-text-300" />;
    case 'keyboard':
      return <KeyboardIcon size={size} className="text-text-300" />;
    case 'timer':
      return <StopwatchIcon size={size} className="text-text-300" />;
    case 'scroll-up':
      return <CircleArrowUpIcon size={size} className="text-text-300" />;
    case 'scroll-down':
      return <CircleArrowDownIcon size={size} className="text-text-300" />;
    case 'scroll-left':
      return <CircleArrowLeftIcon size={size} className="text-text-300" />;
    case 'scroll-right':
      return <CircleArrowRightIcon size={size} className="text-text-300" />;
    case 'zoom':
      return <HorizontalResizeIcon size={size} className="text-text-300" />;
    case 'eye':
      return <EyeIcon size={size} className="text-text-300" />;
    case 'search':
    case 'web-search':
      return <SearchIcon size={size} className="text-text-300" />;
    case 'form':
      return <BracketsIcon size={size} className="text-text-300" />;
    case 'navigate':
    case 'web-fetch':
      return <GlobeIcon size={size} className="text-text-300" />;
    case 'tabs':
      return <TabsIcon size={size} className="text-text-300" />;
    case 'upload':
      return <UploadIcon size={size} className="text-text-300" />;
    case 'code':
      return (
        <span className="text-text-300">
          <Code size={size} color="currentColor" />
        </span>
      );
    case 'terminal':
    case 'console':
    case 'network':
      return <TerminalPromptIcon size={size} className="text-text-300" />;
    case 'plan':
      return <ChecklistIcon size={size} className="text-text-300" />;
    case 'resize':
      return <VerticalResizeIcon size={size} className="text-text-300" />;
    case 'shuffle':
      return <MonitorIcon size={size} className="text-text-300" />;
    case 'computer':
    default:
      return <MonitorIcon size={size} className="text-text-300" />;
  }
}

export function resolveToolNameIcon(toolName: string, size: number = 12): React.ReactNode | null {
  const normalized = toolName.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
  switch (normalized) {
    case 'bash':
    case 'bash_tool':
      return <TerminalPromptIcon size={size} className="text-text-300" />;
    case 'read':
      return <BookIcon size={size} className="text-text-300" />;
    case 'write':
    case 'create_file':
    case 'open_file':
    case 'update_file':
      return <FileDocumentIcon size={size} className="text-text-300" />;
    case 'edit':
    case 'str_replace':
    case 'str_replace_editor':
      return <FileDocumentIcon size={size} className="text-text-300" />;
    case 'glob':
    case 'grep':
      return <SearchIcon size={size} className="text-text-300" />;
    case 'repl':
      return <CodeBracketsIcon size={size} className="text-text-300" />;
    case 'web_search':
    case 'web_fetch':
      return <GlobeIcon size={size} className="text-text-300" />;
    case 'todo_write':
      return <ChecklistIcon size={size} className="text-text-300" />;
    case 'task':
      return <FlowIcon size={size} className="text-text-300" />;
    case 'ask_user_question':
      return <LightbulbIcon size={size} className="text-text-300" />;
    case 'recent_chats':
    case 'conversation_search':
      return <RetryIcon size={size} className="text-text-300" />;
    case 'project_knowledge_search':
      return <InboxIcon size={size} className="text-text-300" />;
    default:
      return null;
  }
}
