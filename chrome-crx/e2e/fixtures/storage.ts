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

export function getDefaultProviderConfig() {
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
    aiModelMapping: {
      deep: { providerId: "prov_mock", modelId: "claude-sonnet-4-6" },
      smart: { providerId: "prov_mock", modelId: "claude-sonnet-4-6" },
      flash: { providerId: "prov_mock", modelId: "claude-sonnet-4-6" },
    },
    aiProviderConfigVersion: 1,
    anthropicApiKey: "test-fake-key-not-real",
    browserControlPermissionAccepted: true,
  };
}
