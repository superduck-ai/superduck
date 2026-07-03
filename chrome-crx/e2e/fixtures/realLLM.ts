/**
 * Real-LLM provider config for end-to-end specs that drive the production
 * agent loop against a live model. Reads credentials from env so the spec
 * files stay secret-free and CI auto-skips when no key is provided.
 *
 * Env:
 *   SUPERDUCK_REAL_LLM_API_KEY   (required — skip spec when absent)
 *   SUPERDUCK_REAL_LLM_BASE_URL  (default https://token.cvte.com)
 *   SUPERDUCK_REAL_LLM_MODEL_ID  (default qwen3.7-plus)
 */
export const REAL_LLM_API_KEY = process.env.SUPERDUCK_REAL_LLM_API_KEY || "";
export const REAL_LLM_BASE_URL = process.env.SUPERDUCK_REAL_LLM_BASE_URL || "https://token.cvte.com";
export const REAL_LLM_MODEL_ID = process.env.SUPERDUCK_REAL_LLM_MODEL_ID || "qwen3.7-plus";
export const REAL_LLM_ENABLED = REAL_LLM_API_KEY.length > 0;

export const REAL_LLM_PROVIDER_ID = "prov_real_qwen";

export function getRealProviderConfig() {
  return {
    aiProviders: [
      {
        id: REAL_LLM_PROVIDER_ID,
        kind: "anthropic" as const,
        name: "Real Qwen (token.cvte.com)",
        modelId: REAL_LLM_MODEL_ID,
        apiKey: REAL_LLM_API_KEY,
        baseURL: REAL_LLM_BASE_URL,
        status: "active" as const,
      },
    ],
    aiProviderConfigVersion: 2,
    selectedModel: REAL_LLM_PROVIDER_ID,
    anthropicApiKey: REAL_LLM_API_KEY,
    browserControlPermissionAccepted: true,
  };
}
