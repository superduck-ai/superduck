import { getCompactionPrompts, detectConversationLanguage } from './compactionPrompts';
import { MAX_TOKENS } from './messageLimits';
import type {
  ApiConversationMessage,
  ApiResponseMessage,
  CreateApiMessageParams
} from '../../messageTypes';

export class ConversationCompactor {
  private createMessage: (params: CreateApiMessageParams) => Promise<ApiResponseMessage>;
  private locale?: string;

  constructor(
    createMessage: (params: CreateApiMessageParams) => Promise<ApiResponseMessage>,
    locale?: string
  ) {
    this.createMessage = createMessage;
    this.locale = locale;
  }

  async compactConversation(messages: ApiConversationMessage[], continueWithoutPrompt: boolean) {
    if (messages.length === 0) {
      throw new Error('No messages to compact');
    }

    const effectiveLocale = this.locale || detectConversationLanguage(messages);
    const prompts = getCompactionPrompts(effectiveLocale);

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

    return {
      messagesAfterCompacting
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
        (item): item is Extract<ApiResponseMessage['content'][number], { type: 'text' }> =>
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
}
