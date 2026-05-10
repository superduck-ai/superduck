import { getCompactionPrompts, detectConversationLanguage } from './compactionPrompts';
import { CONTEXT_WINDOW, MAX_TOKENS } from './messageLimits';
import type {
  ApiConversationMessage,
  ApiResponseMessage,
  ApiUsage,
  CreateApiMessageParams
} from '../messageTypes';

export class ConversationCompactor {
  private createMessage: (params: CreateApiMessageParams) => Promise<ApiResponseMessage>;
  private locale?: string;
  private contextWindow: number;

  constructor(
    createMessage: (params: CreateApiMessageParams) => Promise<ApiResponseMessage>,
    locale?: string,
    contextWindow: number = CONTEXT_WINDOW
  ) {
    this.createMessage = createMessage;
    this.locale = locale;
    this.contextWindow = contextWindow;
  }

  async compactConversation(
    messages: ApiConversationMessage[],
    maxTokens: number,
    continueWithoutPrompt: boolean
  ) {
    if (messages.length === 0) {
      throw new Error('No messages to compact');
    }

    const effectiveLocale = this.locale || detectConversationLanguage(messages);
    const prompts = getCompactionPrompts(effectiveLocale);

    const metrics = this.calculateMetricsFromMessages(messages, maxTokens);
    const preCompactTokenCount = metrics?.totalTokens || 0;
    const prepared = this.prepareMessages(messages);
    prepared.push({
      role: 'user',
      content: prompts.userPrompt
    });

    const response = await this.createMessage({
      max_tokens: MAX_TOKENS,
      messages: prepared,
      system: [{ type: 'text', text: prompts.systemPrompt }]
    });

    const summary = this.extractText(response);
    const summaryText = this.formatSummary(summary, continueWithoutPrompt);
    const summaryMessage: ApiConversationMessage = {
      role: 'user',
      content: summaryText,
      isCompactSummary: true
    };
    const preservedRecentImages = this.preserveRecentContext(messages);
    const messagesAfterCompacting: ApiConversationMessage[] = [
      {
        role: 'assistant',
        content: prompts.compactionNotice,
        isCompactionMessage: true
      },
      summaryMessage,
      ...preservedRecentImages
    ];

    const imageTokenEstimate = 1600;
    const postCompactTokenCount = Math.round(
      summaryText.length / 4 +
        preservedRecentImages.reduce((total, message) => {
          if (typeof message.content === 'string') {
            return total + message.content.length / 4;
          }
          if (!Array.isArray(message.content)) {
            return total + JSON.stringify(message.content || '').length / 4;
          }

          const imageCount = message.content.filter((item) => item?.type === 'image').length;
          const nonImageText = JSON.stringify(
            message.content.filter((item) => item?.type !== 'image')
          ).length;
          return total + imageCount * imageTokenEstimate + nonImageText / 4;
        }, 0)
    );

    return {
      summaryMessage,
      messagesAfterCompacting,
      preCompactTokenCount,
      postCompactTokenCount,
      tokensSaved: Math.max(0, preCompactTokenCount - postCompactTokenCount)
    };
  }

  private prepareMessages(messages: ApiConversationMessage[]) {
    const prepared: ApiConversationMessage[] = [];
    for (const message of messages) {
      if (!message || typeof message !== 'object') continue;
      if (!(message.role === 'user' || message.role === 'assistant')) continue;
      if (!message.content) continue;
      if (typeof message.content === 'string' && !message.content.trim()) continue;
      if (Array.isArray(message.content) && message.content.length === 0) continue;
      prepared.push({ role: message.role, content: message.content });
    }

    if (prepared.length > 0 && prepared[0].role === 'assistant') {
      prepared.unshift({ role: 'user', content: 'Continue the conversation.' });
    }

    return prepared;
  }

  private extractText(response: ApiResponseMessage) {
    if (!Array.isArray(response?.content)) {
      throw new Error('No content in compaction response');
    }

    const text = response.content
      .filter(
        (
          item
        ): item is Extract<ApiResponseMessage['content'][number], { type: 'text' }> =>
          item.type === 'text'
      )
      .map((item) => item.text || '')
      .join('\n')
      .trim();

    if (!text) {
      throw new Error('No text in compaction response');
    }

    return text;
  }

  private formatSummary(summary: string, continueWithoutPrompt: boolean) {
    const effectiveLocale = this.locale || 'en-US';
    const prompts = getCompactionPrompts(effectiveLocale);

    const cleaned = summary
      .replace(/<analysis>[\s\S]*?<\/analysis>/gi, '')
      .replace(/<summary>([\s\S]*?)<\/summary>/gi, '$1')
      .replace(/\n\n+/g, '\n\n')
      .trim();

    const template = prompts.summaryPrefix(continueWithoutPrompt);
    return template.replace('{summary}', cleaned);
  }

  private preserveRecentContext(messages: ApiConversationMessage[]) {
    const preserved: ApiConversationMessage[] = [];
    let imageMessages = 0;

    for (let index = messages.length - 1; index >= 0 && imageMessages < 3; index -= 1) {
      const message = messages[index];
      if (!message || message.role !== 'user' || !Array.isArray(message.content)) continue;
      const imageContent = message.content.filter((item) => item?.type === 'image');
      if (imageContent.length === 0) continue;
      preserved.unshift({
        ...message,
        content: imageContent
      });
      imageMessages += 1;
    }

    return preserved;
  }

  private calculateMetricsFromMessages(messages: ApiConversationMessage[], maxTokens: number) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role === 'assistant' && message?.usage) {
        return this.calculateMetricsFromUsage(message.usage, maxTokens);
      }
    }

    return null;
  }

  private calculateMetricsFromUsage(usage: ApiUsage, maxTokens: number) {
    const inputTokens = usage?.input_tokens || 0;
    const outputTokens = usage?.output_tokens || 0;
    const cacheCreationTokens = usage?.cache_creation_input_tokens || 0;
    const cacheReadTokens = usage?.cache_read_input_tokens || 0;
    const cachedTokens = cacheCreationTokens + cacheReadTokens;
    const effectiveContextWindow = Math.max(1, this.contextWindow - maxTokens);
    const totalTokens = inputTokens + outputTokens + cachedTokens;
    return {
      totalTokens,
      contextWindow: effectiveContextWindow,
      percentUsed: Math.round((totalTokens / effectiveContextWindow) * 100)
    };
  }
}
