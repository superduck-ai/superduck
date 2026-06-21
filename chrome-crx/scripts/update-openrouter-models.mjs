import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(__dirname, '../src/constants/openRouterModels.ts');

function asString(value) {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function asNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function asStringArray(value) {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((entry) => typeof entry === 'string' && entry.trim());
  return strings.length > 0 ? strings : undefined;
}

function asStringRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value)
    .filter(([, entry]) => typeof entry === 'string' && entry.trim())
    .sort(([a], [b]) => a.localeCompare(b));
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => {
      if (entry === undefined || entry === null) return false;
      if (Array.isArray(entry)) return entry.length > 0;
      if (typeof entry === 'object') return Object.keys(entry).length > 0;
      return true;
    })
  );
}

function contextLengthFor(entry) {
  const topProvider =
    entry.top_provider &&
    typeof entry.top_provider === 'object' &&
    !Array.isArray(entry.top_provider)
      ? entry.top_provider
      : {};
  return [
    entry.context_length,
    entry.contextLength,
    entry.max_context_length,
    entry.maxContextLength,
    entry.max_input_tokens,
    entry.maxInputTokens,
    entry.input_token_limit,
    entry.inputTokenLimit,
    topProvider.context_length,
    topProvider.contextLength,
    topProvider.max_context_length,
    topProvider.maxContextLength,
    topProvider.max_input_tokens,
    topProvider.maxInputTokens
  ].find((value) => asNumber(value));
}

function reasoningFor(entry) {
  const reasoning =
    entry.reasoning && typeof entry.reasoning === 'object' && !Array.isArray(entry.reasoning)
      ? entry.reasoning
      : {};
  return compactObject({
    mandatory: typeof reasoning.mandatory === 'boolean' ? reasoning.mandatory : undefined,
    defaultEnabled:
      typeof reasoning.default_enabled === 'boolean' ? reasoning.default_enabled : undefined,
    supportedEfforts: asStringArray(reasoning.supported_efforts),
    defaultEffort: asString(reasoning.default_effort)
  });
}

function metadataFor(entry) {
  const id = asString(entry.id);
  const contextLength = contextLengthFor(entry);
  if (!id || !contextLength) return null;
  const architecture =
    entry.architecture &&
    typeof entry.architecture === 'object' &&
    !Array.isArray(entry.architecture)
      ? entry.architecture
      : {};
  const topProvider =
    entry.top_provider &&
    typeof entry.top_provider === 'object' &&
    !Array.isArray(entry.top_provider)
      ? entry.top_provider
      : {};
  const reasoning = reasoningFor(entry);
  return compactObject({
    id,
    canonicalSlug: asString(entry.canonical_slug) ?? asString(entry.canonicalSlug),
    name: asString(entry.name) ?? id,
    description: asString(entry.description),
    created: asNumber(entry.created),
    contextLength,
    maxCompletionTokens:
      asNumber(topProvider.max_completion_tokens) ??
      asNumber(topProvider.maxCompletionTokens) ??
      asNumber(entry.max_completion_tokens) ??
      asNumber(entry.maxCompletionTokens),
    isModerated:
      typeof topProvider.is_moderated === 'boolean' ? topProvider.is_moderated : undefined,
    modality: asString(architecture.modality),
    inputModalities: asStringArray(architecture.input_modalities),
    outputModalities: asStringArray(architecture.output_modalities),
    tokenizer: asString(architecture.tokenizer),
    instructType: asString(architecture.instruct_type),
    pricing: asStringRecord(entry.pricing),
    supportedParameters: asStringArray(entry.supported_parameters),
    knowledgeCutoff: asString(entry.knowledge_cutoff),
    expirationDate: asString(entry.expiration_date),
    reasoning: Object.keys(reasoning).length > 0 ? reasoning : undefined
  });
}

function addIndex(indexCandidates, key, modelIndex) {
  if (!key) return;
  if (!indexCandidates.has(key)) indexCandidates.set(key, new Set());
  indexCandidates.get(key).add(modelIndex);
}

function shortId(id) {
  return id.includes('/') ? id.split('/').pop() : '';
}

function buildIndex(models) {
  const candidates = new Map();
  models.forEach((model, index) => {
    addIndex(candidates, model.id, index);
    addIndex(candidates, model.canonicalSlug, index);
    addIndex(candidates, shortId(model.id), index);
    addIndex(candidates, shortId(model.canonicalSlug ?? ''), index);
  });

  return Object.fromEntries(
    Array.from(candidates.entries())
      .filter(([, indexes]) => indexes.size === 1)
      .map(([key, indexes]) => [key, Array.from(indexes)[0]])
      .sort(([a], [b]) => a.localeCompare(b))
  );
}

function formatJson(value) {
  return JSON.stringify(value, null, 2).replace(/[^\x00-\x7F]/gu, (char) => {
    const codePoint = char.codePointAt(0) ?? 0;
    if (codePoint <= 0xffff) return `\\u${codePoint.toString(16).padStart(4, '0')}`;
    const valueWithoutPlane = codePoint - 0x10000;
    const high = 0xd800 + (valueWithoutPlane >> 10);
    const low = 0xdc00 + (valueWithoutPlane & 0x3ff);
    return `\\u${high.toString(16).padStart(4, '0')}\\u${low.toString(16).padStart(4, '0')}`;
  });
}

async function main() {
  const response = await fetch(OPENROUTER_MODELS_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch OpenRouter models: HTTP ${response.status}`);
  }
  const payload = await response.json();
  const source = Array.isArray(payload?.data) ? payload.data : null;
  if (!source || source.length === 0) {
    throw new Error('OpenRouter payload missing model list; aborting snapshot refresh.');
  }

  const models = source
    .map(metadataFor)
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (models.length === 0) {
    throw new Error('No valid OpenRouter models extracted; aborting snapshot refresh.');
  }

  const index = buildIndex(models);
  const body = `/**\n * Bundled OpenRouter model metadata.\n *\n * Generated from ${OPENROUTER_MODELS_URL} so extension users do not need to\n * reach OpenRouter at runtime for model metadata such as context length,\n * pricing, modalities, and supported parameters.\n *\n * Refresh with: bun scripts/update-openrouter-models.mjs\n */\n\nexport interface OpenRouterModelMetadata {\n  id: string;\n  canonicalSlug?: string;\n  name: string;\n  description?: string;\n  created?: number;\n  contextLength: number;\n  maxCompletionTokens?: number;\n  isModerated?: boolean;\n  modality?: string;\n  inputModalities?: string[];\n  outputModalities?: string[];\n  tokenizer?: string;\n  instructType?: string;\n  pricing?: Record<string, string>;\n  supportedParameters?: string[];\n  knowledgeCutoff?: string;\n  expirationDate?: string;\n  reasoning?: {\n    mandatory?: boolean;\n    defaultEnabled?: boolean;\n    supportedEfforts?: string[];\n    defaultEffort?: string;\n  };\n}\n\nexport const OPENROUTER_MODELS: OpenRouterModelMetadata[] = ${formatJson(models)};\n\nexport const OPENROUTER_MODEL_INDEX: Record<string, number> = ${formatJson(index)};\n`;
  await writeFile(outputPath, body);
  console.log(
    `Wrote ${models.length} OpenRouter models to ${path.relative(process.cwd(), outputPath)}`
  );
}

await main();
