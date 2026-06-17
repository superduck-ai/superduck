import { type SupportedLocale } from '../index-react-dom-intl';

export { type SupportedLocale };

export const WORKFLOW_INPUT_PREFIX = {
  'en-US': 'Before running this workflow, please provide the following information:',
  'zh-CN': '在运行此工作流之前，请提供以下信息：'
};

export const PROMPT_TEMPLATES = {
  'en-US': {
    shortcutName: {
      system:
        'Act as a concise command name generator for browser automation shortcuts. Use lowercase kebab-case and keep the command short.',
      user: (prompt: string) =>
        `<prompt>\n${prompt}\n</prompt>\n\nThink about the main action in this prompt, then suggest a short command name, putting it between <name> tags.`,
      assistant: 'Here is a concise command name for this shortcut:\n\n<name>'
    },
    workflowSummary: {
      system:
        'You are analyzing a recorded browser automation workflow. Capture semantic intent, extract dynamic inputs, and return structured <inputs> and <prompt> tags.',
      user: (stepList: string, narrationSection: string, detailHint: string) =>
        `Here is a sequence of browser automation steps that were just recorded:\n\n${stepList}${narrationSection}${detailHint}\n\nGenerate a reusable prompt that captures the task intent and goal.`,
      assistant: 'I will analyze this workflow and create a reusable prompt.\n\n<inputs>',
      fragments: {
        narration: (transcript: string) =>
          `\n\nUSER SPOKEN NARRATION:\n"${transcript}"\n\nUse this as the primary signal for intent.`,
        detailHint:
          '\n\nScreenshots are available now but will not be saved. Include enough visual detail to make the workflow reproducible without screenshots.',
        contextHint: '\n\nScreenshots are available for context.'
      }
    },
    stepDescription: {
      system:
        'Generate concise, screenshot-grounded action instructions for browser automation. Avoid HTML tag names in the final instruction.',
      user: (prompt: string) =>
        `${prompt}\n\nIMPORTANT: Look at the screenshot with the blue highlight box. Describe what the user is clicking based on what is visible.`,
      assistant: 'Here is the action instruction:\n\n<description>',
      fragments: {
        narration: (transcript: string) =>
          `\n\nUSER NARRATION:\n"${transcript}"\n\nUse this narration as the primary intent signal.`
      }
    },
    conversationTitle: {
      system:
        'Act as an accurate and concise title generator for browser automation conversations. Generate a <title> based on the first message in the conversation.',
      user: (text: string) =>
        `<conversation>\n\n${text}\n\n</conversation>\n\nThink about it, then suggest a title based on the first message, putting it between <title> tags.`
    },
    dailySummary: {
      system:
        'Transform conversation titles into a concise first-person daily summary with natural narrative flow.',
      user: (titles: string) =>
        `Here are the conversation titles from today:\n\n${titles}\n\nTransform these titles into a narrative daily summary (1-2 sentences) in first person as SuperDuck. Rewrite into past tense actions with natural flow. If completely meaningless, return "SKIP".`
    }
  },
  'zh-CN': {
    shortcutName: {
      system:
        '作为一个简洁的浏览器自动化快捷操作名称生成器。生成一个简洁、直观且具有可读性的中文名称（通常为2-6个字）。',
      user: (prompt: string) =>
        `<prompt>\n${prompt}\n</prompt>\n\n根据这个提示词的功能，建议一个简短且好记的中文名称，将其放在 <name> 标签之间。`,
      assistant: '这是该快捷方式的简洁中文名称：\n\n<name>'
    },
    workflowSummary: {
      system:
        '你正在分析一段录制的浏览器自动化工作流。捕捉语义意图，提取动态输入，并返回结构化的 <inputs> 和 <prompt> 标签。',
      user: (stepList: string, narrationSection: string, detailHint: string) =>
        `这是刚刚录制的一系列浏览器自动化步骤：\n\n${stepList}${narrationSection}${detailHint}\n\n生成一个可复用的提示词，捕捉任务意图和目标。`,
      assistant: '我将分析此工作流并创建一个可复用的提示词。\n\n<inputs>',
      fragments: {
        narration: (transcript: string) =>
          `\n\n用户口述旁白：\n"${transcript}"\n\n将此作为意图的主要信号。`,
        detailHint:
          '\n\n截图现在可用，但不会被保存。请包含足够的视觉细节，使工作流在没有截图的情况下也可复现。',
        contextHint: '\n\n截图可作为上下文参考。'
      }
    },
    stepDescription: {
      system: '生成简洁的、基于截图的浏览器自动化操作指令。避免在最终指令中使用 HTML 标签名称。',
      user: (prompt: string) =>
        `${prompt}\n\n重要提示：查看带有蓝色高亮框的截图。根据可见内容描述用户正在点击的对象。`,
      assistant: '这是操作指令：\n\n<description>',
      fragments: {
        narration: (transcript: string) =>
          `\n\n用户旁白：\n"${transcript}"\n\n以此旁白作为主要的意图信号。`
      }
    },
    conversationTitle: {
      system:
        '作为一个准确且简洁的浏览器自动化对话标题生成器。根据对话中的第一条消息生成一个 <title>。',
      user: (text: string) =>
        `<conversation>\n\n${text}\n\n</conversation>\n\n思考一下，然后根据第一条消息建议一个标题，将其放在 <title> 标签之间。`
    },
    dailySummary: {
      system: '将对话标题转换为具有自然叙事流的简洁第一人称每日总结。',
      user: (titles: string) =>
        `以下是今天的对话标题：\n\n${titles}\n\n将这些标题转换为以 SuperDuck 第一人称叙述的每日总结（1-2 句）。使用过去时态改写动作，语感自然。如果完全没有意义，返回 "SKIP"。`
    }
  }
};
