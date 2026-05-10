import * as Sentry from "@sentry/browser";
import {
  trace,
  context,
  SpanStatusCode,
  SpanKind,
  type Span,
} from "@opentelemetry/api";
import { HoneycombWebSDK } from "@honeycombio/opentelemetry-web";
import {
  PermissionAction,
  PermissionDuration,
  StorageKeys,
  getStorageValue,
  setStorageValue,
  getConfig,
} from "./extensionServices";

// --- Sentry Initialization ---

export function initSentry(): void {
  const integrations = Sentry.getDefaultIntegrations({}).filter(
    (i) =>
      !["BrowserApiErrors", "Breadcrumbs", "GlobalHandlers"].includes(i.name),
  );
  Sentry.init({
    dsn: "https://60bea3ee4ef1022e4035b23ba50f44d0@o1158394.ingest.us.sentry.io/4509876992278529",
    integrations,
    initialScope: {
      tags: { extension_version: chrome.runtime.getManifest().version },
    },
    beforeSend: (event) => {
      event.contexts = {
        ...event.contexts,
        extension: {
          id: chrome.runtime.id,
          version: chrome.runtime.getManifest().version,
          environment: "production",
        },
      };
      return event;
    },
  });
}

// --- OpenTelemetry Tracing ---

const SERVICE_NAME = "superduck-browser-extension";

export async function withTracing<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  parentSpan?: Span,
): Promise<T> {
  return trace
    .getTracer(SERVICE_NAME)
    .startActiveSpan(
      name,
      { kind: SpanKind.INTERNAL },
      parentSpan
        ? trace.setSpan(context.active(), parentSpan)
        : context.active(),
      async (span) => {
        try {
          const result = await fn(span);
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (error: any) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message,
          });
          span.recordException(error);
          throw error;
        } finally {
          span.end();
        }
      },
    );
}

export function generateTraceHeaders(_traceId?: string): {
  traceId: string;
  headers: Record<string, string>;
} {
  const hexChars = "0123456789abcdef";
  const newTraceId = Array.from({ length: 32 }, () =>
    hexChars[Math.floor(16 * Math.random())],
  ).join("");
  const spanId = Array.from({ length: 16 }, () =>
    hexChars[Math.floor(16 * Math.random())],
  ).join("");
  const headers: Record<string, string> = {
    traceparent: `00-${newTraceId}-${spanId}-01`,
    "x-cloud-trace-context": `${newTraceId}/${parseInt(spanId, 16).toString()};o=1`,
    baggage: "forceTrace=true",
    "x-refinery-force-trace": "true",
  };
  return { traceId: newTraceId, headers };
}

export function initHoneycomb(): void {
  const config = getConfig();
  const manifest = chrome.runtime.getManifest();
  try {
    new HoneycombWebSDK({
      debug: (config as any).environment !== "production" || false,
      apiKey:
        "hcaik_01k4x5jaf9v7sdymjzmxvktd6whp9x2y75jj8y5f8y7aaf1zy6aedg9858",
      serviceName: SERVICE_NAME,
      sampleRate: 1,
      resourceAttributes: {
        "extension.version": manifest.version,
        "build.type": "external",
      },
      webVitalsInstrumentationConfig: { enabled: false },
    }).start();
  } catch {
    return;
  }
}

// --- Re-export SpanStatusCode for consumers ---

export { SpanStatusCode } from "@opentelemetry/api";

// --- PermissionManager Class ---

interface PermissionScope {
  type: "netloc" | "domain_transition";
  netloc?: string;
  fromDomain?: string;
  toDomain?: string;
}

interface Permission {
  id: string;
  scope: PermissionScope;
  action: PermissionAction;
  duration: PermissionDuration;
  createdAt: number;
  lastUsed?: number;
  toolUseId?: string;
}

interface PermissionCheckResult {
  allowed: boolean;
  needsPrompt?: boolean;
  permission?: Permission;
}

export class PermissionManager {
  private permissions: Permission[] = [];
  private cache = new Map<string, Permission>();
  private getSkipAllPermissions: () => boolean;
  private forcePrompt = false;
  private bypassLocalhostForMcp = false;
  private turnApprovedDomains = new Set<string>();

  constructor(
    getSkipAllPermissions: () => boolean,
    options?: { bypassLocalhostForMcp?: boolean },
  ) {
    this.getSkipAllPermissions = getSkipAllPermissions;
    this.bypassLocalhostForMcp = options?.bypassLocalhostForMcp ?? false;
    this.loadPermissions();
    this.setupStorageListener();
  }

  setForcePrompt(value: boolean): void {
    this.forcePrompt = value;
  }

  setTurnApprovedDomains(domains: string[]): void {
    this.turnApprovedDomains.clear();
    for (const domain of domains) {
      const normalized = this.normalizeDomain(domain);
      if (normalized) this.turnApprovedDomains.add(normalized);
    }
  }

  clearTurnApprovedDomains(): void {
    this.turnApprovedDomains.clear();
  }

  isTurnApprovedDomain(domain: string): boolean {
    const normalized = this.normalizeDomain(domain);
    return !!normalized && this.turnApprovedDomains.has(normalized);
  }

  getTurnApprovedDomains(): string[] {
    return Array.from(this.turnApprovedDomains);
  }

  normalizeDomain(input: string): string | null {
    try {
      if (input.startsWith("http://") || input.startsWith("https://")) {
        return new URL(input).hostname.toLowerCase().replace(/^www\./, "");
      }
      return input.toLowerCase().replace(/^www\./, "").split("/")[0];
    } catch {
      return null;
    }
  }

  async checkPermission(
    url: string,
    toolUseId?: string,
  ): Promise<PermissionCheckResult> {
    if (this.bypassLocalhostForMcp && this.isLocalhostUrl(url))
      return { allowed: true, needsPrompt: false };
    if (!this.forcePrompt && this.getSkipAllPermissions())
      return { allowed: true, permission: undefined };
    const { host } = new URL(url);
    if (!this.forcePrompt && this.isTurnApprovedDomain(host))
      return { allowed: true, needsPrompt: false };
    await this.loadPermissions();
    const found = this.findApplicablePermission(host, toolUseId);
    if (found) {
      found.lastUsed = Date.now();
      await this.savePermissions();
      return {
        allowed: found.action === PermissionAction.ALLOW,
        permission: found,
      };
    }
    return { allowed: false, needsPrompt: true };
  }

  async checkDomainTransition(
    fromDomain: string,
    toDomain: string,
  ): Promise<PermissionCheckResult> {
    if (this.bypassLocalhostForMcp) {
      const fromLocal = this.isLocalhostDomain(fromDomain);
      const toLocal = this.isLocalhostDomain(toDomain);
      if (toLocal) return { allowed: true, needsPrompt: false };
      if (fromLocal && !toLocal) return { allowed: false, needsPrompt: true };
    }
    if (this.forcePrompt) return { allowed: false, needsPrompt: true };
    if (this.isTurnApprovedDomain(toDomain))
      return { allowed: true, needsPrompt: false };
    await this.loadPermissions();
    const matching = this.permissions.filter(
      (p) =>
        "domain_transition" === p.scope.type &&
        p.scope.fromDomain === fromDomain &&
        p.scope.toDomain === toDomain,
    );
    const denied = matching.find(
      (p) => p.action === PermissionAction.DENY,
    );
    if (denied) {
      denied.lastUsed = Date.now();
      await this.savePermissions();
      return { allowed: false, permission: denied };
    }
    const allowed = matching.find(
      (p) => p.action === PermissionAction.ALLOW,
    );
    if (allowed) {
      allowed.lastUsed = Date.now();
      await this.savePermissions();
      return { allowed: true, permission: allowed };
    }
    return { allowed: false, needsPrompt: true };
  }

  async grantPermission(
    scope: PermissionScope,
    duration: PermissionDuration,
    toolUseId?: string,
  ): Promise<void> {
    const permission: Permission = {
      id: crypto.randomUUID(),
      scope,
      action: PermissionAction.ALLOW,
      duration,
      createdAt: Date.now(),
      toolUseId: duration === PermissionDuration.ONCE ? toolUseId : undefined,
    };
    this.permissions.push(permission);
    await this.savePermissions();
    this.clearCache();
  }

  async denyPermission(
    scope: PermissionScope,
    duration: PermissionDuration,
  ): Promise<void> {
    if (duration === PermissionDuration.ONCE) return;
    const permission: Permission = {
      id: crypto.randomUUID(),
      scope,
      action: PermissionAction.DENY,
      duration,
      createdAt: Date.now(),
    };
    if (duration === PermissionDuration.ALWAYS)
      this.permissions.push(permission);
    await this.savePermissions();
    this.clearCache();
  }

  async revokePermission(id: string): Promise<void> {
    this.permissions = this.permissions.filter((p) => p.id !== id);
    await this.savePermissions();
    this.clearCache();
  }

  async clearAllPermissions(): Promise<void> {
    this.permissions = [];
    await this.savePermissions();
    this.clearCache();
  }

  async clearOncePermissions(): Promise<void> {
    const before = this.permissions.length;
    this.permissions = this.permissions.filter(
      (p) => p.duration !== PermissionDuration.ONCE,
    );
    if (before - this.permissions.length > 0) {
      await this.savePermissions();
      this.clearCache();
    }
  }

  getPermissionsByScope(): {
    netloc: Permission[];
    domain_transition: Permission[];
  } {
    return {
      netloc: this.permissions.filter((p) => "netloc" === p.scope.type),
      domain_transition: this.permissions.filter(
        (p) => "domain_transition" === p.scope.type,
      ),
    };
  }

  getAllPermissions(): Permission[] {
    return [...this.permissions];
  }

  findApplicablePermission(
    host: string,
    toolUseId?: string,
  ): Permission | null {
    const cacheKey = `${host}:${toolUseId || "no-tool"}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey)!;
    if (toolUseId) {
      const once = this.permissions.find(
        (p) =>
          p.duration === PermissionDuration.ONCE &&
          p.toolUseId === toolUseId &&
          "netloc" === p.scope.type &&
          p.scope.netloc &&
          this.matchesNetloc(host, p.scope.netloc),
      );
      if (once) {
        this.revokePermission(once.id);
        return once;
      }
    }
    const persistent = this.permissions.filter(
      (p) =>
        "netloc" === p.scope.type &&
        p.duration !== PermissionDuration.ONCE &&
        p.scope.netloc &&
        this.matchesNetloc(host, p.scope.netloc),
    );
    const denied = persistent.find(
      (p) => p.action === PermissionAction.DENY,
    );
    if (denied) {
      this.cache.set(cacheKey, denied);
      return denied;
    }
    const allowed = persistent.find(
      (p) => p.action === PermissionAction.ALLOW,
    );
    if (allowed) {
      this.cache.set(cacheKey, allowed);
      return allowed;
    }
    return null;
  }

  async hasSiteWidePermissions(host: string): Promise<boolean> {
    await this.loadPermissions();
    return this.permissions.some(
      (p) =>
        "netloc" === p.scope.type &&
        p.duration === PermissionDuration.ALWAYS &&
        p.action === PermissionAction.ALLOW &&
        p.scope.netloc &&
        this.matchesNetloc(host, p.scope.netloc),
    );
  }

  matchesNetloc(host: string, netloc: string): boolean {
    if (netloc.startsWith("*.")) {
      const base = netloc.slice(2);
      return host === base || host.endsWith("." + base);
    }
    return (
      host === netloc ||
      host.replace(/^www\./, "") === netloc.replace(/^www\./, "")
    );
  }

  async loadPermissions(): Promise<void> {
    try {
      const data = await getStorageValue(StorageKeys.PERMISSION_STORAGE);
      if (data) this.permissions = data.permissions || [];
    } catch {
      // ignore storage errors
    }
  }

  async savePermissions(): Promise<void> {
    try {
      await setStorageValue(StorageKeys.PERMISSION_STORAGE, {
        permissions: this.permissions,
      });
    } catch {
      // ignore storage errors
    }
  }

  private setupStorageListener(): void {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (
        "local" === areaName &&
        changes[StorageKeys.PERMISSION_STORAGE]
      ) {
        this.loadPermissions();
        this.clearCache();
      }
    });
  }

  private clearCache(): void {
    this.cache.clear();
  }

  isLocalhostDomain(domain: string): boolean {
    const lower = domain.toLowerCase();
    return (
      "localhost" === lower ||
      "127.0.0.1" === lower ||
      "[::1]" === lower ||
      "::1" === lower ||
      lower.startsWith("127.") ||
      lower.endsWith(".localhost")
    );
  }

  isLocalhostUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return (
        ("http:" === parsed.protocol || "https:" === parsed.protocol) &&
        this.isLocalhostDomain(parsed.hostname)
      );
    } catch {
      return false;
    }
  }
}
