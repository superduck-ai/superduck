import type { ApiConversationMessage } from '../messageTypes';
import { isTextContentBlock } from '../messageTypes';

/**
 * Compaction prompts for different locales
 *
 * This module provides i18n-aware prompts for conversation compaction.
 * The prompts are designed to generate high-quality summaries that preserve
 * critical information for browser automation tasks.
 */

export type SupportedCompactionLocale = 'en-US' | 'zh-CN';

interface CompactionPrompts {
  systemPrompt: string;
  userPrompt: string;
  summaryPrefix: (continueWithoutPrompt: boolean) => string;
  compactionNotice: string;
}

/**
 * English prompts - optimized for clarity and structure
 */
const EN_PROMPTS: CompactionPrompts = {
  systemPrompt: `You are a conversation summarizer for browser automation tasks. Your summaries must:
- Be accurate and preserve all critical information
- Use the same language as the conversation
- Be structured and easy to understand
- Focus on what matters for continuing the task
- Be concise but comprehensive`,

  userPrompt: `Summarize this browser automation conversation. Create a comprehensive summary that preserves:

1. **User's Goals**: What is the user trying to accomplish?
2. **Specific Instructions**: Any explicit requirements, constraints, or preferences given by the user
3. **Corrections & Changes**: Any modifications to the approach or corrections made during the conversation
4. **Current Context**:
   - Which websites/pages are we working with?
   - What data or information has been gathered?
   - Current state of the task
5. **Progress Made**: What has been completed successfully?
6. **Next Steps**: What needs to be done next to complete the task?
7. **Important Details**: Any specific values, URLs, selectors, or technical details that must be preserved

Format your summary clearly with sections. Focus on actionable information that will help continue the task seamlessly. Be concise but don't omit critical details.`,

  summaryPrefix: (continueWithoutPrompt: boolean) => {
    const base = `The conversation history was compressed to save context space. Here's a summary of what we discussed:`;
    const continuation = continueWithoutPrompt
      ? `\n\nI'll continue from where we left off without asking additional questions.`
      : `\n\nHow would you like to proceed?`;
    return base + '\n\n{summary}' + continuation;
  },

  compactionNotice: 'This conversation has been summarized so we can keep going.'
};

/**
 * Chinese prompts - optimized for Chinese language patterns
 */
const ZH_CN_PROMPTS: CompactionPrompts = {
  systemPrompt: `你是一个浏览器自动化任务的对话总结助手。你的摘要必须：
- 准确并保留所有关键信息
- 使用与对话相同的语言
- 结构清晰易懂
- 聚焦于继续任务所需的重要内容
- 简洁但全面`,

  userPrompt: `请总结这段浏览器自动化对话。创建一个全面的摘要，务必保留：

1. **用户目标**：用户想要完成什么任务？
2. **具体指令**：用户给出的明确要求、约束条件或偏好设置
3. **修正与变更**：对话过程中对方法的任何修改或纠正
4. **当前上下文**：
   - 正在处理哪些网站/页面？
   - 已收集了哪些数据或信息？
   - 任务的当前状态
5. **已完成进展**：哪些部分已成功完成？
6. **后续步骤**：完成任务还需要做什么？
7. **重要细节**：必须保留的具体数值、URL、选择器或技术细节

请用清晰的分段格式组织摘要。重点关注有助于无缝继续任务的可操作信息。要简洁但不要遗漏关键细节。`,

  summaryPrefix: (continueWithoutPrompt: boolean) => {
    const base = `为了节省上下文空间，对话历史已被压缩。以下是我们讨论内容的摘要：`;
    const continuation = continueWithoutPrompt
      ? `\n\n我将从我们停下的地方继续，不会询问额外的问题。`
      : `\n\n您希望如何继续？`;
    return base + '\n\n{summary}' + continuation;
  },

  compactionNotice: '对话已被总结，我们可以继续了。'
};

/**
 * Get prompts for a specific locale
 */
export function getCompactionPrompts(locale?: string): CompactionPrompts {
  const normalizedLocale = normalizeLocale(locale);

  switch (normalizedLocale) {
    case 'zh-CN':
      return ZH_CN_PROMPTS;
    case 'en-US':
    default:
      return EN_PROMPTS;
  }
}

/**
 * Normalize locale string to supported locale
 */
function normalizeLocale(locale?: string): SupportedCompactionLocale {
  if (!locale) return 'en-US';

  const lower = locale.toLowerCase();

  // Chinese variants
  if (lower.startsWith('zh')) {
    return 'zh-CN';
  }

  // Default to English
  return 'en-US';
}

/**
 * Detect conversation language from messages
 * This can be used as a fallback if locale is not available
 */
export function detectConversationLanguage(
  messages: ApiConversationMessage[]
): SupportedCompactionLocale {
  // Sample recent user messages
  const recentUserMessages = messages
    .filter((msg) => msg.role === 'user')
    .slice(-5)
    .map((msg) => {
      if (typeof msg.content === 'string') return msg.content;
      if (Array.isArray(msg.content)) {
        return msg.content
          .filter(isTextContentBlock)
          .map((item) => item.text || '')
          .join(' ');
      }
      return '';
    })
    .join(' ');

  // Simple heuristic: check for Chinese characters
  const chineseCharCount = (recentUserMessages.match(/[\u4e00-\u9fa5]/g) || []).length;
  const totalChars = recentUserMessages.length;

  // If more than 20% are Chinese characters, consider it Chinese
  if (totalChars > 0 && chineseCharCount / totalChars > 0.2) {
    return 'zh-CN';
  }

  return 'en-US';
}
