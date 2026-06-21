/**
 * Bundled OpenRouter model metadata.
 *
 * Generated from https://openrouter.ai/api/v1/models so extension users do not need to
 * reach OpenRouter at runtime for model metadata such as context length,
 * pricing, modalities, and supported parameters.
 *
 * Refresh with: bun scripts/update-openrouter-models.mjs
 */

export interface OpenRouterModelMetadata {
  id: string;
  canonicalSlug?: string;
  name: string;
  description?: string;
  created?: number;
  contextLength: number;
  maxCompletionTokens?: number;
  isModerated?: boolean;
  modality?: string;
  inputModalities?: string[];
  outputModalities?: string[];
  tokenizer?: string;
  instructType?: string;
  pricing?: Record<string, string>;
  supportedParameters?: string[];
  knowledgeCutoff?: string;
  expirationDate?: string;
  reasoning?: {
    mandatory?: boolean;
    defaultEnabled?: boolean;
    supportedEfforts?: string[];
    defaultEffort?: string;
  };
}

export const OPENROUTER_MODELS: OpenRouterModelMetadata[] = [
  {
    id: '~anthropic/claude-fable-latest',
    canonicalSlug: '~anthropic/claude-fable-latest',
    name: 'Anthropic: Claude Fable Latest',
    description: 'This model always redirects to the latest model in the Claude Fable family.',
    created: 1781029944,
    contextLength: 1000000,
    maxCompletionTokens: 128000,
    isModerated: true,
    modality: 'text+image+file->text',
    inputModalities: ['text', 'image', 'file'],
    outputModalities: ['text'],
    tokenizer: 'Router',
    pricing: {
      completion: '0.00005',
      input_cache_read: '0.000001',
      input_cache_write: '0.0000125',
      prompt: '0.00001',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_completion_tokens',
      'max_tokens',
      'reasoning',
      'response_format',
      'stop',
      'structured_outputs',
      'tool_choice',
      'tools',
      'verbosity'
    ],
    reasoning: {
      mandatory: true
    }
  },
  {
    id: '~anthropic/claude-haiku-latest',
    canonicalSlug: '~anthropic/claude-haiku-latest',
    name: 'Anthropic Claude Haiku Latest',
    description:
      'This model always redirects to the latest model in the Anthropic Claude Haiku family.',
    created: 1777318492,
    contextLength: 200000,
    maxCompletionTokens: 64000,
    isModerated: true,
    modality: 'text+image+file->text',
    inputModalities: ['text', 'image', 'file'],
    outputModalities: ['text'],
    tokenizer: 'Router',
    pricing: {
      completion: '0.000005',
      input_cache_read: '0.0000001',
      input_cache_write: '0.00000125',
      prompt: '0.000001',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: '~anthropic/claude-opus-latest',
    canonicalSlug: '~anthropic/claude-opus-latest',
    name: 'Anthropic: Claude Opus Latest',
    description: 'This model always redirects to the latest model in the Claude Opus family.',
    created: 1776795361,
    contextLength: 1000000,
    maxCompletionTokens: 128000,
    isModerated: false,
    modality: 'text+image+file->text',
    inputModalities: ['text', 'image', 'file'],
    outputModalities: ['text'],
    tokenizer: 'Router',
    pricing: {
      completion: '0.000025',
      input_cache_read: '0.0000005',
      input_cache_write: '0.00000625',
      prompt: '0.000005',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'stop',
      'structured_outputs',
      'tool_choice',
      'tools',
      'verbosity'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: '~anthropic/claude-sonnet-latest',
    canonicalSlug: '~anthropic/claude-sonnet-latest',
    name: 'Anthropic Claude Sonnet Latest',
    description:
      'This model always redirects to the latest model in the Anthropic Claude Sonnet family.',
    created: 1777318368,
    contextLength: 1000000,
    maxCompletionTokens: 128000,
    isModerated: true,
    modality: 'text+image+file->text',
    inputModalities: ['text', 'image', 'file'],
    outputModalities: ['text'],
    tokenizer: 'Router',
    pricing: {
      completion: '0.000015',
      input_cache_read: '0.0000003',
      input_cache_write: '0.00000375',
      prompt: '0.000003',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_completion_tokens',
      'max_tokens',
      'reasoning',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
      'verbosity'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: '~google/gemini-flash-latest',
    canonicalSlug: '~google/gemini-flash-latest',
    name: 'Google Gemini Flash Latest',
    description:
      'This model always redirects to the latest model in the Google Gemini Flash family.',
    created: 1777318398,
    contextLength: 1048576,
    maxCompletionTokens: 65536,
    isModerated: false,
    modality: 'text+image+file+audio+video->text',
    inputModalities: ['text', 'image', 'video', 'file', 'audio'],
    outputModalities: ['text'],
    tokenizer: 'Router',
    pricing: {
      audio: '0.000003',
      completion: '0.000009',
      image: '0.0000015',
      input_cache_read: '0.00000015',
      input_cache_write: '0.00000008333333333333334',
      internal_reasoning: '0.000009',
      prompt: '0.0000015',
      web_search: '0.014'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    knowledgeCutoff: '2025-01-01',
    reasoning: {
      mandatory: true,
      defaultEnabled: true,
      supportedEfforts: ['high', 'medium', 'low', 'minimal'],
      defaultEffort: 'medium'
    }
  },
  {
    id: '~google/gemini-pro-latest',
    canonicalSlug: '~google/gemini-pro-latest',
    name: 'Google Gemini Pro Latest',
    description: 'This model always redirects to the latest model in the Google Gemini Pro family.',
    created: 1777318451,
    contextLength: 1048576,
    maxCompletionTokens: 65536,
    isModerated: false,
    modality: 'text+image+file+audio+video->text',
    inputModalities: ['audio', 'file', 'image', 'text', 'video'],
    outputModalities: ['text'],
    tokenizer: 'Router',
    pricing: {
      audio: '0.000002',
      completion: '0.000012',
      image: '0.000002',
      input_cache_read: '0.0000002',
      input_cache_write: '0.000000375',
      internal_reasoning: '0.000012',
      prompt: '0.000002',
      web_search: '0.014'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    reasoning: {
      mandatory: true,
      supportedEfforts: ['high', 'medium', 'low'],
      defaultEffort: 'medium'
    }
  },
  {
    id: '~moonshotai/kimi-latest',
    canonicalSlug: '~moonshotai/kimi-latest',
    name: 'MoonshotAI Kimi Latest',
    description: 'This model always redirects to the latest model in the MoonshotAI Kimi family.',
    created: 1777318428,
    contextLength: 262144,
    maxCompletionTokens: 262142,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'Router',
    pricing: {
      completion: '0.0000035',
      input_cache_read: '0.00000033',
      prompt: '0.00000066'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'parallel_tool_calls',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: true
    }
  },
  {
    id: '~openai/gpt-latest',
    canonicalSlug: '~openai/gpt-latest',
    name: 'OpenAI GPT Latest',
    description: 'This model always redirects to the latest model in the OpenAI GPT family.',
    created: 1777318334,
    contextLength: 1050000,
    maxCompletionTokens: 128000,
    isModerated: true,
    modality: 'text+image+file->text',
    inputModalities: ['file', 'image', 'text'],
    outputModalities: ['text'],
    tokenizer: 'Router',
    pricing: {
      completion: '0.00003',
      input_cache_read: '0.0000005',
      prompt: '0.000005',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_completion_tokens',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools'
    ],
    knowledgeCutoff: '2025-12-01',
    reasoning: {
      mandatory: false,
      defaultEnabled: true,
      supportedEfforts: ['xhigh', 'high', 'medium', 'low', 'none'],
      defaultEffort: 'medium'
    }
  },
  {
    id: '~openai/gpt-mini-latest',
    canonicalSlug: '~openai/gpt-mini-latest',
    name: 'OpenAI GPT Mini Latest',
    description: 'This model always redirects to the latest model in the OpenAI GPT Mini family.',
    created: 1777318471,
    contextLength: 400000,
    maxCompletionTokens: 128000,
    isModerated: true,
    modality: 'text+image+file->text',
    inputModalities: ['file', 'image', 'text'],
    outputModalities: ['text'],
    tokenizer: 'Router',
    pricing: {
      completion: '0.0000045',
      input_cache_read: '0.000000075',
      prompt: '0.00000075',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_completion_tokens',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools'
    ],
    knowledgeCutoff: '2025-08-31',
    reasoning: {
      mandatory: false,
      defaultEnabled: false,
      supportedEfforts: ['xhigh', 'high', 'medium', 'low', 'none'],
      defaultEffort: 'medium'
    }
  },
  {
    id: 'ai21/jamba-large-1.7',
    canonicalSlug: 'ai21/jamba-large-1.7',
    name: 'AI21: Jamba Large 1.7',
    description:
      'Jamba Large 1.7 is the latest model in the Jamba open family, offering improvements in grounding, instruction-following, and overall efficiency. Built on a hybrid SSM-Transformer architecture with a 256K context...',
    created: 1754669020,
    contextLength: 256000,
    maxCompletionTokens: 4096,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.000008',
      prompt: '0.000002'
    },
    supportedParameters: [
      'max_tokens',
      'response_format',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    knowledgeCutoff: '2024-08-31'
  },
  {
    id: 'aion-labs/aion-1.0',
    canonicalSlug: 'aion-labs/aion-1.0',
    name: 'AionLabs: Aion-1.0',
    description:
      'Aion-1.0 is a multi-model system designed for high performance across various tasks, including reasoning and coding. It is built on DeepSeek-R1, augmented with additional models and techniques such as Tree...',
    created: 1738697557,
    contextLength: 131072,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.000008',
      prompt: '0.000004'
    },
    supportedParameters: ['include_reasoning', 'max_tokens', 'reasoning', 'temperature', 'top_p'],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'aion-labs/aion-1.0-mini',
    canonicalSlug: 'aion-labs/aion-1.0-mini',
    name: 'AionLabs: Aion-1.0-Mini',
    description:
      'Aion-1.0-Mini 32B parameter model is a distilled version of the DeepSeek-R1 model, designed for strong performance in reasoning domains such as mathematics, coding, and logic. It is a modified variant...',
    created: 1738697107,
    contextLength: 131072,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000014',
      prompt: '0.0000007'
    },
    supportedParameters: ['include_reasoning', 'max_tokens', 'reasoning', 'temperature', 'top_p'],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'aion-labs/aion-2.0',
    canonicalSlug: 'aion-labs/aion-2.0-20260223',
    name: 'AionLabs: Aion-2.0',
    description:
      'Aion-2.0 is a variant of DeepSeek V3.2 optimized for immersive roleplaying and storytelling. It is particularly strong at introducing tension, crises, and conflict into stories, making narratives feel more engaging....',
    created: 1771881306,
    contextLength: 131072,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000016',
      input_cache_read: '0.0000002',
      prompt: '0.0000008'
    },
    supportedParameters: ['include_reasoning', 'max_tokens', 'reasoning', 'temperature', 'top_p'],
    reasoning: {
      mandatory: true
    }
  },
  {
    id: 'aion-labs/aion-rp-llama-3.1-8b',
    canonicalSlug: 'aion-labs/aion-rp-llama-3.1-8b',
    name: 'AionLabs: Aion-RP 1.0 (8B)',
    description:
      'Aion-RP-Llama-3.1-8B ranks the highest in the character evaluation portion of the RPBench-Auto benchmark, a roleplaying-specific variant of Arena-Hard-Auto, where LLMs evaluate each other\u2019s responses. It is a fine-tuned base model...',
    created: 1738696718,
    contextLength: 32768,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000016',
      prompt: '0.0000008'
    },
    supportedParameters: ['max_tokens', 'temperature', 'top_p'],
    knowledgeCutoff: '2023-12-31'
  },
  {
    id: 'allenai/olmo-3-32b-think',
    canonicalSlug: 'allenai/olmo-3-32b-think-20251121',
    name: 'AllenAI: Olmo 3 32B Think',
    description:
      'Olmo 3 32B Think is a large-scale, 32-billion-parameter model purpose-built for deep reasoning, complex logic chains and advanced instruction-following scenarios. Its capacity enables strong performance on demanding evaluation tasks and...',
    created: 1763758276,
    contextLength: 65536,
    maxCompletionTokens: 65536,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000005',
      prompt: '0.00000015'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p'
    ],
    reasoning: {
      mandatory: true
    }
  },
  {
    id: 'amazon/nova-2-lite-v1',
    canonicalSlug: 'amazon/nova-2-lite-v1',
    name: 'Amazon: Nova 2 Lite',
    description:
      'Nova 2 Lite is a fast, cost-effective reasoning model for everyday workloads that can process text, images, and videos to generate text. Nova 2 Lite demonstrates standout capabilities in processing...',
    created: 1764696672,
    contextLength: 1000000,
    maxCompletionTokens: 65535,
    isModerated: true,
    modality: 'text+image+file+video->text',
    inputModalities: ['text', 'image', 'video', 'file'],
    outputModalities: ['text'],
    tokenizer: 'Nova',
    pricing: {
      completion: '0.0000025',
      prompt: '0.0000003'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'amazon/nova-lite-v1',
    canonicalSlug: 'amazon/nova-lite-v1',
    name: 'Amazon: Nova Lite 1.0',
    description:
      'Amazon Nova Lite 1.0 is a very low-cost multimodal model from Amazon that focused on fast processing of image, video, and text inputs to generate text output. Amazon Nova Lite...',
    created: 1733437363,
    contextLength: 300000,
    maxCompletionTokens: 5120,
    isModerated: true,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'Nova',
    pricing: {
      completion: '0.00000024',
      prompt: '0.00000006'
    },
    supportedParameters: ['max_tokens', 'stop', 'temperature', 'tools', 'top_k', 'top_p'],
    knowledgeCutoff: '2024-10-31'
  },
  {
    id: 'amazon/nova-micro-v1',
    canonicalSlug: 'amazon/nova-micro-v1',
    name: 'Amazon: Nova Micro 1.0',
    description:
      'Amazon Nova Micro 1.0 is a text-only model that delivers the lowest latency responses in the Amazon Nova family of models at a very low cost. With a context length...',
    created: 1733437237,
    contextLength: 128000,
    maxCompletionTokens: 5120,
    isModerated: true,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Nova',
    pricing: {
      completion: '0.00000014',
      prompt: '0.000000035'
    },
    supportedParameters: ['max_tokens', 'stop', 'temperature', 'tools', 'top_k', 'top_p'],
    knowledgeCutoff: '2024-10-31'
  },
  {
    id: 'amazon/nova-premier-v1',
    canonicalSlug: 'amazon/nova-premier-v1',
    name: 'Amazon: Nova Premier 1.0',
    description:
      'Amazon Nova Premier is the most capable of Amazon\u2019s multimodal models for complex reasoning tasks and for use as the best teacher for distilling custom models.',
    created: 1761950332,
    contextLength: 1000000,
    maxCompletionTokens: 32000,
    isModerated: true,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'Nova',
    pricing: {
      completion: '0.0000125',
      input_cache_read: '0.000000625',
      prompt: '0.0000025'
    },
    supportedParameters: ['max_tokens', 'stop', 'temperature', 'tools', 'top_k', 'top_p']
  },
  {
    id: 'amazon/nova-pro-v1',
    canonicalSlug: 'amazon/nova-pro-v1',
    name: 'Amazon: Nova Pro 1.0',
    description:
      'Amazon Nova Pro 1.0 is a capable multimodal model from Amazon focused on providing a combination of accuracy, speed, and cost for a wide range of tasks. As of December...',
    created: 1733436303,
    contextLength: 300000,
    maxCompletionTokens: 5120,
    isModerated: true,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'Nova',
    pricing: {
      completion: '0.0000032',
      prompt: '0.0000008'
    },
    supportedParameters: ['max_tokens', 'stop', 'temperature', 'tools', 'top_k', 'top_p'],
    knowledgeCutoff: '2024-10-31'
  },
  {
    id: 'anthracite-org/magnum-v4-72b',
    canonicalSlug: 'anthracite-org/magnum-v4-72b',
    name: 'Magnum v4 72B',
    description:
      'This is a series of models designed to replicate the prose quality of the Claude 3 models, specifically Sonnet(https://openrouter.ai/anthropic/claude-3.5-sonnet) and Opus(https://openrouter.ai/anthropic/claude-3-opus).\n\nThe model is fine-tuned on top of [Qwen2.5 72B](https://openrouter.ai/qwen/qwen-2.5-72b-instruct).',
    created: 1729555200,
    contextLength: 32768,
    maxCompletionTokens: 2048,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Qwen',
    instructType: 'chatml',
    pricing: {
      completion: '0.000005',
      prompt: '0.000003'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_a',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2024-06-30'
  },
  {
    id: 'anthropic/claude-3-haiku',
    canonicalSlug: 'anthropic/claude-3-haiku',
    name: 'Anthropic: Claude 3 Haiku',
    description:
      "Claude 3 Haiku is Anthropic's fastest and most compact model for\nnear-instant responsiveness. Quick and accurate targeted performance.\n\nSee the launch announcement and benchmark results [here](https://www.anthropic.com/news/claude-3-haiku)\n\n#multimodal",
    created: 1710288000,
    contextLength: 200000,
    maxCompletionTokens: 4096,
    isModerated: true,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'Claude',
    pricing: {
      completion: '0.00000125',
      input_cache_read: '0.00000003',
      input_cache_write: '0.0000003',
      prompt: '0.00000025',
      web_search: '0.01'
    },
    supportedParameters: [
      'max_tokens',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2023-08-31'
  },
  {
    id: 'anthropic/claude-3.5-haiku',
    canonicalSlug: 'anthropic/claude-3-5-haiku',
    name: 'Anthropic: Claude 3.5 Haiku',
    description:
      'Claude 3.5 Haiku features offers enhanced capabilities in speed, coding accuracy, and tool use. Engineered to excel in real-time applications, it delivers quick response times that are essential for dynamic...',
    created: 1730678400,
    contextLength: 200000,
    maxCompletionTokens: 8192,
    isModerated: true,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'Claude',
    pricing: {
      completion: '0.000004',
      input_cache_read: '0.00000008',
      input_cache_write: '0.000001',
      prompt: '0.0000008',
      web_search: '0.01'
    },
    supportedParameters: [
      'max_tokens',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2024-07-31'
  },
  {
    id: 'anthropic/claude-fable-5',
    canonicalSlug: 'anthropic/claude-5-fable-20260609',
    name: 'Anthropic: Claude Fable 5',
    description:
      'Claude Fable 5 is a Mythos-class model from Anthropic, built for autonomous knowledge work and coding. It supports text, image, and file inputs with text output, with reasoning support and...',
    created: 1781007515,
    contextLength: 1000000,
    maxCompletionTokens: 128000,
    isModerated: true,
    modality: 'text+image+file->text',
    inputModalities: ['text', 'image', 'file'],
    outputModalities: ['text'],
    tokenizer: 'Claude',
    pricing: {
      completion: '0.00005',
      input_cache_read: '0.000001',
      input_cache_write: '0.0000125',
      prompt: '0.00001',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_completion_tokens',
      'max_tokens',
      'reasoning',
      'response_format',
      'stop',
      'structured_outputs',
      'tool_choice',
      'tools',
      'verbosity'
    ],
    reasoning: {
      mandatory: true
    }
  },
  {
    id: 'anthropic/claude-haiku-4.5',
    canonicalSlug: 'anthropic/claude-4.5-haiku-20251001',
    name: 'Anthropic: Claude Haiku 4.5',
    description:
      'Claude Haiku 4.5 is Anthropic\u2019s fastest and most efficient model, delivering near-frontier intelligence at a fraction of the cost and latency of larger Claude models. Matching Claude Sonnet 4\u2019s performance...',
    created: 1760547638,
    contextLength: 200000,
    maxCompletionTokens: 64000,
    isModerated: true,
    modality: 'text+image+file->text',
    inputModalities: ['text', 'image', 'file'],
    outputModalities: ['text'],
    tokenizer: 'Claude',
    pricing: {
      completion: '0.000005',
      input_cache_read: '0.0000001',
      input_cache_write: '0.00000125',
      prompt: '0.000001',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'anthropic/claude-opus-4',
    canonicalSlug: 'anthropic/claude-4-opus-20250522',
    name: 'Anthropic: Claude Opus 4',
    description:
      'Claude Opus 4 is benchmarked as the world\u2019s best coding model, at time of release, bringing sustained performance on complex, long-running tasks and agent workflows. It sets new benchmarks in...',
    created: 1747931245,
    contextLength: 200000,
    maxCompletionTokens: 32000,
    isModerated: false,
    modality: 'text+image+file->text',
    inputModalities: ['image', 'text', 'file'],
    outputModalities: ['text'],
    tokenizer: 'Claude',
    pricing: {
      completion: '0.000075',
      input_cache_read: '0.0000015',
      input_cache_write: '0.00001875',
      prompt: '0.000015',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    knowledgeCutoff: '2025-01-31',
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'anthropic/claude-opus-4.1',
    canonicalSlug: 'anthropic/claude-4.1-opus-20250805',
    name: 'Anthropic: Claude Opus 4.1',
    description:
      'Claude Opus 4.1 is an updated version of Anthropic\u2019s flagship model, offering improved performance in coding, reasoning, and agentic tasks. It achieves 74.5% on SWE-bench Verified and shows notable gains...',
    created: 1754411591,
    contextLength: 200000,
    maxCompletionTokens: 32000,
    isModerated: true,
    modality: 'text+image+file->text',
    inputModalities: ['image', 'text', 'file'],
    outputModalities: ['text'],
    tokenizer: 'Claude',
    pricing: {
      completion: '0.000075',
      input_cache_read: '0.0000015',
      input_cache_write: '0.00001875',
      prompt: '0.000015',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2025-01-31',
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'anthropic/claude-opus-4.5',
    canonicalSlug: 'anthropic/claude-4.5-opus-20251124',
    name: 'Anthropic: Claude Opus 4.5',
    description:
      'Claude Opus 4.5 is Anthropic\u2019s frontier reasoning model optimized for complex software engineering, agentic workflows, and long-horizon computer use. It offers strong multimodal capabilities, competitive performance across real-world coding and...',
    created: 1764010580,
    contextLength: 200000,
    maxCompletionTokens: 64000,
    isModerated: true,
    modality: 'text+image+file->text',
    inputModalities: ['file', 'image', 'text'],
    outputModalities: ['text'],
    tokenizer: 'Claude',
    pricing: {
      completion: '0.000025',
      input_cache_read: '0.0000005',
      input_cache_write: '0.00000625',
      prompt: '0.000005',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'verbosity'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'anthropic/claude-opus-4.6',
    canonicalSlug: 'anthropic/claude-4.6-opus-20260205',
    name: 'Anthropic: Claude Opus 4.6',
    description:
      'Opus 4.6 is Anthropic\u2019s strongest model for coding and long-running professional tasks. It is built for agents that operate across entire workflows rather than single prompts, making it especially effective...',
    created: 1770219050,
    contextLength: 1000000,
    maxCompletionTokens: 128000,
    isModerated: false,
    modality: 'text+image+file->text',
    inputModalities: ['text', 'image', 'file'],
    outputModalities: ['text'],
    tokenizer: 'Claude',
    pricing: {
      completion: '0.000025',
      input_cache_read: '0.0000005',
      input_cache_write: '0.00000625',
      prompt: '0.000005',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_completion_tokens',
      'max_tokens',
      'reasoning',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
      'verbosity'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'anthropic/claude-opus-4.6-fast',
    canonicalSlug: 'anthropic/claude-4.6-opus-fast-20260407',
    name: 'Anthropic: Claude Opus 4.6 (Fast)',
    description:
      "Fast-mode variant of [Opus 4.6](/anthropic/claude-opus-4.6) - identical capabilities with higher output speed at premium 6x pricing.\n\nLearn more in Anthropic's docs: https://platform.claude.com/docs/en/build-with-claude/fast-mode",
    created: 1775592472,
    contextLength: 1000000,
    maxCompletionTokens: 128000,
    isModerated: true,
    modality: 'text+image+file->text',
    inputModalities: ['text', 'image', 'file'],
    outputModalities: ['text'],
    tokenizer: 'Claude',
    pricing: {
      completion: '0.00015',
      input_cache_read: '0.000003',
      input_cache_write: '0.0000375',
      prompt: '0.00003',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p',
      'verbosity'
    ],
    expirationDate: '2026-06-29',
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'anthropic/claude-opus-4.7',
    canonicalSlug: 'anthropic/claude-4.7-opus-20260416',
    name: 'Anthropic: Claude Opus 4.7',
    description:
      "Opus 4.7 is the next generation of Anthropic's Opus family, built for long-running, asynchronous agents. Building on the coding and agentic strengths of Opus 4.6, it delivers stronger performance on...",
    created: 1776351100,
    contextLength: 1000000,
    maxCompletionTokens: 128000,
    isModerated: false,
    modality: 'text+image+file->text',
    inputModalities: ['text', 'image', 'file'],
    outputModalities: ['text'],
    tokenizer: 'Claude',
    pricing: {
      completion: '0.000025',
      input_cache_read: '0.0000005',
      input_cache_write: '0.00000625',
      prompt: '0.000005',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'stop',
      'structured_outputs',
      'tool_choice',
      'tools',
      'verbosity'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'anthropic/claude-opus-4.7-fast',
    canonicalSlug: 'anthropic/claude-4.7-opus-fast-20260512',
    name: 'Anthropic: Claude Opus 4.7 (Fast)',
    description:
      "Fast-mode variant of [Opus 4.7](/anthropic/claude-opus-4.7) - identical capabilities with higher output speed at premium 6x pricing.\n\nLearn more in Anthropic's docs: https://platform.claude.com/docs/en/build-with-claude/fast-mode",
    created: 1778613011,
    contextLength: 1000000,
    maxCompletionTokens: 128000,
    isModerated: true,
    modality: 'text+image+file->text',
    inputModalities: ['text', 'image', 'file'],
    outputModalities: ['text'],
    tokenizer: 'Claude',
    pricing: {
      completion: '0.00015',
      input_cache_read: '0.000003',
      input_cache_write: '0.0000375',
      prompt: '0.00003',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'stop',
      'structured_outputs',
      'tool_choice',
      'tools',
      'verbosity'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'anthropic/claude-opus-4.8',
    canonicalSlug: 'anthropic/claude-4.8-opus-20260528',
    name: 'Anthropic: Claude Opus 4.8',
    description:
      "Claude Opus 4.8 is Anthropic's most capable generally available model in the Opus family. It supports text, image, and file inputs with text output, with reasoning support and a 1M-token...",
    created: 1779905091,
    contextLength: 1000000,
    maxCompletionTokens: 128000,
    isModerated: false,
    modality: 'text+image+file->text',
    inputModalities: ['text', 'image', 'file'],
    outputModalities: ['text'],
    tokenizer: 'Claude',
    pricing: {
      completion: '0.000025',
      input_cache_read: '0.0000005',
      input_cache_write: '0.00000625',
      prompt: '0.000005',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'stop',
      'structured_outputs',
      'tool_choice',
      'tools',
      'verbosity'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'anthropic/claude-opus-4.8-fast',
    canonicalSlug: 'anthropic/claude-4.8-opus-fast-20260528',
    name: 'Anthropic: Claude Opus 4.8 (Fast)',
    description:
      "Fast-mode variant of [Opus 4.8](/anthropic/claude-opus-4.8) - identical capabilities with higher output speed at 2x pricing relative to regular Opus 4.8.\n\nLearn more in Anthropic's docs: https://platform.claude.com/docs/en/build-with-claude/fast-mode",
    created: 1779913703,
    contextLength: 1000000,
    maxCompletionTokens: 128000,
    isModerated: true,
    modality: 'text+image+file->text',
    inputModalities: ['text', 'image', 'file'],
    outputModalities: ['text'],
    tokenizer: 'Claude',
    pricing: {
      completion: '0.00005',
      input_cache_read: '0.000001',
      input_cache_write: '0.0000125',
      prompt: '0.00001',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'stop',
      'structured_outputs',
      'tool_choice',
      'tools',
      'verbosity'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'anthropic/claude-sonnet-4',
    canonicalSlug: 'anthropic/claude-4-sonnet-20250522',
    name: 'Anthropic: Claude Sonnet 4',
    description:
      'Claude Sonnet 4 significantly enhances the capabilities of its predecessor, Sonnet 3.7, excelling in both coding and reasoning tasks with improved precision and controllability. Achieving state-of-the-art performance on SWE-bench (72.7%),...',
    created: 1747930371,
    contextLength: 1000000,
    maxCompletionTokens: 64000,
    isModerated: false,
    modality: 'text+image+file->text',
    inputModalities: ['image', 'text', 'file'],
    outputModalities: ['text'],
    tokenizer: 'Claude',
    pricing: {
      completion: '0.000015',
      input_cache_read: '0.0000003',
      input_cache_write: '0.00000375',
      prompt: '0.000003',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2025-01-31',
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'anthropic/claude-sonnet-4.5',
    canonicalSlug: 'anthropic/claude-4.5-sonnet-20250929',
    name: 'Anthropic: Claude Sonnet 4.5',
    description:
      'Claude Sonnet 4.5 is Anthropic\u2019s most advanced Sonnet model to date, optimized for real-world agents and coding workflows. It delivers state-of-the-art performance on coding benchmarks such as SWE-bench Verified, with...',
    created: 1759161676,
    contextLength: 1000000,
    maxCompletionTokens: 64000,
    isModerated: true,
    modality: 'text+image+file->text',
    inputModalities: ['text', 'image', 'file'],
    outputModalities: ['text'],
    tokenizer: 'Claude',
    pricing: {
      completion: '0.000015',
      input_cache_read: '0.0000003',
      input_cache_write: '0.00000375',
      prompt: '0.000003',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2025-01-31',
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'anthropic/claude-sonnet-4.6',
    canonicalSlug: 'anthropic/claude-4.6-sonnet-20260217',
    name: 'Anthropic: Claude Sonnet 4.6',
    description:
      "Sonnet 4.6 is Anthropic's most capable Sonnet-class model yet, with frontier performance across coding, agents, and professional work. It excels at iterative development, complex codebase navigation, end-to-end project management with...",
    created: 1771342990,
    contextLength: 1000000,
    maxCompletionTokens: 128000,
    isModerated: true,
    modality: 'text+image+file->text',
    inputModalities: ['text', 'image', 'file'],
    outputModalities: ['text'],
    tokenizer: 'Claude',
    pricing: {
      completion: '0.000015',
      input_cache_read: '0.0000003',
      input_cache_write: '0.00000375',
      prompt: '0.000003',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_completion_tokens',
      'max_tokens',
      'reasoning',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p',
      'verbosity'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'arcee-ai/coder-large',
    canonicalSlug: 'arcee-ai/coder-large',
    name: 'Arcee AI: Coder Large',
    description:
      'Coder\u2011Large is a 32 B\u2011parameter offspring of Qwen 2.5\u2011Instruct that has been further trained on permissively\u2011licensed GitHub, CodeSearchNet and synthetic bug\u2011fix corpora. It supports a 32k context window, enabling multi\u2011file...',
    created: 1746478663,
    contextLength: 32768,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000008',
      prompt: '0.0000005'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'stop',
      'temperature',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2025-03-31'
  },
  {
    id: 'arcee-ai/trinity-large-thinking',
    canonicalSlug: 'arcee-ai/trinity-large-thinking',
    name: 'Arcee AI: Trinity Large Thinking',
    description:
      'Trinity Large Thinking is a powerful open source reasoning model from the team at Arcee AI. It shows strong performance in PinchBench, agentic workloads, and reasoning tasks. Launch video: https://youtu.be/Gc82AXLa0Rg?si=4RLn6WBz33qT--B7...',
    created: 1775058318,
    contextLength: 262144,
    maxCompletionTokens: 80000,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000008',
      input_cache_read: '0.00000006',
      prompt: '0.00000025'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    reasoning: {
      mandatory: true
    }
  },
  {
    id: 'arcee-ai/trinity-mini',
    canonicalSlug: 'arcee-ai/trinity-mini-20251201',
    name: 'Arcee AI: Trinity Mini',
    description:
      'Trinity Mini is a 26B-parameter (3B active) sparse mixture-of-experts language model featuring 128 experts with 8 active per token. Engineered for efficient reasoning over long contexts (131k) with robust function...',
    created: 1764601720,
    contextLength: 131072,
    maxCompletionTokens: 131072,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.00000015',
      prompt: '0.000000045'
    },
    supportedParameters: [
      'include_reasoning',
      'logprobs',
      'max_completion_tokens',
      'max_tokens',
      'reasoning',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: true
    }
  },
  {
    id: 'arcee-ai/virtuoso-large',
    canonicalSlug: 'arcee-ai/virtuoso-large',
    name: 'Arcee AI: Virtuoso Large',
    description:
      "Virtuoso\u2011Large is Arcee's top\u2011tier general\u2011purpose LLM at 72 B parameters, tuned to tackle cross\u2011domain reasoning, creative writing and enterprise QA. Unlike many 70 B peers, it retains the 128 k...",
    created: 1746478885,
    contextLength: 131072,
    maxCompletionTokens: 64000,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000012',
      prompt: '0.00000075'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2025-03-31'
  },
  {
    id: 'baidu/ernie-4.5-vl-424b-a47b',
    canonicalSlug: 'baidu/ernie-4.5-vl-424b-a47b',
    name: 'Baidu: ERNIE 4.5 VL 424B A47B ',
    description:
      'ERNIE-4.5-VL-424B-A47B is a multimodal Mixture-of-Experts (MoE) model from Baidu\u2019s ERNIE 4.5 series, featuring 424B total parameters with 47B active per token. It is trained jointly on text and image data...',
    created: 1751300903,
    contextLength: 131072,
    maxCompletionTokens: 16000,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['image', 'text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.00000125',
      prompt: '0.00000042'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2025-03-31',
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'bytedance-seed/seed-1.6',
    canonicalSlug: 'bytedance-seed/seed-1.6-20250625',
    name: 'ByteDance Seed: Seed 1.6',
    description:
      'Seed 1.6 is a general-purpose model released by the ByteDance Seed team. It incorporates multimodal capabilities and adaptive deep thinking with a 256K context window.',
    created: 1766504997,
    contextLength: 262144,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text+image+video->text',
    inputModalities: ['image', 'text', 'video'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.000002',
      prompt: '0.00000025'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'bytedance-seed/seed-1.6-flash',
    canonicalSlug: 'bytedance-seed/seed-1.6-flash-20250625',
    name: 'ByteDance Seed: Seed 1.6 Flash',
    description:
      'Seed 1.6 Flash is an ultra-fast multimodal deep thinking model by ByteDance Seed, supporting both text and visual understanding. It features a 256k context window and can generate outputs of...',
    created: 1766505011,
    contextLength: 262144,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text+image+video->text',
    inputModalities: ['image', 'text', 'video'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000003',
      prompt: '0.000000075'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'bytedance-seed/seed-2.0-lite',
    canonicalSlug: 'bytedance-seed/seed-2.0-lite-20260309',
    name: 'ByteDance Seed: Seed-2.0-Lite',
    description:
      'Seed-2.0-Lite is a versatile, cost\u2011efficient enterprise workhorse that delivers strong multimodal and agent capabilities while offering noticeably lower latency, making it a practical default choice for most production workloads across...',
    created: 1773157231,
    contextLength: 262144,
    maxCompletionTokens: 131072,
    isModerated: false,
    modality: 'text+image+video->text',
    inputModalities: ['text', 'image', 'video'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.000002',
      prompt: '0.00000025'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    reasoning: {
      mandatory: false,
      supportedEfforts: ['high', 'medium', 'low', 'minimal'],
      defaultEffort: 'medium'
    }
  },
  {
    id: 'bytedance-seed/seed-2.0-mini',
    canonicalSlug: 'bytedance-seed/seed-2.0-mini-20260224',
    name: 'ByteDance Seed: Seed-2.0-Mini',
    description:
      'Seed-2.0-mini targets latency-sensitive, high-concurrency, and cost-sensitive scenarios, emphasizing fast response and flexible inference deployment. It delivers performance comparable to ByteDance-Seed-1.6, supports 256k context, four reasoning effort modes (minimal/low/medium/high), multimodal understanding,...',
    created: 1772131107,
    contextLength: 262144,
    maxCompletionTokens: 131072,
    isModerated: false,
    modality: 'text+image+video->text',
    inputModalities: ['text', 'image', 'video'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000004',
      prompt: '0.0000001'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    reasoning: {
      mandatory: false,
      supportedEfforts: ['high', 'medium', 'low', 'minimal'],
      defaultEffort: 'medium'
    }
  },
  {
    id: 'bytedance/ui-tars-1.5-7b',
    canonicalSlug: 'bytedance/ui-tars-1.5-7b',
    name: 'ByteDance: UI-TARS 7B ',
    description:
      'UI-TARS-1.5 is a multimodal vision-language agent optimized for GUI-based environments, including desktop interfaces, web browsers, mobile systems, and games. Built by ByteDance, it builds upon the UI-TARS framework with reinforcement...',
    created: 1753205056,
    contextLength: 128000,
    maxCompletionTokens: 2048,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['image', 'text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000002',
      input_cache_read: '0.0000001',
      prompt: '0.0000001'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'repetition_penalty',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2025-01-31'
  },
  {
    id: 'cognitivecomputations/dolphin-mistral-24b-venice-edition:free',
    canonicalSlug: 'venice/uncensored',
    name: 'Venice: Uncensored (free)',
    description:
      'Venice Uncensored Dolphin Mistral 24B Venice Edition is a fine-tuned variant of Mistral-Small-24B-Instruct-2501, developed by dphn.ai in collaboration with Venice.ai. This model is designed as an \u201cuncensored\u201d instruct-tuned LLM, preserving...',
    created: 1752094966,
    contextLength: 32768,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0',
      prompt: '0'
    },
    supportedParameters: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2024-04-30'
  },
  {
    id: 'cohere/command-a',
    canonicalSlug: 'cohere/command-a-03-2025',
    name: 'Cohere: Command A',
    description:
      'Command A is an open-weights 111B parameter model with a 256k context window focused on delivering great performance across agentic, multilingual, and coding use cases. Compared to other leading proprietary...',
    created: 1741894342,
    contextLength: 256000,
    maxCompletionTokens: 8192,
    isModerated: true,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.00001',
      prompt: '0.0000025'
    },
    supportedParameters: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2024-08-31'
  },
  {
    id: 'cohere/command-r-08-2024',
    canonicalSlug: 'cohere/command-r-08-2024',
    name: 'Cohere: Command R (08-2024)',
    description:
      'command-r-08-2024 is an update of the [Command R](/models/cohere/command-r) with improved performance for multilingual retrieval-augmented generation (RAG) and tool use. More broadly, it is better at math, code and reasoning and...',
    created: 1724976000,
    contextLength: 128000,
    maxCompletionTokens: 4000,
    isModerated: true,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Cohere',
    pricing: {
      completion: '0.0000006',
      prompt: '0.00000015'
    },
    supportedParameters: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2024-03-31'
  },
  {
    id: 'cohere/command-r-plus-08-2024',
    canonicalSlug: 'cohere/command-r-plus-08-2024',
    name: 'Cohere: Command R+ (08-2024)',
    description:
      'command-r-plus-08-2024 is an update of the [Command R+](/models/cohere/command-r-plus) with roughly 50% higher throughput and 25% lower latencies as compared to the previous Command R+ version, while keeping the hardware footprint...',
    created: 1724976000,
    contextLength: 128000,
    maxCompletionTokens: 4000,
    isModerated: true,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Cohere',
    pricing: {
      completion: '0.00001',
      prompt: '0.0000025'
    },
    supportedParameters: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2024-03-31'
  },
  {
    id: 'cohere/command-r7b-12-2024',
    canonicalSlug: 'cohere/command-r7b-12-2024',
    name: 'Cohere: Command R7B (12-2024)',
    description:
      'Command R7B (12-2024) is a small, fast update of the Command R+ model, delivered in December 2024. It excels at RAG, tool use, agents, and similar tasks requiring complex reasoning...',
    created: 1734158152,
    contextLength: 128000,
    maxCompletionTokens: 4000,
    isModerated: true,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Cohere',
    pricing: {
      completion: '0.00000015',
      prompt: '0.0000000375'
    },
    supportedParameters: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2024-08-31'
  },
  {
    id: 'cohere/north-mini-code:free',
    canonicalSlug: 'cohere/north-mini-code-20260617',
    name: 'Cohere: North Mini Code (free)',
    description:
      "North Mini Code is Cohere's first agentic coding model and the debut of its North family. A sparse mixture-of-experts model with 30B total parameters and 3B active, it is optimized...",
    created: 1781723748,
    contextLength: 256000,
    maxCompletionTokens: 64000,
    isModerated: true,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Cohere',
    pricing: {
      completion: '0',
      prompt: '0'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'deepcogito/cogito-v2.1-671b',
    canonicalSlug: 'deepcogito/cogito-v2.1-671b-20251118',
    name: 'Deep Cogito: Cogito v2.1 671B',
    description:
      'Cogito v2.1 671B MoE represents one of the strongest open models globally, matching performance of frontier closed and open models. This model is trained using self play with reinforcement learning...',
    created: 1763071233,
    contextLength: 128000,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.00000125',
      prompt: '0.00000125'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'deepseek/deepseek-chat',
    canonicalSlug: 'deepseek/deepseek-chat-v3',
    name: 'DeepSeek: DeepSeek V3',
    description:
      'DeepSeek-V3 is the latest model from the DeepSeek team, building upon the instruction following and coding abilities of the previous versions. Pre-trained on nearly 15 trillion tokens, the reported evaluations...',
    created: 1735241320,
    contextLength: 131072,
    maxCompletionTokens: 16000,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'DeepSeek',
    pricing: {
      completion: '0.0000008001',
      prompt: '0.0000002002'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2024-07-31'
  },
  {
    id: 'deepseek/deepseek-chat-v3-0324',
    canonicalSlug: 'deepseek/deepseek-chat-v3-0324',
    name: 'DeepSeek: DeepSeek V3 0324',
    description:
      'DeepSeek V3, a 685B-parameter, mixture-of-experts model, is the latest iteration of the flagship chat model family from the DeepSeek team. It succeeds the [DeepSeek V3](/deepseek/deepseek-chat-v3) model and performs really well...',
    created: 1742824755,
    contextLength: 163840,
    maxCompletionTokens: 16384,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'DeepSeek',
    pricing: {
      completion: '0.00000077',
      input_cache_read: '0.000000135',
      prompt: '0.0000002'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2024-07-31'
  },
  {
    id: 'deepseek/deepseek-chat-v3.1',
    canonicalSlug: 'deepseek/deepseek-chat-v3.1',
    name: 'DeepSeek: DeepSeek V3.1',
    description:
      'DeepSeek-V3.1 is a large hybrid reasoning model (671B parameters, 37B active) that supports both thinking and non-thinking modes via prompt templates. It extends the DeepSeek-V3 base with a two-phase long-context...',
    created: 1755779628,
    contextLength: 163840,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'DeepSeek',
    instructType: 'deepseek-v3.1',
    pricing: {
      completion: '0.00000079',
      input_cache_read: '0.00000013',
      prompt: '0.00000021'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2025-03-31',
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'deepseek/deepseek-r1',
    canonicalSlug: 'deepseek/deepseek-r1',
    name: 'DeepSeek: R1',
    description:
      "DeepSeek R1 is here: Performance on par with [OpenAI o1](/openai/o1), but open-sourced and with fully open reasoning tokens. It's 671B parameters in size, with 37B active in an inference pass....",
    created: 1737381095,
    contextLength: 163840,
    maxCompletionTokens: 16000,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'DeepSeek',
    instructType: 'deepseek-r1',
    pricing: {
      completion: '0.0000025',
      prompt: '0.0000007'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'max_completion_tokens',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2024-07-31',
    reasoning: {
      mandatory: true
    }
  },
  {
    id: 'deepseek/deepseek-r1-0528',
    canonicalSlug: 'deepseek/deepseek-r1-0528',
    name: 'DeepSeek: R1 0528',
    description:
      "May 28th update to the [original DeepSeek R1](/deepseek/deepseek-r1) Performance on par with [OpenAI o1](/openai/o1), but open-sourced and with fully open reasoning tokens. It's 671B parameters in size, with 37B active...",
    created: 1748455170,
    contextLength: 163840,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'DeepSeek',
    instructType: 'deepseek-r1',
    pricing: {
      completion: '0.00000215',
      input_cache_read: '0.00000035',
      prompt: '0.0000005'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2025-03-31',
    reasoning: {
      mandatory: true
    }
  },
  {
    id: 'deepseek/deepseek-r1-distill-llama-70b',
    canonicalSlug: 'deepseek/deepseek-r1-distill-llama-70b',
    name: 'DeepSeek: R1 Distill Llama 70B',
    description:
      'DeepSeek R1 Distill Llama 70B is a distilled large language model based on [Llama-3.3-70B-Instruct](/meta-llama/llama-3.3-70b-instruct), using outputs from [DeepSeek R1](/deepseek/deepseek-r1). The model combines advanced distillation techniques to achieve high performance across...',
    created: 1737663169,
    contextLength: 128000,
    maxCompletionTokens: 8192,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Llama3',
    instructType: 'deepseek-r1',
    pricing: {
      completion: '0.0000008',
      prompt: '0.0000008'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2024-07-31',
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'deepseek/deepseek-v3.1-terminus',
    canonicalSlug: 'deepseek/deepseek-v3.1-terminus',
    name: 'DeepSeek: DeepSeek V3.1 Terminus',
    description:
      "DeepSeek-V3.1 Terminus is an update to [DeepSeek V3.1](/deepseek/deepseek-chat-v3.1) that maintains the model's original capabilities while addressing issues reported by users, including language consistency and agent capabilities, further optimizing the model's...",
    created: 1758548275,
    contextLength: 163840,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'DeepSeek',
    instructType: 'deepseek-v3.1',
    pricing: {
      completion: '0.00000095',
      input_cache_read: '0.00000013',
      prompt: '0.00000027'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2025-03-31',
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'deepseek/deepseek-v3.2',
    canonicalSlug: 'deepseek/deepseek-v3.2-20251201',
    name: 'DeepSeek: DeepSeek V3.2',
    description:
      'DeepSeek-V3.2 is a large language model designed to harmonize high computational efficiency with strong reasoning and agentic tool-use performance. It introduces DeepSeek Sparse Attention (DSA), a fine-grained sparse attention mechanism...',
    created: 1764594642,
    contextLength: 131072,
    maxCompletionTokens: 64000,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'DeepSeek',
    pricing: {
      completion: '0.0000003432',
      prompt: '0.0000002288'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: false
    }
  },
  {
    id: 'deepseek/deepseek-v3.2-exp',
    canonicalSlug: 'deepseek/deepseek-v3.2-exp',
    name: 'DeepSeek: DeepSeek V3.2 Exp',
    description:
      'DeepSeek-V3.2-Exp is an experimental large language model released by DeepSeek as an intermediate step between V3.1 and future architectures. It introduces DeepSeek Sparse Attention (DSA), a fine-grained sparse attention mechanism...',
    created: 1759150481,
    contextLength: 163840,
    maxCompletionTokens: 65536,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'DeepSeek',
    instructType: 'deepseek-v3.1',
    pricing: {
      completion: '0.00000041',
      prompt: '0.00000027'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2025-07-31',
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'deepseek/deepseek-v4-flash',
    canonicalSlug: 'deepseek/deepseek-v4-flash-20260423',
    name: 'DeepSeek: DeepSeek V4 Flash',
    description:
      'DeepSeek V4 Flash is an efficiency-optimized Mixture-of-Experts model from DeepSeek with 284B total parameters and 13B activated parameters, supporting a 1M-token context window. It is designed for fast inference and...',
    created: 1777000666,
    contextLength: 1048576,
    maxCompletionTokens: 65536,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'DeepSeek',
    pricing: {
      completion: '0.00000018',
      input_cache_read: '0.00000002',
      prompt: '0.00000009'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: false,
      supportedEfforts: ['xhigh', 'high'],
      defaultEffort: 'high'
    }
  },
  {
    id: 'deepseek/deepseek-v4-pro',
    canonicalSlug: 'deepseek/deepseek-v4-pro-20260423',
    name: 'DeepSeek: DeepSeek V4 Pro',
    description:
      'DeepSeek V4 Pro is a large-scale Mixture-of-Experts model from DeepSeek with 1.6T total parameters and 49B activated parameters, supporting a 1M-token context window. It is designed for advanced reasoning, coding,...',
    created: 1777000679,
    contextLength: 1048576,
    maxCompletionTokens: 384000,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'DeepSeek',
    pricing: {
      completion: '0.00000087',
      input_cache_read: '0.000000003625',
      prompt: '0.000000435'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: false,
      supportedEfforts: ['xhigh', 'high'],
      defaultEffort: 'high'
    }
  },
  {
    id: 'essentialai/rnj-1-instruct',
    canonicalSlug: 'essentialai/rnj-1-instruct',
    name: 'EssentialAI: Rnj 1 Instruct',
    description:
      'Rnj-1 is an 8B-parameter, dense, open-weight model family developed by Essential AI and trained from scratch with a focus on programming, math, and scientific reasoning. The model demonstrates strong performance...',
    created: 1765094847,
    contextLength: 32768,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.00000015',
      prompt: '0.00000015'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'google/gemini-2.5-flash',
    canonicalSlug: 'google/gemini-2.5-flash',
    name: 'Google: Gemini 2.5 Flash',
    description:
      'Gemini 2.5 Flash is Google\'s state-of-the-art workhorse model, specifically designed for advanced reasoning, coding, mathematics, and scientific tasks. It includes built-in "thinking" capabilities, enabling it to provide responses with greater...',
    created: 1750172488,
    contextLength: 1048576,
    maxCompletionTokens: 65535,
    isModerated: false,
    modality: 'text+image+file+audio+video->text',
    inputModalities: ['file', 'image', 'text', 'audio', 'video'],
    outputModalities: ['text'],
    tokenizer: 'Gemini',
    pricing: {
      audio: '0.000001',
      completion: '0.0000025',
      image: '0.0000003',
      input_cache_read: '0.00000003',
      input_cache_write: '0.00000008333333333333334',
      internal_reasoning: '0.0000025',
      prompt: '0.0000003',
      web_search: '0.014'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    knowledgeCutoff: '2025-01-31',
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'google/gemini-2.5-flash-image',
    canonicalSlug: 'google/gemini-2.5-flash-image',
    name: 'Google: Nano Banana (Gemini 2.5 Flash Image)',
    description:
      'Gemini 2.5 Flash Image, a.k.a. "Nano Banana," is now generally available. It is a state of the art image generation model with contextual understanding. It is capable of image generation,...',
    created: 1759870431,
    contextLength: 32768,
    maxCompletionTokens: 8192,
    isModerated: false,
    modality: 'text+image->text+image',
    inputModalities: ['image', 'text'],
    outputModalities: ['image', 'text'],
    tokenizer: 'Gemini',
    pricing: {
      audio: '0.000001',
      completion: '0.0000025',
      image: '0.0000003',
      input_cache_read: '0.00000003',
      input_cache_write: '0.00000008333333333333334',
      internal_reasoning: '0.0000025',
      prompt: '0.0000003',
      web_search: '0.014'
    },
    supportedParameters: [
      'max_tokens',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_p'
    ],
    knowledgeCutoff: '2025-01-31'
  },
  {
    id: 'google/gemini-2.5-flash-lite',
    canonicalSlug: 'google/gemini-2.5-flash-lite',
    name: 'Google: Gemini 2.5 Flash Lite',
    description:
      'Gemini 2.5 Flash-Lite is a lightweight reasoning model in the Gemini 2.5 family, optimized for ultra-low latency and cost efficiency. It offers improved throughput, faster token generation, and better performance...',
    created: 1753200276,
    contextLength: 1048576,
    maxCompletionTokens: 65535,
    isModerated: false,
    modality: 'text+image+file+audio+video->text',
    inputModalities: ['text', 'image', 'file', 'audio', 'video'],
    outputModalities: ['text'],
    tokenizer: 'Gemini',
    pricing: {
      audio: '0.0000003',
      completion: '0.0000004',
      image: '0.0000001',
      input_cache_read: '0.00000001',
      input_cache_write: '0.00000008333333333333334',
      internal_reasoning: '0.0000004',
      prompt: '0.0000001',
      web_search: '0.014'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    knowledgeCutoff: '2025-01-31',
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'google/gemini-2.5-flash-lite-preview-09-2025',
    canonicalSlug: 'google/gemini-2.5-flash-lite-preview-09-2025',
    name: 'Google: Gemini 2.5 Flash Lite Preview 09-2025',
    description:
      'Gemini 2.5 Flash-Lite is a lightweight reasoning model in the Gemini 2.5 family, optimized for ultra-low latency and cost efficiency. It offers improved throughput, faster token generation, and better performance...',
    created: 1758819686,
    contextLength: 1048576,
    maxCompletionTokens: 65535,
    isModerated: false,
    modality: 'text+image+file+audio+video->text',
    inputModalities: ['text', 'image', 'file', 'audio', 'video'],
    outputModalities: ['text'],
    tokenizer: 'Gemini',
    pricing: {
      audio: '0.0000003',
      completion: '0.0000004',
      image: '0.0000001',
      input_cache_read: '0.00000001',
      input_cache_write: '0.00000008333333333333334',
      internal_reasoning: '0.0000004',
      prompt: '0.0000001',
      web_search: '0.014'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    knowledgeCutoff: '2025-01-31',
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'google/gemini-2.5-pro',
    canonicalSlug: 'google/gemini-2.5-pro',
    name: 'Google: Gemini 2.5 Pro',
    description:
      'Gemini 2.5 Pro is Google\u2019s state-of-the-art AI model designed for advanced reasoning, coding, mathematics, and scientific tasks. It employs \u201cthinking\u201d capabilities, enabling it to reason through responses with enhanced accuracy...',
    created: 1750169544,
    contextLength: 1048576,
    maxCompletionTokens: 65536,
    isModerated: false,
    modality: 'text+image+file+audio+video->text',
    inputModalities: ['text', 'image', 'file', 'audio', 'video'],
    outputModalities: ['text'],
    tokenizer: 'Gemini',
    pricing: {
      audio: '0.00000125',
      completion: '0.00001',
      image: '0.00000125',
      input_cache_read: '0.000000125',
      input_cache_write: '0.000000375',
      internal_reasoning: '0.00001',
      prompt: '0.00000125',
      web_search: '0.014'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    knowledgeCutoff: '2025-01-31',
    reasoning: {
      mandatory: true
    }
  },
  {
    id: 'google/gemini-2.5-pro-preview',
    canonicalSlug: 'google/gemini-2.5-pro-preview-06-05',
    name: 'Google: Gemini 2.5 Pro Preview 06-05',
    description:
      'Gemini 2.5 Pro is Google\u2019s state-of-the-art AI model designed for advanced reasoning, coding, mathematics, and scientific tasks. It employs \u201cthinking\u201d capabilities, enabling it to reason through responses with enhanced accuracy...',
    created: 1749137257,
    contextLength: 1048576,
    maxCompletionTokens: 65536,
    isModerated: false,
    modality: 'text+image+file+audio->text',
    inputModalities: ['file', 'image', 'text', 'audio'],
    outputModalities: ['text'],
    tokenizer: 'Gemini',
    pricing: {
      audio: '0.00000125',
      completion: '0.00001',
      image: '0.00000125',
      input_cache_read: '0.000000125',
      input_cache_write: '0.000000375',
      internal_reasoning: '0.00001',
      prompt: '0.00000125',
      web_search: '0.014'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    knowledgeCutoff: '2025-01-31',
    reasoning: {
      mandatory: true
    }
  },
  {
    id: 'google/gemini-2.5-pro-preview-05-06',
    canonicalSlug: 'google/gemini-2.5-pro-preview-03-25',
    name: 'Google: Gemini 2.5 Pro Preview 05-06',
    description:
      'Gemini 2.5 Pro is Google\u2019s state-of-the-art AI model designed for advanced reasoning, coding, mathematics, and scientific tasks. It employs \u201cthinking\u201d capabilities, enabling it to reason through responses with enhanced accuracy...',
    created: 1746578513,
    contextLength: 1048576,
    maxCompletionTokens: 65535,
    isModerated: false,
    modality: 'text+image+file+audio+video->text',
    inputModalities: ['text', 'image', 'file', 'audio', 'video'],
    outputModalities: ['text'],
    tokenizer: 'Gemini',
    pricing: {
      audio: '0.00000125',
      completion: '0.00001',
      image: '0.00000125',
      input_cache_read: '0.000000125',
      input_cache_write: '0.000000375',
      internal_reasoning: '0.00001',
      prompt: '0.00000125',
      web_search: '0.014'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    knowledgeCutoff: '2025-01-31',
    reasoning: {
      mandatory: true
    }
  },
  {
    id: 'google/gemini-3-flash-preview',
    canonicalSlug: 'google/gemini-3-flash-preview-20251217',
    name: 'Google: Gemini 3 Flash Preview',
    description:
      'Gemini 3 Flash Preview is a high speed, high value thinking model designed for agentic workflows, multi turn chat, and coding assistance. It delivers near Pro level reasoning and tool...',
    created: 1765987078,
    contextLength: 1048576,
    maxCompletionTokens: 65535,
    isModerated: false,
    modality: 'text+image+file+audio+video->text',
    inputModalities: ['text', 'image', 'file', 'audio', 'video'],
    outputModalities: ['text'],
    tokenizer: 'Gemini',
    pricing: {
      audio: '0.000001',
      completion: '0.000003',
      image: '0.0000005',
      input_cache_read: '0.00000005',
      input_cache_write: '0.00000008333333333333334',
      internal_reasoning: '0.000003',
      prompt: '0.0000005',
      web_search: '0.014'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    reasoning: {
      mandatory: false,
      supportedEfforts: ['high', 'medium', 'low', 'minimal'],
      defaultEffort: 'medium'
    }
  },
  {
    id: 'google/gemini-3-pro-image',
    canonicalSlug: 'google/gemini-3-pro-image-20260528',
    name: 'Google: Nano Banana Pro (Gemini 3 Pro Image)',
    description:
      'Nano Banana Pro is Google\u2019s most advanced image-generation and editing model, built on Gemini 3 Pro. It extends the original Nano Banana with significantly improved multimodal reasoning, real-world grounding, and...',
    created: 1781754054,
    contextLength: 65536,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text+image->text+image',
    inputModalities: ['image', 'text'],
    outputModalities: ['image', 'text'],
    tokenizer: 'Gemini',
    pricing: {
      audio: '0.000002',
      completion: '0.000012',
      image: '0.000002',
      input_cache_read: '0.0000002',
      input_cache_write: '0.000000375',
      internal_reasoning: '0.000012',
      prompt: '0.000002',
      web_search: '0.014'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    reasoning: {
      mandatory: true
    }
  },
  {
    id: 'google/gemini-3-pro-image-preview',
    canonicalSlug: 'google/gemini-3-pro-image-preview-20251120',
    name: 'Google: Nano Banana Pro (Gemini 3 Pro Image Preview)',
    description:
      'Nano Banana Pro is Google\u2019s most advanced image-generation and editing model, built on Gemini 3 Pro. It extends the original Nano Banana with significantly improved multimodal reasoning, real-world grounding, and...',
    created: 1763653797,
    contextLength: 65536,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text+image->text+image',
    inputModalities: ['image', 'text'],
    outputModalities: ['image', 'text'],
    tokenizer: 'Gemini',
    pricing: {
      audio: '0.000002',
      completion: '0.000012',
      image: '0.000002',
      input_cache_read: '0.0000002',
      input_cache_write: '0.000000375',
      internal_reasoning: '0.000012',
      prompt: '0.000002',
      web_search: '0.014'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_p'
    ],
    reasoning: {
      mandatory: true
    }
  },
  {
    id: 'google/gemini-3.1-flash-image',
    canonicalSlug: 'google/gemini-3.1-flash-image-20260528',
    name: 'Google: Nano Banana 2 (Gemini 3.1 Flash Image)',
    description:
      'Gemini 3.1 Flash Image, a.k.a. "Nano Banana 2," is Google\u2019s latest state of the art image generation and editing model, delivering Pro-level visual quality at Flash speed. It combines advanced...',
    created: 1781754065,
    contextLength: 131072,
    maxCompletionTokens: 65536,
    isModerated: false,
    modality: 'text+image->text+image',
    inputModalities: ['image', 'text'],
    outputModalities: ['image', 'text'],
    tokenizer: 'Gemini',
    pricing: {
      completion: '0.000003',
      prompt: '0.0000005',
      web_search: '0.014'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'top_p'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: true,
      supportedEfforts: ['high', 'minimal'],
      defaultEffort: 'minimal'
    }
  },
  {
    id: 'google/gemini-3.1-flash-image-preview',
    canonicalSlug: 'google/gemini-3.1-flash-image-preview-20260226',
    name: 'Google: Nano Banana 2 (Gemini 3.1 Flash Image Preview)',
    description:
      'Gemini 3.1 Flash Image Preview, a.k.a. "Nano Banana 2," is Google\u2019s latest state of the art image generation and editing model, delivering Pro-level visual quality at Flash speed. It combines...',
    created: 1772119558,
    contextLength: 131072,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text+image->text+image',
    inputModalities: ['image', 'text'],
    outputModalities: ['image', 'text'],
    tokenizer: 'Gemini',
    pricing: {
      completion: '0.000003',
      prompt: '0.0000005',
      web_search: '0.014'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'top_p'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: true,
      supportedEfforts: ['high', 'minimal'],
      defaultEffort: 'minimal'
    }
  },
  {
    id: 'google/gemini-3.1-flash-lite',
    canonicalSlug: 'google/gemini-3.1-flash-lite-20260507',
    name: 'Google: Gemini 3.1 Flash Lite',
    description:
      'Gemini 3.1 Flash Lite is Google\u2019s GA high-efficiency multimodal model optimized for low-latency, high-volume workloads. It supports text, image, video, audio, and PDF inputs, and is designed for lightweight agentic...',
    created: 1778168828,
    contextLength: 1048576,
    maxCompletionTokens: 65536,
    isModerated: false,
    modality: 'text+image+file+audio+video->text',
    inputModalities: ['text', 'image', 'video', 'file', 'audio'],
    outputModalities: ['text'],
    tokenizer: 'Gemini',
    pricing: {
      audio: '0.0000005',
      completion: '0.0000015',
      image: '0.00000025',
      input_cache_read: '0.000000025',
      input_cache_write: '0.00000008333333333333334',
      internal_reasoning: '0.0000015',
      prompt: '0.00000025',
      web_search: '0.014'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: true,
      supportedEfforts: ['high', 'medium', 'low', 'minimal'],
      defaultEffort: 'minimal'
    }
  },
  {
    id: 'google/gemini-3.1-flash-lite-preview',
    canonicalSlug: 'google/gemini-3.1-flash-lite-preview-20260303',
    name: 'Google: Gemini 3.1 Flash Lite Preview',
    description:
      "Gemini 3.1 Flash Lite Preview is Google's high-efficiency model optimized for high-volume use cases. It outperforms Gemini 2.5 Flash Lite on overall quality and approaches Gemini 2.5 Flash performance across...",
    created: 1772512673,
    contextLength: 1048576,
    maxCompletionTokens: 65536,
    isModerated: false,
    modality: 'text+image+file+audio+video->text',
    inputModalities: ['text', 'image', 'video', 'file', 'audio'],
    outputModalities: ['text'],
    tokenizer: 'Gemini',
    pricing: {
      audio: '0.0000005',
      completion: '0.0000015',
      image: '0.00000025',
      input_cache_read: '0.000000025',
      input_cache_write: '0.00000008333333333333334',
      internal_reasoning: '0.0000015',
      prompt: '0.00000025',
      web_search: '0.014'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: true,
      supportedEfforts: ['high', 'medium', 'low', 'minimal'],
      defaultEffort: 'minimal'
    }
  },
  {
    id: 'google/gemini-3.1-pro-preview',
    canonicalSlug: 'google/gemini-3.1-pro-preview-20260219',
    name: 'Google: Gemini 3.1 Pro Preview',
    description:
      'Gemini 3.1 Pro Preview is Google\u2019s frontier reasoning model, delivering enhanced software engineering performance, improved agentic reliability, and more efficient token usage across complex workflows. Building on the multimodal foundation...',
    created: 1771509627,
    contextLength: 1048576,
    maxCompletionTokens: 65536,
    isModerated: false,
    modality: 'text+image+file+audio+video->text',
    inputModalities: ['audio', 'file', 'image', 'text', 'video'],
    outputModalities: ['text'],
    tokenizer: 'Gemini',
    pricing: {
      audio: '0.000002',
      completion: '0.000012',
      image: '0.000002',
      input_cache_read: '0.0000002',
      input_cache_write: '0.000000375',
      internal_reasoning: '0.000012',
      prompt: '0.000002',
      web_search: '0.014'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    reasoning: {
      mandatory: true,
      supportedEfforts: ['high', 'medium', 'low'],
      defaultEffort: 'medium'
    }
  },
  {
    id: 'google/gemini-3.1-pro-preview-customtools',
    canonicalSlug: 'google/gemini-3.1-pro-preview-customtools-20260219',
    name: 'Google: Gemini 3.1 Pro Preview Custom Tools',
    description:
      'Gemini 3.1 Pro Preview Custom Tools is a variant of Gemini 3.1 Pro that improves tool selection behavior by preventing overuse of a general bash tool when more efficient third-party...',
    created: 1772045923,
    contextLength: 1048756,
    maxCompletionTokens: 65536,
    isModerated: false,
    modality: 'text+image+file+audio+video->text',
    inputModalities: ['text', 'audio', 'image', 'video', 'file'],
    outputModalities: ['text'],
    tokenizer: 'Gemini',
    pricing: {
      audio: '0.000002',
      completion: '0.000012',
      image: '0.000002',
      input_cache_read: '0.0000002',
      input_cache_write: '0.000000375',
      internal_reasoning: '0.000012',
      prompt: '0.000002',
      web_search: '0.014'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    reasoning: {
      mandatory: true,
      supportedEfforts: ['high', 'medium', 'low'],
      defaultEffort: 'medium'
    }
  },
  {
    id: 'google/gemini-3.5-flash',
    canonicalSlug: 'google/gemini-3.5-flash-20260519',
    name: 'Google: Gemini 3.5 Flash',
    description:
      "Gemini 3.5 Flash is Google's high-efficiency multimodal model, bringing near-Pro level coding and reasoning at Flash-tier cost and speed. It is highly optimized for coding proficiency and parallel agentic execution...",
    created: 1779193800,
    contextLength: 1048576,
    maxCompletionTokens: 65536,
    isModerated: false,
    modality: 'text+image+file+audio+video->text',
    inputModalities: ['text', 'image', 'video', 'file', 'audio'],
    outputModalities: ['text'],
    tokenizer: 'Gemini',
    pricing: {
      audio: '0.000003',
      completion: '0.000009',
      image: '0.0000015',
      input_cache_read: '0.00000015',
      input_cache_write: '0.00000008333333333333334',
      internal_reasoning: '0.000009',
      prompt: '0.0000015',
      web_search: '0.014'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    knowledgeCutoff: '2025-01-01',
    reasoning: {
      mandatory: true,
      defaultEnabled: true,
      supportedEfforts: ['high', 'medium', 'low', 'minimal'],
      defaultEffort: 'medium'
    }
  },
  {
    id: 'google/gemma-2-27b-it',
    canonicalSlug: 'google/gemma-2-27b-it',
    name: 'Google: Gemma 2 27B',
    description:
      'Gemma 2 27B by Google is an open model built from the same research and technology used to create the [Gemini models](/models?q=gemini). Gemma models are well-suited for a variety of...',
    created: 1720828800,
    contextLength: 8192,
    maxCompletionTokens: 2048,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Gemini',
    instructType: 'gemma',
    pricing: {
      completion: '0.00000065',
      prompt: '0.00000065'
    },
    supportedParameters: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_p'
    ],
    knowledgeCutoff: '2024-06-30'
  },
  {
    id: 'google/gemma-3-12b-it',
    canonicalSlug: 'google/gemma-3-12b-it',
    name: 'Google: Gemma 3 12B',
    description:
      'Gemma 3 introduces multimodality, supporting vision-language input and text outputs. It handles context windows up to 128k tokens, understands over 140 languages, and offers improved math, reasoning, and chat capabilities,...',
    created: 1741902625,
    contextLength: 131072,
    maxCompletionTokens: 16384,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'Gemini',
    instructType: 'gemma',
    pricing: {
      completion: '0.00000015',
      prompt: '0.00000005'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2024-08-31'
  },
  {
    id: 'google/gemma-3-27b-it',
    canonicalSlug: 'google/gemma-3-27b-it',
    name: 'Google: Gemma 3 27B',
    description:
      'Gemma 3 introduces multimodality, supporting vision-language input and text outputs. It handles context windows up to 128k tokens, understands over 140 languages, and offers improved math, reasoning, and chat capabilities,...',
    created: 1741756359,
    contextLength: 131072,
    maxCompletionTokens: 16384,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'Gemini',
    instructType: 'gemma',
    pricing: {
      completion: '0.00000016',
      prompt: '0.00000008'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2024-08-31'
  },
  {
    id: 'google/gemma-3-4b-it',
    canonicalSlug: 'google/gemma-3-4b-it',
    name: 'Google: Gemma 3 4B',
    description:
      'Gemma 3 introduces multimodality, supporting vision-language input and text outputs. It handles context windows up to 128k tokens, understands over 140 languages, and offers improved math, reasoning, and chat capabilities,...',
    created: 1741905510,
    contextLength: 131072,
    maxCompletionTokens: 16384,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'Gemini',
    instructType: 'gemma',
    pricing: {
      completion: '0.0000001',
      prompt: '0.00000005'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2024-08-31'
  },
  {
    id: 'google/gemma-3n-e4b-it',
    canonicalSlug: 'google/gemma-3n-e4b-it',
    name: 'Google: Gemma 3n 4B',
    description:
      'Gemma 3n E4B-it is optimized for efficient execution on mobile and low-resource devices, such as phones, laptops, and tablets. It supports multimodal inputs\u2014including text, visual data, and audio\u2014enabling diverse tasks...',
    created: 1747776824,
    contextLength: 32768,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.00000012',
      prompt: '0.00000006'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2024-08-31'
  },
  {
    id: 'google/gemma-4-26b-a4b-it',
    canonicalSlug: 'google/gemma-4-26b-a4b-it-20260403',
    name: 'Google: Gemma 4 26B A4B ',
    description:
      'Gemma 4 26B A4B IT is an instruction-tuned Mixture-of-Experts (MoE) model from Google DeepMind. Despite 25.2B total parameters, only 3.8B activate per token during inference \u2014 delivering near-31B quality at...',
    created: 1775227989,
    contextLength: 262144,
    isModerated: false,
    modality: 'text+image+video->text',
    inputModalities: ['image', 'text', 'video'],
    outputModalities: ['text'],
    tokenizer: 'Gemma',
    pricing: {
      completion: '0.00000033',
      prompt: '0.00000006'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: false
    }
  },
  {
    id: 'google/gemma-4-26b-a4b-it:free',
    canonicalSlug: 'google/gemma-4-26b-a4b-it-20260403',
    name: 'Google: Gemma 4 26B A4B  (free)',
    description:
      'Gemma 4 26B A4B IT is an instruction-tuned Mixture-of-Experts (MoE) model from Google DeepMind. Despite 25.2B total parameters, only 3.8B activate per token during inference \u2014 delivering near-31B quality at...',
    created: 1775227989,
    contextLength: 262144,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text+image+video->text',
    inputModalities: ['image', 'text', 'video'],
    outputModalities: ['text'],
    tokenizer: 'Gemma',
    pricing: {
      completion: '0',
      prompt: '0'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: false
    }
  },
  {
    id: 'google/gemma-4-31b-it',
    canonicalSlug: 'google/gemma-4-31b-it-20260402',
    name: 'Google: Gemma 4 31B',
    description:
      "Gemma 4 31B Instruct is Google DeepMind's 30.7B dense multimodal model supporting text and image input with text output. Features a 256K token context window, configurable thinking/reasoning mode, native function...",
    created: 1775148486,
    contextLength: 262144,
    maxCompletionTokens: 262144,
    isModerated: false,
    modality: 'text+image+video->text',
    inputModalities: ['image', 'text', 'video'],
    outputModalities: ['text'],
    tokenizer: 'Gemma',
    pricing: {
      completion: '0.00000035',
      input_cache_read: '0.00000009',
      prompt: '0.00000012'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: false
    }
  },
  {
    id: 'google/gemma-4-31b-it:free',
    canonicalSlug: 'google/gemma-4-31b-it-20260402',
    name: 'Google: Gemma 4 31B (free)',
    description:
      "Gemma 4 31B Instruct is Google DeepMind's 30.7B dense multimodal model supporting text and image input with text output. Features a 256K token context window, configurable thinking/reasoning mode, native function...",
    created: 1775148486,
    contextLength: 262144,
    maxCompletionTokens: 8192,
    isModerated: true,
    modality: 'text+image+video->text',
    inputModalities: ['image', 'text', 'video'],
    outputModalities: ['text'],
    tokenizer: 'Gemma',
    pricing: {
      completion: '0',
      prompt: '0'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'min_p',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_a',
      'top_k',
      'top_p'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: false
    }
  },
  {
    id: 'google/lyria-3-clip-preview',
    canonicalSlug: 'google/lyria-3-clip-preview-20260330',
    name: 'Google: Lyria 3 Clip Preview',
    description:
      "30 second duration clips are priced at $0.04 per clip. Lyria 3 is Google's family of music generation models, available through the Gemini API. With Lyria 3, you can generate...",
    created: 1774907255,
    contextLength: 1048576,
    maxCompletionTokens: 65536,
    isModerated: false,
    modality: 'text+image->text+audio',
    inputModalities: ['text', 'image'],
    outputModalities: ['text', 'audio'],
    tokenizer: 'Other',
    pricing: {
      completion: '0',
      prompt: '0'
    },
    supportedParameters: ['max_tokens', 'response_format', 'seed', 'temperature', 'top_p']
  },
  {
    id: 'google/lyria-3-pro-preview',
    canonicalSlug: 'google/lyria-3-pro-preview-20260330',
    name: 'Google: Lyria 3 Pro Preview',
    description:
      "Full-length songs are priced at $0.08 per song. Lyria 3 is Google's family of music generation models, available through the Gemini API. With Lyria 3, you can generate high-quality, 48kHz...",
    created: 1774907286,
    contextLength: 1048576,
    maxCompletionTokens: 65536,
    isModerated: false,
    modality: 'text+image->text+audio',
    inputModalities: ['text', 'image'],
    outputModalities: ['text', 'audio'],
    tokenizer: 'Other',
    pricing: {
      completion: '0',
      prompt: '0'
    },
    supportedParameters: ['max_tokens', 'response_format', 'seed', 'temperature', 'top_p']
  },
  {
    id: 'gryphe/mythomax-l2-13b',
    canonicalSlug: 'gryphe/mythomax-l2-13b',
    name: 'MythoMax 13B',
    description:
      'One of the highest performing and most popular fine-tunes of Llama 2 13B, with rich descriptions and roleplay. #merge',
    created: 1688256000,
    contextLength: 4096,
    maxCompletionTokens: 4096,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Llama2',
    instructType: 'alpaca',
    pricing: {
      completion: '0.00000006',
      prompt: '0.00000006'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_a',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2023-06-30'
  },
  {
    id: 'ibm-granite/granite-4.0-h-micro',
    canonicalSlug: 'ibm-granite/granite-4.0-h-micro',
    name: 'IBM: Granite 4.0 Micro',
    description:
      'Granite-4.0-H-Micro is a 3B parameter from the Granite 4 family of models. These models are the latest in a series of models released by IBM. They are fine-tuned for long...',
    created: 1760927695,
    contextLength: 131000,
    maxCompletionTokens: 131000,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.000000112',
      prompt: '0.000000017'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_logprobs',
      'top_p'
    ]
  },
  {
    id: 'ibm-granite/granite-4.1-8b',
    canonicalSlug: 'ibm-granite/granite-4.1-8b-20260429',
    name: 'IBM: Granite 4.1 8B',
    description:
      'Granite 4.1 8B is a dense, decoder-only 8-billion-parameter language model from IBM, part of the Granite 4.1 family. It supports a 131K-token context window and is designed for enterprise tasks...',
    created: 1777577071,
    contextLength: 131072,
    maxCompletionTokens: 131072,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000001',
      input_cache_read: '0.00000005',
      prompt: '0.00000005'
    },
    supportedParameters: [
      'frequency_penalty',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ]
  },
  {
    id: 'inception/mercury-2',
    canonicalSlug: 'inception/mercury-2-20260304',
    name: 'Inception: Mercury 2',
    description:
      'Mercury 2 is an extremely fast reasoning LLM, and the first reasoning diffusion LLM (dLLM). Instead of generating tokens sequentially, Mercury 2 produces and refines multiple tokens in parallel, achieving...',
    created: 1772636275,
    contextLength: 128000,
    maxCompletionTokens: 50000,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.00000075',
      input_cache_read: '0.000000025',
      prompt: '0.00000025'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: true,
      supportedEfforts: ['high', 'medium', 'low', 'none'],
      defaultEffort: 'medium'
    }
  },
  {
    id: 'inclusionai/ling-2.6-1t',
    canonicalSlug: 'inclusionai/ling-2.6-1t-20260423',
    name: 'inclusionAI: Ling-2.6-1T',
    description:
      'Ling-2.6-1T is an instant (instruct) model from inclusionAI and the company\u2019s trillion-parameter flagship, designed for real-world agents that require fast execution and high efficiency at scale. It uses a \u201cfast...',
    created: 1776948238,
    contextLength: 262144,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.000000625',
      input_cache_read: '0.000000015',
      prompt: '0.000000075'
    },
    supportedParameters: [
      'frequency_penalty',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ]
  },
  {
    id: 'inclusionai/ling-2.6-flash',
    canonicalSlug: 'inclusionai/ling-2.6-flash-20260421',
    name: 'inclusionAI: Ling-2.6-flash',
    description:
      'Ling-2.6-flash is an instant (instruct) model from inclusionAI with 104B total parameters and 7.4B active parameters, designed for real-world agents that require fast responses, strong execution, and high token efficiency....',
    created: 1776795886,
    contextLength: 262144,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.00000003',
      input_cache_read: '0.000000002',
      prompt: '0.00000001'
    },
    supportedParameters: [
      'frequency_penalty',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ]
  },
  {
    id: 'inclusionai/ring-2.6-1t',
    canonicalSlug: 'inclusionai/ring-2.6-1t-20260508',
    name: 'inclusionAI: Ring-2.6-1T',
    description:
      'Ring-2.6-1T is a 1T-parameter-scale thinking model with 63B active parameters, built for real-world agent workflows that require both strong capability and operational efficiency. It is optimized for coding agents, tool...',
    created: 1778247440,
    contextLength: 262144,
    maxCompletionTokens: 65536,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.000000625',
      input_cache_read: '0.000000015',
      prompt: '0.000000075'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    reasoning: {
      mandatory: true,
      supportedEfforts: ['xhigh', 'high'],
      defaultEffort: 'high'
    }
  },
  {
    id: 'inflection/inflection-3-pi',
    canonicalSlug: 'inflection/inflection-3-pi',
    name: 'Inflection: Inflection 3 Pi',
    description:
      "Inflection 3 Pi powers Inflection's [Pi](https://pi.ai) chatbot, including backstory, emotional intelligence, productivity, and safety. It has access to recent news, and excels in scenarios like customer support and roleplay. Pi...",
    created: 1728604800,
    contextLength: 8000,
    maxCompletionTokens: 1024,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.00001',
      prompt: '0.0000025'
    },
    supportedParameters: ['max_tokens', 'stop', 'temperature', 'top_p'],
    knowledgeCutoff: '2024-10-31'
  },
  {
    id: 'inflection/inflection-3-productivity',
    canonicalSlug: 'inflection/inflection-3-productivity',
    name: 'Inflection: Inflection 3 Productivity',
    description:
      'Inflection 3 Productivity is optimized for following instructions. It is better for tasks requiring JSON output or precise adherence to provided guidelines. It has access to recent news. For emotional...',
    created: 1728604800,
    contextLength: 8000,
    maxCompletionTokens: 1024,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.00001',
      prompt: '0.0000025'
    },
    supportedParameters: ['max_tokens', 'stop', 'temperature', 'top_p'],
    knowledgeCutoff: '2024-10-31'
  },
  {
    id: 'kwaipilot/kat-coder-pro-v2',
    canonicalSlug: 'kwaipilot/kat-coder-pro-v2-20260327',
    name: 'Kwaipilot: KAT-Coder-Pro V2',
    description:
      'KAT-Coder-Pro V2 is the latest high-performance model in KwaiKAT\u2019s KAT-Coder series, designed for complex enterprise-grade software engineering and SaaS integration. It builds on the agentic coding strengths of earlier versions,...',
    created: 1774649310,
    contextLength: 256000,
    maxCompletionTokens: 80000,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000012',
      input_cache_read: '0.00000006',
      prompt: '0.0000003'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ]
  },
  {
    id: 'liquid/lfm-2-24b-a2b',
    canonicalSlug: 'liquid/lfm-2-24b-a2b-20260224',
    name: 'LiquidAI: LFM2-24B-A2B',
    description:
      'LFM2-24B-A2B is the largest model in the LFM2 family of hybrid architectures designed for efficient on-device deployment. Built as a 24B parameter Mixture-of-Experts model with only 2B active parameters per...',
    created: 1772048711,
    contextLength: 128000,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.00000012',
      prompt: '0.00000003'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'stop',
      'temperature',
      'top_k',
      'top_p'
    ]
  },
  {
    id: 'liquid/lfm-2.5-1.2b-instruct:free',
    canonicalSlug: 'liquid/lfm-2.5-1.2b-instruct-20260120',
    name: 'LiquidAI: LFM2.5-1.2B-Instruct (free)',
    description:
      'LFM2.5-1.2B-Instruct is a compact, high-performance instruction-tuned model built for fast on-device AI. It delivers strong chat quality in a 1.2B parameter footprint, with efficient edge inference and broad runtime support.',
    created: 1768927521,
    contextLength: 32768,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0',
      prompt: '0'
    },
    supportedParameters: [
      'frequency_penalty',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p'
    ]
  },
  {
    id: 'liquid/lfm-2.5-1.2b-thinking:free',
    canonicalSlug: 'liquid/lfm-2.5-1.2b-thinking-20260120',
    name: 'LiquidAI: LFM2.5-1.2B-Thinking (free)',
    description:
      'LFM2.5-1.2B-Thinking is a lightweight reasoning-focused model optimized for agentic tasks, data extraction, and RAG\u2014while still running comfortably on edge devices. It supports long context (up to 32K tokens) and is...',
    created: 1768927527,
    contextLength: 32768,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0',
      prompt: '0'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    reasoning: {
      mandatory: true
    }
  },
  {
    id: 'mancer/weaver',
    canonicalSlug: 'mancer/weaver',
    name: 'Mancer: Weaver (alpha)',
    description:
      "An attempt to recreate Claude-style verbosity, but don't expect the same level of coherence or memory. Meant for use in roleplay/narrative situations.",
    created: 1690934400,
    contextLength: 8000,
    maxCompletionTokens: 2000,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Llama2',
    instructType: 'alpaca',
    pricing: {
      completion: '0.000001',
      prompt: '0.00000075'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_a',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2023-06-30'
  },
  {
    id: 'meta-llama/llama-3-8b-instruct',
    canonicalSlug: 'meta-llama/llama-3-8b-instruct',
    name: 'Meta: Llama 3 8B Instruct',
    description:
      "Meta's latest class of model (Llama 3) launched with a variety of sizes & flavors. This 8B instruct-tuned version was optimized for high quality dialogue usecases. It has demonstrated strong...",
    created: 1713398400,
    contextLength: 8192,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Llama3',
    instructType: 'llama3',
    pricing: {
      completion: '0.00000014',
      prompt: '0.00000014'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2023-12-31'
  },
  {
    id: 'meta-llama/llama-3.1-70b-instruct',
    canonicalSlug: 'meta-llama/llama-3.1-70b-instruct',
    name: 'Meta: Llama 3.1 70B Instruct',
    description:
      "Meta's latest class of model (Llama 3.1) launched with a variety of sizes & flavors. This 70B instruct-tuned version is optimized for high quality dialogue usecases. It has demonstrated strong...",
    created: 1721692800,
    contextLength: 131072,
    maxCompletionTokens: 16384,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Llama3',
    instructType: 'llama3',
    pricing: {
      completion: '0.0000004',
      prompt: '0.0000004'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2023-12-31'
  },
  {
    id: 'meta-llama/llama-3.1-8b-instruct',
    canonicalSlug: 'meta-llama/llama-3.1-8b-instruct',
    name: 'Meta: Llama 3.1 8B Instruct',
    description:
      "Meta's latest class of model (Llama 3.1) launched with a variety of sizes & flavors. This 8B instruct-tuned version is fast and efficient. It has demonstrated strong performance compared to...",
    created: 1721692800,
    contextLength: 131072,
    maxCompletionTokens: 16384,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Llama3',
    instructType: 'llama3',
    pricing: {
      completion: '0.00000003',
      prompt: '0.00000002'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2023-12-31'
  },
  {
    id: 'meta-llama/llama-3.2-11b-vision-instruct',
    canonicalSlug: 'meta-llama/llama-3.2-11b-vision-instruct',
    name: 'Meta: Llama 3.2 11B Vision Instruct',
    description:
      'Llama 3.2 11B Vision is a multimodal model with 11 billion parameters, designed to handle tasks combining visual and textual data. It excels in tasks such as image captioning and...',
    created: 1727222400,
    contextLength: 131072,
    maxCompletionTokens: 16384,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'Llama3',
    instructType: 'llama3',
    pricing: {
      completion: '0.000000345',
      prompt: '0.000000345'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2023-12-31'
  },
  {
    id: 'meta-llama/llama-3.2-1b-instruct',
    canonicalSlug: 'meta-llama/llama-3.2-1b-instruct',
    name: 'Meta: Llama 3.2 1B Instruct',
    description:
      'Llama 3.2 1B is a 1-billion-parameter language model focused on efficiently performing natural language tasks, such as summarization, dialogue, and multilingual text analysis. Its smaller size allows it to operate...',
    created: 1727222400,
    contextLength: 131072,
    maxCompletionTokens: 60000,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Llama3',
    instructType: 'llama3',
    pricing: {
      completion: '0.000000201',
      prompt: '0.000000027'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2023-12-31'
  },
  {
    id: 'meta-llama/llama-3.2-3b-instruct',
    canonicalSlug: 'meta-llama/llama-3.2-3b-instruct',
    name: 'Meta: Llama 3.2 3B Instruct',
    description:
      'Llama 3.2 3B is a 3-billion-parameter multilingual large language model, optimized for advanced natural language processing tasks like dialogue generation, reasoning, and summarization. Designed with the latest transformer architecture, it...',
    created: 1727222400,
    contextLength: 131072,
    maxCompletionTokens: 80000,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Llama3',
    instructType: 'llama3',
    pricing: {
      completion: '0.000000335',
      prompt: '0.0000000509'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2023-12-31'
  },
  {
    id: 'meta-llama/llama-3.2-3b-instruct:free',
    canonicalSlug: 'meta-llama/llama-3.2-3b-instruct',
    name: 'Meta: Llama 3.2 3B Instruct (free)',
    description:
      'Llama 3.2 3B is a 3-billion-parameter multilingual large language model, optimized for advanced natural language processing tasks like dialogue generation, reasoning, and summarization. Designed with the latest transformer architecture, it...',
    created: 1727222400,
    contextLength: 131072,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Llama3',
    instructType: 'llama3',
    pricing: {
      completion: '0',
      prompt: '0'
    },
    supportedParameters: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'stop',
      'temperature',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2023-12-31'
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct',
    canonicalSlug: 'meta-llama/llama-3.3-70b-instruct',
    name: 'Meta: Llama 3.3 70B Instruct',
    description:
      'The Meta Llama 3.3 multilingual large language model (LLM) is a pretrained and instruction tuned generative model in 70B (text in/text out). The Llama 3.3 instruction tuned text only model...',
    created: 1733506137,
    contextLength: 131072,
    maxCompletionTokens: 16384,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Llama3',
    instructType: 'llama3',
    pricing: {
      completion: '0.00000032',
      prompt: '0.0000001'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2023-12-31'
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    canonicalSlug: 'meta-llama/llama-3.3-70b-instruct',
    name: 'Meta: Llama 3.3 70B Instruct (free)',
    description:
      'The Meta Llama 3.3 multilingual large language model (LLM) is a pretrained and instruction tuned generative model in 70B (text in/text out). The Llama 3.3 instruction tuned text only model...',
    created: 1733506137,
    contextLength: 131072,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Llama3',
    instructType: 'llama3',
    pricing: {
      completion: '0',
      prompt: '0'
    },
    supportedParameters: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2023-12-31'
  },
  {
    id: 'meta-llama/llama-4-maverick',
    canonicalSlug: 'meta-llama/llama-4-maverick-17b-128e-instruct',
    name: 'Meta: Llama 4 Maverick',
    description:
      'Llama 4 Maverick 17B Instruct (128E) is a high-capacity multimodal language model from Meta, built on a mixture-of-experts (MoE) architecture with 128 experts and 17 billion active parameters per forward...',
    created: 1743881822,
    contextLength: 1048576,
    maxCompletionTokens: 16384,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'Llama4',
    pricing: {
      completion: '0.0000006',
      prompt: '0.00000015'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2024-08-31'
  },
  {
    id: 'meta-llama/llama-4-scout',
    canonicalSlug: 'meta-llama/llama-4-scout-17b-16e-instruct',
    name: 'Meta: Llama 4 Scout',
    description:
      'Llama 4 Scout 17B Instruct (16E) is a mixture-of-experts (MoE) language model developed by Meta, activating 17 billion parameters out of a total of 109B. It supports native multimodal input...',
    created: 1743881519,
    contextLength: 10000000,
    maxCompletionTokens: 16384,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'Llama4',
    pricing: {
      completion: '0.0000003',
      prompt: '0.0000001'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2024-08-31'
  },
  {
    id: 'meta-llama/llama-guard-4-12b',
    canonicalSlug: 'meta-llama/llama-guard-4-12b',
    name: 'Meta: Llama Guard 4 12B',
    description:
      'Llama Guard 4 is a Llama 4 Scout-derived multimodal pretrained model, fine-tuned for content safety classification. Similar to previous versions, it can be used to classify content in both LLM...',
    created: 1745975193,
    contextLength: 163840,
    maxCompletionTokens: 16384,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['image', 'text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.00000018',
      prompt: '0.00000018'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2024-08-31'
  },
  {
    id: 'microsoft/phi-4',
    canonicalSlug: 'microsoft/phi-4',
    name: 'Microsoft: Phi 4',
    description:
      '[Microsoft Research](/microsoft) Phi-4 is designed to perform well in complex reasoning tasks and can operate efficiently in situations with limited memory or where quick responses are needed. At 14 billion...',
    created: 1736489872,
    contextLength: 16384,
    maxCompletionTokens: 16384,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.00000014',
      prompt: '0.000000065'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2024-06-30'
  },
  {
    id: 'microsoft/phi-4-mini-instruct',
    canonicalSlug: 'microsoft/phi-4-mini-instruct',
    name: 'Microsoft: Phi 4 Mini Instruct',
    description:
      'Phi-4-mini-instruct is a lightweight open model built upon synthetic data and filtered publicly available websites - with a focus on high-quality, reasoning dense data. The model belongs to the Phi-4...',
    created: 1760726049,
    contextLength: 131072,
    maxCompletionTokens: 128000,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.00000035',
      input_cache_read: '0.00000008',
      prompt: '0.00000008'
    },
    supportedParameters: [
      'frequency_penalty',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_logprobs',
      'top_p'
    ]
  },
  {
    id: 'microsoft/wizardlm-2-8x22b',
    canonicalSlug: 'microsoft/wizardlm-2-8x22b',
    name: 'WizardLM-2 8x22B',
    description:
      "WizardLM-2 8x22B is Microsoft AI's most advanced Wizard model. It demonstrates highly competitive performance compared to leading proprietary models, and it consistently outperforms all existing state-of-the-art opensource models. It is...",
    created: 1713225600,
    contextLength: 65536,
    maxCompletionTokens: 8000,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Mistral',
    instructType: 'vicuna',
    pricing: {
      completion: '0.00000062',
      prompt: '0.00000062'
    },
    supportedParameters: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2024-04-30'
  },
  {
    id: 'minimax/minimax-01',
    canonicalSlug: 'minimax/minimax-01',
    name: 'MiniMax: MiniMax-01',
    description:
      'MiniMax-01 is a combines MiniMax-Text-01 for text generation and MiniMax-VL-01 for image understanding. It has 456 billion parameters, with 45.9 billion parameters activated per inference, and can handle a context...',
    created: 1736915462,
    contextLength: 1000192,
    maxCompletionTokens: 1000192,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000011',
      prompt: '0.0000002'
    },
    supportedParameters: ['max_tokens', 'temperature', 'top_p'],
    knowledgeCutoff: '2024-03-31'
  },
  {
    id: 'minimax/minimax-m1',
    canonicalSlug: 'minimax/minimax-m1',
    name: 'MiniMax: MiniMax M1',
    description:
      'MiniMax-M1 is a large-scale, open-weight reasoning model designed for extended context and high-efficiency inference. It leverages a hybrid Mixture-of-Experts (MoE) architecture paired with a custom "lightning attention" mechanism, allowing it...',
    created: 1750200414,
    contextLength: 1000000,
    maxCompletionTokens: 40000,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000022',
      prompt: '0.0000004'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2024-06-30',
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'minimax/minimax-m2',
    canonicalSlug: 'minimax/minimax-m2',
    name: 'MiniMax: MiniMax M2',
    description:
      'MiniMax-M2 is a compact, high-efficiency large language model optimized for end-to-end coding and agentic workflows. With 10 billion activated parameters (230 billion total), it delivers near-frontier intelligence across general reasoning,...',
    created: 1761252093,
    contextLength: 204800,
    maxCompletionTokens: 196608,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.000001',
      input_cache_read: '0.00000003',
      prompt: '0.000000255'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: true
    }
  },
  {
    id: 'minimax/minimax-m2-her',
    canonicalSlug: 'minimax/minimax-m2-her-20260123',
    name: 'MiniMax: MiniMax M2-her',
    description:
      'MiniMax M2-her is a dialogue-first large language model built for immersive roleplay, character-driven chat, and expressive multi-turn conversations. Designed to stay consistent in tone and personality, it supports rich message...',
    created: 1769177239,
    contextLength: 65536,
    maxCompletionTokens: 2048,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000012',
      input_cache_read: '0.00000003',
      prompt: '0.0000003'
    },
    supportedParameters: ['max_tokens', 'temperature', 'top_p']
  },
  {
    id: 'minimax/minimax-m2.1',
    canonicalSlug: 'minimax/minimax-m2.1',
    name: 'MiniMax: MiniMax M2.1',
    description:
      'MiniMax-M2.1 is a lightweight, state-of-the-art large language model optimized for coding, agentic workflows, and modern application development. With only 10 billion activated parameters, it delivers a major jump in real-world...',
    created: 1766454997,
    contextLength: 204800,
    maxCompletionTokens: 196608,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.00000095',
      input_cache_read: '0.00000003',
      prompt: '0.00000029'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    reasoning: {
      mandatory: true
    }
  },
  {
    id: 'minimax/minimax-m2.5',
    canonicalSlug: 'minimax/minimax-m2.5-20260211',
    name: 'MiniMax: MiniMax M2.5',
    description:
      'MiniMax-M2.5 is a SOTA large language model designed for real-world productivity. Trained in a diverse range of complex real-world digital working environments, M2.5 builds upon the coding expertise of M2.1...',
    created: 1770908502,
    contextLength: 204800,
    maxCompletionTokens: 196608,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000009',
      input_cache_read: '0.00000005',
      prompt: '0.00000015'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'parallel_tool_calls',
      'presence_penalty',
      'reasoning',
      'reasoning_effort',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: true
    }
  },
  {
    id: 'minimax/minimax-m2.7',
    canonicalSlug: 'minimax/minimax-m2.7-20260318',
    name: 'MiniMax: MiniMax M2.7',
    description:
      'MiniMax-M2.7 is a next-generation large language model designed for autonomous, real-world productivity and continuous improvement. Built to actively participate in its own evolution, M2.7 integrates advanced agentic capabilities through multi-agent...',
    created: 1773836697,
    contextLength: 204800,
    maxCompletionTokens: 131072,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.000001',
      input_cache_read: '0.00000005',
      prompt: '0.00000025'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: true
    }
  },
  {
    id: 'minimax/minimax-m3',
    canonicalSlug: 'minimax/minimax-m3-20260531',
    name: 'MiniMax: MiniMax M3',
    description:
      'MiniMax-M3 is a multimodal foundation model from MiniMax. It supports text, image, and video inputs with text output, a 1M-token context window, and is suited for long-horizon agentic work, coding,...',
    created: 1780245374,
    contextLength: 1048576,
    maxCompletionTokens: 512000,
    isModerated: false,
    modality: 'text+image+video->text',
    inputModalities: ['text', 'image', 'video'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000012',
      input_cache_read: '0.00000006',
      prompt: '0.0000003'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'mistralai/codestral-2508',
    canonicalSlug: 'mistralai/codestral-2508',
    name: 'Mistral: Codestral 2508',
    description:
      "Mistral's cutting-edge language model for coding released end of July 2025. Codestral specializes in low-latency, high-frequency tasks such as fill-in-the-middle (FIM), code correction and test generation.\n\n[Blog Post](https://mistral.ai/news/codestral-25-08)",
    created: 1754079630,
    contextLength: 256000,
    isModerated: false,
    modality: 'text+file->text',
    inputModalities: ['text', 'file'],
    outputModalities: ['text'],
    tokenizer: 'Mistral',
    pricing: {
      completion: '0.0000009',
      input_cache_read: '0.00000003',
      prompt: '0.0000003'
    },
    supportedParameters: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    knowledgeCutoff: '2025-03-31'
  },
  {
    id: 'mistralai/devstral-2512',
    canonicalSlug: 'mistralai/devstral-2512',
    name: 'Mistral: Devstral 2 2512',
    description:
      'Devstral 2 is a state-of-the-art open-source model by Mistral AI specializing in agentic coding. It is a 123B-parameter dense transformer model supporting a 256K context window. Devstral 2 supports exploring...',
    created: 1765285419,
    contextLength: 262144,
    isModerated: false,
    modality: 'text+file->text',
    inputModalities: ['text', 'file'],
    outputModalities: ['text'],
    tokenizer: 'Mistral',
    pricing: {
      completion: '0.000002',
      input_cache_read: '0.00000004',
      prompt: '0.0000004'
    },
    supportedParameters: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ]
  },
  {
    id: 'mistralai/ministral-14b-2512',
    canonicalSlug: 'mistralai/ministral-14b-2512',
    name: 'Mistral: Ministral 3 14B 2512',
    description:
      'The largest model in the Ministral 3 family, Ministral 3 14B offers frontier capabilities and performance comparable to its larger Mistral Small 3.2 24B counterpart. A powerful and efficient language...',
    created: 1764681735,
    contextLength: 262144,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'Mistral',
    pricing: {
      completion: '0.0000002',
      input_cache_read: '0.00000002',
      prompt: '0.0000002'
    },
    supportedParameters: [
      'frequency_penalty',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p'
    ]
  },
  {
    id: 'mistralai/ministral-3b-2512',
    canonicalSlug: 'mistralai/ministral-3b-2512',
    name: 'Mistral: Ministral 3 3B 2512',
    description:
      'The smallest model in the Ministral 3 family, Ministral 3 3B is a powerful, efficient tiny language model with vision capabilities.',
    created: 1764681560,
    contextLength: 131072,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'Mistral',
    pricing: {
      completion: '0.0000001',
      input_cache_read: '0.00000001',
      prompt: '0.0000001'
    },
    supportedParameters: [
      'frequency_penalty',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p'
    ]
  },
  {
    id: 'mistralai/ministral-8b-2512',
    canonicalSlug: 'mistralai/ministral-8b-2512',
    name: 'Mistral: Ministral 3 8B 2512',
    description:
      'A balanced model in the Ministral 3 family, Ministral 3 8B is a powerful, efficient tiny language model with vision capabilities.',
    created: 1764681654,
    contextLength: 262144,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'Mistral',
    pricing: {
      completion: '0.00000015',
      input_cache_read: '0.000000015',
      prompt: '0.00000015'
    },
    supportedParameters: [
      'frequency_penalty',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p'
    ]
  },
  {
    id: 'mistralai/mistral-large',
    canonicalSlug: 'mistralai/mistral-large',
    name: 'Mistral Large',
    description:
      "This is Mistral AI's flagship model, Mistral Large 2 (version `mistral-large-2407`). It's a proprietary weights-available model and excels at reasoning, code, JSON, chat, and more. Read the launch announcement [here](https://mistral.ai/news/mistral-large-2407/)....",
    created: 1708905600,
    contextLength: 128000,
    isModerated: false,
    modality: 'text+file->text',
    inputModalities: ['text', 'file'],
    outputModalities: ['text'],
    tokenizer: 'Mistral',
    pricing: {
      completion: '0.000006',
      input_cache_read: '0.0000002',
      prompt: '0.000002'
    },
    supportedParameters: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    knowledgeCutoff: '2024-11-30'
  },
  {
    id: 'mistralai/mistral-large-2407',
    canonicalSlug: 'mistralai/mistral-large-2407',
    name: 'Mistral Large 2407',
    description:
      "This is Mistral AI's flagship model, Mistral Large 2 (version mistral-large-2407). It's a proprietary weights-available model and excels at reasoning, code, JSON, chat, and more. Read the launch announcement [here](https://mistral.ai/news/mistral-large-2407/)....",
    created: 1731978415,
    contextLength: 131072,
    isModerated: false,
    modality: 'text+file->text',
    inputModalities: ['text', 'file'],
    outputModalities: ['text'],
    tokenizer: 'Mistral',
    pricing: {
      completion: '0.000006',
      input_cache_read: '0.0000002',
      prompt: '0.000002'
    },
    supportedParameters: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    knowledgeCutoff: '2024-03-31'
  },
  {
    id: 'mistralai/mistral-large-2512',
    canonicalSlug: 'mistralai/mistral-large-2512',
    name: 'Mistral: Mistral Large 3 2512',
    description:
      'Mistral Large 3 2512 is Mistral\u2019s most capable model to date, featuring a sparse mixture-of-experts architecture with 41B active parameters (675B total), and released under the Apache 2.0 license.',
    created: 1764624472,
    contextLength: 262144,
    isModerated: false,
    modality: 'text+image+file->text',
    inputModalities: ['text', 'image', 'file'],
    outputModalities: ['text'],
    tokenizer: 'Mistral',
    pricing: {
      completion: '0.0000015',
      input_cache_read: '0.00000005',
      prompt: '0.0000005'
    },
    supportedParameters: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ]
  },
  {
    id: 'mistralai/mistral-medium-3',
    canonicalSlug: 'mistralai/mistral-medium-3',
    name: 'Mistral: Mistral Medium 3',
    description:
      'Mistral Medium 3 is a high-performance enterprise-grade language model designed to deliver frontier-level capabilities at significantly reduced operational cost. It balances state-of-the-art reasoning and multimodal performance with 8\u00d7 lower cost...',
    created: 1746627341,
    contextLength: 131072,
    isModerated: false,
    modality: 'text+image+file->text',
    inputModalities: ['text', 'image', 'file'],
    outputModalities: ['text'],
    tokenizer: 'Mistral',
    pricing: {
      completion: '0.000002',
      input_cache_read: '0.00000004',
      prompt: '0.0000004'
    },
    supportedParameters: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    knowledgeCutoff: '2025-03-31'
  },
  {
    id: 'mistralai/mistral-medium-3-5',
    canonicalSlug: 'mistralai/mistral-medium-3.5-20260430',
    name: 'Mistral: Mistral Medium 3.5',
    description:
      'Mistral Medium 3.5 is a dense 128B instruction-following model from Mistral AI. It supports text and image inputs with text output, and is designed for agentic workflows, coding, and complex...',
    created: 1777570439,
    contextLength: 262144,
    isModerated: false,
    modality: 'text+image+file->text',
    inputModalities: ['text', 'image', 'file'],
    outputModalities: ['text'],
    tokenizer: 'Mistral',
    pricing: {
      completion: '0.0000075',
      prompt: '0.0000015'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    reasoning: {
      mandatory: false,
      supportedEfforts: ['high', 'none'],
      defaultEffort: 'high'
    }
  },
  {
    id: 'mistralai/mistral-medium-3.1',
    canonicalSlug: 'mistralai/mistral-medium-3.1',
    name: 'Mistral: Mistral Medium 3.1',
    description:
      'Mistral Medium 3.1 is an updated version of Mistral Medium 3, which is a high-performance enterprise-grade language model designed to deliver frontier-level capabilities at significantly reduced operational cost. It balances...',
    created: 1755095639,
    contextLength: 131072,
    isModerated: false,
    modality: 'text+image+file->text',
    inputModalities: ['text', 'image', 'file'],
    outputModalities: ['text'],
    tokenizer: 'Mistral',
    pricing: {
      completion: '0.000002',
      input_cache_read: '0.00000004',
      prompt: '0.0000004'
    },
    supportedParameters: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    knowledgeCutoff: '2025-06-30'
  },
  {
    id: 'mistralai/mistral-nemo',
    canonicalSlug: 'mistralai/mistral-nemo',
    name: 'Mistral: Mistral Nemo',
    description:
      'A 12B parameter model with a 128k token context length built by Mistral in collaboration with NVIDIA. The model is multilingual, supporting English, French, German, Spanish, Italian, Portuguese, Chinese, Japanese,...',
    created: 1721347200,
    contextLength: 131072,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Mistral',
    instructType: 'mistral',
    pricing: {
      completion: '0.00000003',
      prompt: '0.00000002'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2024-04-30'
  },
  {
    id: 'mistralai/mistral-saba',
    canonicalSlug: 'mistralai/mistral-saba-2502',
    name: 'Mistral: Saba',
    description:
      'Mistral Saba is a 24B-parameter language model specifically designed for the Middle East and South Asia, delivering accurate and contextually relevant responses while maintaining efficient performance. Trained on curated regional...',
    created: 1739803239,
    contextLength: 32768,
    isModerated: false,
    modality: 'text+file->text',
    inputModalities: ['text', 'file'],
    outputModalities: ['text'],
    tokenizer: 'Mistral',
    pricing: {
      completion: '0.0000006',
      input_cache_read: '0.00000002',
      prompt: '0.0000002'
    },
    supportedParameters: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    knowledgeCutoff: '2024-09-30'
  },
  {
    id: 'mistralai/mistral-small-24b-instruct-2501',
    canonicalSlug: 'mistralai/mistral-small-24b-instruct-2501',
    name: 'Mistral: Mistral Small 3',
    description:
      'Mistral Small 3 is a 24B-parameter language model optimized for low-latency performance across common AI tasks. Released under the Apache 2.0 license, it features both pre-trained and instruction-tuned versions designed...',
    created: 1738255409,
    contextLength: 32768,
    maxCompletionTokens: 16384,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Mistral',
    pricing: {
      completion: '0.00000008',
      prompt: '0.00000005'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2023-10-31'
  },
  {
    id: 'mistralai/mistral-small-2603',
    canonicalSlug: 'mistralai/mistral-small-2603',
    name: 'Mistral: Mistral Small 4',
    description:
      'Mistral Small 4 is the next major release in the Mistral Small family, unifying the capabilities of several flagship Mistral models into a single system. It combines strong reasoning from...',
    created: 1773695685,
    contextLength: 262144,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'Mistral',
    pricing: {
      completion: '0.0000006',
      input_cache_read: '0.000000015',
      prompt: '0.00000015'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: false,
      supportedEfforts: ['high', 'none'],
      defaultEffort: 'high'
    }
  },
  {
    id: 'mistralai/mistral-small-3.1-24b-instruct',
    canonicalSlug: 'mistralai/mistral-small-3.1-24b-instruct-2503',
    name: 'Mistral: Mistral Small 3.1 24B',
    description:
      'Mistral Small 3.1 24B Instruct is an upgraded variant of Mistral Small 3 (2501), featuring 24 billion parameters with advanced multimodal capabilities. It provides state-of-the-art performance in text-based reasoning and...',
    created: 1742238937,
    contextLength: 128000,
    maxCompletionTokens: 128000,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'Mistral',
    pricing: {
      completion: '0.000000555',
      prompt: '0.000000351'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2023-10-31'
  },
  {
    id: 'mistralai/mistral-small-3.2-24b-instruct',
    canonicalSlug: 'mistralai/mistral-small-3.2-24b-instruct-2506',
    name: 'Mistral: Mistral Small 3.2 24B',
    description:
      'Mistral-Small-3.2-24B-Instruct-2506 is an updated 24B parameter model from Mistral optimized for instruction following, repetition reduction, and improved function calling. Compared to the 3.1 release, version 3.2 significantly improves accuracy on...',
    created: 1750443016,
    contextLength: 128000,
    maxCompletionTokens: 16384,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['image', 'text'],
    outputModalities: ['text'],
    tokenizer: 'Mistral',
    pricing: {
      completion: '0.0000002',
      prompt: '0.000000075'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2023-10-31'
  },
  {
    id: 'mistralai/mixtral-8x22b-instruct',
    canonicalSlug: 'mistralai/mixtral-8x22b-instruct',
    name: 'Mistral: Mixtral 8x22B Instruct',
    description:
      "Mistral's official instruct fine-tuned version of [Mixtral 8x22B](/models/mistralai/mixtral-8x22b). It uses 39B active parameters out of 141B, offering unparalleled cost efficiency for its size. Its strengths include: - strong math, coding,...",
    created: 1713312000,
    contextLength: 65536,
    isModerated: false,
    modality: 'text+file->text',
    inputModalities: ['text', 'file'],
    outputModalities: ['text'],
    tokenizer: 'Mistral',
    instructType: 'mistral',
    pricing: {
      completion: '0.000006',
      input_cache_read: '0.0000002',
      prompt: '0.000002'
    },
    supportedParameters: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    knowledgeCutoff: '2024-01-31'
  },
  {
    id: 'mistralai/voxtral-small-24b-2507',
    canonicalSlug: 'mistralai/voxtral-small-24b-2507',
    name: 'Mistral: Voxtral Small 24B 2507',
    description:
      'Voxtral Small is an enhancement of Mistral Small 3, incorporating state-of-the-art audio input capabilities while retaining best-in-class text performance. It excels at speech transcription, translation and audio understanding. Input audio...',
    created: 1761835144,
    contextLength: 32000,
    isModerated: false,
    modality: 'text+file+audio->text',
    inputModalities: ['text', 'audio', 'file'],
    outputModalities: ['text'],
    tokenizer: 'Mistral',
    pricing: {
      audio: '0.0001',
      completion: '0.0000003',
      input_cache_read: '0.00000001',
      prompt: '0.0000001'
    },
    supportedParameters: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ]
  },
  {
    id: 'moonshotai/kimi-k2',
    canonicalSlug: 'moonshotai/kimi-k2',
    name: 'MoonshotAI: Kimi K2 0711',
    description:
      'Kimi K2 Instruct is a large-scale Mixture-of-Experts (MoE) language model developed by Moonshot AI, featuring 1 trillion total parameters with 32 billion active per forward pass. It is optimized for...',
    created: 1752263252,
    contextLength: 131072,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000023',
      prompt: '0.00000057'
    },
    supportedParameters: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'repetition_penalty',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2024-12-31'
  },
  {
    id: 'moonshotai/kimi-k2-0905',
    canonicalSlug: 'moonshotai/kimi-k2-0905',
    name: 'MoonshotAI: Kimi K2 0905',
    description:
      'Kimi K2 0905 is the September update of [Kimi K2 0711](moonshotai/kimi-k2). It is a large-scale Mixture-of-Experts (MoE) language model developed by Moonshot AI, featuring 1 trillion total parameters with 32...',
    created: 1757021147,
    contextLength: 262144,
    maxCompletionTokens: 262144,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000025',
      prompt: '0.0000006'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2024-12-31'
  },
  {
    id: 'moonshotai/kimi-k2-thinking',
    canonicalSlug: 'moonshotai/kimi-k2-thinking-20251106',
    name: 'MoonshotAI: Kimi K2 Thinking',
    description:
      'Kimi K2 Thinking is Moonshot AI\u2019s most advanced open reasoning model to date, extending the K2 series into agentic, long-horizon reasoning. Built on the trillion-parameter Mixture-of-Experts (MoE) architecture introduced in...',
    created: 1762440622,
    contextLength: 262144,
    maxCompletionTokens: 262144,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000025',
      prompt: '0.0000006'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: true
    }
  },
  {
    id: 'moonshotai/kimi-k2.5',
    canonicalSlug: 'moonshotai/kimi-k2.5-0127',
    name: 'MoonshotAI: Kimi K2.5',
    description:
      "Kimi K2.5 is Moonshot AI's native multimodal model, delivering state-of-the-art visual coding capability and a self-directed agent swarm paradigm. Built on Kimi K2 with continued pretraining over approximately 15T mixed...",
    created: 1769487076,
    contextLength: 262144,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.000002025',
      prompt: '0.000000375'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: true
    }
  },
  {
    id: 'moonshotai/kimi-k2.6',
    canonicalSlug: 'moonshotai/kimi-k2.6-20260420',
    name: 'MoonshotAI: Kimi K2.6',
    description:
      "Kimi K2.6 is Moonshot AI's next-generation multimodal model, designed for long-horizon coding, coding-driven UI/UX generation, and multi-agent orchestration. It handles complex end-to-end coding tasks across Python, Rust, and Go, and...",
    created: 1776699402,
    contextLength: 262144,
    maxCompletionTokens: 262142,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000035',
      input_cache_read: '0.00000033',
      prompt: '0.00000066'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'parallel_tool_calls',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: true
    }
  },
  {
    id: 'moonshotai/kimi-k2.7-code',
    canonicalSlug: 'moonshotai/kimi-k2.7-code-20260612',
    name: 'MoonshotAI: Kimi K2.7 Code',
    description:
      "MoonshotAI: Kimi K2.7 Code is a coding-focused model in Moonshot AI's Kimi K2 family, built to complete end-to-end programming tasks reliably over long contexts. It uses a native multimodal mixture-of-experts...",
    created: 1781266361,
    contextLength: 262144,
    maxCompletionTokens: 262144,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.000003069',
      input_cache_read: '0.0000001296',
      prompt: '0.000000612'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: true,
      defaultEnabled: true
    }
  },
  {
    id: 'morph/morph-v3-fast',
    canonicalSlug: 'morph/morph-v3-fast',
    name: 'Morph: Morph V3 Fast',
    description:
      "Morph's fastest apply model for code edits. ~10,500 tokens/sec with 96% accuracy for rapid code transformations. The model requires the prompt to be in the following format: <instruction>{instruction}</instruction> <code>{initial_code}</code> <update>{edit_snippet}</update>...",
    created: 1751910002,
    contextLength: 81920,
    maxCompletionTokens: 38000,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000012',
      prompt: '0.0000008'
    },
    supportedParameters: ['max_tokens', 'stop', 'temperature']
  },
  {
    id: 'morph/morph-v3-large',
    canonicalSlug: 'morph/morph-v3-large',
    name: 'Morph: Morph V3 Large',
    description:
      "Morph's high-accuracy apply model for complex code edits. ~4,500 tokens/sec with 98% accuracy for precise code transformations. The model requires the prompt to be in the following format: <instruction>{instruction}</instruction> <code>{initial_code}</code>...",
    created: 1751910858,
    contextLength: 262144,
    maxCompletionTokens: 131072,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000019',
      prompt: '0.0000009'
    },
    supportedParameters: [
      'logprobs',
      'max_tokens',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'top_logprobs'
    ]
  },
  {
    id: 'nex-agi/nex-n2-pro:free',
    canonicalSlug: 'nex-agi/nex-n2-pro',
    name: 'Nex AGI: Nex-N2-Pro (free)',
    description:
      'Nex-N2-Pro is an agentic mixture-of-experts model from Nex AGI, with 17B active parameters out of 397B total. Built on the Qwen3.5 architecture, it accepts text and image input and produces...',
    created: 1780937140,
    contextLength: 262144,
    maxCompletionTokens: 262144,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'Qwen3',
    pricing: {
      completion: '0',
      prompt: '0'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logprobs',
      'max_tokens',
      'reasoning',
      'response_format',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    expirationDate: '2026-06-22',
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'nousresearch/hermes-3-llama-3.1-405b',
    canonicalSlug: 'nousresearch/hermes-3-llama-3.1-405b',
    name: 'Nous: Hermes 3 405B Instruct',
    description:
      'Hermes 3 is a generalist language model with many improvements over Hermes 2, including advanced agentic capabilities, much better roleplaying, reasoning, multi-turn conversation, long context coherence, and improvements across the...',
    created: 1723766400,
    contextLength: 131072,
    maxCompletionTokens: 16384,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Llama3',
    instructType: 'chatml',
    pricing: {
      completion: '0.000001',
      prompt: '0.000001'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2023-12-31'
  },
  {
    id: 'nousresearch/hermes-3-llama-3.1-405b:free',
    canonicalSlug: 'nousresearch/hermes-3-llama-3.1-405b',
    name: 'Nous: Hermes 3 405B Instruct (free)',
    description:
      'Hermes 3 is a generalist language model with many improvements over Hermes 2, including advanced agentic capabilities, much better roleplaying, reasoning, multi-turn conversation, long context coherence, and improvements across the...',
    created: 1723766400,
    contextLength: 131072,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Llama3',
    instructType: 'chatml',
    pricing: {
      completion: '0',
      prompt: '0'
    },
    supportedParameters: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'stop',
      'temperature',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2023-12-31'
  },
  {
    id: 'nousresearch/hermes-3-llama-3.1-70b',
    canonicalSlug: 'nousresearch/hermes-3-llama-3.1-70b',
    name: 'Nous: Hermes 3 70B Instruct',
    description:
      'Hermes 3 is a generalist language model with many improvements over [Hermes 2](/models/nousresearch/nous-hermes-2-mistral-7b-dpo), including advanced agentic capabilities, much better roleplaying, reasoning, multi-turn conversation, long context coherence, and improvements across the...',
    created: 1723939200,
    contextLength: 131072,
    maxCompletionTokens: 16384,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Llama3',
    instructType: 'chatml',
    pricing: {
      completion: '0.0000007',
      prompt: '0.0000007'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2023-12-31'
  },
  {
    id: 'nousresearch/hermes-4-405b',
    canonicalSlug: 'nousresearch/hermes-4-405b',
    name: 'Nous: Hermes 4 405B',
    description:
      'Hermes 4 is a large-scale reasoning model built on Meta-Llama-3.1-405B and released by Nous Research. It introduces a hybrid reasoning mode, where the model can choose to deliberate internally with...',
    created: 1756235463,
    contextLength: 131072,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.000003',
      prompt: '0.000001'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'temperature',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2024-08-31',
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'nousresearch/hermes-4-70b',
    canonicalSlug: 'nousresearch/hermes-4-70b',
    name: 'Nous: Hermes 4 70B',
    description:
      'Hermes 4 70B is a hybrid reasoning model from Nous Research, built on Meta-Llama-3.1-70B. It introduces the same hybrid mode as the larger 405B release, allowing the model to either...',
    created: 1756236182,
    contextLength: 131072,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Llama3',
    pricing: {
      completion: '0.0000004',
      prompt: '0.00000013'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'temperature',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2024-08-31',
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'nvidia/llama-3.3-nemotron-super-49b-v1.5',
    canonicalSlug: 'nvidia/llama-3.3-nemotron-super-49b-v1.5',
    name: 'NVIDIA: Llama 3.3 Nemotron Super 49B V1.5',
    description:
      'Llama-3.3-Nemotron-Super-49B-v1.5 is a 49B-parameter, English-centric reasoning/chat model derived from Meta\u2019s Llama-3.3-70B-Instruct with a 128K context. It\u2019s post-trained for agentic workflows (RAG, tool calling) via SFT across math, code, science, and...',
    created: 1760101395,
    contextLength: 131072,
    maxCompletionTokens: 16384,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Llama3',
    pricing: {
      completion: '0.0000004',
      prompt: '0.0000004'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2024-03-31',
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'nvidia/nemotron-3-nano-30b-a3b',
    canonicalSlug: 'nvidia/nemotron-3-nano-30b-a3b',
    name: 'NVIDIA: Nemotron 3 Nano 30B A3B',
    description:
      'NVIDIA Nemotron 3 Nano 30B A3B is a small language MoE model with highest compute efficiency and accuracy for developers to build specialized agentic AI systems. The model is fully...',
    created: 1765731275,
    contextLength: 262144,
    maxCompletionTokens: 228000,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000002',
      prompt: '0.00000005'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'nvidia/nemotron-3-nano-30b-a3b:free',
    canonicalSlug: 'nvidia/nemotron-3-nano-30b-a3b',
    name: 'NVIDIA: Nemotron 3 Nano 30B A3B (free)',
    description:
      'NVIDIA Nemotron 3 Nano 30B A3B is a small language MoE model with highest compute efficiency and accuracy for developers to build specialized agentic AI systems. The model is fully...',
    created: 1765731275,
    contextLength: 256000,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0',
      prompt: '0'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'seed',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
    canonicalSlug: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning-20260428',
    name: 'NVIDIA: Nemotron 3 Nano Omni (free)',
    description:
      'NVIDIA Nemotron\u2122 3 Nano Omni is a 30B-A3B open multimodal model designed to function as a perception and context sub-agent in enterprise agent systems. It accepts text, image, video, and...',
    created: 1777393095,
    contextLength: 256000,
    maxCompletionTokens: 65536,
    isModerated: false,
    modality: 'text+image+audio+video->text',
    inputModalities: ['text', 'audio', 'image', 'video'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0',
      prompt: '0'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'seed',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: true
    }
  },
  {
    id: 'nvidia/nemotron-3-super-120b-a12b',
    canonicalSlug: 'nvidia/nemotron-3-super-120b-a12b-20230311',
    name: 'NVIDIA: Nemotron 3 Super',
    description:
      'NVIDIA Nemotron 3 Super is a 120B-parameter open hybrid MoE model, activating just 12B parameters for maximum compute efficiency and accuracy in complex multi-agent applications. Built on a hybrid Mamba-Transformer...',
    created: 1773245239,
    contextLength: 1000000,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.00000045',
      prompt: '0.00000009'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: true,
      supportedEfforts: ['medium', 'low'],
      defaultEffort: 'medium'
    }
  },
  {
    id: 'nvidia/nemotron-3-super-120b-a12b:free',
    canonicalSlug: 'nvidia/nemotron-3-super-120b-a12b-20230311',
    name: 'NVIDIA: Nemotron 3 Super (free)',
    description:
      'NVIDIA Nemotron 3 Super is a 120B-parameter open hybrid MoE model, activating just 12B parameters for maximum compute efficiency and accuracy in complex multi-agent applications. Built on a hybrid Mamba-Transformer...',
    created: 1773245239,
    contextLength: 1000000,
    maxCompletionTokens: 262144,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0',
      prompt: '0'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: true,
      supportedEfforts: ['medium', 'low'],
      defaultEffort: 'medium'
    }
  },
  {
    id: 'nvidia/nemotron-3-ultra-550b-a55b',
    canonicalSlug: 'nvidia/nemotron-3-ultra-550b-a55b-20260604',
    name: 'NVIDIA: Nemotron 3 Ultra',
    description:
      'NVIDIA Nemotron 3 Ultra is an open frontier-reasoning and orchestration model from NVIDIA, with 55B active parameters out of 550B total (MoE). Built on a hybrid Transformer-Mamba mixture-of-experts architecture, it...',
    created: 1780551208,
    contextLength: 1000000,
    maxCompletionTokens: 16384,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000022',
      input_cache_read: '0.0000001',
      prompt: '0.0000005'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: true,
      supportedEfforts: ['high', 'medium'],
      defaultEffort: 'high'
    }
  },
  {
    id: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    canonicalSlug: 'nvidia/nemotron-3-ultra-550b-a55b-20260604',
    name: 'NVIDIA: Nemotron 3 Ultra (free)',
    description:
      'NVIDIA Nemotron 3 Ultra is an open frontier-reasoning and orchestration model from NVIDIA, with 55B active parameters out of 550B total (MoE). Built on a hybrid Transformer-Mamba mixture-of-experts architecture, it...',
    created: 1780551208,
    contextLength: 1000000,
    maxCompletionTokens: 65536,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0',
      prompt: '0'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'seed',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: true,
      supportedEfforts: ['high', 'medium'],
      defaultEffort: 'high'
    }
  },
  {
    id: 'nvidia/nemotron-3.5-content-safety:free',
    canonicalSlug: 'nvidia/nemotron-3.5-content-safety-20260604',
    name: 'NVIDIA: Nemotron 3.5 Content Safety (free)',
    description:
      'NVIDIA Nemotron 3.5 Content Safety is a compact 4B-parameter multimodal guardrail model from NVIDIA, fine-tuned from Google Gemma-3-4B. It moderates both inputs to and responses from LLMs and VLMs, accepting...',
    created: 1780581864,
    contextLength: 128000,
    maxCompletionTokens: 8192,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0',
      prompt: '0'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'seed',
      'temperature',
      'top_p'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: true
    }
  },
  {
    id: 'nvidia/nemotron-nano-12b-v2-vl:free',
    canonicalSlug: 'nvidia/nemotron-nano-12b-v2-vl',
    name: 'NVIDIA: Nemotron Nano 12B 2 VL (free)',
    description:
      'NVIDIA Nemotron Nano 2 VL is a 12-billion-parameter open multimodal reasoning model designed for video understanding and document intelligence. It introduces a hybrid Transformer-Mamba architecture, combining transformer-level accuracy with Mamba\u2019s...',
    created: 1761675565,
    contextLength: 128000,
    maxCompletionTokens: 128000,
    isModerated: false,
    modality: 'text+image+video->text',
    inputModalities: ['image', 'text', 'video'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0',
      prompt: '0'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'seed',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'nvidia/nemotron-nano-9b-v2:free',
    canonicalSlug: 'nvidia/nemotron-nano-9b-v2',
    name: 'NVIDIA: Nemotron Nano 9B V2 (free)',
    description:
      'NVIDIA-Nemotron-Nano-9B-v2 is a large language model (LLM) trained from scratch by NVIDIA, and designed as a unified model for both reasoning and non-reasoning tasks. It responds to user queries and...',
    created: 1757106807,
    contextLength: 128000,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0',
      prompt: '0'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    knowledgeCutoff: '2025-03-31',
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'openai/gpt-3.5-turbo',
    canonicalSlug: 'openai/gpt-3.5-turbo',
    name: 'OpenAI: GPT-3.5 Turbo',
    description:
      "GPT-3.5 Turbo is OpenAI's fastest model. It can understand and generate natural language or code, and is optimized for chat and traditional completion tasks.\n\nTraining data up to Sep 2021.",
    created: 1685232000,
    contextLength: 16385,
    maxCompletionTokens: 4096,
    isModerated: true,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.0000015',
      prompt: '0.0000005'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2021-09-30'
  },
  {
    id: 'openai/gpt-3.5-turbo-0613',
    canonicalSlug: 'openai/gpt-3.5-turbo-0613',
    name: 'OpenAI: GPT-3.5 Turbo (older v0613)',
    description:
      "GPT-3.5 Turbo is OpenAI's fastest model. It can understand and generate natural language or code, and is optimized for chat and traditional completion tasks.\n\nTraining data up to Sep 2021.",
    created: 1706140800,
    contextLength: 4095,
    maxCompletionTokens: 4096,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.000002',
      prompt: '0.000001'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_completion_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2021-09-30'
  },
  {
    id: 'openai/gpt-3.5-turbo-16k',
    canonicalSlug: 'openai/gpt-3.5-turbo-16k',
    name: 'OpenAI: GPT-3.5 Turbo 16k',
    description:
      'This model offers four times the context length of gpt-3.5-turbo, allowing it to support approximately 20 pages of text in a single request at a higher cost. Training data: up...',
    created: 1693180800,
    contextLength: 16385,
    maxCompletionTokens: 4096,
    isModerated: true,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.000004',
      prompt: '0.000003'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_completion_tokens',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2021-09-30'
  },
  {
    id: 'openai/gpt-3.5-turbo-instruct',
    canonicalSlug: 'openai/gpt-3.5-turbo-instruct',
    name: 'OpenAI: GPT-3.5 Turbo Instruct',
    description:
      'This model is a variant of GPT-3.5 Turbo tuned for instructional prompts and omitting chat-related optimizations. Training data: up to Sep 2021.',
    created: 1695859200,
    contextLength: 4095,
    maxCompletionTokens: 4096,
    isModerated: true,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    instructType: 'chatml',
    pricing: {
      completion: '0.000002',
      prompt: '0.0000015'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2021-09-30'
  },
  {
    id: 'openai/gpt-4',
    canonicalSlug: 'openai/gpt-4',
    name: 'OpenAI: GPT-4',
    description:
      "OpenAI's flagship model, GPT-4 is a large-scale multimodal language model capable of solving difficult problems with greater accuracy than previous models due to its broader general knowledge and advanced reasoning...",
    created: 1685232000,
    contextLength: 8191,
    maxCompletionTokens: 4096,
    isModerated: true,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.00006',
      prompt: '0.00003'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_completion_tokens',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2021-09-30'
  },
  {
    id: 'openai/gpt-4-turbo',
    canonicalSlug: 'openai/gpt-4-turbo',
    name: 'OpenAI: GPT-4 Turbo',
    description:
      'The latest GPT-4 Turbo model with vision capabilities. Vision requests can now use JSON mode and function calling.\n\nTraining data: up to December 2023.',
    created: 1712620800,
    contextLength: 128000,
    maxCompletionTokens: 4096,
    isModerated: true,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.00003',
      prompt: '0.00001'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2023-12-31'
  },
  {
    id: 'openai/gpt-4-turbo-preview',
    canonicalSlug: 'openai/gpt-4-turbo-preview',
    name: 'OpenAI: GPT-4 Turbo Preview',
    description:
      'The preview GPT-4 model with improved instruction following, JSON mode, reproducible outputs, parallel function calling, and more. Training data: up to Dec 2023. **Note:** heavily rate limited by OpenAI while...',
    created: 1706140800,
    contextLength: 128000,
    maxCompletionTokens: 4096,
    isModerated: true,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.00003',
      prompt: '0.00001'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2023-12-31'
  },
  {
    id: 'openai/gpt-4.1',
    canonicalSlug: 'openai/gpt-4.1-2025-04-14',
    name: 'OpenAI: GPT-4.1',
    description:
      'GPT-4.1 is a flagship large language model optimized for advanced instruction following, real-world software engineering, and long-context reasoning. It supports a 1 million token context window and outperforms GPT-4o and...',
    created: 1744651385,
    contextLength: 1047576,
    isModerated: false,
    modality: 'text+image+file->text',
    inputModalities: ['image', 'text', 'file'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.000008',
      input_cache_read: '0.0000005',
      prompt: '0.000002',
      web_search: '0.01'
    },
    supportedParameters: [
      'max_completion_tokens',
      'max_tokens',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    knowledgeCutoff: '2024-06-30'
  },
  {
    id: 'openai/gpt-4.1-mini',
    canonicalSlug: 'openai/gpt-4.1-mini-2025-04-14',
    name: 'OpenAI: GPT-4.1 Mini',
    description:
      'GPT-4.1 Mini is a mid-sized model delivering performance competitive with GPT-4o at substantially lower latency and cost. It retains a 1 million token context window and scores 45.1% on hard...',
    created: 1744651381,
    contextLength: 1047576,
    maxCompletionTokens: 32768,
    isModerated: true,
    modality: 'text+image+file->text',
    inputModalities: ['image', 'text', 'file'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.0000016',
      input_cache_read: '0.0000001',
      prompt: '0.0000004',
      web_search: '0.01'
    },
    supportedParameters: [
      'max_completion_tokens',
      'max_tokens',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    knowledgeCutoff: '2024-06-30'
  },
  {
    id: 'openai/gpt-4.1-nano',
    canonicalSlug: 'openai/gpt-4.1-nano-2025-04-14',
    name: 'OpenAI: GPT-4.1 Nano',
    description:
      'For tasks that demand low latency, GPT\u20114.1 nano is the fastest and cheapest model in the GPT-4.1 series. It delivers exceptional performance at a small size with its 1 million...',
    created: 1744651369,
    contextLength: 1047576,
    maxCompletionTokens: 32768,
    isModerated: true,
    modality: 'text+image+file->text',
    inputModalities: ['image', 'text', 'file'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.0000004',
      input_cache_read: '0.000000025',
      prompt: '0.0000001',
      web_search: '0.01'
    },
    supportedParameters: [
      'max_completion_tokens',
      'max_tokens',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    knowledgeCutoff: '2024-06-30'
  },
  {
    id: 'openai/gpt-4o',
    canonicalSlug: 'openai/gpt-4o',
    name: 'OpenAI: GPT-4o',
    description:
      'GPT-4o ("o" for "omni") is OpenAI\'s latest AI model, supporting both text and image inputs with text outputs. It maintains the intelligence level of [GPT-4 Turbo](/models/openai/gpt-4-turbo) while being twice as...',
    created: 1715558400,
    contextLength: 128000,
    maxCompletionTokens: 16384,
    isModerated: false,
    modality: 'text+image+file->text',
    inputModalities: ['text', 'image', 'file'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.00001',
      prompt: '0.0000025'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_completion_tokens',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p',
      'web_search_options'
    ],
    knowledgeCutoff: '2023-10-31'
  },
  {
    id: 'openai/gpt-4o-2024-05-13',
    canonicalSlug: 'openai/gpt-4o-2024-05-13',
    name: 'OpenAI: GPT-4o (2024-05-13)',
    description:
      'GPT-4o ("o" for "omni") is OpenAI\'s latest AI model, supporting both text and image inputs with text outputs. It maintains the intelligence level of [GPT-4 Turbo](/models/openai/gpt-4-turbo) while being twice as...',
    created: 1715558400,
    contextLength: 128000,
    maxCompletionTokens: 4096,
    isModerated: false,
    modality: 'text+image+file->text',
    inputModalities: ['text', 'image', 'file'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.000015',
      prompt: '0.000005'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_completion_tokens',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p',
      'web_search_options'
    ],
    knowledgeCutoff: '2023-10-31'
  },
  {
    id: 'openai/gpt-4o-2024-08-06',
    canonicalSlug: 'openai/gpt-4o-2024-08-06',
    name: 'OpenAI: GPT-4o (2024-08-06)',
    description:
      'The 2024-08-06 version of GPT-4o offers improved performance in structured outputs, with the ability to supply a JSON schema in the respone_format. Read more [here](https://openai.com/index/introducing-structured-outputs-in-the-api/). GPT-4o ("o" for "omni") is...',
    created: 1722902400,
    contextLength: 128000,
    maxCompletionTokens: 16384,
    isModerated: false,
    modality: 'text+image+file->text',
    inputModalities: ['text', 'image', 'file'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.00001',
      input_cache_read: '0.00000125',
      prompt: '0.0000025'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_completion_tokens',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p',
      'web_search_options'
    ],
    knowledgeCutoff: '2023-10-31'
  },
  {
    id: 'openai/gpt-4o-2024-11-20',
    canonicalSlug: 'openai/gpt-4o-2024-11-20',
    name: 'OpenAI: GPT-4o (2024-11-20)',
    description:
      'The 2024-11-20 version of GPT-4o offers a leveled-up creative writing ability with more natural, engaging, and tailored writing to improve relevance & readability. It\u2019s also better at working with uploaded...',
    created: 1732127594,
    contextLength: 128000,
    maxCompletionTokens: 16384,
    isModerated: true,
    modality: 'text+image+file->text',
    inputModalities: ['text', 'image', 'file'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.00001',
      input_cache_read: '0.00000125',
      prompt: '0.0000025'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p',
      'web_search_options'
    ],
    knowledgeCutoff: '2023-10-31'
  },
  {
    id: 'openai/gpt-4o-mini',
    canonicalSlug: 'openai/gpt-4o-mini',
    name: 'OpenAI: GPT-4o-mini',
    description:
      "GPT-4o mini is OpenAI's newest model after [GPT-4 Omni](/models/openai/gpt-4o), supporting both text and image inputs with text outputs. As their most advanced small model, it is many multiples more affordable...",
    created: 1721260800,
    contextLength: 128000,
    maxCompletionTokens: 16384,
    isModerated: false,
    modality: 'text+image+file->text',
    inputModalities: ['text', 'image', 'file'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.0000006',
      input_cache_read: '0.000000075',
      prompt: '0.00000015'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_completion_tokens',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p',
      'web_search_options'
    ],
    knowledgeCutoff: '2023-10-31'
  },
  {
    id: 'openai/gpt-4o-mini-2024-07-18',
    canonicalSlug: 'openai/gpt-4o-mini-2024-07-18',
    name: 'OpenAI: GPT-4o-mini (2024-07-18)',
    description:
      "GPT-4o mini is OpenAI's newest model after [GPT-4 Omni](/models/openai/gpt-4o), supporting both text and image inputs with text outputs. As their most advanced small model, it is many multiples more affordable...",
    created: 1721260800,
    contextLength: 128000,
    maxCompletionTokens: 16384,
    isModerated: true,
    modality: 'text+image+file->text',
    inputModalities: ['text', 'image', 'file'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.0000006',
      input_cache_read: '0.000000075',
      prompt: '0.00000015'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p',
      'web_search_options'
    ],
    knowledgeCutoff: '2023-10-31'
  },
  {
    id: 'openai/gpt-4o-mini-search-preview',
    canonicalSlug: 'openai/gpt-4o-mini-search-preview-2025-03-11',
    name: 'OpenAI: GPT-4o-mini Search Preview',
    description:
      'GPT-4o mini Search Preview is a specialized model for web search in Chat Completions. It is trained to understand and execute web search queries.',
    created: 1741818122,
    contextLength: 128000,
    maxCompletionTokens: 16384,
    isModerated: true,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.0000006',
      prompt: '0.00000015',
      web_search: '0.0275'
    },
    supportedParameters: [
      'max_tokens',
      'response_format',
      'structured_outputs',
      'web_search_options'
    ],
    knowledgeCutoff: '2023-10-31'
  },
  {
    id: 'openai/gpt-4o-search-preview',
    canonicalSlug: 'openai/gpt-4o-search-preview-2025-03-11',
    name: 'OpenAI: GPT-4o Search Preview',
    description:
      'GPT-4o Search Previewis a specialized model for web search in Chat Completions. It is trained to understand and execute web search queries.',
    created: 1741817949,
    contextLength: 128000,
    maxCompletionTokens: 16384,
    isModerated: true,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.00001',
      prompt: '0.0000025',
      web_search: '0.035'
    },
    supportedParameters: [
      'max_tokens',
      'response_format',
      'structured_outputs',
      'web_search_options'
    ],
    knowledgeCutoff: '2023-10-31'
  },
  {
    id: 'openai/gpt-5',
    canonicalSlug: 'openai/gpt-5-2025-08-07',
    name: 'OpenAI: GPT-5',
    description:
      'GPT-5 is OpenAI\u2019s most advanced model, offering major improvements in reasoning, code quality, and user experience. It is optimized for complex tasks that require step-by-step reasoning, instruction following, and accuracy...',
    created: 1754587413,
    contextLength: 400000,
    maxCompletionTokens: 128000,
    isModerated: false,
    modality: 'text+image+file->text',
    inputModalities: ['text', 'image', 'file'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.00001',
      input_cache_read: '0.000000125',
      prompt: '0.00000125',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_completion_tokens',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools'
    ],
    knowledgeCutoff: '2024-09-30',
    reasoning: {
      mandatory: true,
      supportedEfforts: ['high', 'medium', 'low', 'minimal'],
      defaultEffort: 'medium'
    }
  },
  {
    id: 'openai/gpt-5-chat',
    canonicalSlug: 'openai/gpt-5-chat-2025-08-07',
    name: 'OpenAI: GPT-5 Chat',
    description:
      'GPT-5 Chat is designed for advanced, natural, multimodal, and context-aware conversations for enterprise applications.',
    created: 1754587837,
    contextLength: 128000,
    maxCompletionTokens: 16384,
    isModerated: true,
    modality: 'text+image+file->text',
    inputModalities: ['file', 'image', 'text'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.00001',
      input_cache_read: '0.000000125',
      prompt: '0.00000125',
      web_search: '0.01'
    },
    supportedParameters: ['max_tokens', 'response_format', 'seed', 'structured_outputs'],
    knowledgeCutoff: '2024-09-30'
  },
  {
    id: 'openai/gpt-5-codex',
    canonicalSlug: 'openai/gpt-5-codex',
    name: 'OpenAI: GPT-5 Codex',
    description:
      'GPT-5-Codex is a specialized version of GPT-5 optimized for software engineering and coding workflows. It is designed for both interactive development sessions and long, independent execution of complex engineering tasks....',
    created: 1758643403,
    contextLength: 400000,
    maxCompletionTokens: 128000,
    isModerated: true,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.00001',
      input_cache_read: '0.000000125',
      prompt: '0.00000125',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools'
    ],
    knowledgeCutoff: '2024-09-30',
    reasoning: {
      mandatory: true
    }
  },
  {
    id: 'openai/gpt-5-image',
    canonicalSlug: 'openai/gpt-5-image',
    name: 'OpenAI: GPT-5 Image',
    description:
      "[GPT-5](https://openrouter.ai/openai/gpt-5) Image combines OpenAI's GPT-5 model with state-of-the-art image generation capabilities. It offers major improvements in reasoning, code quality, and user experience while incorporating GPT Image 1's superior instruction following,...",
    created: 1760447986,
    contextLength: 400000,
    maxCompletionTokens: 128000,
    isModerated: true,
    modality: 'text+image+file->text+image',
    inputModalities: ['image', 'text', 'file'],
    outputModalities: ['image', 'text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.00001',
      input_cache_read: '0.00000125',
      prompt: '0.00001',
      web_search: '0.01'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: true
    }
  },
  {
    id: 'openai/gpt-5-image-mini',
    canonicalSlug: 'openai/gpt-5-image-mini',
    name: 'OpenAI: GPT-5 Image Mini',
    description:
      "GPT-5 Image Mini combines OpenAI's advanced language capabilities, powered by [GPT-5 Mini](https://openrouter.ai/openai/gpt-5-mini), with GPT Image 1 Mini for efficient image generation. This natively multimodal model features superior instruction following, text...",
    created: 1760624583,
    contextLength: 400000,
    maxCompletionTokens: 128000,
    isModerated: true,
    modality: 'text+image+file->text+image',
    inputModalities: ['file', 'image', 'text'],
    outputModalities: ['image', 'text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.000002',
      input_cache_read: '0.00000025',
      prompt: '0.0000025',
      web_search: '0.01'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: true
    }
  },
  {
    id: 'openai/gpt-5-mini',
    canonicalSlug: 'openai/gpt-5-mini-2025-08-07',
    name: 'OpenAI: GPT-5 Mini',
    description:
      'GPT-5 Mini is a compact version of GPT-5, designed to handle lighter-weight reasoning tasks. It provides the same instruction-following and safety-tuning benefits as GPT-5, but with reduced latency and cost....',
    created: 1754587407,
    contextLength: 400000,
    maxCompletionTokens: 128000,
    isModerated: true,
    modality: 'text+image+file->text',
    inputModalities: ['text', 'image', 'file'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.000002',
      input_cache_read: '0.000000025',
      prompt: '0.00000025',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_completion_tokens',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools'
    ],
    knowledgeCutoff: '2024-05-31',
    reasoning: {
      mandatory: true,
      supportedEfforts: ['high', 'medium', 'low', 'minimal'],
      defaultEffort: 'medium'
    }
  },
  {
    id: 'openai/gpt-5-nano',
    canonicalSlug: 'openai/gpt-5-nano-2025-08-07',
    name: 'OpenAI: GPT-5 Nano',
    description:
      'GPT-5-Nano is the smallest and fastest variant in the GPT-5 system, optimized for developer tools, rapid interactions, and ultra-low latency environments. While limited in reasoning depth compared to its larger...',
    created: 1754587402,
    contextLength: 400000,
    isModerated: false,
    modality: 'text+image+file->text',
    inputModalities: ['text', 'image', 'file'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.0000004',
      input_cache_read: '0.00000001',
      prompt: '0.00000005',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_completion_tokens',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools'
    ],
    knowledgeCutoff: '2024-05-31',
    reasoning: {
      mandatory: true,
      supportedEfforts: ['high', 'medium', 'low', 'minimal'],
      defaultEffort: 'medium'
    }
  },
  {
    id: 'openai/gpt-5-pro',
    canonicalSlug: 'openai/gpt-5-pro-2025-10-06',
    name: 'OpenAI: GPT-5 Pro',
    description:
      'GPT-5 Pro is OpenAI\u2019s most advanced model, offering major improvements in reasoning, code quality, and user experience. It is optimized for complex tasks that require step-by-step reasoning, instruction following, and...',
    created: 1759776663,
    contextLength: 400000,
    maxCompletionTokens: 128000,
    isModerated: true,
    modality: 'text+image+file->text',
    inputModalities: ['image', 'text', 'file'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.00012',
      prompt: '0.000015',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools'
    ],
    knowledgeCutoff: '2024-09-30',
    reasoning: {
      mandatory: true,
      supportedEfforts: ['high'],
      defaultEffort: 'high'
    }
  },
  {
    id: 'openai/gpt-5.1',
    canonicalSlug: 'openai/gpt-5.1-20251113',
    name: 'OpenAI: GPT-5.1',
    description:
      'GPT-5.1 is the latest frontier-grade model in the GPT-5 series, offering stronger general-purpose reasoning, improved instruction adherence, and a more natural conversational style compared to GPT-5. It uses adaptive reasoning...',
    created: 1763060305,
    contextLength: 400000,
    maxCompletionTokens: 128000,
    isModerated: false,
    modality: 'text+image+file->text',
    inputModalities: ['image', 'text', 'file'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.00001',
      input_cache_read: '0.00000013',
      prompt: '0.00000125',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_completion_tokens',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: true,
      supportedEfforts: ['high', 'medium', 'low', 'none'],
      defaultEffort: 'none'
    }
  },
  {
    id: 'openai/gpt-5.1-chat',
    canonicalSlug: 'openai/gpt-5.1-chat-20251113',
    name: 'OpenAI: GPT-5.1 Chat',
    description:
      'GPT-5.1 Chat (AKA Instant is the fast, lightweight member of the 5.1 family, optimized for low-latency chat while retaining strong general intelligence. It uses adaptive reasoning to selectively \u201cthink\u201d on...',
    created: 1763060302,
    contextLength: 128000,
    maxCompletionTokens: 32000,
    isModerated: false,
    modality: 'text+image+file->text',
    inputModalities: ['file', 'image', 'text'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.00001',
      input_cache_read: '0.00000013',
      prompt: '0.00000125',
      web_search: '0.01'
    },
    supportedParameters: [
      'max_completion_tokens',
      'max_tokens',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools'
    ]
  },
  {
    id: 'openai/gpt-5.1-codex',
    canonicalSlug: 'openai/gpt-5.1-codex-20251113',
    name: 'OpenAI: GPT-5.1-Codex',
    description:
      'GPT-5.1-Codex is a specialized version of GPT-5.1 optimized for software engineering and coding workflows. It is designed for both interactive development sessions and long, independent execution of complex engineering tasks....',
    created: 1763060298,
    contextLength: 400000,
    maxCompletionTokens: 128000,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.00001',
      input_cache_read: '0.00000013',
      prompt: '0.00000125',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_completion_tokens',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools'
    ],
    reasoning: {
      mandatory: true,
      supportedEfforts: ['high', 'medium', 'low'],
      defaultEffort: 'medium'
    }
  },
  {
    id: 'openai/gpt-5.1-codex-max',
    canonicalSlug: 'openai/gpt-5.1-codex-max-20251204',
    name: 'OpenAI: GPT-5.1-Codex-Max',
    description:
      'GPT-5.1-Codex-Max is OpenAI\u2019s latest agentic coding model, designed for long-running, high-context software development tasks. It is based on an updated version of the 5.1 reasoning stack and trained on agentic...',
    created: 1764878934,
    contextLength: 400000,
    maxCompletionTokens: 128000,
    isModerated: true,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.00001',
      input_cache_read: '0.000000125',
      prompt: '0.00000125',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_completion_tokens',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools'
    ],
    reasoning: {
      mandatory: true,
      supportedEfforts: ['xhigh', 'high', 'medium', 'low'],
      defaultEffort: 'medium'
    }
  },
  {
    id: 'openai/gpt-5.1-codex-mini',
    canonicalSlug: 'openai/gpt-5.1-codex-mini-20251113',
    name: 'OpenAI: GPT-5.1-Codex-Mini',
    description: 'GPT-5.1-Codex-Mini is a smaller and faster version of GPT-5.1-Codex',
    created: 1763057820,
    contextLength: 400000,
    maxCompletionTokens: 100000,
    isModerated: true,
    modality: 'text+image->text',
    inputModalities: ['image', 'text'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.000002',
      input_cache_read: '0.000000025',
      prompt: '0.00000025',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_completion_tokens',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools'
    ],
    reasoning: {
      mandatory: false,
      supportedEfforts: ['high', 'medium', 'low'],
      defaultEffort: 'medium'
    }
  },
  {
    id: 'openai/gpt-5.2',
    canonicalSlug: 'openai/gpt-5.2-20251211',
    name: 'OpenAI: GPT-5.2',
    description:
      'GPT-5.2 is the latest frontier-grade model in the GPT-5 series, offering stronger agentic and long context perfomance compared to GPT-5.1. It uses adaptive reasoning to allocate computation dynamically, responding quickly...',
    created: 1765389775,
    contextLength: 400000,
    maxCompletionTokens: 128000,
    isModerated: true,
    modality: 'text+image+file->text',
    inputModalities: ['file', 'image', 'text'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.000014',
      input_cache_read: '0.000000175',
      prompt: '0.00000175',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_completion_tokens',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools'
    ],
    reasoning: {
      mandatory: false,
      supportedEfforts: ['xhigh', 'high', 'medium', 'low', 'none'],
      defaultEffort: 'medium'
    }
  },
  {
    id: 'openai/gpt-5.2-chat',
    canonicalSlug: 'openai/gpt-5.2-chat-20251211',
    name: 'OpenAI: GPT-5.2 Chat',
    description:
      'GPT-5.2 Chat (AKA Instant) is the fast, lightweight member of the 5.2 family, optimized for low-latency chat while retaining strong general intelligence. It uses adaptive reasoning to selectively \u201cthink\u201d on...',
    created: 1765389783,
    contextLength: 128000,
    maxCompletionTokens: 16384,
    isModerated: true,
    modality: 'text+image+file->text',
    inputModalities: ['file', 'image', 'text'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.000014',
      input_cache_read: '0.000000175',
      prompt: '0.00000175',
      web_search: '0.01'
    },
    supportedParameters: [
      'max_completion_tokens',
      'max_tokens',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools'
    ],
    expirationDate: '2026-08-10'
  },
  {
    id: 'openai/gpt-5.2-codex',
    canonicalSlug: 'openai/gpt-5.2-codex-20260114',
    name: 'OpenAI: GPT-5.2-Codex',
    description:
      'GPT-5.2-Codex is an upgraded version of GPT-5.1-Codex optimized for software engineering and coding workflows. It is designed for both interactive development sessions and long, independent execution of complex engineering tasks....',
    created: 1768409315,
    contextLength: 400000,
    maxCompletionTokens: 128000,
    isModerated: true,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.000014',
      input_cache_read: '0.000000175',
      prompt: '0.00000175',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_completion_tokens',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools'
    ],
    reasoning: {
      mandatory: true,
      supportedEfforts: ['xhigh', 'high', 'medium', 'low'],
      defaultEffort: 'medium'
    }
  },
  {
    id: 'openai/gpt-5.2-pro',
    canonicalSlug: 'openai/gpt-5.2-pro-20251211',
    name: 'OpenAI: GPT-5.2 Pro',
    description:
      'GPT-5.2 Pro is OpenAI\u2019s most advanced model, offering major improvements in agentic coding and long context performance over GPT-5 Pro. It is optimized for complex tasks that require step-by-step reasoning,...',
    created: 1765389780,
    contextLength: 400000,
    maxCompletionTokens: 128000,
    isModerated: true,
    modality: 'text+image+file->text',
    inputModalities: ['image', 'text', 'file'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.000168',
      prompt: '0.000021',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools'
    ],
    reasoning: {
      mandatory: true,
      supportedEfforts: ['xhigh', 'high', 'medium'],
      defaultEffort: 'medium'
    }
  },
  {
    id: 'openai/gpt-5.3-chat',
    canonicalSlug: 'openai/gpt-5.3-chat-20260303',
    name: 'OpenAI: GPT-5.3 Chat',
    description:
      "GPT-5.3 Chat is an update to ChatGPT's most-used model that makes everyday conversations smoother, more useful, and more directly helpful. It delivers more accurate answers with better contextualization and significantly...",
    created: 1772564061,
    contextLength: 128000,
    maxCompletionTokens: 16384,
    isModerated: false,
    modality: 'text+image+file->text',
    inputModalities: ['text', 'image', 'file'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.000014',
      input_cache_read: '0.000000175',
      prompt: '0.00000175',
      web_search: '0.01'
    },
    supportedParameters: [
      'max_completion_tokens',
      'max_tokens',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools'
    ]
  },
  {
    id: 'openai/gpt-5.3-codex',
    canonicalSlug: 'openai/gpt-5.3-codex-20260224',
    name: 'OpenAI: GPT-5.3-Codex',
    description:
      'GPT-5.3-Codex is OpenAI\u2019s most advanced agentic coding model, combining the frontier software engineering performance of GPT-5.2-Codex with the broader reasoning and professional knowledge capabilities of GPT-5.2. It achieves state-of-the-art results...',
    created: 1771959164,
    contextLength: 400000,
    maxCompletionTokens: 128000,
    isModerated: true,
    modality: 'text+image+file->text',
    inputModalities: ['text', 'image', 'file'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.000014',
      input_cache_read: '0.000000175',
      prompt: '0.00000175',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_completion_tokens',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools'
    ],
    reasoning: {
      mandatory: false,
      supportedEfforts: ['xhigh', 'high', 'medium', 'low', 'none'],
      defaultEffort: 'medium'
    }
  },
  {
    id: 'openai/gpt-5.4',
    canonicalSlug: 'openai/gpt-5.4-20260305',
    name: 'OpenAI: GPT-5.4',
    description:
      'GPT-5.4 is OpenAI\u2019s latest frontier model, unifying the Codex and GPT lines into a single system. It features a 1M+ token context window (922K input, 128K output) with support for...',
    created: 1772734352,
    contextLength: 1050000,
    maxCompletionTokens: 128000,
    isModerated: true,
    modality: 'text+image+file->text',
    inputModalities: ['text', 'image', 'file'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.000015',
      input_cache_read: '0.00000025',
      prompt: '0.0000025',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_completion_tokens',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: false,
      supportedEfforts: ['xhigh', 'high', 'medium', 'low', 'none'],
      defaultEffort: 'medium'
    }
  },
  {
    id: 'openai/gpt-5.4-image-2',
    canonicalSlug: 'openai/gpt-5.4-image-2-20260421',
    name: 'OpenAI: GPT-5.4 Image 2',
    description:
      "[GPT-5.4](https://openrouter.ai/openai/gpt-5.4) Image 2 combines OpenAI's GPT-5.4 model with state-of-the-art image generation capabilities from GPT Image 2. It enables rich multimodal workflows, allowing users to seamlessly move between reasoning, coding, and...",
    created: 1776797528,
    contextLength: 272000,
    maxCompletionTokens: 128000,
    isModerated: true,
    modality: 'text+image+file->text+image',
    inputModalities: ['image', 'text', 'file'],
    outputModalities: ['image', 'text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.000015',
      input_cache_read: '0.000002',
      prompt: '0.000008',
      web_search: '0.01'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'top_logprobs'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: false,
      supportedEfforts: ['xhigh', 'high', 'medium', 'low', 'none'],
      defaultEffort: 'medium'
    }
  },
  {
    id: 'openai/gpt-5.4-mini',
    canonicalSlug: 'openai/gpt-5.4-mini-20260317',
    name: 'OpenAI: GPT-5.4 Mini',
    description:
      'GPT-5.4 mini brings the core capabilities of GPT-5.4 to a faster, more efficient model optimized for high-throughput workloads. It supports text and image inputs with strong performance across reasoning, coding,...',
    created: 1773748178,
    contextLength: 400000,
    maxCompletionTokens: 128000,
    isModerated: true,
    modality: 'text+image+file->text',
    inputModalities: ['file', 'image', 'text'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.0000045',
      input_cache_read: '0.000000075',
      prompt: '0.00000075',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_completion_tokens',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools'
    ],
    knowledgeCutoff: '2025-08-31',
    reasoning: {
      mandatory: false,
      defaultEnabled: false,
      supportedEfforts: ['xhigh', 'high', 'medium', 'low', 'none'],
      defaultEffort: 'medium'
    }
  },
  {
    id: 'openai/gpt-5.4-nano',
    canonicalSlug: 'openai/gpt-5.4-nano-20260317',
    name: 'OpenAI: GPT-5.4 Nano',
    description:
      'GPT-5.4 nano is the most lightweight and cost-efficient variant of the GPT-5.4 family, optimized for speed-critical and high-volume tasks. It supports text and image inputs and is designed for low-latency...',
    created: 1773748187,
    contextLength: 400000,
    maxCompletionTokens: 128000,
    isModerated: false,
    modality: 'text+image+file->text',
    inputModalities: ['file', 'image', 'text'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.00000125',
      input_cache_read: '0.00000002',
      prompt: '0.0000002',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_completion_tokens',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools'
    ],
    knowledgeCutoff: '2025-08-31',
    reasoning: {
      mandatory: false,
      defaultEnabled: false,
      supportedEfforts: ['xhigh', 'high', 'medium', 'low', 'none'],
      defaultEffort: 'medium'
    }
  },
  {
    id: 'openai/gpt-5.4-pro',
    canonicalSlug: 'openai/gpt-5.4-pro-20260305',
    name: 'OpenAI: GPT-5.4 Pro',
    description:
      "GPT-5.4 Pro is OpenAI's most advanced model, building on GPT-5.4's unified architecture with enhanced reasoning capabilities for complex, high-stakes tasks. It features a 1M+ token context window (922K input, 128K...",
    created: 1772734366,
    contextLength: 1050000,
    maxCompletionTokens: 128000,
    isModerated: true,
    modality: 'text+image+file->text',
    inputModalities: ['text', 'image', 'file'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.00018',
      prompt: '0.00003',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_completion_tokens',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools'
    ],
    reasoning: {
      mandatory: true,
      supportedEfforts: ['xhigh', 'high', 'medium'],
      defaultEffort: 'medium'
    }
  },
  {
    id: 'openai/gpt-5.5',
    canonicalSlug: 'openai/gpt-5.5-20260423',
    name: 'OpenAI: GPT-5.5',
    description:
      'GPT-5.5 is OpenAI\u2019s frontier model designed for complex professional workloads, building on GPT-5.4 with stronger reasoning, higher reliability, and improved token efficiency on hard tasks. It features a 1M+ token...',
    created: 1777051893,
    contextLength: 1050000,
    maxCompletionTokens: 128000,
    isModerated: true,
    modality: 'text+image+file->text',
    inputModalities: ['file', 'image', 'text'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.00003',
      input_cache_read: '0.0000005',
      prompt: '0.000005',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_completion_tokens',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools'
    ],
    knowledgeCutoff: '2025-12-01',
    reasoning: {
      mandatory: false,
      defaultEnabled: true,
      supportedEfforts: ['xhigh', 'high', 'medium', 'low', 'none'],
      defaultEffort: 'medium'
    }
  },
  {
    id: 'openai/gpt-5.5-pro',
    canonicalSlug: 'openai/gpt-5.5-pro-20260423',
    name: 'OpenAI: GPT-5.5 Pro',
    description:
      'GPT-5.5 Pro is OpenAI\u2019s high-capability model optimized for deep reasoning and accuracy on complex, high-stakes workloads. It features a 1M+ token context window (922K input, 128K output) with support for...',
    created: 1777051896,
    contextLength: 1050000,
    maxCompletionTokens: 128000,
    isModerated: true,
    modality: 'text+image+file->text',
    inputModalities: ['file', 'image', 'text'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.00018',
      prompt: '0.00003',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools'
    ],
    knowledgeCutoff: '2025-12-01',
    reasoning: {
      mandatory: true,
      supportedEfforts: ['xhigh', 'high', 'medium'],
      defaultEffort: 'medium'
    }
  },
  {
    id: 'openai/gpt-audio',
    canonicalSlug: 'openai/gpt-audio',
    name: 'OpenAI: GPT Audio',
    description:
      "The gpt-audio model is OpenAI's first generally available audio model. The new snapshot features an upgraded decoder for more natural sounding voices and maintains better voice consistency. Audio is priced...",
    created: 1768862569,
    contextLength: 128000,
    maxCompletionTokens: 16384,
    isModerated: true,
    modality: 'text+audio->text+audio',
    inputModalities: ['text', 'audio'],
    outputModalities: ['text', 'audio'],
    tokenizer: 'GPT',
    pricing: {
      audio: '0.000032',
      completion: '0.00001',
      prompt: '0.0000025'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p'
    ]
  },
  {
    id: 'openai/gpt-audio-mini',
    canonicalSlug: 'openai/gpt-audio-mini',
    name: 'OpenAI: GPT Audio Mini',
    description:
      'A cost-efficient version of GPT Audio. The new snapshot features an upgraded decoder for more natural sounding voices and maintains better voice consistency. Input is priced at $0.60 per million...',
    created: 1768859419,
    contextLength: 128000,
    maxCompletionTokens: 16384,
    isModerated: true,
    modality: 'text+audio->text+audio',
    inputModalities: ['text', 'audio'],
    outputModalities: ['text', 'audio'],
    tokenizer: 'GPT',
    pricing: {
      audio: '0.0000006',
      completion: '0.0000024',
      prompt: '0.0000006'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p'
    ]
  },
  {
    id: 'openai/gpt-chat-latest',
    canonicalSlug: 'openai/gpt-chat-latest-20260505',
    name: 'OpenAI: GPT Chat Latest',
    description:
      "GPT Chat Latest points to OpenAI's stable API alias `chat-latest` that always resolves to the latest Instant chat model used in ChatGPT. As OpenAI rolls out new Instant model updates...",
    created: 1778000212,
    contextLength: 400000,
    maxCompletionTokens: 128000,
    isModerated: true,
    modality: 'text+image+file->text',
    inputModalities: ['text', 'image', 'file'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.00003',
      input_cache_read: '0.0000005',
      prompt: '0.000005',
      web_search: '0.01'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'tool_choice',
      'tools',
      'top_logprobs'
    ]
  },
  {
    id: 'openai/gpt-oss-120b',
    canonicalSlug: 'openai/gpt-oss-120b',
    name: 'OpenAI: gpt-oss-120b',
    description:
      'gpt-oss-120b is an open-weight, 117B-parameter Mixture-of-Experts (MoE) language model from OpenAI designed for high-reasoning, agentic, and general-purpose production use cases. It activates 5.1B parameters per forward pass and is optimized...',
    created: 1754414231,
    contextLength: 131072,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.00000018',
      prompt: '0.000000039'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2024-06-30',
    reasoning: {
      mandatory: true,
      supportedEfforts: ['high', 'medium', 'low'],
      defaultEffort: 'medium'
    }
  },
  {
    id: 'openai/gpt-oss-120b:free',
    canonicalSlug: 'openai/gpt-oss-120b',
    name: 'OpenAI: gpt-oss-120b (free)',
    description:
      'gpt-oss-120b is an open-weight, 117B-parameter Mixture-of-Experts (MoE) language model from OpenAI designed for high-reasoning, agentic, and general-purpose production use cases. It activates 5.1B parameters per forward pass and is optimized...',
    created: 1754414231,
    contextLength: 131072,
    maxCompletionTokens: 131072,
    isModerated: true,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0',
      prompt: '0'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'min_p',
      'reasoning',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_a',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2024-06-30',
    reasoning: {
      mandatory: true,
      supportedEfforts: ['high', 'medium', 'low'],
      defaultEffort: 'medium'
    }
  },
  {
    id: 'openai/gpt-oss-20b',
    canonicalSlug: 'openai/gpt-oss-20b',
    name: 'OpenAI: gpt-oss-20b',
    description:
      'gpt-oss-20b is an open-weight 21B parameter model released by OpenAI under the Apache 2.0 license. It uses a Mixture-of-Experts (MoE) architecture with 3.6B active parameters per forward pass, optimized for...',
    created: 1754414229,
    contextLength: 131072,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.00000014',
      prompt: '0.000000029'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2024-06-30',
    reasoning: {
      mandatory: true,
      supportedEfforts: ['high', 'medium', 'low'],
      defaultEffort: 'medium'
    }
  },
  {
    id: 'openai/gpt-oss-20b:free',
    canonicalSlug: 'openai/gpt-oss-20b',
    name: 'OpenAI: gpt-oss-20b (free)',
    description:
      'gpt-oss-20b is an open-weight 21B parameter model released by OpenAI under the Apache 2.0 license. It uses a Mixture-of-Experts (MoE) architecture with 3.6B active parameters per forward pass, optimized for...',
    created: 1754414229,
    contextLength: 131072,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0',
      prompt: '0'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_a',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2024-06-30',
    reasoning: {
      mandatory: true,
      supportedEfforts: ['high', 'medium', 'low'],
      defaultEffort: 'medium'
    }
  },
  {
    id: 'openai/gpt-oss-safeguard-20b',
    canonicalSlug: 'openai/gpt-oss-safeguard-20b',
    name: 'OpenAI: gpt-oss-safeguard-20b',
    description:
      'gpt-oss-safeguard-20b is a safety reasoning model from OpenAI built upon gpt-oss-20b. This open-weight, 21B-parameter Mixture-of-Experts (MoE) model offers lower latency for safety tasks like content classification, LLM filtering, and trust...',
    created: 1761752836,
    contextLength: 131072,
    maxCompletionTokens: 65536,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.0000003',
      input_cache_read: '0.0000000375',
      prompt: '0.000000075'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    reasoning: {
      mandatory: true
    }
  },
  {
    id: 'openai/o1',
    canonicalSlug: 'openai/o1-2024-12-17',
    name: 'OpenAI: o1',
    description:
      'The latest and strongest model family from OpenAI, o1 is designed to spend more time thinking before responding. The o1 model series is trained with large-scale reinforcement learning to reason...',
    created: 1734459999,
    contextLength: 200000,
    maxCompletionTokens: 100000,
    isModerated: true,
    modality: 'text+image+file->text',
    inputModalities: ['text', 'image', 'file'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.00006',
      input_cache_read: '0.0000075',
      prompt: '0.000015',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools'
    ],
    knowledgeCutoff: '2023-10-31',
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'openai/o1-pro',
    canonicalSlug: 'openai/o1-pro',
    name: 'OpenAI: o1-pro',
    description:
      'The o1 series of models are trained with reinforcement learning to think before they answer and perform complex reasoning. The o1-pro model uses more compute to think harder and provide...',
    created: 1742423211,
    contextLength: 200000,
    maxCompletionTokens: 100000,
    isModerated: true,
    modality: 'text+image+file->text',
    inputModalities: ['text', 'image', 'file'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.0006',
      prompt: '0.00015',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs'
    ],
    knowledgeCutoff: '2023-10-31',
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'openai/o3',
    canonicalSlug: 'openai/o3-2025-04-16',
    name: 'OpenAI: o3',
    description:
      'o3 is a well-rounded and powerful model across domains. It sets a new standard for math, science, coding, and visual reasoning tasks. It also excels at technical writing and instruction-following....',
    created: 1744823457,
    contextLength: 200000,
    maxCompletionTokens: 100000,
    isModerated: true,
    modality: 'text+image+file->text',
    inputModalities: ['image', 'text', 'file'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.000008',
      input_cache_read: '0.0000005',
      prompt: '0.000002',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools'
    ],
    knowledgeCutoff: '2024-06-30',
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'openai/o3-deep-research',
    canonicalSlug: 'openai/o3-deep-research-2025-06-26',
    name: 'OpenAI: o3 Deep Research',
    description:
      "o3-deep-research is OpenAI's advanced model for deep research, designed to tackle complex, multi-step research tasks.\n\nNote: This model always uses the 'web_search' tool which adds additional cost.",
    created: 1760129661,
    contextLength: 200000,
    maxCompletionTokens: 100000,
    isModerated: true,
    modality: 'text+image+file->text',
    inputModalities: ['image', 'text', 'file'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.00004',
      input_cache_read: '0.0000025',
      prompt: '0.00001',
      web_search: '0.01'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'openai/o3-mini',
    canonicalSlug: 'openai/o3-mini-2025-01-31',
    name: 'OpenAI: o3 Mini',
    description:
      'OpenAI o3-mini is a cost-efficient language model optimized for STEM reasoning tasks, particularly excelling in science, mathematics, and coding. This model supports the `reasoning_effort` parameter, which can be set to...',
    created: 1738351721,
    contextLength: 200000,
    maxCompletionTokens: 100000,
    isModerated: true,
    modality: 'text+file->text',
    inputModalities: ['text', 'file'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.0000044',
      input_cache_read: '0.00000055',
      prompt: '0.0000011',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools'
    ],
    knowledgeCutoff: '2023-10-31',
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'openai/o3-mini-high',
    canonicalSlug: 'openai/o3-mini-high-2025-01-31',
    name: 'OpenAI: o3 Mini High',
    description:
      'OpenAI o3-mini-high is the same model as [o3-mini](/openai/o3-mini) with reasoning_effort set to high. o3-mini is a cost-efficient language model optimized for STEM reasoning tasks, particularly excelling in science, mathematics, and...',
    created: 1739372611,
    contextLength: 200000,
    maxCompletionTokens: 100000,
    isModerated: true,
    modality: 'text+file->text',
    inputModalities: ['text', 'file'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.0000044',
      input_cache_read: '0.00000055',
      prompt: '0.0000011',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools'
    ],
    knowledgeCutoff: '2023-10-31',
    reasoning: {
      mandatory: true,
      supportedEfforts: ['high'],
      defaultEffort: 'high'
    }
  },
  {
    id: 'openai/o3-pro',
    canonicalSlug: 'openai/o3-pro-2025-06-10',
    name: 'OpenAI: o3 Pro',
    description:
      'The o-series of models are trained with reinforcement learning to think before they answer and perform complex reasoning. The o3-pro model uses more compute to think harder and provide consistently...',
    created: 1749598352,
    contextLength: 200000,
    maxCompletionTokens: 100000,
    isModerated: true,
    modality: 'text+image+file->text',
    inputModalities: ['text', 'file', 'image'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.00008',
      prompt: '0.00002',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools'
    ],
    knowledgeCutoff: '2024-06-30',
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'openai/o4-mini',
    canonicalSlug: 'openai/o4-mini-2025-04-16',
    name: 'OpenAI: o4 Mini',
    description:
      'OpenAI o4-mini is a compact reasoning model in the o-series, optimized for fast, cost-efficient performance while retaining strong multimodal and agentic capabilities. It supports tool use and demonstrates competitive reasoning...',
    created: 1744820942,
    contextLength: 200000,
    maxCompletionTokens: 100000,
    isModerated: true,
    modality: 'text+image+file->text',
    inputModalities: ['image', 'text', 'file'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.0000044',
      input_cache_read: '0.000000275',
      prompt: '0.0000011',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools'
    ],
    knowledgeCutoff: '2024-06-30',
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'openai/o4-mini-deep-research',
    canonicalSlug: 'openai/o4-mini-deep-research-2025-06-26',
    name: 'OpenAI: o4 Mini Deep Research',
    description:
      "o4-mini-deep-research is OpenAI's faster, more affordable deep research model\u2014ideal for tackling complex, multi-step research tasks.\n\nNote: This model always uses the 'web_search' tool which adds additional cost.",
    created: 1760129642,
    contextLength: 200000,
    maxCompletionTokens: 100000,
    isModerated: true,
    modality: 'text+image+file->text',
    inputModalities: ['file', 'image', 'text'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.000008',
      input_cache_read: '0.0000005',
      prompt: '0.000002',
      web_search: '0.01'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'openai/o4-mini-high',
    canonicalSlug: 'openai/o4-mini-high-2025-04-16',
    name: 'OpenAI: o4 Mini High',
    description:
      'OpenAI o4-mini-high is the same model as [o4-mini](/openai/o4-mini) with reasoning_effort set to high. OpenAI o4-mini is a compact reasoning model in the o-series, optimized for fast, cost-efficient performance while retaining...',
    created: 1744824212,
    contextLength: 200000,
    maxCompletionTokens: 100000,
    isModerated: true,
    modality: 'text+image+file->text',
    inputModalities: ['image', 'text', 'file'],
    outputModalities: ['text'],
    tokenizer: 'GPT',
    pricing: {
      completion: '0.0000044',
      input_cache_read: '0.000000275',
      prompt: '0.0000011',
      web_search: '0.01'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'tool_choice',
      'tools'
    ],
    knowledgeCutoff: '2024-06-30',
    reasoning: {
      mandatory: true,
      supportedEfforts: ['high'],
      defaultEffort: 'high'
    }
  },
  {
    id: 'openrouter/auto',
    canonicalSlug: 'openrouter/auto',
    name: 'Auto Router',
    description:
      'Your prompt will be processed by a meta-model and routed to one of dozens of models (see below), optimizing for the best possible output. To see which model was used,...',
    created: 1699401600,
    contextLength: 2000000,
    isModerated: false,
    modality: 'text+image+file+audio+video->text+image',
    inputModalities: ['text', 'image', 'audio', 'file', 'video'],
    outputModalities: ['text', 'image'],
    tokenizer: 'Router',
    pricing: {
      completion: '-1',
      prompt: '-1'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_completion_tokens',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_a',
      'top_k',
      'top_logprobs',
      'top_p',
      'web_search_options'
    ]
  },
  {
    id: 'openrouter/bodybuilder',
    canonicalSlug: 'openrouter/bodybuilder',
    name: 'Body Builder (beta)',
    description:
      'Transform your natural language requests into structured OpenRouter API request objects. Describe what you want to accomplish with AI models, and Body Builder will construct the appropriate API calls. Example:...',
    created: 1764903653,
    contextLength: 128000,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Router',
    pricing: {
      completion: '-1',
      prompt: '-1'
    }
  },
  {
    id: 'openrouter/free',
    canonicalSlug: 'openrouter/free',
    name: 'Free Models Router',
    description:
      'The simplest way to get free inference. openrouter/free is a router that selects free models at random from the models available on OpenRouter. The router smartly filters for models that...',
    created: 1769917427,
    contextLength: 200000,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'Router',
    pricing: {
      completion: '0',
      prompt: '0'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_a',
      'top_k',
      'top_p'
    ]
  },
  {
    id: 'openrouter/fusion',
    canonicalSlug: 'openrouter/fusion',
    name: 'OpenRouter: Fusion',
    description:
      'Fusion turns your prompt into a small multi-model deliberation. A panel of expert models (see below) analyzes your prompt in parallel with web search and web fetch enabled, then a...',
    created: 1781371647,
    contextLength: 1000000,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Router',
    pricing: {
      completion: '-1',
      prompt: '-1'
    }
  },
  {
    id: 'openrouter/owl-alpha',
    canonicalSlug: 'openrouter/owl-alpha',
    name: 'Owl Alpha',
    description:
      'Owl Alpha is a high-performance foundation model designed for agentic workloads. Natively supports tool use, and long-context tasks, with strong performance in code generation, automated workflows, and complex instruction execution....',
    created: 1777398589,
    contextLength: 1048756,
    maxCompletionTokens: 262144,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0',
      prompt: '0'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tools',
      'top_k',
      'top_p'
    ]
  },
  {
    id: 'openrouter/pareto-code',
    canonicalSlug: 'openrouter/pareto-code',
    name: 'Pareto Code Router',
    description:
      'The Pareto Router maintains a tiered shortlist of strong coding models, ranked by [Artificial Analysis](https://artificialanalysis.ai/) coding percentiles. Set min_coding_score between 0 and 1 on the [pareto-router plugin](https://openrouter.ai/docs/guides/routing/routers/pareto-router#the-min_coding_score-parameter) to control how...',
    created: 1776747900,
    contextLength: 2000000,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Router',
    pricing: {
      completion: '-1',
      prompt: '-1'
    }
  },
  {
    id: 'perceptron/perceptron-mk1',
    canonicalSlug: 'perceptron/perceptron-mk1-20260512',
    name: 'Perceptron: Perceptron Mk1',
    description:
      "Perceptron Mk1 (Mark One) is Perceptron's highest-quality vision-language model for video and embodied reasoning.** It accepts image and video inputs paired with natural language queries, and produces detailed visual understanding...",
    created: 1778597029,
    contextLength: 32768,
    maxCompletionTokens: 8192,
    isModerated: false,
    modality: 'text+image+video->text',
    inputModalities: ['text', 'image', 'video'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000015',
      prompt: '0.00000015'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'perplexity/sonar',
    canonicalSlug: 'perplexity/sonar',
    name: 'Perplexity: Sonar',
    description:
      'Sonar is lightweight, affordable, fast, and simple to use \u2014 now featuring citations and the ability to customize sources. It is designed for companies seeking to integrate lightweight question-and-answer features...',
    created: 1738013808,
    contextLength: 127072,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.000001',
      prompt: '0.000001',
      web_search: '0.005'
    },
    supportedParameters: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'temperature',
      'top_k',
      'top_p',
      'web_search_options'
    ]
  },
  {
    id: 'perplexity/sonar-deep-research',
    canonicalSlug: 'perplexity/sonar-deep-research',
    name: 'Perplexity: Sonar Deep Research',
    description:
      'Sonar Deep Research is a research-focused model designed for multi-step retrieval, synthesis, and reasoning across complex topics. It autonomously searches, reads, and evaluates sources, refining its approach as it gathers...',
    created: 1741311246,
    contextLength: 128000,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    instructType: 'deepseek-r1',
    pricing: {
      completion: '0.000008',
      internal_reasoning: '0.000003',
      prompt: '0.000002',
      web_search: '0.005'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'temperature',
      'top_k',
      'top_p',
      'web_search_options'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'perplexity/sonar-pro',
    canonicalSlug: 'perplexity/sonar-pro',
    name: 'Perplexity: Sonar Pro',
    description:
      'Note: Sonar Pro pricing includes Perplexity search pricing. See [details here](https://docs.perplexity.ai/guides/pricing#detailed-pricing-breakdown-for-sonar-reasoning-pro-and-sonar-pro) For enterprises seeking more advanced capabilities, the Sonar Pro API can handle in-depth, multi-step queries with added extensibility, like...',
    created: 1741312423,
    contextLength: 200000,
    maxCompletionTokens: 8000,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.000015',
      prompt: '0.000003',
      web_search: '0.005'
    },
    supportedParameters: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'temperature',
      'top_k',
      'top_p',
      'web_search_options'
    ]
  },
  {
    id: 'perplexity/sonar-pro-search',
    canonicalSlug: 'perplexity/sonar-pro-search',
    name: 'Perplexity: Sonar Pro Search',
    description:
      "Exclusively available on the OpenRouter API, Sonar Pro's new Pro Search mode is Perplexity's most advanced agentic search system. It is designed for deeper reasoning and analysis. Pricing is based...",
    created: 1761854366,
    contextLength: 200000,
    maxCompletionTokens: 8000,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.000015',
      prompt: '0.000003',
      web_search: '0.018'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p',
      'web_search_options'
    ],
    reasoning: {
      mandatory: true
    }
  },
  {
    id: 'perplexity/sonar-reasoning-pro',
    canonicalSlug: 'perplexity/sonar-reasoning-pro',
    name: 'Perplexity: Sonar Reasoning Pro',
    description:
      'Note: Sonar Pro pricing includes Perplexity search pricing. See [details here](https://docs.perplexity.ai/guides/pricing#detailed-pricing-breakdown-for-sonar-reasoning-pro-and-sonar-pro) Sonar Reasoning Pro is a premier reasoning model powered by DeepSeek R1 with Chain of Thought (CoT). Designed for...',
    created: 1741313308,
    contextLength: 128000,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    instructType: 'deepseek-r1',
    pricing: {
      completion: '0.000008',
      prompt: '0.000002',
      web_search: '0.005'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'temperature',
      'top_k',
      'top_p',
      'web_search_options'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'poolside/laguna-m.1',
    canonicalSlug: 'poolside/laguna-m.1-20260312',
    name: 'Poolside: Laguna M.1',
    description:
      'Laguna M.1 is the flagship coding agent model from [Poolside](https://poolside.ai/), optimized for complex software engineering tasks. Designed for agentic coding workflows, it supports tool calling and reasoning, with a 256K...',
    created: 1777388504,
    contextLength: 262144,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000004',
      input_cache_read: '0.0000001',
      prompt: '0.0000002'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'temperature',
      'tool_choice',
      'tools'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: true
    }
  },
  {
    id: 'poolside/laguna-m.1:free',
    canonicalSlug: 'poolside/laguna-m.1-20260312',
    name: 'Poolside: Laguna M.1 (free)',
    description:
      'Laguna M.1 is the flagship coding agent model from [Poolside](https://poolside.ai/), optimized for complex software engineering tasks. Designed for agentic coding workflows, it supports tool calling and reasoning, with a 256K...',
    created: 1777388504,
    contextLength: 262144,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0',
      prompt: '0'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'temperature',
      'tool_choice',
      'tools'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: true
    }
  },
  {
    id: 'poolside/laguna-xs.2',
    canonicalSlug: 'poolside/laguna-xs.2-20260421',
    name: 'Poolside: Laguna XS.2',
    description:
      'Laguna XS.2 is the second-generation model in the XS size class from [Poolside](https://poolside.ai/), their efficient coding agent series. It combines tool calling and reasoning capabilities with a compact footprint, offering...',
    created: 1777389604,
    contextLength: 262144,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000002',
      input_cache_read: '0.00000005',
      prompt: '0.0000001'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'temperature',
      'tool_choice',
      'tools'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: true
    }
  },
  {
    id: 'poolside/laguna-xs.2:free',
    canonicalSlug: 'poolside/laguna-xs.2-20260421',
    name: 'Poolside: Laguna XS.2 (free)',
    description:
      'Laguna XS.2 is the second-generation model in the XS size class from [Poolside](https://poolside.ai/), their efficient coding agent series. It combines tool calling and reasoning capabilities with a compact footprint, offering...',
    created: 1777389604,
    contextLength: 262144,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0',
      prompt: '0'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'temperature',
      'tool_choice',
      'tools'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: true
    }
  },
  {
    id: 'prime-intellect/intellect-3',
    canonicalSlug: 'prime-intellect/intellect-3-20251126',
    name: 'Prime Intellect: INTELLECT-3',
    description:
      'INTELLECT-3 is a 106B-parameter Mixture-of-Experts model (12B active) post-trained from GLM-4.5-Air-Base using supervised fine-tuning (SFT) followed by large-scale reinforcement learning (RL). It offers state-of-the-art performance for its size across math,...',
    created: 1764212534,
    contextLength: 131072,
    maxCompletionTokens: 131072,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000011',
      prompt: '0.0000002'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    reasoning: {
      mandatory: true
    }
  },
  {
    id: 'qwen/qwen-2.5-72b-instruct',
    canonicalSlug: 'qwen/qwen-2.5-72b-instruct',
    name: 'Qwen2.5 72B Instruct',
    description:
      'Qwen2.5 72B is the latest series of Qwen large language models. Qwen2.5 brings the following improvements upon Qwen2: - Significantly more knowledge and has greatly improved capabilities in coding and...',
    created: 1726704000,
    contextLength: 131072,
    maxCompletionTokens: 16384,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Qwen',
    instructType: 'chatml',
    pricing: {
      completion: '0.0000004',
      prompt: '0.00000036'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2024-06-30'
  },
  {
    id: 'qwen/qwen-2.5-7b-instruct',
    canonicalSlug: 'qwen/qwen-2.5-7b-instruct',
    name: 'Qwen: Qwen2.5 7B Instruct',
    description:
      'Qwen2.5 7B is the latest series of Qwen large language models. Qwen2.5 brings the following improvements upon Qwen2: - Significantly more knowledge and has greatly improved capabilities in coding and...',
    created: 1729036800,
    contextLength: 131072,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Qwen',
    instructType: 'chatml',
    pricing: {
      completion: '0.0000001',
      prompt: '0.00000004'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2024-06-30'
  },
  {
    id: 'qwen/qwen-2.5-coder-32b-instruct',
    canonicalSlug: 'qwen/qwen-2.5-coder-32b-instruct',
    name: 'Qwen2.5 Coder 32B Instruct',
    description:
      'Qwen2.5-Coder is the latest series of Code-Specific Qwen large language models (formerly known as CodeQwen). Qwen2.5-Coder brings the following improvements upon CodeQwen1.5: - Significantly improvements in **code generation**, **code reasoning**...',
    created: 1731368400,
    contextLength: 128000,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Qwen',
    instructType: 'chatml',
    pricing: {
      completion: '0.000001',
      prompt: '0.00000066'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2024-06-30'
  },
  {
    id: 'qwen/qwen-plus',
    canonicalSlug: 'qwen/qwen-plus-2025-01-25',
    name: 'Qwen: Qwen-Plus',
    description:
      'Qwen-Plus, based on the Qwen2.5 foundation model, is a 131K context model with a balanced performance, speed, and cost combination.',
    created: 1738409840,
    contextLength: 1000000,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Qwen',
    pricing: {
      completion: '0.00000078',
      input_cache_read: '0.000000052',
      input_cache_write: '0.000000325',
      prompt: '0.00000026'
    },
    supportedParameters: [
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2025-03-31'
  },
  {
    id: 'qwen/qwen-plus-2025-07-28',
    canonicalSlug: 'qwen/qwen-plus-2025-07-28',
    name: 'Qwen: Qwen Plus 0728',
    description:
      'Qwen Plus 0728, based on the Qwen3 foundation model, is a 1 million context hybrid reasoning model with a balanced performance, speed, and cost combination.',
    created: 1757347599,
    contextLength: 1000000,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Qwen3',
    pricing: {
      completion: '0.00000078',
      prompt: '0.00000026'
    },
    supportedParameters: [
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2025-03-31',
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'qwen/qwen-plus-2025-07-28:thinking',
    canonicalSlug: 'qwen/qwen-plus-2025-07-28',
    name: 'Qwen: Qwen Plus 0728 (thinking)',
    description:
      'Qwen Plus 0728, based on the Qwen3 foundation model, is a 1 million context hybrid reasoning model with a balanced performance, speed, and cost combination.',
    created: 1757347599,
    contextLength: 1000000,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Qwen3',
    pricing: {
      completion: '0.00000078',
      input_cache_write: '0.000000325',
      prompt: '0.00000026'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    knowledgeCutoff: '2025-03-31',
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'qwen/qwen2.5-vl-72b-instruct',
    canonicalSlug: 'qwen/qwen2.5-vl-72b-instruct',
    name: 'Qwen: Qwen2.5 VL 72B Instruct',
    description:
      'Qwen2.5-VL is proficient in recognizing common objects such as flowers, birds, fish, and insects. It is also highly capable of analyzing texts, charts, icons, graphics, and layouts within images.',
    created: 1738410311,
    contextLength: 131072,
    maxCompletionTokens: 128000,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'Qwen',
    pricing: {
      completion: '0.000001',
      input_cache_read: '0.0000004',
      prompt: '0.0000008'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2024-06-30'
  },
  {
    id: 'qwen/qwen3-14b',
    canonicalSlug: 'qwen/qwen3-14b-04-28',
    name: 'Qwen: Qwen3 14B',
    description:
      'Qwen3-14B is a dense 14.8B parameter causal language model from the Qwen3 series, designed for both complex reasoning and efficient dialogue. It supports seamless switching between a "thinking" mode for...',
    created: 1745876478,
    contextLength: 131702,
    maxCompletionTokens: 40960,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Qwen3',
    instructType: 'qwen3',
    pricing: {
      completion: '0.00000024',
      prompt: '0.0000001'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2025-03-31',
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'qwen/qwen3-235b-a22b',
    canonicalSlug: 'qwen/qwen3-235b-a22b-04-28',
    name: 'Qwen: Qwen3 235B A22B',
    description:
      'Qwen3-235B-A22B is a 235B parameter mixture-of-experts (MoE) model developed by Qwen, activating 22B parameters per forward pass. It supports seamless switching between a "thinking" mode for complex reasoning, math, and...',
    created: 1745875757,
    contextLength: 131072,
    maxCompletionTokens: 8192,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Qwen3',
    instructType: 'qwen3',
    pricing: {
      completion: '0.00000182',
      prompt: '0.000000455'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'response_format',
      'seed',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    knowledgeCutoff: '2025-03-31',
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'qwen/qwen3-235b-a22b-2507',
    canonicalSlug: 'qwen/qwen3-235b-a22b-07-25',
    name: 'Qwen: Qwen3 235B A22B Instruct 2507',
    description:
      'Qwen3-235B-A22B-Instruct-2507 is a multilingual, instruction-tuned mixture-of-experts language model based on the Qwen3-235B architecture, with 22B active parameters per forward pass. It is optimized for general-purpose text generation, including instruction following,...',
    created: 1753119555,
    contextLength: 262144,
    maxCompletionTokens: 16384,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Qwen3',
    pricing: {
      completion: '0.0000001',
      prompt: '0.00000009'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2025-06-30'
  },
  {
    id: 'qwen/qwen3-235b-a22b-thinking-2507',
    canonicalSlug: 'qwen/qwen3-235b-a22b-thinking-2507',
    name: 'Qwen: Qwen3 235B A22B Thinking 2507',
    description:
      'Qwen3-235B-A22B-Thinking-2507 is a high-performance, open-weight Mixture-of-Experts (MoE) language model optimized for complex reasoning tasks. It activates 22B of its 235B parameters per forward pass and natively supports up to 262,144...',
    created: 1753449557,
    contextLength: 262144,
    maxCompletionTokens: 262144,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Qwen3',
    instructType: 'qwen3',
    pricing: {
      completion: '0.0000001',
      input_cache_read: '0.0000001',
      prompt: '0.0000001'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2025-06-30',
    reasoning: {
      mandatory: true
    }
  },
  {
    id: 'qwen/qwen3-30b-a3b',
    canonicalSlug: 'qwen/qwen3-30b-a3b-04-28',
    name: 'Qwen: Qwen3 30B A3B',
    description:
      'Qwen3, the latest generation in the Qwen large language model series, features both dense and mixture-of-experts (MoE) architectures to excel in reasoning, multilingual support, and advanced agent tasks. Its unique...',
    created: 1745878604,
    contextLength: 131072,
    maxCompletionTokens: 16384,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Qwen3',
    instructType: 'qwen3',
    pricing: {
      completion: '0.0000005',
      prompt: '0.00000012'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2025-03-31',
    reasoning: {
      mandatory: false,
      defaultEnabled: true
    }
  },
  {
    id: 'qwen/qwen3-30b-a3b-instruct-2507',
    canonicalSlug: 'qwen/qwen3-30b-a3b-instruct-2507',
    name: 'Qwen: Qwen3 30B A3B Instruct 2507',
    description:
      'Qwen3-30B-A3B-Instruct-2507 is a 30.5B-parameter mixture-of-experts language model from Qwen, with 3.3B active parameters per inference. It operates in non-thinking mode and is designed for high-quality instruction following, multilingual understanding, and...',
    created: 1753806965,
    contextLength: 131072,
    maxCompletionTokens: 32000,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Qwen3',
    pricing: {
      completion: '0.00000019305',
      prompt: '0.00000004815'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2025-06-30'
  },
  {
    id: 'qwen/qwen3-30b-a3b-thinking-2507',
    canonicalSlug: 'qwen/qwen3-30b-a3b-thinking-2507',
    name: 'Qwen: Qwen3 30B A3B Thinking 2507',
    description:
      'Qwen3-30B-A3B-Thinking-2507 is a 30B parameter Mixture-of-Experts reasoning model optimized for complex tasks requiring extended multi-step thinking. The model is designed specifically for \u201cthinking mode,\u201d where internal reasoning traces are separated...',
    created: 1756399192,
    contextLength: 131072,
    maxCompletionTokens: 131072,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Qwen3',
    pricing: {
      completion: '0.0000004',
      input_cache_read: '0.00000008',
      prompt: '0.00000008'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2025-06-30',
    reasoning: {
      mandatory: true
    }
  },
  {
    id: 'qwen/qwen3-32b',
    canonicalSlug: 'qwen/qwen3-32b-04-28',
    name: 'Qwen: Qwen3 32B',
    description:
      'Qwen3-32B is a dense 32.8B parameter causal language model from the Qwen3 series, optimized for both complex reasoning and efficient dialogue. It supports seamless switching between a "thinking" mode for...',
    created: 1745875945,
    contextLength: 131072,
    maxCompletionTokens: 16384,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Qwen3',
    instructType: 'qwen3',
    pricing: {
      completion: '0.00000028',
      prompt: '0.00000008'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2025-03-31',
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'qwen/qwen3-8b',
    canonicalSlug: 'qwen/qwen3-8b-04-28',
    name: 'Qwen: Qwen3 8B',
    description:
      'Qwen3-8B is a dense 8.2B parameter causal language model from the Qwen3 series, designed for both reasoning-heavy tasks and efficient dialogue. It supports seamless switching between "thinking" mode for math,...',
    created: 1745876632,
    contextLength: 131072,
    maxCompletionTokens: 8192,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Qwen3',
    instructType: 'qwen3',
    pricing: {
      completion: '0.0000004',
      input_cache_read: '0.00000005',
      prompt: '0.00000005'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2025-03-31',
    reasoning: {
      mandatory: false,
      defaultEnabled: true
    }
  },
  {
    id: 'qwen/qwen3-coder',
    canonicalSlug: 'qwen/qwen3-coder-480b-a35b-07-25',
    name: 'Qwen: Qwen3 Coder 480B A35B',
    description:
      'Qwen3-Coder-480B-A35B-Instruct is a Mixture-of-Experts (MoE) code generation model developed by the Qwen team. It is optimized for agentic coding tasks such as function calling, tool use, and long-context reasoning over...',
    created: 1753230546,
    contextLength: 1048576,
    maxCompletionTokens: 65536,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Qwen3',
    pricing: {
      completion: '0.0000018',
      prompt: '0.00000022'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2025-06-30'
  },
  {
    id: 'qwen/qwen3-coder-30b-a3b-instruct',
    canonicalSlug: 'qwen/qwen3-coder-30b-a3b-instruct',
    name: 'Qwen: Qwen3 Coder 30B A3B Instruct',
    description:
      'Qwen3-Coder-30B-A3B-Instruct is a 30.5B parameter Mixture-of-Experts (MoE) model with 128 experts (8 active per forward pass), designed for advanced code generation, repository-scale understanding, and agentic tool use. Built on the...',
    created: 1753972379,
    contextLength: 160000,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Qwen3',
    pricing: {
      completion: '0.00000027',
      prompt: '0.00000007'
    },
    supportedParameters: [
      'frequency_penalty',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2025-06-30'
  },
  {
    id: 'qwen/qwen3-coder-flash',
    canonicalSlug: 'qwen/qwen3-coder-flash',
    name: 'Qwen: Qwen3 Coder Flash',
    description:
      "Qwen3 Coder Flash is Alibaba's fast and cost efficient version of their proprietary Qwen3 Coder Plus. It is a powerful coding agent model specializing in autonomous programming via tool calling...",
    created: 1758115536,
    contextLength: 1000000,
    maxCompletionTokens: 65536,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Qwen3',
    pricing: {
      completion: '0.000000975',
      input_cache_read: '0.000000039',
      input_cache_write: '0.00000024375',
      prompt: '0.000000195'
    },
    supportedParameters: [
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2025-06-30'
  },
  {
    id: 'qwen/qwen3-coder-next',
    canonicalSlug: 'qwen/qwen3-coder-next-2025-02-03',
    name: 'Qwen: Qwen3 Coder Next',
    description:
      'Qwen3-Coder-Next is an open-weight causal language model optimized for coding agents and local development workflows. It uses a sparse MoE design with 80B total parameters and only 3B activated per...',
    created: 1770164101,
    contextLength: 262144,
    maxCompletionTokens: 262144,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Qwen',
    pricing: {
      completion: '0.0000008',
      input_cache_read: '0.00000007',
      prompt: '0.00000011'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ]
  },
  {
    id: 'qwen/qwen3-coder-plus',
    canonicalSlug: 'qwen/qwen3-coder-plus',
    name: 'Qwen: Qwen3 Coder Plus',
    description:
      "Qwen3 Coder Plus is Alibaba's proprietary version of the Open Source Qwen3 Coder 480B A35B. It is a powerful coding agent model specializing in autonomous programming via tool calling and...",
    created: 1758662707,
    contextLength: 1000000,
    maxCompletionTokens: 65536,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Qwen3',
    pricing: {
      completion: '0.00000325',
      input_cache_read: '0.00000013',
      input_cache_write: '0.0000008125',
      prompt: '0.00000065'
    },
    supportedParameters: [
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2025-06-30',
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'qwen/qwen3-coder:free',
    canonicalSlug: 'qwen/qwen3-coder-480b-a35b-07-25',
    name: 'Qwen: Qwen3 Coder 480B A35B (free)',
    description:
      'Qwen3-Coder-480B-A35B-Instruct is a Mixture-of-Experts (MoE) code generation model developed by the Qwen team. It is optimized for agentic coding tasks such as function calling, tool use, and long-context reasoning over...',
    created: 1753230546,
    contextLength: 1048576,
    maxCompletionTokens: 262000,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Qwen3',
    pricing: {
      completion: '0',
      prompt: '0'
    },
    supportedParameters: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2025-06-30'
  },
  {
    id: 'qwen/qwen3-max',
    canonicalSlug: 'qwen/qwen3-max',
    name: 'Qwen: Qwen3 Max',
    description:
      'Qwen3-Max is an updated release built on the Qwen3 series, offering major improvements in reasoning, instruction following, multilingual support, and long-tail knowledge coverage compared to the January 2025 version. It...',
    created: 1758662808,
    contextLength: 262144,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Qwen3',
    pricing: {
      completion: '0.0000039',
      input_cache_read: '0.000000156',
      input_cache_write: '0.000000975',
      prompt: '0.00000078'
    },
    supportedParameters: [
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2025-06-30',
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'qwen/qwen3-max-thinking',
    canonicalSlug: 'qwen/qwen3-max-thinking-20260123',
    name: 'Qwen: Qwen3 Max Thinking',
    description:
      'Qwen3-Max-Thinking is the flagship reasoning model in the Qwen3 series, designed for high-stakes cognitive tasks that require deep, multi-step reasoning. By significantly scaling model capacity and reinforcement learning compute, it...',
    created: 1770671901,
    contextLength: 262144,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Qwen',
    pricing: {
      completion: '0.0000039',
      prompt: '0.00000078'
    },
    supportedParameters: [
      'include_reasoning',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'qwen/qwen3-next-80b-a3b-instruct',
    canonicalSlug: 'qwen/qwen3-next-80b-a3b-instruct-2509',
    name: 'Qwen: Qwen3 Next 80B A3B Instruct',
    description:
      'Qwen3-Next-80B-A3B-Instruct is an instruction-tuned chat model in the Qwen3-Next series optimized for fast, stable responses without \u201cthinking\u201d traces. It targets complex tasks across reasoning, code generation, knowledge QA, and multilingual...',
    created: 1757612213,
    contextLength: 262144,
    maxCompletionTokens: 16384,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Qwen3',
    pricing: {
      completion: '0.0000011',
      prompt: '0.00000009'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2025-09-30'
  },
  {
    id: 'qwen/qwen3-next-80b-a3b-instruct:free',
    canonicalSlug: 'qwen/qwen3-next-80b-a3b-instruct-2509',
    name: 'Qwen: Qwen3 Next 80B A3B Instruct (free)',
    description:
      'Qwen3-Next-80B-A3B-Instruct is an instruction-tuned chat model in the Qwen3-Next series optimized for fast, stable responses without \u201cthinking\u201d traces. It targets complex tasks across reasoning, code generation, knowledge QA, and multilingual...',
    created: 1757612213,
    contextLength: 262144,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Qwen3',
    pricing: {
      completion: '0',
      prompt: '0'
    },
    supportedParameters: [
      'frequency_penalty',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2025-09-30'
  },
  {
    id: 'qwen/qwen3-next-80b-a3b-thinking',
    canonicalSlug: 'qwen/qwen3-next-80b-a3b-thinking-2509',
    name: 'Qwen: Qwen3 Next 80B A3B Thinking',
    description:
      'Qwen3-Next-80B-A3B-Thinking is a reasoning-first chat model in the Qwen3-Next line that outputs structured \u201cthinking\u201d traces by default. It\u2019s designed for hard multi-step problems; math proofs, code synthesis/debugging, logic, and agentic...',
    created: 1757612284,
    contextLength: 262144,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Qwen3',
    pricing: {
      completion: '0.00000078',
      prompt: '0.0000000975'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2025-09-30',
    reasoning: {
      mandatory: true
    }
  },
  {
    id: 'qwen/qwen3-vl-235b-a22b-instruct',
    canonicalSlug: 'qwen/qwen3-vl-235b-a22b-instruct',
    name: 'Qwen: Qwen3 VL 235B A22B Instruct',
    description:
      'Qwen3-VL-235B-A22B Instruct is an open-weight multimodal model that unifies strong text generation with visual understanding across images and video. The Instruct model targets general vision-language use (VQA, document parsing, chart/table...',
    created: 1758668687,
    contextLength: 262144,
    maxCompletionTokens: 16384,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'Qwen3',
    pricing: {
      completion: '0.00000088',
      input_cache_read: '0.00000011',
      prompt: '0.0000002'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2025-03-31'
  },
  {
    id: 'qwen/qwen3-vl-235b-a22b-thinking',
    canonicalSlug: 'qwen/qwen3-vl-235b-a22b-thinking',
    name: 'Qwen: Qwen3 VL 235B A22B Thinking',
    description:
      'Qwen3-VL-235B-A22B Thinking is a multimodal model that unifies strong text generation with visual understanding across images and video. The Thinking model is optimized for multimodal reasoning in STEM and math....',
    created: 1758668690,
    contextLength: 131072,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'Qwen3',
    pricing: {
      completion: '0.0000026',
      prompt: '0.00000026'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2025-03-31',
    reasoning: {
      mandatory: true
    }
  },
  {
    id: 'qwen/qwen3-vl-30b-a3b-instruct',
    canonicalSlug: 'qwen/qwen3-vl-30b-a3b-instruct',
    name: 'Qwen: Qwen3 VL 30B A3B Instruct',
    description:
      'Qwen3-VL-30B-A3B-Instruct is a multimodal model that unifies strong text generation with visual understanding for images and videos. Its Instruct variant optimizes instruction-following for general multimodal tasks. It excels in perception...',
    created: 1759794476,
    contextLength: 262144,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'Qwen3',
    pricing: {
      completion: '0.00000052',
      prompt: '0.00000013'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2025-03-31'
  },
  {
    id: 'qwen/qwen3-vl-30b-a3b-thinking',
    canonicalSlug: 'qwen/qwen3-vl-30b-a3b-thinking',
    name: 'Qwen: Qwen3 VL 30B A3B Thinking',
    description:
      'Qwen3-VL-30B-A3B-Thinking is a multimodal model that unifies strong text generation with visual understanding for images and videos. Its Thinking variant enhances reasoning in STEM, math, and complex tasks. It excels...',
    created: 1759794479,
    contextLength: 131072,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'Qwen3',
    pricing: {
      completion: '0.00000156',
      prompt: '0.00000013'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2025-03-31',
    reasoning: {
      mandatory: true
    }
  },
  {
    id: 'qwen/qwen3-vl-32b-instruct',
    canonicalSlug: 'qwen/qwen3-vl-32b-instruct',
    name: 'Qwen: Qwen3 VL 32B Instruct',
    description:
      'Qwen3-VL-32B-Instruct is a large-scale multimodal vision-language model designed for high-precision understanding and reasoning across text, images, and video. With 32 billion parameters, it combines deep visual perception with advanced text...',
    created: 1761231332,
    contextLength: 262144,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'Qwen',
    pricing: {
      completion: '0.000000416',
      prompt: '0.000000104'
    },
    supportedParameters: [
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p'
    ]
  },
  {
    id: 'qwen/qwen3-vl-8b-instruct',
    canonicalSlug: 'qwen/qwen3-vl-8b-instruct',
    name: 'Qwen: Qwen3 VL 8B Instruct',
    description:
      'Qwen3-VL-8B-Instruct is a multimodal vision-language model from the Qwen3-VL series, built for high-fidelity understanding and reasoning across text, images, and video. It features improved multimodal fusion with Interleaved-MRoPE for long-horizon...',
    created: 1760463308,
    contextLength: 256000,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['image', 'text'],
    outputModalities: ['text'],
    tokenizer: 'Qwen3',
    pricing: {
      completion: '0.0000005',
      prompt: '0.00000008'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ]
  },
  {
    id: 'qwen/qwen3-vl-8b-thinking',
    canonicalSlug: 'qwen/qwen3-vl-8b-thinking',
    name: 'Qwen: Qwen3 VL 8B Thinking',
    description:
      'Qwen3-VL-8B-Thinking is the reasoning-optimized variant of the Qwen3-VL-8B multimodal model, designed for advanced visual and textual reasoning across complex scenes, documents, and temporal sequences. It integrates enhanced multimodal alignment and...',
    created: 1760463746,
    contextLength: 256000,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['image', 'text'],
    outputModalities: ['text'],
    tokenizer: 'Qwen3',
    pricing: {
      completion: '0.000001365',
      prompt: '0.000000117'
    },
    supportedParameters: [
      'include_reasoning',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: true
    }
  },
  {
    id: 'qwen/qwen3.5-122b-a10b',
    canonicalSlug: 'qwen/qwen3.5-122b-a10b-20260224',
    name: 'Qwen: Qwen3.5-122B-A10B',
    description:
      'The Qwen3.5 122B-A10B native vision-language model is built on a hybrid architecture that integrates a linear attention mechanism with a sparse mixture-of-experts model, achieving higher inference efficiency. In terms of...',
    created: 1772053789,
    contextLength: 262144,
    maxCompletionTokens: 262144,
    isModerated: false,
    modality: 'text+image+video->text',
    inputModalities: ['text', 'image', 'video'],
    outputModalities: ['text'],
    tokenizer: 'Qwen3',
    pricing: {
      completion: '0.00000208',
      prompt: '0.00000026'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'qwen/qwen3.5-27b',
    canonicalSlug: 'qwen/qwen3.5-27b-20260224',
    name: 'Qwen: Qwen3.5-27B',
    description:
      'The Qwen3.5 27B native vision-language Dense model incorporates a linear attention mechanism, delivering fast response times while balancing inference speed and performance. Its overall capabilities are comparable to those of...',
    created: 1772053810,
    contextLength: 262144,
    maxCompletionTokens: 65536,
    isModerated: false,
    modality: 'text+image+video->text',
    inputModalities: ['text', 'image', 'video'],
    outputModalities: ['text'],
    tokenizer: 'Qwen3',
    pricing: {
      completion: '0.00000156',
      prompt: '0.000000195'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'qwen/qwen3.5-35b-a3b',
    canonicalSlug: 'qwen/qwen3.5-35b-a3b-20260224',
    name: 'Qwen: Qwen3.5-35B-A3B',
    description:
      'The Qwen3.5 Series 35B-A3B is a native vision-language model designed with a hybrid architecture that integrates linear attention mechanisms and a sparse mixture-of-experts model, achieving higher inference efficiency. Its overall...',
    created: 1772053822,
    contextLength: 262144,
    maxCompletionTokens: 262144,
    isModerated: false,
    modality: 'text+image+video->text',
    inputModalities: ['text', 'image', 'video'],
    outputModalities: ['text'],
    tokenizer: 'Qwen3',
    pricing: {
      completion: '0.000001',
      prompt: '0.00000014'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'qwen/qwen3.5-397b-a17b',
    canonicalSlug: 'qwen/qwen3.5-397b-a17b-20260216',
    name: 'Qwen: Qwen3.5 397B A17B',
    description:
      'The Qwen3.5 series 397B-A17B native vision-language model is built on a hybrid architecture that integrates a linear attention mechanism with a sparse mixture-of-experts model, achieving higher inference efficiency. It delivers...',
    created: 1771223018,
    contextLength: 256000,
    isModerated: false,
    modality: 'text+image+video->text',
    inputModalities: ['text', 'image', 'video'],
    outputModalities: ['text'],
    tokenizer: 'Qwen3',
    pricing: {
      completion: '0.00000245',
      prompt: '0.000000385'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'qwen/qwen3.5-9b',
    canonicalSlug: 'qwen/qwen3.5-9b-20260310',
    name: 'Qwen: Qwen3.5-9B',
    description:
      'Qwen3.5-9B is a multimodal foundation model from the Qwen3.5 family, designed to deliver strong reasoning, coding, and visual understanding in an efficient 9B-parameter architecture. It uses a unified vision-language design...',
    created: 1773152396,
    contextLength: 262144,
    maxCompletionTokens: 262144,
    isModerated: false,
    modality: 'text+image+video->text',
    inputModalities: ['text', 'image', 'video'],
    outputModalities: ['text'],
    tokenizer: 'Qwen3',
    pricing: {
      completion: '0.00000015',
      prompt: '0.0000001'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'qwen/qwen3.5-flash-02-23',
    canonicalSlug: 'qwen/qwen3.5-flash-20260224',
    name: 'Qwen: Qwen3.5-Flash',
    description:
      'The Qwen3.5 native vision-language Flash models are built on a hybrid architecture that integrates a linear attention mechanism with a sparse mixture-of-experts model, achieving higher inference efficiency. Compared to the...',
    created: 1772053776,
    contextLength: 1000000,
    maxCompletionTokens: 65536,
    isModerated: false,
    modality: 'text+image+video->text',
    inputModalities: ['text', 'image', 'video'],
    outputModalities: ['text'],
    tokenizer: 'Qwen3',
    pricing: {
      completion: '0.00000026',
      prompt: '0.000000065'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'qwen/qwen3.5-plus-02-15',
    canonicalSlug: 'qwen/qwen3.5-plus-20260216',
    name: 'Qwen: Qwen3.5 Plus 2026-02-15',
    description:
      'The Qwen3.5 native vision-language series Plus models are built on a hybrid architecture that integrates linear attention mechanisms with sparse mixture-of-experts models, achieving higher inference efficiency. In a variety of...',
    created: 1771229416,
    contextLength: 1000000,
    maxCompletionTokens: 65536,
    isModerated: false,
    modality: 'text+image+video->text',
    inputModalities: ['text', 'image', 'video'],
    outputModalities: ['text'],
    tokenizer: 'Qwen3',
    pricing: {
      completion: '0.00000156',
      prompt: '0.00000026'
    },
    supportedParameters: [
      'include_reasoning',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'qwen/qwen3.5-plus-20260420',
    canonicalSlug: 'qwen/qwen3.5-plus-20260420',
    name: 'Qwen: Qwen3.5 Plus 2026-04-20',
    description:
      'Qwen3.5 Plus (April 2026) is a large-scale multimodal language model from Alibaba. It accepts text, image, and video input and produces text output, with a 1M token context window. This...',
    created: 1777261368,
    contextLength: 1000000,
    maxCompletionTokens: 65536,
    isModerated: false,
    modality: 'text+image+video->text',
    inputModalities: ['text', 'image', 'video'],
    outputModalities: ['text'],
    tokenizer: 'Qwen3',
    pricing: {
      completion: '0.0000018',
      input_cache_write: '0.000000375',
      prompt: '0.0000003'
    },
    supportedParameters: [
      'include_reasoning',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'qwen/qwen3.6-27b',
    canonicalSlug: 'qwen/qwen3.6-27b-20260422',
    name: 'Qwen: Qwen3.6 27B',
    description:
      'Qwen3.6 27B is a dense 27-billion-parameter language model from the Qwen Team at Alibaba, released in April 2026. It features hybrid multimodal capabilities \u2014 accepting text, image, and video inputs...',
    created: 1777255064,
    contextLength: 262144,
    maxCompletionTokens: 262140,
    isModerated: false,
    modality: 'text+image+video->text',
    inputModalities: ['text', 'image', 'video'],
    outputModalities: ['text'],
    tokenizer: 'Qwen3',
    pricing: {
      completion: '0.00000317',
      prompt: '0.0000002885'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: true
    }
  },
  {
    id: 'qwen/qwen3.6-35b-a3b',
    canonicalSlug: 'qwen/qwen3.6-35b-a3b-20260415',
    name: 'Qwen: Qwen3.6 35B A3B',
    description:
      'Qwen3.6-35B-A3B is an open-weight multimodal model from Alibaba Cloud with 35 billion total parameters and 3 billion active parameters per token. It uses a hybrid sparse mixture-of-experts architecture combining Gated...',
    created: 1777260255,
    contextLength: 262144,
    maxCompletionTokens: 262144,
    isModerated: false,
    modality: 'text+image+video->text',
    inputModalities: ['text', 'image', 'video'],
    outputModalities: ['text'],
    tokenizer: 'Qwen',
    pricing: {
      completion: '0.000001',
      prompt: '0.00000014'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: true
    }
  },
  {
    id: 'qwen/qwen3.6-flash',
    canonicalSlug: 'qwen/qwen3.6-flash',
    name: 'Qwen: Qwen3.6 Flash',
    description:
      "Qwen3.6 Flash is a fast, efficient language model from Alibaba's Qwen 3.6 series. It supports text, image, and video input with a 1M token context window. Tiered pricing kicks in...",
    created: 1777261362,
    contextLength: 1000000,
    maxCompletionTokens: 65536,
    isModerated: false,
    modality: 'text+image+video->text',
    inputModalities: ['text', 'image', 'video'],
    outputModalities: ['text'],
    tokenizer: 'Qwen3',
    pricing: {
      completion: '0.000001125',
      input_cache_write: '0.000000234375',
      prompt: '0.0000001875'
    },
    supportedParameters: [
      'include_reasoning',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'qwen/qwen3.6-max-preview',
    canonicalSlug: 'qwen/qwen3.6-max-preview-20260420',
    name: 'Qwen: Qwen3.6 Max Preview',
    description:
      'Qwen3.6-Max-Preview is a proprietary frontier model from Alibaba Cloud built on a sparse mixture-of-experts architecture with approximately 1 trillion total parameters. It is optimized for agentic coding, tool use, and...',
    created: 1777260242,
    contextLength: 262144,
    maxCompletionTokens: 65536,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Qwen',
    pricing: {
      completion: '0.00000624',
      input_cache_write: '0.0000013',
      prompt: '0.00000104'
    },
    supportedParameters: [
      'include_reasoning',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: true
    }
  },
  {
    id: 'qwen/qwen3.6-plus',
    canonicalSlug: 'qwen/qwen3.6-plus-04-02',
    name: 'Qwen: Qwen3.6 Plus',
    description:
      'Qwen 3.6 Plus builds on a hybrid architecture that combines efficient linear attention with sparse mixture-of-experts routing, enabling strong scalability and high-performance inference. Compared to the 3.5 series, it delivers...',
    created: 1775133557,
    contextLength: 1000000,
    maxCompletionTokens: 65536,
    isModerated: false,
    modality: 'text+image+video->text',
    inputModalities: ['text', 'image', 'video'],
    outputModalities: ['text'],
    tokenizer: 'Qwen3',
    pricing: {
      completion: '0.00000195',
      input_cache_write: '0.00000040625',
      prompt: '0.000000325'
    },
    supportedParameters: [
      'include_reasoning',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'qwen/qwen3.7-max',
    canonicalSlug: 'qwen/qwen3.7-max-20260520',
    name: 'Qwen: Qwen3.7 Max',
    description:
      "Qwen3.7-Max is the flagship model in Alibaba's Qwen3.7 series. It supports text input and output and is designed for agent-centric workloads, with particular strengths in coding, office and productivity tasks,...",
    created: 1779376861,
    contextLength: 1000000,
    maxCompletionTokens: 65536,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Qwen',
    pricing: {
      completion: '0.00000375',
      input_cache_read: '0.00000025',
      input_cache_write: '0.0000015625',
      prompt: '0.00000125'
    },
    supportedParameters: [
      'include_reasoning',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: true
    }
  },
  {
    id: 'qwen/qwen3.7-plus',
    canonicalSlug: 'qwen/qwen3.7-plus-20260602',
    name: 'Qwen: Qwen3.7 Plus',
    description:
      "Qwen3.7-Plus is a cost-effective model in Alibaba's Qwen3.7 series. It supports text and image input with text output, building on the series' text capabilities with a comprehensive upgrade to its...",
    created: 1780491783,
    contextLength: 1000000,
    maxCompletionTokens: 65536,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'Qwen',
    pricing: {
      completion: '0.00000128',
      input_cache_read: '0.000000064',
      input_cache_write: '0.0000004',
      prompt: '0.00000032'
    },
    supportedParameters: [
      'include_reasoning',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: true
    }
  },
  {
    id: 'rekaai/reka-edge',
    canonicalSlug: 'rekaai/reka-edge-2603',
    name: 'Reka Edge',
    description:
      'Reka Edge is an extremely efficient 7B multimodal vision-language model that accepts image/video+text inputs and generates text outputs. This model is optimized specifically to deliver industry-leading performance in image understanding,...',
    created: 1774026965,
    contextLength: 16384,
    maxCompletionTokens: 16384,
    isModerated: false,
    modality: 'text+image+video->text',
    inputModalities: ['image', 'text', 'video'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000001',
      prompt: '0.0000001'
    },
    supportedParameters: [
      'frequency_penalty',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'rekaai/reka-flash-3',
    canonicalSlug: 'rekaai/reka-flash-3',
    name: 'Reka Flash 3',
    description:
      'Reka Flash 3 is a general-purpose, instruction-tuned large language model with 21 billion parameters, developed by Reka. It excels at general chat, coding tasks, instruction-following, and function calling. Featuring a...',
    created: 1741812813,
    contextLength: 65536,
    maxCompletionTokens: 65536,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000002',
      prompt: '0.0000001'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2025-01-31',
    reasoning: {
      mandatory: true
    }
  },
  {
    id: 'relace/relace-apply-3',
    canonicalSlug: 'relace/relace-apply-3',
    name: 'Relace: Relace Apply 3',
    description:
      'Relace Apply 3 is a specialized code-patching LLM that merges AI-suggested edits straight into your source files. It can apply updates from GPT-4o, Claude, and others into your files at...',
    created: 1758891572,
    contextLength: 256000,
    maxCompletionTokens: 128000,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.00000125',
      prompt: '0.00000085'
    },
    supportedParameters: ['max_tokens', 'seed', 'stop']
  },
  {
    id: 'relace/relace-search',
    canonicalSlug: 'relace/relace-search-20251208',
    name: 'Relace: Relace Search',
    description:
      'The relace-search model uses 4-12 `view_file` and `grep` tools in parallel to explore a codebase and return relevant files to the user request. In contrast to RAG, relace-search performs agentic...',
    created: 1765213560,
    contextLength: 256000,
    maxCompletionTokens: 128000,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.000003',
      prompt: '0.000001'
    },
    supportedParameters: [
      'max_tokens',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_p'
    ]
  },
  {
    id: 'sao10k/l3-lunaris-8b',
    canonicalSlug: 'sao10k/l3-lunaris-8b',
    name: 'Sao10K: Llama 3 8B Lunaris',
    description:
      "Lunaris 8B is a versatile generalist and roleplaying model based on Llama 3. It's a strategic merge of multiple models, designed to balance creativity with improved logic and general knowledge....",
    created: 1723507200,
    contextLength: 8192,
    maxCompletionTokens: 16384,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Llama3',
    instructType: 'llama3',
    pricing: {
      completion: '0.00000005',
      prompt: '0.00000004'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2023-12-31'
  },
  {
    id: 'sao10k/l3.1-70b-hanami-x1',
    canonicalSlug: 'sao10k/l3.1-70b-hanami-x1',
    name: 'Sao10K: Llama 3.1 70B Hanami x1',
    description:
      "This is [Sao10K](/sao10k)'s experiment over [Euryale v2.2](/sao10k/l3.1-euryale-70b).",
    created: 1736302854,
    contextLength: 16000,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Llama3',
    pricing: {
      completion: '0.000003',
      prompt: '0.000003'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2023-12-31'
  },
  {
    id: 'sao10k/l3.1-euryale-70b',
    canonicalSlug: 'sao10k/l3.1-euryale-70b',
    name: 'Sao10K: Llama 3.1 Euryale 70B v2.2',
    description:
      'Euryale L3.1 70B v2.2 is a model focused on creative roleplay from [Sao10k](https://ko-fi.com/sao10k). It is the successor of [Euryale L3 70B v2.1](/models/sao10k/l3-euryale-70b).',
    created: 1724803200,
    contextLength: 131072,
    maxCompletionTokens: 16384,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Llama3',
    instructType: 'llama3',
    pricing: {
      completion: '0.00000085',
      prompt: '0.00000085'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2023-12-31'
  },
  {
    id: 'sao10k/l3.3-euryale-70b',
    canonicalSlug: 'sao10k/l3.3-euryale-70b-v2.3',
    name: 'Sao10K: Llama 3.3 Euryale 70B',
    description:
      'Euryale L3.3 70B is a model focused on creative roleplay from [Sao10k](https://ko-fi.com/sao10k). It is the successor of [Euryale L3 70B v2.2](/models/sao10k/l3-euryale-70b).',
    created: 1734535928,
    contextLength: 131072,
    maxCompletionTokens: 16384,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Llama3',
    instructType: 'llama3',
    pricing: {
      completion: '0.00000075',
      prompt: '0.00000065'
    },
    supportedParameters: [
      'frequency_penalty',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2023-12-31'
  },
  {
    id: 'stepfun/step-3.5-flash',
    canonicalSlug: 'stepfun/step-3.5-flash',
    name: 'StepFun: Step 3.5 Flash',
    description:
      "Step 3.5 Flash is StepFun's most capable open-source foundation model. Built on a sparse Mixture of Experts (MoE) architecture, it selectively activates only 11B of its 196B parameters per token....",
    created: 1769728337,
    contextLength: 262144,
    maxCompletionTokens: 16384,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000003',
      input_cache_read: '0.00000002',
      prompt: '0.00000009'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    reasoning: {
      mandatory: true
    }
  },
  {
    id: 'stepfun/step-3.7-flash',
    canonicalSlug: 'stepfun/step-3.7-flash-20260528',
    name: 'StepFun: Step 3.7 Flash',
    description:
      "Step 3.7 Flash is StepFun's latest high-efficiency multimodal Mixture-of-Experts model. It pairs a 196B-parameter language backbone with a vision encoder for native image and video understanding, activating roughly 11B parameters...",
    created: 1779985069,
    contextLength: 256000,
    maxCompletionTokens: 256000,
    isModerated: false,
    modality: 'text+image+video->text',
    inputModalities: ['text', 'image', 'video'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.00000115',
      input_cache_read: '0.00000004',
      prompt: '0.0000002'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: true,
      supportedEfforts: ['high', 'medium', 'low'],
      defaultEffort: 'medium'
    }
  },
  {
    id: 'switchpoint/router',
    canonicalSlug: 'switchpoint/router',
    name: 'Switchpoint Router',
    description:
      "Switchpoint AI's router instantly analyzes your request and directs it to the optimal AI from an ever-evolving library. As the world of LLMs advances, our router gets smarter, ensuring you...",
    created: 1752272899,
    contextLength: 131072,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000034',
      prompt: '0.00000085'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'top_k',
      'top_p'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'tencent/hunyuan-a13b-instruct',
    canonicalSlug: 'tencent/hunyuan-a13b-instruct',
    name: 'Tencent: Hunyuan A13B Instruct',
    description:
      'Hunyuan-A13B is a 13B active parameter Mixture-of-Experts (MoE) language model developed by Tencent, with a total parameter count of 80B and support for reasoning via Chain-of-Thought. It offers competitive benchmark...',
    created: 1751987664,
    contextLength: 131072,
    maxCompletionTokens: 131072,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.00000057',
      prompt: '0.00000014'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2025-03-31',
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'tencent/hy3-preview',
    canonicalSlug: 'tencent/hy3-preview-20260421',
    name: 'Tencent: Hy3 preview',
    description:
      'Hy3 preview is a high-efficiency Mixture-of-Experts model from Tencent designed for agentic workflows and production use. It supports configurable reasoning levels across disabled, low, and high modes, allowing it to...',
    created: 1776878150,
    contextLength: 262144,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.00000021',
      input_cache_read: '0.000000021',
      prompt: '0.000000063'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: true,
      supportedEfforts: ['high', 'low', 'none'],
      defaultEffort: 'high'
    }
  },
  {
    id: 'thedrummer/cydonia-24b-v4.1',
    canonicalSlug: 'thedrummer/cydonia-24b-v4.1',
    name: 'TheDrummer: Cydonia 24B V4.1',
    description:
      'Uncensored and creative writing model based on Mistral Small 3.2 24B with good recall, prompt adherence, and intelligence.',
    created: 1758931878,
    contextLength: 131072,
    maxCompletionTokens: 131072,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000005',
      input_cache_read: '0.00000015',
      prompt: '0.0000003'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2024-04-30'
  },
  {
    id: 'thedrummer/rocinante-12b',
    canonicalSlug: 'thedrummer/rocinante-12b',
    name: 'TheDrummer: Rocinante 12B',
    description:
      'Rocinante 12B is designed for engaging storytelling and rich prose. Early testers have reported: - Expanded vocabulary with unique and expressive word choices - Enhanced creativity for vivid narratives -...',
    created: 1727654400,
    contextLength: 32768,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Qwen',
    instructType: 'chatml',
    pricing: {
      completion: '0.00000043',
      prompt: '0.00000017'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2024-04-30'
  },
  {
    id: 'thedrummer/skyfall-36b-v2',
    canonicalSlug: 'thedrummer/skyfall-36b-v2',
    name: 'TheDrummer: Skyfall 36B V2',
    description:
      'Skyfall 36B v2 is an enhanced iteration of Mistral Small 2501, specifically fine-tuned for improved creativity, nuanced writing, role-playing, and coherent storytelling.',
    created: 1741636566,
    contextLength: 32768,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000008',
      input_cache_read: '0.00000025',
      prompt: '0.00000055'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2024-06-30'
  },
  {
    id: 'thedrummer/unslopnemo-12b',
    canonicalSlug: 'thedrummer/unslopnemo-12b',
    name: 'TheDrummer: UnslopNemo 12B',
    description:
      'UnslopNemo v4.1 is the latest addition from the creator of Rocinante, designed for adventure writing and role-play scenarios.',
    created: 1731103448,
    contextLength: 32768,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Mistral',
    instructType: 'mistral',
    pricing: {
      completion: '0.0000004',
      prompt: '0.0000004'
    },
    supportedParameters: [
      'frequency_penalty',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2024-04-30'
  },
  {
    id: 'undi95/remm-slerp-l2-13b',
    canonicalSlug: 'undi95/remm-slerp-l2-13b',
    name: 'ReMM SLERP 13B',
    description:
      'A recreation trial of the original MythoMax-L2-B13 but with updated models. #merge',
    created: 1689984000,
    contextLength: 6144,
    maxCompletionTokens: 4096,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Llama2',
    instructType: 'alpaca',
    pricing: {
      completion: '0.00000065',
      prompt: '0.00000045'
    },
    supportedParameters: [
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'top_a',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2023-06-30'
  },
  {
    id: 'upstage/solar-pro-3',
    canonicalSlug: 'upstage/solar-pro-3',
    name: 'Upstage: Solar Pro 3',
    description:
      "Solar Pro 3 is Upstage's powerful Mixture-of-Experts (MoE) language model. With 102B total parameters and 12B active parameters per forward pass, it delivers exceptional performance while maintaining computational efficiency. Optimized...",
    created: 1769481200,
    contextLength: 128000,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000006',
      input_cache_read: '0.000000015',
      prompt: '0.00000015'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'writer/palmyra-x5',
    canonicalSlug: 'writer/palmyra-x5-20250428',
    name: 'Writer: Palmyra X5',
    description:
      "Palmyra X5 is Writer's most advanced model, purpose-built for building and scaling AI agents across the enterprise. It delivers industry-leading speed and efficiency on context windows up to 1 million...",
    created: 1769003823,
    contextLength: 1040000,
    maxCompletionTokens: 8192,
    isModerated: true,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.000006',
      prompt: '0.0000006'
    },
    supportedParameters: ['max_tokens', 'stop', 'temperature', 'top_k', 'top_p']
  },
  {
    id: 'x-ai/grok-4.20',
    canonicalSlug: 'x-ai/grok-4.20-20260309',
    name: 'xAI: Grok 4.20',
    description:
      'Grok 4.20 is a reasoning model from xAI with industry-leading speed and agentic tool calling capabilities. It combines the lowest hallucination rate on the market with strict prompt adherance, delivering...',
    created: 1774979019,
    contextLength: 2000000,
    isModerated: false,
    modality: 'text+image+file->text',
    inputModalities: ['text', 'image', 'file'],
    outputModalities: ['text'],
    tokenizer: 'Grok',
    pricing: {
      completion: '0.0000025',
      input_cache_read: '0.0000002',
      prompt: '0.00000125',
      web_search: '0.005'
    },
    supportedParameters: [
      'include_reasoning',
      'logprobs',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2025-09-01',
    reasoning: {
      mandatory: false,
      defaultEnabled: false
    }
  },
  {
    id: 'x-ai/grok-4.20-multi-agent',
    canonicalSlug: 'x-ai/grok-4.20-multi-agent-20260309',
    name: 'xAI: Grok 4.20 Multi-Agent',
    description:
      'Grok 4.20 Multi-Agent is a variant of xAI\u2019s Grok 4.20 designed for collaborative, agent-based workflows. Multiple agents operate in parallel to conduct deep research, coordinate tool use, and synthesize information...',
    created: 1774979158,
    contextLength: 2000000,
    isModerated: false,
    modality: 'text+image+file->text',
    inputModalities: ['text', 'image', 'file'],
    outputModalities: ['text'],
    tokenizer: 'Grok',
    pricing: {
      completion: '0.0000025',
      input_cache_read: '0.0000002',
      prompt: '0.00000125',
      web_search: '0.005'
    },
    supportedParameters: [
      'include_reasoning',
      'logprobs',
      'max_tokens',
      'reasoning',
      'response_format',
      'seed',
      'structured_outputs',
      'temperature',
      'top_logprobs',
      'top_p'
    ],
    knowledgeCutoff: '2025-09-01',
    reasoning: {
      mandatory: true,
      defaultEnabled: true,
      supportedEfforts: ['xhigh', 'high', 'medium', 'low'],
      defaultEffort: 'medium'
    }
  },
  {
    id: 'x-ai/grok-4.3',
    canonicalSlug: 'x-ai/grok-4.3-20260430',
    name: 'xAI: Grok 4.3',
    description:
      'Grok 4.3 is a reasoning model from xAI. It accepts text and image inputs with text output, and is suited for agentic workflows, instruction-following tasks, and applications requiring high factual...',
    created: 1777591821,
    contextLength: 1000000,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'Grok',
    pricing: {
      completion: '0.0000025',
      input_cache_read: '0.0000002',
      prompt: '0.00000125',
      web_search: '0.005'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: true,
      supportedEfforts: ['high', 'medium', 'low', 'none'],
      defaultEffort: 'low'
    }
  },
  {
    id: 'x-ai/grok-build-0.1',
    canonicalSlug: 'x-ai/grok-build-0.1-20260520',
    name: 'xAI: Grok Build 0.1',
    description:
      'Grok Build 0.1 is xAI\u2019s fast coding model trained specifically for agentic software engineering workflows. It supports text and image inputs with text output, and is optimized for interactive coding...',
    created: 1779298123,
    contextLength: 256000,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'Grok',
    pricing: {
      completion: '0.000002',
      input_cache_read: '0.0000002',
      prompt: '0.000001',
      web_search: '0.005'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: true
    }
  },
  {
    id: 'xiaomi/mimo-v2.5',
    canonicalSlug: 'xiaomi/mimo-v2.5-20260422',
    name: 'Xiaomi: MiMo-V2.5',
    description:
      'MiMo-V2.5 is a native omnimodal model by Xiaomi. It delivers Pro-level agentic performance at roughly half the inference cost, while surpassing MiMo-V2-Omni in multimodal perception across image and video understanding...',
    created: 1776874269,
    contextLength: 1048576,
    maxCompletionTokens: 131072,
    isModerated: false,
    modality: 'text+image+audio+video->text',
    inputModalities: ['text', 'audio', 'image', 'video'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.00000028',
      input_cache_read: '0.0000000028',
      prompt: '0.00000014'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logprobs',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'response_format',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'xiaomi/mimo-v2.5-pro',
    canonicalSlug: 'xiaomi/mimo-v2.5-pro-20260422',
    name: 'Xiaomi: MiMo-V2.5-Pro',
    description:
      'MiMo-V2.5-Pro is Xiaomi\u2019s flagship model, delivering strong performance in general agentic capabilities, complex software engineering, and long-horizon tasks, with top rankings on benchmarks such as ClawEval, GDPVal, and SWE-bench Pro....',
    created: 1776874273,
    contextLength: 1048576,
    maxCompletionTokens: 131072,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.00000087',
      input_cache_read: '0.0000000036',
      prompt: '0.000000435'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'z-ai/glm-4.5',
    canonicalSlug: 'z-ai/glm-4.5',
    name: 'Z.ai: GLM 4.5',
    description:
      'GLM-4.5 is our latest flagship foundation model, purpose-built for agent-based applications. It leverages a Mixture-of-Experts (MoE) architecture and supports a context length of up to 128k tokens. GLM-4.5 delivers significantly...',
    created: 1753471347,
    contextLength: 131072,
    maxCompletionTokens: 98304,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000022',
      input_cache_read: '0.00000011',
      prompt: '0.0000006'
    },
    supportedParameters: [
      'include_reasoning',
      'max_tokens',
      'reasoning',
      'response_format',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2024-12-31',
    expirationDate: '2026-12-31',
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'z-ai/glm-4.5-air',
    canonicalSlug: 'z-ai/glm-4.5-air',
    name: 'Z.ai: GLM 4.5 Air',
    description:
      'GLM-4.5-Air is the lightweight variant of our latest flagship model family, also purpose-built for agent-centric applications. Like GLM-4.5, it adopts the Mixture-of-Experts (MoE) architecture but with a more compact parameter...',
    created: 1753471258,
    contextLength: 131072,
    maxCompletionTokens: 98304,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.00000085',
      input_cache_read: '0.000000025',
      prompt: '0.00000013'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2024-12-31',
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'z-ai/glm-4.5v',
    canonicalSlug: 'z-ai/glm-4.5v',
    name: 'Z.ai: GLM 4.5V',
    description:
      'GLM-4.5V is a vision-language foundation model for multimodal agent applications. Built on a Mixture-of-Experts (MoE) architecture with 106B parameters and 12B activated parameters, it achieves state-of-the-art results in video understanding,...',
    created: 1754922288,
    contextLength: 65536,
    maxCompletionTokens: 16384,
    isModerated: false,
    modality: 'text+image->text',
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000018',
      input_cache_read: '0.00000011',
      prompt: '0.0000006'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2024-12-31',
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'z-ai/glm-4.6',
    canonicalSlug: 'z-ai/glm-4.6',
    name: 'Z.ai: GLM 4.6',
    description:
      'Compared with GLM-4.5, this generation brings several key improvements: Longer context window: The context window has been expanded from 128K to 200K tokens, enabling the model to handle more complex...',
    created: 1759235576,
    contextLength: 202752,
    maxCompletionTokens: 131072,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.00000174',
      input_cache_read: '0.00000008',
      prompt: '0.00000043'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    knowledgeCutoff: '2025-03-31',
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'z-ai/glm-4.6v',
    canonicalSlug: 'z-ai/glm-4.6-20251208',
    name: 'Z.ai: GLM 4.6V',
    description:
      'GLM-4.6V is a large multimodal model designed for high-fidelity visual understanding and long-context reasoning across images, documents, and mixed media. It supports up to 128K tokens, processes complex page layouts...',
    created: 1765207462,
    contextLength: 131072,
    maxCompletionTokens: 32768,
    isModerated: false,
    modality: 'text+image+video->text',
    inputModalities: ['image', 'text', 'video'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000009',
      input_cache_read: '0.000000055',
      prompt: '0.0000003'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'max_tokens',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    reasoning: {
      mandatory: false
    }
  },
  {
    id: 'z-ai/glm-4.7',
    canonicalSlug: 'z-ai/glm-4.7-20251222',
    name: 'Z.ai: GLM 4.7',
    description:
      'GLM-4.7 is Z.ai\u2019s latest flagship model, featuring upgrades in two key areas: enhanced programming capabilities and more stable multi-step reasoning/execution. It demonstrates significant improvements in executing complex agent tasks while...',
    created: 1766378014,
    contextLength: 202752,
    maxCompletionTokens: 131072,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.00000175',
      input_cache_read: '0.00000008',
      prompt: '0.0000004'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: true
    }
  },
  {
    id: 'z-ai/glm-4.7-flash',
    canonicalSlug: 'z-ai/glm-4.7-flash-20260119',
    name: 'Z.ai: GLM 4.7 Flash',
    description:
      'As a 30B-class SOTA model, GLM-4.7-Flash offers a new option that balances performance and efficiency. It is further optimized for agentic coding use cases, strengthening coding capabilities, long-horizon task planning,...',
    created: 1768833913,
    contextLength: 202752,
    maxCompletionTokens: 16384,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000004',
      input_cache_read: '0.00000001',
      prompt: '0.00000006'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: true
    }
  },
  {
    id: 'z-ai/glm-5',
    canonicalSlug: 'z-ai/glm-5-20260211',
    name: 'Z.ai: GLM 5',
    description:
      'GLM-5 is Z.ai\u2019s flagship open-source foundation model engineered for complex systems design and long-horizon agent workflows. Built for expert developers, it delivers production-grade performance on large-scale programming tasks, rivaling leading...',
    created: 1770829182,
    contextLength: 202752,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.00000192',
      input_cache_read: '0.00000012',
      prompt: '0.0000006'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: true
    }
  },
  {
    id: 'z-ai/glm-5-turbo',
    canonicalSlug: 'z-ai/glm-5-turbo-20260315',
    name: 'Z.ai: GLM 5 Turbo',
    description:
      'GLM-5 Turbo is a new model from Z.ai designed for fast inference and strong performance in agent-driven environments such as OpenClaw scenarios. It is deeply optimized for real-world agent workflows...',
    created: 1773583573,
    contextLength: 262144,
    maxCompletionTokens: 131072,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.000004',
      input_cache_read: '0.00000024',
      prompt: '0.0000012'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_p'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: true
    }
  },
  {
    id: 'z-ai/glm-5.1',
    canonicalSlug: 'z-ai/glm-5.1-20260406',
    name: 'Z.ai: GLM 5.1',
    description:
      'GLM-5.1 delivers a major leap in coding capability, with particularly significant gains in handling long-horizon tasks. Unlike previous models built around minute-level interactions, GLM-5.1 can work independently and continuously on...',
    created: 1775578025,
    contextLength: 202752,
    maxCompletionTokens: 65535,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.00000308',
      input_cache_read: '0.00000049',
      prompt: '0.00000098'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'parallel_tool_calls',
      'presence_penalty',
      'reasoning',
      'reasoning_effort',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: true
    }
  },
  {
    id: 'z-ai/glm-5.2',
    canonicalSlug: 'z-ai/glm-5.2-20260616',
    name: 'Z.ai: GLM 5.2',
    description:
      'GLM 5.2 is a large-scale reasoning model from Z.ai. It supports text input and output with a 1M-token context window, and is suited for long-horizon agent workflows, project-level software engineering,...',
    created: 1781631930,
    contextLength: 1048576,
    maxCompletionTokens: 131072,
    isModerated: false,
    modality: 'text->text',
    inputModalities: ['text'],
    outputModalities: ['text'],
    tokenizer: 'Other',
    pricing: {
      completion: '0.0000041',
      input_cache_read: '0.0000002',
      prompt: '0.0000012'
    },
    supportedParameters: [
      'frequency_penalty',
      'include_reasoning',
      'logit_bias',
      'logprobs',
      'max_tokens',
      'min_p',
      'presence_penalty',
      'reasoning',
      'repetition_penalty',
      'response_format',
      'seed',
      'stop',
      'structured_outputs',
      'temperature',
      'tool_choice',
      'tools',
      'top_k',
      'top_logprobs',
      'top_p'
    ],
    reasoning: {
      mandatory: false,
      defaultEnabled: true,
      supportedEfforts: ['xhigh', 'high'],
      defaultEffort: 'high'
    }
  }
];

export const OPENROUTER_MODEL_INDEX: Record<string, number> = {
  '~anthropic/claude-fable-latest': 0,
  '~anthropic/claude-haiku-latest': 1,
  '~anthropic/claude-opus-latest': 2,
  '~anthropic/claude-sonnet-latest': 3,
  '~google/gemini-flash-latest': 4,
  '~google/gemini-pro-latest': 5,
  '~moonshotai/kimi-latest': 6,
  '~openai/gpt-latest': 7,
  '~openai/gpt-mini-latest': 8,
  'ai21/jamba-large-1.7': 9,
  'aion-1.0': 10,
  'aion-1.0-mini': 11,
  'aion-2.0': 12,
  'aion-2.0-20260223': 12,
  'aion-labs/aion-1.0': 10,
  'aion-labs/aion-1.0-mini': 11,
  'aion-labs/aion-2.0': 12,
  'aion-labs/aion-2.0-20260223': 12,
  'aion-labs/aion-rp-llama-3.1-8b': 13,
  'aion-rp-llama-3.1-8b': 13,
  'allenai/olmo-3-32b-think': 14,
  'allenai/olmo-3-32b-think-20251121': 14,
  'amazon/nova-2-lite-v1': 15,
  'amazon/nova-lite-v1': 16,
  'amazon/nova-micro-v1': 17,
  'amazon/nova-premier-v1': 18,
  'amazon/nova-pro-v1': 19,
  'anthracite-org/magnum-v4-72b': 20,
  'anthropic/claude-3-5-haiku': 22,
  'anthropic/claude-3-haiku': 21,
  'anthropic/claude-3.5-haiku': 22,
  'anthropic/claude-4-opus-20250522': 25,
  'anthropic/claude-4-sonnet-20250522': 34,
  'anthropic/claude-4.1-opus-20250805': 26,
  'anthropic/claude-4.5-haiku-20251001': 24,
  'anthropic/claude-4.5-opus-20251124': 27,
  'anthropic/claude-4.5-sonnet-20250929': 35,
  'anthropic/claude-4.6-opus-20260205': 28,
  'anthropic/claude-4.6-opus-fast-20260407': 29,
  'anthropic/claude-4.6-sonnet-20260217': 36,
  'anthropic/claude-4.7-opus-20260416': 30,
  'anthropic/claude-4.7-opus-fast-20260512': 31,
  'anthropic/claude-4.8-opus-20260528': 32,
  'anthropic/claude-4.8-opus-fast-20260528': 33,
  'anthropic/claude-5-fable-20260609': 23,
  'anthropic/claude-fable-5': 23,
  'anthropic/claude-haiku-4.5': 24,
  'anthropic/claude-opus-4': 25,
  'anthropic/claude-opus-4.1': 26,
  'anthropic/claude-opus-4.5': 27,
  'anthropic/claude-opus-4.6': 28,
  'anthropic/claude-opus-4.6-fast': 29,
  'anthropic/claude-opus-4.7': 30,
  'anthropic/claude-opus-4.7-fast': 31,
  'anthropic/claude-opus-4.8': 32,
  'anthropic/claude-opus-4.8-fast': 33,
  'anthropic/claude-sonnet-4': 34,
  'anthropic/claude-sonnet-4.5': 35,
  'anthropic/claude-sonnet-4.6': 36,
  'arcee-ai/coder-large': 37,
  'arcee-ai/trinity-large-thinking': 38,
  'arcee-ai/trinity-mini': 39,
  'arcee-ai/trinity-mini-20251201': 39,
  'arcee-ai/virtuoso-large': 40,
  auto: 237,
  'baidu/ernie-4.5-vl-424b-a47b': 41,
  bodybuilder: 238,
  'bytedance-seed/seed-1.6': 42,
  'bytedance-seed/seed-1.6-20250625': 42,
  'bytedance-seed/seed-1.6-flash': 43,
  'bytedance-seed/seed-1.6-flash-20250625': 43,
  'bytedance-seed/seed-2.0-lite': 44,
  'bytedance-seed/seed-2.0-lite-20260309': 44,
  'bytedance-seed/seed-2.0-mini': 45,
  'bytedance-seed/seed-2.0-mini-20260224': 45,
  'bytedance/ui-tars-1.5-7b': 46,
  'claude-3-5-haiku': 22,
  'claude-3-haiku': 21,
  'claude-3.5-haiku': 22,
  'claude-4-opus-20250522': 25,
  'claude-4-sonnet-20250522': 34,
  'claude-4.1-opus-20250805': 26,
  'claude-4.5-haiku-20251001': 24,
  'claude-4.5-opus-20251124': 27,
  'claude-4.5-sonnet-20250929': 35,
  'claude-4.6-opus-20260205': 28,
  'claude-4.6-opus-fast-20260407': 29,
  'claude-4.6-sonnet-20260217': 36,
  'claude-4.7-opus-20260416': 30,
  'claude-4.7-opus-fast-20260512': 31,
  'claude-4.8-opus-20260528': 32,
  'claude-4.8-opus-fast-20260528': 33,
  'claude-5-fable-20260609': 23,
  'claude-fable-5': 23,
  'claude-fable-latest': 0,
  'claude-haiku-4.5': 24,
  'claude-haiku-latest': 1,
  'claude-opus-4': 25,
  'claude-opus-4.1': 26,
  'claude-opus-4.5': 27,
  'claude-opus-4.6': 28,
  'claude-opus-4.6-fast': 29,
  'claude-opus-4.7': 30,
  'claude-opus-4.7-fast': 31,
  'claude-opus-4.8': 32,
  'claude-opus-4.8-fast': 33,
  'claude-opus-latest': 2,
  'claude-sonnet-4': 34,
  'claude-sonnet-4.5': 35,
  'claude-sonnet-4.6': 36,
  'claude-sonnet-latest': 3,
  'coder-large': 37,
  'codestral-2508': 131,
  'cogito-v2.1-671b': 53,
  'cogito-v2.1-671b-20251118': 53,
  'cognitivecomputations/dolphin-mistral-24b-venice-edition:free': 47,
  'cohere/command-a': 48,
  'cohere/command-a-03-2025': 48,
  'cohere/command-r-08-2024': 49,
  'cohere/command-r-plus-08-2024': 50,
  'cohere/command-r7b-12-2024': 51,
  'cohere/north-mini-code-20260617': 52,
  'cohere/north-mini-code:free': 52,
  'command-a': 48,
  'command-a-03-2025': 48,
  'command-r-08-2024': 49,
  'command-r-plus-08-2024': 50,
  'command-r7b-12-2024': 51,
  'cydonia-24b-v4.1': 316,
  'deepcogito/cogito-v2.1-671b': 53,
  'deepcogito/cogito-v2.1-671b-20251118': 53,
  'deepseek-chat': 54,
  'deepseek-chat-v3': 54,
  'deepseek-chat-v3-0324': 55,
  'deepseek-chat-v3.1': 56,
  'deepseek-r1': 57,
  'deepseek-r1-0528': 58,
  'deepseek-r1-distill-llama-70b': 59,
  'deepseek-v3.1-terminus': 60,
  'deepseek-v3.2': 61,
  'deepseek-v3.2-20251201': 61,
  'deepseek-v3.2-exp': 62,
  'deepseek-v4-flash': 63,
  'deepseek-v4-flash-20260423': 63,
  'deepseek-v4-pro': 64,
  'deepseek-v4-pro-20260423': 64,
  'deepseek/deepseek-chat': 54,
  'deepseek/deepseek-chat-v3': 54,
  'deepseek/deepseek-chat-v3-0324': 55,
  'deepseek/deepseek-chat-v3.1': 56,
  'deepseek/deepseek-r1': 57,
  'deepseek/deepseek-r1-0528': 58,
  'deepseek/deepseek-r1-distill-llama-70b': 59,
  'deepseek/deepseek-v3.1-terminus': 60,
  'deepseek/deepseek-v3.2': 61,
  'deepseek/deepseek-v3.2-20251201': 61,
  'deepseek/deepseek-v3.2-exp': 62,
  'deepseek/deepseek-v4-flash': 63,
  'deepseek/deepseek-v4-flash-20260423': 63,
  'deepseek/deepseek-v4-pro': 64,
  'deepseek/deepseek-v4-pro-20260423': 64,
  'devstral-2512': 132,
  'dolphin-mistral-24b-venice-edition:free': 47,
  'ernie-4.5-vl-424b-a47b': 41,
  'essentialai/rnj-1-instruct': 65,
  free: 239,
  fusion: 240,
  'gemini-2.5-flash': 66,
  'gemini-2.5-flash-image': 67,
  'gemini-2.5-flash-lite': 68,
  'gemini-2.5-flash-lite-preview-09-2025': 69,
  'gemini-2.5-pro': 70,
  'gemini-2.5-pro-preview': 71,
  'gemini-2.5-pro-preview-03-25': 72,
  'gemini-2.5-pro-preview-05-06': 72,
  'gemini-2.5-pro-preview-06-05': 71,
  'gemini-3-flash-preview': 73,
  'gemini-3-flash-preview-20251217': 73,
  'gemini-3-pro-image': 74,
  'gemini-3-pro-image-20260528': 74,
  'gemini-3-pro-image-preview': 75,
  'gemini-3-pro-image-preview-20251120': 75,
  'gemini-3.1-flash-image': 76,
  'gemini-3.1-flash-image-20260528': 76,
  'gemini-3.1-flash-image-preview': 77,
  'gemini-3.1-flash-image-preview-20260226': 77,
  'gemini-3.1-flash-lite': 78,
  'gemini-3.1-flash-lite-20260507': 78,
  'gemini-3.1-flash-lite-preview': 79,
  'gemini-3.1-flash-lite-preview-20260303': 79,
  'gemini-3.1-pro-preview': 80,
  'gemini-3.1-pro-preview-20260219': 80,
  'gemini-3.1-pro-preview-customtools': 81,
  'gemini-3.1-pro-preview-customtools-20260219': 81,
  'gemini-3.5-flash': 82,
  'gemini-3.5-flash-20260519': 82,
  'gemini-flash-latest': 4,
  'gemini-pro-latest': 5,
  'gemma-2-27b-it': 83,
  'gemma-3-12b-it': 84,
  'gemma-3-27b-it': 85,
  'gemma-3-4b-it': 86,
  'gemma-3n-e4b-it': 87,
  'gemma-4-26b-a4b-it': 88,
  'gemma-4-26b-a4b-it:free': 89,
  'gemma-4-31b-it': 90,
  'gemma-4-31b-it:free': 91,
  'glm-4.5': 329,
  'glm-4.5-air': 330,
  'glm-4.5v': 331,
  'glm-4.6': 332,
  'glm-4.6-20251208': 333,
  'glm-4.6v': 333,
  'glm-4.7': 334,
  'glm-4.7-20251222': 334,
  'glm-4.7-flash': 335,
  'glm-4.7-flash-20260119': 335,
  'glm-5': 336,
  'glm-5-20260211': 336,
  'glm-5-turbo': 337,
  'glm-5-turbo-20260315': 337,
  'glm-5.1': 338,
  'glm-5.1-20260406': 338,
  'glm-5.2': 339,
  'glm-5.2-20260616': 339,
  'google/gemini-2.5-flash': 66,
  'google/gemini-2.5-flash-image': 67,
  'google/gemini-2.5-flash-lite': 68,
  'google/gemini-2.5-flash-lite-preview-09-2025': 69,
  'google/gemini-2.5-pro': 70,
  'google/gemini-2.5-pro-preview': 71,
  'google/gemini-2.5-pro-preview-03-25': 72,
  'google/gemini-2.5-pro-preview-05-06': 72,
  'google/gemini-2.5-pro-preview-06-05': 71,
  'google/gemini-3-flash-preview': 73,
  'google/gemini-3-flash-preview-20251217': 73,
  'google/gemini-3-pro-image': 74,
  'google/gemini-3-pro-image-20260528': 74,
  'google/gemini-3-pro-image-preview': 75,
  'google/gemini-3-pro-image-preview-20251120': 75,
  'google/gemini-3.1-flash-image': 76,
  'google/gemini-3.1-flash-image-20260528': 76,
  'google/gemini-3.1-flash-image-preview': 77,
  'google/gemini-3.1-flash-image-preview-20260226': 77,
  'google/gemini-3.1-flash-lite': 78,
  'google/gemini-3.1-flash-lite-20260507': 78,
  'google/gemini-3.1-flash-lite-preview': 79,
  'google/gemini-3.1-flash-lite-preview-20260303': 79,
  'google/gemini-3.1-pro-preview': 80,
  'google/gemini-3.1-pro-preview-20260219': 80,
  'google/gemini-3.1-pro-preview-customtools': 81,
  'google/gemini-3.1-pro-preview-customtools-20260219': 81,
  'google/gemini-3.5-flash': 82,
  'google/gemini-3.5-flash-20260519': 82,
  'google/gemma-2-27b-it': 83,
  'google/gemma-3-12b-it': 84,
  'google/gemma-3-27b-it': 85,
  'google/gemma-3-4b-it': 86,
  'google/gemma-3n-e4b-it': 87,
  'google/gemma-4-26b-a4b-it': 88,
  'google/gemma-4-26b-a4b-it:free': 89,
  'google/gemma-4-31b-it': 90,
  'google/gemma-4-31b-it:free': 91,
  'google/lyria-3-clip-preview': 92,
  'google/lyria-3-clip-preview-20260330': 92,
  'google/lyria-3-pro-preview': 93,
  'google/lyria-3-pro-preview-20260330': 93,
  'gpt-3.5-turbo': 175,
  'gpt-3.5-turbo-0613': 176,
  'gpt-3.5-turbo-16k': 177,
  'gpt-3.5-turbo-instruct': 178,
  'gpt-4': 179,
  'gpt-4-turbo': 180,
  'gpt-4-turbo-preview': 181,
  'gpt-4.1': 182,
  'gpt-4.1-2025-04-14': 182,
  'gpt-4.1-mini': 183,
  'gpt-4.1-mini-2025-04-14': 183,
  'gpt-4.1-nano': 184,
  'gpt-4.1-nano-2025-04-14': 184,
  'gpt-4o': 185,
  'gpt-4o-2024-05-13': 186,
  'gpt-4o-2024-08-06': 187,
  'gpt-4o-2024-11-20': 188,
  'gpt-4o-mini': 189,
  'gpt-4o-mini-2024-07-18': 190,
  'gpt-4o-mini-search-preview': 191,
  'gpt-4o-mini-search-preview-2025-03-11': 191,
  'gpt-4o-search-preview': 192,
  'gpt-4o-search-preview-2025-03-11': 192,
  'gpt-5': 193,
  'gpt-5-2025-08-07': 193,
  'gpt-5-chat': 194,
  'gpt-5-chat-2025-08-07': 194,
  'gpt-5-codex': 195,
  'gpt-5-image': 196,
  'gpt-5-image-mini': 197,
  'gpt-5-mini': 198,
  'gpt-5-mini-2025-08-07': 198,
  'gpt-5-nano': 199,
  'gpt-5-nano-2025-08-07': 199,
  'gpt-5-pro': 200,
  'gpt-5-pro-2025-10-06': 200,
  'gpt-5.1': 201,
  'gpt-5.1-20251113': 201,
  'gpt-5.1-chat': 202,
  'gpt-5.1-chat-20251113': 202,
  'gpt-5.1-codex': 203,
  'gpt-5.1-codex-20251113': 203,
  'gpt-5.1-codex-max': 204,
  'gpt-5.1-codex-max-20251204': 204,
  'gpt-5.1-codex-mini': 205,
  'gpt-5.1-codex-mini-20251113': 205,
  'gpt-5.2': 206,
  'gpt-5.2-20251211': 206,
  'gpt-5.2-chat': 207,
  'gpt-5.2-chat-20251211': 207,
  'gpt-5.2-codex': 208,
  'gpt-5.2-codex-20260114': 208,
  'gpt-5.2-pro': 209,
  'gpt-5.2-pro-20251211': 209,
  'gpt-5.3-chat': 210,
  'gpt-5.3-chat-20260303': 210,
  'gpt-5.3-codex': 211,
  'gpt-5.3-codex-20260224': 211,
  'gpt-5.4': 212,
  'gpt-5.4-20260305': 212,
  'gpt-5.4-image-2': 213,
  'gpt-5.4-image-2-20260421': 213,
  'gpt-5.4-mini': 214,
  'gpt-5.4-mini-20260317': 214,
  'gpt-5.4-nano': 215,
  'gpt-5.4-nano-20260317': 215,
  'gpt-5.4-pro': 216,
  'gpt-5.4-pro-20260305': 216,
  'gpt-5.5': 217,
  'gpt-5.5-20260423': 217,
  'gpt-5.5-pro': 218,
  'gpt-5.5-pro-20260423': 218,
  'gpt-audio': 219,
  'gpt-audio-mini': 220,
  'gpt-chat-latest': 221,
  'gpt-chat-latest-20260505': 221,
  'gpt-latest': 7,
  'gpt-mini-latest': 8,
  'gpt-oss-120b:free': 223,
  'gpt-oss-20b:free': 225,
  'gpt-oss-safeguard-20b': 226,
  'granite-4.0-h-micro': 95,
  'granite-4.1-8b': 96,
  'granite-4.1-8b-20260429': 96,
  'grok-4.20': 323,
  'grok-4.20-20260309': 323,
  'grok-4.20-multi-agent': 324,
  'grok-4.20-multi-agent-20260309': 324,
  'grok-4.3': 325,
  'grok-4.3-20260430': 325,
  'grok-build-0.1': 326,
  'grok-build-0.1-20260520': 326,
  'gryphe/mythomax-l2-13b': 94,
  'hermes-3-llama-3.1-405b:free': 160,
  'hermes-3-llama-3.1-70b': 161,
  'hermes-4-405b': 162,
  'hermes-4-70b': 163,
  'hunyuan-a13b-instruct': 314,
  'hy3-preview': 315,
  'hy3-preview-20260421': 315,
  'ibm-granite/granite-4.0-h-micro': 95,
  'ibm-granite/granite-4.1-8b': 96,
  'ibm-granite/granite-4.1-8b-20260429': 96,
  'inception/mercury-2': 97,
  'inception/mercury-2-20260304': 97,
  'inclusionai/ling-2.6-1t': 98,
  'inclusionai/ling-2.6-1t-20260423': 98,
  'inclusionai/ling-2.6-flash': 99,
  'inclusionai/ling-2.6-flash-20260421': 99,
  'inclusionai/ring-2.6-1t': 100,
  'inclusionai/ring-2.6-1t-20260508': 100,
  'inflection-3-pi': 101,
  'inflection-3-productivity': 102,
  'inflection/inflection-3-pi': 101,
  'inflection/inflection-3-productivity': 102,
  'intellect-3': 253,
  'intellect-3-20251126': 253,
  'jamba-large-1.7': 9,
  'kat-coder-pro-v2': 103,
  'kat-coder-pro-v2-20260327': 103,
  'kimi-k2': 150,
  'kimi-k2-0905': 151,
  'kimi-k2-thinking': 152,
  'kimi-k2-thinking-20251106': 152,
  'kimi-k2.5': 153,
  'kimi-k2.5-0127': 153,
  'kimi-k2.6': 154,
  'kimi-k2.6-20260420': 154,
  'kimi-k2.7-code': 155,
  'kimi-k2.7-code-20260612': 155,
  'kimi-latest': 6,
  'kwaipilot/kat-coder-pro-v2': 103,
  'kwaipilot/kat-coder-pro-v2-20260327': 103,
  'l3-lunaris-8b': 307,
  'l3.1-70b-hanami-x1': 308,
  'l3.1-euryale-70b': 309,
  'l3.3-euryale-70b': 310,
  'l3.3-euryale-70b-v2.3': 310,
  'laguna-m.1': 249,
  'laguna-m.1:free': 250,
  'laguna-xs.2': 251,
  'laguna-xs.2:free': 252,
  'lfm-2-24b-a2b': 104,
  'lfm-2-24b-a2b-20260224': 104,
  'lfm-2.5-1.2b-instruct-20260120': 105,
  'lfm-2.5-1.2b-instruct:free': 105,
  'lfm-2.5-1.2b-thinking-20260120': 106,
  'lfm-2.5-1.2b-thinking:free': 106,
  'ling-2.6-1t': 98,
  'ling-2.6-1t-20260423': 98,
  'ling-2.6-flash': 99,
  'ling-2.6-flash-20260421': 99,
  'liquid/lfm-2-24b-a2b': 104,
  'liquid/lfm-2-24b-a2b-20260224': 104,
  'liquid/lfm-2.5-1.2b-instruct-20260120': 105,
  'liquid/lfm-2.5-1.2b-instruct:free': 105,
  'liquid/lfm-2.5-1.2b-thinking-20260120': 106,
  'liquid/lfm-2.5-1.2b-thinking:free': 106,
  'llama-3-8b-instruct': 108,
  'llama-3.1-70b-instruct': 109,
  'llama-3.1-8b-instruct': 110,
  'llama-3.2-11b-vision-instruct': 111,
  'llama-3.2-1b-instruct': 112,
  'llama-3.2-3b-instruct:free': 114,
  'llama-3.3-70b-instruct:free': 116,
  'llama-3.3-nemotron-super-49b-v1.5': 164,
  'llama-4-maverick': 117,
  'llama-4-maverick-17b-128e-instruct': 117,
  'llama-4-scout': 118,
  'llama-4-scout-17b-16e-instruct': 118,
  'llama-guard-4-12b': 119,
  'lyria-3-clip-preview': 92,
  'lyria-3-clip-preview-20260330': 92,
  'lyria-3-pro-preview': 93,
  'lyria-3-pro-preview-20260330': 93,
  'magnum-v4-72b': 20,
  'mancer/weaver': 107,
  'mercury-2': 97,
  'mercury-2-20260304': 97,
  'meta-llama/llama-3-8b-instruct': 108,
  'meta-llama/llama-3.1-70b-instruct': 109,
  'meta-llama/llama-3.1-8b-instruct': 110,
  'meta-llama/llama-3.2-11b-vision-instruct': 111,
  'meta-llama/llama-3.2-1b-instruct': 112,
  'meta-llama/llama-3.2-3b-instruct:free': 114,
  'meta-llama/llama-3.3-70b-instruct:free': 116,
  'meta-llama/llama-4-maverick': 117,
  'meta-llama/llama-4-maverick-17b-128e-instruct': 117,
  'meta-llama/llama-4-scout': 118,
  'meta-llama/llama-4-scout-17b-16e-instruct': 118,
  'meta-llama/llama-guard-4-12b': 119,
  'microsoft/phi-4': 120,
  'microsoft/phi-4-mini-instruct': 121,
  'microsoft/wizardlm-2-8x22b': 122,
  'mimo-v2.5': 327,
  'mimo-v2.5-20260422': 327,
  'mimo-v2.5-pro': 328,
  'mimo-v2.5-pro-20260422': 328,
  'minimax-01': 123,
  'minimax-m1': 124,
  'minimax-m2': 125,
  'minimax-m2-her': 126,
  'minimax-m2-her-20260123': 126,
  'minimax-m2.1': 127,
  'minimax-m2.5': 128,
  'minimax-m2.5-20260211': 128,
  'minimax-m2.7': 129,
  'minimax-m2.7-20260318': 129,
  'minimax-m3': 130,
  'minimax-m3-20260531': 130,
  'minimax/minimax-01': 123,
  'minimax/minimax-m1': 124,
  'minimax/minimax-m2': 125,
  'minimax/minimax-m2-her': 126,
  'minimax/minimax-m2-her-20260123': 126,
  'minimax/minimax-m2.1': 127,
  'minimax/minimax-m2.5': 128,
  'minimax/minimax-m2.5-20260211': 128,
  'minimax/minimax-m2.7': 129,
  'minimax/minimax-m2.7-20260318': 129,
  'minimax/minimax-m3': 130,
  'minimax/minimax-m3-20260531': 130,
  'ministral-14b-2512': 133,
  'ministral-3b-2512': 134,
  'ministral-8b-2512': 135,
  'mistral-large': 136,
  'mistral-large-2407': 137,
  'mistral-large-2512': 138,
  'mistral-medium-3': 139,
  'mistral-medium-3-5': 140,
  'mistral-medium-3.1': 141,
  'mistral-medium-3.5-20260430': 140,
  'mistral-nemo': 142,
  'mistral-saba': 143,
  'mistral-saba-2502': 143,
  'mistral-small-24b-instruct-2501': 144,
  'mistral-small-2603': 145,
  'mistral-small-3.1-24b-instruct': 146,
  'mistral-small-3.1-24b-instruct-2503': 146,
  'mistral-small-3.2-24b-instruct': 147,
  'mistral-small-3.2-24b-instruct-2506': 147,
  'mistralai/codestral-2508': 131,
  'mistralai/devstral-2512': 132,
  'mistralai/ministral-14b-2512': 133,
  'mistralai/ministral-3b-2512': 134,
  'mistralai/ministral-8b-2512': 135,
  'mistralai/mistral-large': 136,
  'mistralai/mistral-large-2407': 137,
  'mistralai/mistral-large-2512': 138,
  'mistralai/mistral-medium-3': 139,
  'mistralai/mistral-medium-3-5': 140,
  'mistralai/mistral-medium-3.1': 141,
  'mistralai/mistral-medium-3.5-20260430': 140,
  'mistralai/mistral-nemo': 142,
  'mistralai/mistral-saba': 143,
  'mistralai/mistral-saba-2502': 143,
  'mistralai/mistral-small-24b-instruct-2501': 144,
  'mistralai/mistral-small-2603': 145,
  'mistralai/mistral-small-3.1-24b-instruct': 146,
  'mistralai/mistral-small-3.1-24b-instruct-2503': 146,
  'mistralai/mistral-small-3.2-24b-instruct': 147,
  'mistralai/mistral-small-3.2-24b-instruct-2506': 147,
  'mistralai/mixtral-8x22b-instruct': 148,
  'mistralai/voxtral-small-24b-2507': 149,
  'mixtral-8x22b-instruct': 148,
  'moonshotai/kimi-k2': 150,
  'moonshotai/kimi-k2-0905': 151,
  'moonshotai/kimi-k2-thinking': 152,
  'moonshotai/kimi-k2-thinking-20251106': 152,
  'moonshotai/kimi-k2.5': 153,
  'moonshotai/kimi-k2.5-0127': 153,
  'moonshotai/kimi-k2.6': 154,
  'moonshotai/kimi-k2.6-20260420': 154,
  'moonshotai/kimi-k2.7-code': 155,
  'moonshotai/kimi-k2.7-code-20260612': 155,
  'morph-v3-fast': 156,
  'morph-v3-large': 157,
  'morph/morph-v3-fast': 156,
  'morph/morph-v3-large': 157,
  'mythomax-l2-13b': 94,
  'nemotron-3-nano-30b-a3b:free': 166,
  'nemotron-3-nano-omni-30b-a3b-reasoning-20260428': 167,
  'nemotron-3-nano-omni-30b-a3b-reasoning:free': 167,
  'nemotron-3-super-120b-a12b': 168,
  'nemotron-3-super-120b-a12b:free': 169,
  'nemotron-3-ultra-550b-a55b': 170,
  'nemotron-3-ultra-550b-a55b:free': 171,
  'nemotron-3.5-content-safety-20260604': 172,
  'nemotron-3.5-content-safety:free': 172,
  'nemotron-nano-12b-v2-vl': 173,
  'nemotron-nano-12b-v2-vl:free': 173,
  'nemotron-nano-9b-v2': 174,
  'nemotron-nano-9b-v2:free': 174,
  'nex-agi/nex-n2-pro': 158,
  'nex-agi/nex-n2-pro:free': 158,
  'nex-n2-pro': 158,
  'nex-n2-pro:free': 158,
  'north-mini-code-20260617': 52,
  'north-mini-code:free': 52,
  'nousresearch/hermes-3-llama-3.1-405b:free': 160,
  'nousresearch/hermes-3-llama-3.1-70b': 161,
  'nousresearch/hermes-4-405b': 162,
  'nousresearch/hermes-4-70b': 163,
  'nova-2-lite-v1': 15,
  'nova-lite-v1': 16,
  'nova-micro-v1': 17,
  'nova-premier-v1': 18,
  'nova-pro-v1': 19,
  'nvidia/llama-3.3-nemotron-super-49b-v1.5': 164,
  'nvidia/nemotron-3-nano-30b-a3b:free': 166,
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning-20260428': 167,
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free': 167,
  'nvidia/nemotron-3-super-120b-a12b': 168,
  'nvidia/nemotron-3-super-120b-a12b:free': 169,
  'nvidia/nemotron-3-ultra-550b-a55b': 170,
  'nvidia/nemotron-3-ultra-550b-a55b:free': 171,
  'nvidia/nemotron-3.5-content-safety-20260604': 172,
  'nvidia/nemotron-3.5-content-safety:free': 172,
  'nvidia/nemotron-nano-12b-v2-vl': 173,
  'nvidia/nemotron-nano-12b-v2-vl:free': 173,
  'nvidia/nemotron-nano-9b-v2': 174,
  'nvidia/nemotron-nano-9b-v2:free': 174,
  o1: 227,
  'o1-2024-12-17': 227,
  'o1-pro': 228,
  o3: 229,
  'o3-2025-04-16': 229,
  'o3-deep-research': 230,
  'o3-deep-research-2025-06-26': 230,
  'o3-mini': 231,
  'o3-mini-2025-01-31': 231,
  'o3-mini-high': 232,
  'o3-mini-high-2025-01-31': 232,
  'o3-pro': 233,
  'o3-pro-2025-06-10': 233,
  'o4-mini': 234,
  'o4-mini-2025-04-16': 234,
  'o4-mini-deep-research': 235,
  'o4-mini-deep-research-2025-06-26': 235,
  'o4-mini-high': 236,
  'o4-mini-high-2025-04-16': 236,
  'olmo-3-32b-think': 14,
  'olmo-3-32b-think-20251121': 14,
  'openai/gpt-3.5-turbo': 175,
  'openai/gpt-3.5-turbo-0613': 176,
  'openai/gpt-3.5-turbo-16k': 177,
  'openai/gpt-3.5-turbo-instruct': 178,
  'openai/gpt-4': 179,
  'openai/gpt-4-turbo': 180,
  'openai/gpt-4-turbo-preview': 181,
  'openai/gpt-4.1': 182,
  'openai/gpt-4.1-2025-04-14': 182,
  'openai/gpt-4.1-mini': 183,
  'openai/gpt-4.1-mini-2025-04-14': 183,
  'openai/gpt-4.1-nano': 184,
  'openai/gpt-4.1-nano-2025-04-14': 184,
  'openai/gpt-4o': 185,
  'openai/gpt-4o-2024-05-13': 186,
  'openai/gpt-4o-2024-08-06': 187,
  'openai/gpt-4o-2024-11-20': 188,
  'openai/gpt-4o-mini': 189,
  'openai/gpt-4o-mini-2024-07-18': 190,
  'openai/gpt-4o-mini-search-preview': 191,
  'openai/gpt-4o-mini-search-preview-2025-03-11': 191,
  'openai/gpt-4o-search-preview': 192,
  'openai/gpt-4o-search-preview-2025-03-11': 192,
  'openai/gpt-5': 193,
  'openai/gpt-5-2025-08-07': 193,
  'openai/gpt-5-chat': 194,
  'openai/gpt-5-chat-2025-08-07': 194,
  'openai/gpt-5-codex': 195,
  'openai/gpt-5-image': 196,
  'openai/gpt-5-image-mini': 197,
  'openai/gpt-5-mini': 198,
  'openai/gpt-5-mini-2025-08-07': 198,
  'openai/gpt-5-nano': 199,
  'openai/gpt-5-nano-2025-08-07': 199,
  'openai/gpt-5-pro': 200,
  'openai/gpt-5-pro-2025-10-06': 200,
  'openai/gpt-5.1': 201,
  'openai/gpt-5.1-20251113': 201,
  'openai/gpt-5.1-chat': 202,
  'openai/gpt-5.1-chat-20251113': 202,
  'openai/gpt-5.1-codex': 203,
  'openai/gpt-5.1-codex-20251113': 203,
  'openai/gpt-5.1-codex-max': 204,
  'openai/gpt-5.1-codex-max-20251204': 204,
  'openai/gpt-5.1-codex-mini': 205,
  'openai/gpt-5.1-codex-mini-20251113': 205,
  'openai/gpt-5.2': 206,
  'openai/gpt-5.2-20251211': 206,
  'openai/gpt-5.2-chat': 207,
  'openai/gpt-5.2-chat-20251211': 207,
  'openai/gpt-5.2-codex': 208,
  'openai/gpt-5.2-codex-20260114': 208,
  'openai/gpt-5.2-pro': 209,
  'openai/gpt-5.2-pro-20251211': 209,
  'openai/gpt-5.3-chat': 210,
  'openai/gpt-5.3-chat-20260303': 210,
  'openai/gpt-5.3-codex': 211,
  'openai/gpt-5.3-codex-20260224': 211,
  'openai/gpt-5.4': 212,
  'openai/gpt-5.4-20260305': 212,
  'openai/gpt-5.4-image-2': 213,
  'openai/gpt-5.4-image-2-20260421': 213,
  'openai/gpt-5.4-mini': 214,
  'openai/gpt-5.4-mini-20260317': 214,
  'openai/gpt-5.4-nano': 215,
  'openai/gpt-5.4-nano-20260317': 215,
  'openai/gpt-5.4-pro': 216,
  'openai/gpt-5.4-pro-20260305': 216,
  'openai/gpt-5.5': 217,
  'openai/gpt-5.5-20260423': 217,
  'openai/gpt-5.5-pro': 218,
  'openai/gpt-5.5-pro-20260423': 218,
  'openai/gpt-audio': 219,
  'openai/gpt-audio-mini': 220,
  'openai/gpt-chat-latest': 221,
  'openai/gpt-chat-latest-20260505': 221,
  'openai/gpt-oss-120b:free': 223,
  'openai/gpt-oss-20b:free': 225,
  'openai/gpt-oss-safeguard-20b': 226,
  'openai/o1': 227,
  'openai/o1-2024-12-17': 227,
  'openai/o1-pro': 228,
  'openai/o3': 229,
  'openai/o3-2025-04-16': 229,
  'openai/o3-deep-research': 230,
  'openai/o3-deep-research-2025-06-26': 230,
  'openai/o3-mini': 231,
  'openai/o3-mini-2025-01-31': 231,
  'openai/o3-mini-high': 232,
  'openai/o3-mini-high-2025-01-31': 232,
  'openai/o3-pro': 233,
  'openai/o3-pro-2025-06-10': 233,
  'openai/o4-mini': 234,
  'openai/o4-mini-2025-04-16': 234,
  'openai/o4-mini-deep-research': 235,
  'openai/o4-mini-deep-research-2025-06-26': 235,
  'openai/o4-mini-high': 236,
  'openai/o4-mini-high-2025-04-16': 236,
  'openrouter/auto': 237,
  'openrouter/bodybuilder': 238,
  'openrouter/free': 239,
  'openrouter/fusion': 240,
  'openrouter/owl-alpha': 241,
  'openrouter/pareto-code': 242,
  'owl-alpha': 241,
  'palmyra-x5': 322,
  'palmyra-x5-20250428': 322,
  'pareto-code': 242,
  'perceptron-mk1': 243,
  'perceptron-mk1-20260512': 243,
  'perceptron/perceptron-mk1': 243,
  'perceptron/perceptron-mk1-20260512': 243,
  'perplexity/sonar': 244,
  'perplexity/sonar-deep-research': 245,
  'perplexity/sonar-pro': 246,
  'perplexity/sonar-pro-search': 247,
  'perplexity/sonar-reasoning-pro': 248,
  'phi-4': 120,
  'phi-4-mini-instruct': 121,
  'poolside/laguna-m.1': 249,
  'poolside/laguna-m.1:free': 250,
  'poolside/laguna-xs.2': 251,
  'poolside/laguna-xs.2:free': 252,
  'prime-intellect/intellect-3': 253,
  'prime-intellect/intellect-3-20251126': 253,
  'qwen-2.5-72b-instruct': 254,
  'qwen-2.5-7b-instruct': 255,
  'qwen-2.5-coder-32b-instruct': 256,
  'qwen-plus': 257,
  'qwen-plus-2025-01-25': 257,
  'qwen-plus-2025-07-28:thinking': 259,
  'qwen/qwen-2.5-72b-instruct': 254,
  'qwen/qwen-2.5-7b-instruct': 255,
  'qwen/qwen-2.5-coder-32b-instruct': 256,
  'qwen/qwen-plus': 257,
  'qwen/qwen-plus-2025-01-25': 257,
  'qwen/qwen-plus-2025-07-28:thinking': 259,
  'qwen/qwen2.5-vl-72b-instruct': 260,
  'qwen/qwen3-14b': 261,
  'qwen/qwen3-14b-04-28': 261,
  'qwen/qwen3-235b-a22b': 262,
  'qwen/qwen3-235b-a22b-04-28': 262,
  'qwen/qwen3-235b-a22b-07-25': 263,
  'qwen/qwen3-235b-a22b-2507': 263,
  'qwen/qwen3-235b-a22b-thinking-2507': 264,
  'qwen/qwen3-30b-a3b': 265,
  'qwen/qwen3-30b-a3b-04-28': 265,
  'qwen/qwen3-30b-a3b-instruct-2507': 266,
  'qwen/qwen3-30b-a3b-thinking-2507': 267,
  'qwen/qwen3-32b': 268,
  'qwen/qwen3-32b-04-28': 268,
  'qwen/qwen3-8b': 269,
  'qwen/qwen3-8b-04-28': 269,
  'qwen/qwen3-coder': 270,
  'qwen/qwen3-coder-30b-a3b-instruct': 271,
  'qwen/qwen3-coder-flash': 272,
  'qwen/qwen3-coder-next': 273,
  'qwen/qwen3-coder-next-2025-02-03': 273,
  'qwen/qwen3-coder-plus': 274,
  'qwen/qwen3-coder:free': 275,
  'qwen/qwen3-max': 276,
  'qwen/qwen3-max-thinking': 277,
  'qwen/qwen3-max-thinking-20260123': 277,
  'qwen/qwen3-next-80b-a3b-instruct': 278,
  'qwen/qwen3-next-80b-a3b-instruct:free': 279,
  'qwen/qwen3-next-80b-a3b-thinking': 280,
  'qwen/qwen3-next-80b-a3b-thinking-2509': 280,
  'qwen/qwen3-vl-235b-a22b-instruct': 281,
  'qwen/qwen3-vl-235b-a22b-thinking': 282,
  'qwen/qwen3-vl-30b-a3b-instruct': 283,
  'qwen/qwen3-vl-30b-a3b-thinking': 284,
  'qwen/qwen3-vl-32b-instruct': 285,
  'qwen/qwen3-vl-8b-instruct': 286,
  'qwen/qwen3-vl-8b-thinking': 287,
  'qwen/qwen3.5-122b-a10b': 288,
  'qwen/qwen3.5-122b-a10b-20260224': 288,
  'qwen/qwen3.5-27b': 289,
  'qwen/qwen3.5-27b-20260224': 289,
  'qwen/qwen3.5-35b-a3b': 290,
  'qwen/qwen3.5-35b-a3b-20260224': 290,
  'qwen/qwen3.5-397b-a17b': 291,
  'qwen/qwen3.5-397b-a17b-20260216': 291,
  'qwen/qwen3.5-9b': 292,
  'qwen/qwen3.5-9b-20260310': 292,
  'qwen/qwen3.5-flash-02-23': 293,
  'qwen/qwen3.5-flash-20260224': 293,
  'qwen/qwen3.5-plus-02-15': 294,
  'qwen/qwen3.5-plus-20260216': 294,
  'qwen/qwen3.5-plus-20260420': 295,
  'qwen/qwen3.6-27b': 296,
  'qwen/qwen3.6-27b-20260422': 296,
  'qwen/qwen3.6-35b-a3b': 297,
  'qwen/qwen3.6-35b-a3b-20260415': 297,
  'qwen/qwen3.6-flash': 298,
  'qwen/qwen3.6-max-preview': 299,
  'qwen/qwen3.6-max-preview-20260420': 299,
  'qwen/qwen3.6-plus': 300,
  'qwen/qwen3.6-plus-04-02': 300,
  'qwen/qwen3.7-max': 301,
  'qwen/qwen3.7-max-20260520': 301,
  'qwen/qwen3.7-plus': 302,
  'qwen/qwen3.7-plus-20260602': 302,
  'qwen2.5-vl-72b-instruct': 260,
  'qwen3-14b': 261,
  'qwen3-14b-04-28': 261,
  'qwen3-235b-a22b': 262,
  'qwen3-235b-a22b-04-28': 262,
  'qwen3-235b-a22b-07-25': 263,
  'qwen3-235b-a22b-2507': 263,
  'qwen3-235b-a22b-thinking-2507': 264,
  'qwen3-30b-a3b': 265,
  'qwen3-30b-a3b-04-28': 265,
  'qwen3-30b-a3b-instruct-2507': 266,
  'qwen3-30b-a3b-thinking-2507': 267,
  'qwen3-32b': 268,
  'qwen3-32b-04-28': 268,
  'qwen3-8b': 269,
  'qwen3-8b-04-28': 269,
  'qwen3-coder': 270,
  'qwen3-coder-30b-a3b-instruct': 271,
  'qwen3-coder-flash': 272,
  'qwen3-coder-next': 273,
  'qwen3-coder-next-2025-02-03': 273,
  'qwen3-coder-plus': 274,
  'qwen3-coder:free': 275,
  'qwen3-max': 276,
  'qwen3-max-thinking': 277,
  'qwen3-max-thinking-20260123': 277,
  'qwen3-next-80b-a3b-instruct': 278,
  'qwen3-next-80b-a3b-instruct:free': 279,
  'qwen3-next-80b-a3b-thinking': 280,
  'qwen3-next-80b-a3b-thinking-2509': 280,
  'qwen3-vl-235b-a22b-instruct': 281,
  'qwen3-vl-235b-a22b-thinking': 282,
  'qwen3-vl-30b-a3b-instruct': 283,
  'qwen3-vl-30b-a3b-thinking': 284,
  'qwen3-vl-32b-instruct': 285,
  'qwen3-vl-8b-instruct': 286,
  'qwen3-vl-8b-thinking': 287,
  'qwen3.5-122b-a10b': 288,
  'qwen3.5-122b-a10b-20260224': 288,
  'qwen3.5-27b': 289,
  'qwen3.5-27b-20260224': 289,
  'qwen3.5-35b-a3b': 290,
  'qwen3.5-35b-a3b-20260224': 290,
  'qwen3.5-397b-a17b': 291,
  'qwen3.5-397b-a17b-20260216': 291,
  'qwen3.5-9b': 292,
  'qwen3.5-9b-20260310': 292,
  'qwen3.5-flash-02-23': 293,
  'qwen3.5-flash-20260224': 293,
  'qwen3.5-plus-02-15': 294,
  'qwen3.5-plus-20260216': 294,
  'qwen3.5-plus-20260420': 295,
  'qwen3.6-27b': 296,
  'qwen3.6-27b-20260422': 296,
  'qwen3.6-35b-a3b': 297,
  'qwen3.6-35b-a3b-20260415': 297,
  'qwen3.6-flash': 298,
  'qwen3.6-max-preview': 299,
  'qwen3.6-max-preview-20260420': 299,
  'qwen3.6-plus': 300,
  'qwen3.6-plus-04-02': 300,
  'qwen3.7-max': 301,
  'qwen3.7-max-20260520': 301,
  'qwen3.7-plus': 302,
  'qwen3.7-plus-20260602': 302,
  'reka-edge': 303,
  'reka-edge-2603': 303,
  'reka-flash-3': 304,
  'rekaai/reka-edge': 303,
  'rekaai/reka-edge-2603': 303,
  'rekaai/reka-flash-3': 304,
  'relace-apply-3': 305,
  'relace-search': 306,
  'relace-search-20251208': 306,
  'relace/relace-apply-3': 305,
  'relace/relace-search': 306,
  'relace/relace-search-20251208': 306,
  'remm-slerp-l2-13b': 320,
  'ring-2.6-1t': 100,
  'ring-2.6-1t-20260508': 100,
  'rnj-1-instruct': 65,
  'rocinante-12b': 317,
  router: 313,
  'sao10k/l3-lunaris-8b': 307,
  'sao10k/l3.1-70b-hanami-x1': 308,
  'sao10k/l3.1-euryale-70b': 309,
  'sao10k/l3.3-euryale-70b': 310,
  'sao10k/l3.3-euryale-70b-v2.3': 310,
  'seed-1.6': 42,
  'seed-1.6-20250625': 42,
  'seed-1.6-flash': 43,
  'seed-1.6-flash-20250625': 43,
  'seed-2.0-lite': 44,
  'seed-2.0-lite-20260309': 44,
  'seed-2.0-mini': 45,
  'seed-2.0-mini-20260224': 45,
  'skyfall-36b-v2': 318,
  'solar-pro-3': 321,
  sonar: 244,
  'sonar-deep-research': 245,
  'sonar-pro': 246,
  'sonar-pro-search': 247,
  'sonar-reasoning-pro': 248,
  'step-3.5-flash': 311,
  'step-3.7-flash': 312,
  'step-3.7-flash-20260528': 312,
  'stepfun/step-3.5-flash': 311,
  'stepfun/step-3.7-flash': 312,
  'stepfun/step-3.7-flash-20260528': 312,
  'switchpoint/router': 313,
  'tencent/hunyuan-a13b-instruct': 314,
  'tencent/hy3-preview': 315,
  'tencent/hy3-preview-20260421': 315,
  'thedrummer/cydonia-24b-v4.1': 316,
  'thedrummer/rocinante-12b': 317,
  'thedrummer/skyfall-36b-v2': 318,
  'thedrummer/unslopnemo-12b': 319,
  'trinity-large-thinking': 38,
  'trinity-mini': 39,
  'trinity-mini-20251201': 39,
  'ui-tars-1.5-7b': 46,
  uncensored: 47,
  'undi95/remm-slerp-l2-13b': 320,
  'unslopnemo-12b': 319,
  'upstage/solar-pro-3': 321,
  'venice/uncensored': 47,
  'virtuoso-large': 40,
  'voxtral-small-24b-2507': 149,
  weaver: 107,
  'wizardlm-2-8x22b': 122,
  'writer/palmyra-x5': 322,
  'writer/palmyra-x5-20250428': 322,
  'x-ai/grok-4.20': 323,
  'x-ai/grok-4.20-20260309': 323,
  'x-ai/grok-4.20-multi-agent': 324,
  'x-ai/grok-4.20-multi-agent-20260309': 324,
  'x-ai/grok-4.3': 325,
  'x-ai/grok-4.3-20260430': 325,
  'x-ai/grok-build-0.1': 326,
  'x-ai/grok-build-0.1-20260520': 326,
  'xiaomi/mimo-v2.5': 327,
  'xiaomi/mimo-v2.5-20260422': 327,
  'xiaomi/mimo-v2.5-pro': 328,
  'xiaomi/mimo-v2.5-pro-20260422': 328,
  'z-ai/glm-4.5': 329,
  'z-ai/glm-4.5-air': 330,
  'z-ai/glm-4.5v': 331,
  'z-ai/glm-4.6': 332,
  'z-ai/glm-4.6-20251208': 333,
  'z-ai/glm-4.6v': 333,
  'z-ai/glm-4.7': 334,
  'z-ai/glm-4.7-20251222': 334,
  'z-ai/glm-4.7-flash': 335,
  'z-ai/glm-4.7-flash-20260119': 335,
  'z-ai/glm-5': 336,
  'z-ai/glm-5-20260211': 336,
  'z-ai/glm-5-turbo': 337,
  'z-ai/glm-5-turbo-20260315': 337,
  'z-ai/glm-5.1': 338,
  'z-ai/glm-5.1-20260406': 338,
  'z-ai/glm-5.2': 339,
  'z-ai/glm-5.2-20260616': 339
};
