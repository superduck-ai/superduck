import type { Worker } from "@playwright/test";

export async function seedStorage(sw: Worker, data: Record<string, unknown>): Promise<void> {
  await sw.evaluate(async (items) => {
    await (globalThis as any).chrome.storage.local.set(items);
  }, data);
}

export async function clearStorage(sw: Worker): Promise<void> {
  await sw.evaluate(async () => {
    await (globalThis as any).chrome.storage.local.clear();
  });
}

/**
 * Whether to drive a real LLM provider instead of the mock fetch interceptor.
 * Enabled when E2E_REAL_LLM=1 plus E2E_LLM_API_KEY / E2E_LLM_BASE_URL /
 * E2E_LLM_MODEL are set. Mock mode stays the default so CI stays deterministic.
 */
export function isRealLlmMode(): boolean {
  return (
    process.env.E2E_REAL_LLM === "1" &&
    !!process.env.E2E_LLM_API_KEY &&
    !!process.env.E2E_LLM_BASE_URL &&
    !!process.env.E2E_LLM_MODEL
  );
}

export function getDefaultProviderConfig() {
  if (isRealLlmMode()) {
    return {
      aiProviders: [
        {
          id: "prov_real",
          kind: "anthropic",
          name: "Real LLM",
          modelId: process.env.E2E_LLM_MODEL,
          apiKey: process.env.E2E_LLM_API_KEY,
          baseURL: process.env.E2E_LLM_BASE_URL,
          status: "active",
        },
      ],
      aiProviderConfigVersion: 2,
      selectedModel: "prov_real",
      anthropicApiKey: process.env.E2E_LLM_API_KEY,
      browserControlPermissionAccepted: true,
      lastPermissionModePreference: "skip_all_permission_checks",
    };
  }
  return {
    aiProviders: [
      {
        id: "prov_mock",
        kind: "anthropic",
        name: "Mock Provider",
        modelId: "claude-sonnet-4-6",
        apiKey: "test-fake-key-not-real",
        baseURL: "https://api.anthropic.com",
        status: "active",
      },
    ],
    aiProviderConfigVersion: 2,
    selectedModel: "prov_mock",
    anthropicApiKey: "test-fake-key-not-real",
    browserControlPermissionAccepted: true,
    lastPermissionModePreference: "skip_all_permission_checks",
  };
}

