declare const process:
  | {
      version?: string;
    }
  | undefined;
import {
  StorageKeys,
  removeStorageValues,
  getAccessToken,
  getProfileTraits,
  getConfig,
  FeatureFlagManager,
  type FeatureFlagEntry,
  getOrCreateAnonymousId
} from '../extensionServices';
import type { FeatureCollection, FeatureResponse } from '../extensionServices/featureFlags';

// Segment Analytics / Telemetry (lines ~5243-6300)
// This section contains the Segment analytics client used for telemetry.
// =============================================================================

// --- Validation Error class (Fe) ---

class ValidationError extends Error {
  field: string;
  constructor(field: string, message: string) {
    super(`${field} ${message}`);
    this.field = field;
  }
}

// --- Type guard helpers (We, je, ze) ---

type AnalyticsRecord = Record<string, unknown>;

interface AnalyticsUserLike {
  anonymousId(): string | null | undefined;
  id(): string | null | undefined;
}

interface AnalyticsOptions extends AnalyticsRecord {
  anonymousId?: string;
  context?: AnalyticsRecord;
  integrations?: AnalyticsRecord;
  timestamp?: unknown;
  userId?: string;
}

interface AnalyticsEvent extends AnalyticsRecord {
  anonymousId?: string;
  context?: AnalyticsRecord;
  event?: string;
  groupId?: string;
  integrations?: AnalyticsRecord;
  messageId?: string;
  options?: AnalyticsOptions;
  previousId?: string | null;
  properties?: AnalyticsRecord;
  timestamp?: Date;
  traits?: AnalyticsRecord;
  type: string;
  userId?: string;
}

interface ValidatableEvent extends AnalyticsRecord {
  anonymousId?: unknown;
  event?: unknown;
  groupId?: unknown;
  previousId?: unknown;
  properties?: unknown;
  traits?: unknown;
  type?: unknown;
  userId?: unknown;
}

interface CallbackContext {
  log?: (level: string, message: string, extras?: AnalyticsRecord) => void;
  stats?: { increment(metric: string): void };
}

interface LogEntry {
  extras?: unknown;
  level: string;
  message: string;
  time: Date;
}

interface MetricEntry {
  metric: string;
  tags: string[];
  timestamp: number;
  type: 'counter' | 'gauge';
  value: number;
}

type AnalyticsEventMethod = 'alias' | 'group' | 'identify' | 'page' | 'screen' | 'track';
type AnalyticsDispatchCallback = (err?: unknown, ctx?: Context) => void;
type AnalyticsPluginHandler = (
  ctx: Context
) => Promise<Context | ContextCancelation> | Context | ContextCancelation;
type AbortSignalLike = AbortSignal | AbortSignalPolyfill;
type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit & { signal?: AbortSignalLike }
) => Promise<SegmentHttpResponse>;
type RuntimeGlobal = typeof globalThis & {
  EdgeRuntime?: string;
  WebSocketPair?: unknown;
  WorkerGlobalScope?: unknown;
};

interface AbortSignalEvent {
  target: AbortSignalPolyfill;
  type: string;
}

interface AnalyticsPlugin {
  alternativeNames?: string[];
  alias?: AnalyticsPluginHandler;
  group?: AnalyticsPluginHandler;
  identify?: AnalyticsPluginHandler;
  isLoaded?: () => boolean;
  load?: (ctx: Context, instance: unknown) => Promise<unknown> | unknown;
  name: string;
  page?: AnalyticsPluginHandler;
  screen?: AnalyticsPluginHandler;
  track?: AnalyticsPluginHandler;
  type?: string;
  unload?: (ctx: Context, instance: unknown) => Promise<unknown> | unknown;
  version?: string;
}

function isFeatureFlagEntry(value: unknown): value is FeatureFlagEntry {
  return (
    isPlainObject(value) &&
    (value.on === undefined || typeof value.on === 'boolean')
  );
}

function isFeatureCollection(value: unknown): value is FeatureCollection {
  return isPlainObject(value) && Object.values(value).every(isFeatureFlagEntry);
}

function isFeatureResponse(value: unknown): value is FeatureResponse<FeatureCollection> {
  return isPlainObject(value) && isFeatureCollection(value.features);
}

interface AvailableExtensions {
  after: AnalyticsPlugin[];
  before: AnalyticsPlugin[];
  destinations: AnalyticsPlugin[];
  enrichment: AnalyticsPlugin[];
}

interface SegmentHttpRequest {
  data: AnalyticsRecord;
  headers: Record<string, string>;
  httpRequestTimeout: number;
  method: string;
  signal?: AbortSignalLike;
  url: string;
}

interface SegmentHttpResponse {
  headers: Headers | Record<string, string>;
  json: () => Promise<unknown>;
  status: number;
  statusText: string;
  text: () => Promise<string>;
}

interface SegmentHttpClient {
  makeRequest(request: SegmentHttpRequest): Promise<SegmentHttpResponse>;
}

const runtimeGlobal = globalThis as RuntimeGlobal;

function isString(value: unknown): value is string {
  return 'string' === typeof value;
}

function isNotNil(value: unknown): boolean {
  return value !== null && value !== undefined;
}

function isPlainObject(value: unknown): value is AnalyticsRecord {
  return 'object' === Object.prototype.toString.call(value).slice(8, -1).toLowerCase();
}

function hasPromiseFinally(
  value: unknown
): value is PromiseLike<unknown> & { finally(onfinally?: () => void): PromiseLike<unknown> } {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) return false;
  const candidate = value as { finally?: unknown; then?: unknown };
  return typeof candidate.then === 'function' && typeof candidate.finally === 'function';
}

function getPluginHandler(
  plugin: AnalyticsPlugin,
  eventType: string
): AnalyticsPluginHandler | undefined {
  const handler = plugin[eventType as AnalyticsEventMethod];
  return typeof handler === 'function' ? handler : undefined;
}

function isFetchLike(value: unknown): value is FetchLike {
  return typeof value === 'function';
}

// --- Validation constants ---

const IS_NOT_A_STRING = 'is not a string';
const IS_NOT_AN_OBJECT = 'is not an object';
const IS_NIL = 'is nil';

// --- Event validation (Ve) ---

function validateEvent(event: unknown): void {
  const candidate = event as ValidatableEvent;

  // Validate event is non-nil object
  (function validateEventExists(e: unknown) {
    if (!isNotNil(e)) throw new ValidationError('Event', IS_NIL);
    if (!isPlainObject(e)) throw new ValidationError('Event', IS_NOT_AN_OBJECT);
  })(candidate);

  // Validate .type is string
  (function validateType(e: ValidatableEvent) {
    if (!isString(e.type)) throw new ValidationError('.type', IS_NOT_A_STRING);
  })(candidate);

  // Track events need .event and .properties
  if ('track' === candidate.type) {
    (function validateTrackEvent(e: ValidatableEvent) {
      if (!isString(e.event)) throw new ValidationError('.event', IS_NOT_A_STRING);
    })(candidate);
    (function validateTrackProperties(e: ValidatableEvent) {
      if (!isPlainObject(e.properties)) throw new ValidationError('.properties', IS_NOT_AN_OBJECT);
    })(candidate);
  }

  // Group/identify events need .traits
  if ('group' === candidate.type || 'identify' === candidate.type) {
    (function validateTraits(e: ValidatableEvent) {
      if (!isPlainObject(e.traits)) throw new ValidationError('.traits', IS_NOT_AN_OBJECT);
    })(candidate);
  }

  // Validate userId/anonymousId/previousId/groupId
  (function validateIds(e: ValidatableEvent) {
    const fieldName = '.userId/anonymousId/previousId/groupId';
    const id = e.userId ?? e.anonymousId ?? e.groupId ?? e.previousId;
    if (!isNotNil(id)) throw new ValidationError(fieldName, IS_NIL);
    if (!isString(id)) throw new ValidationError(fieldName, IS_NOT_A_STRING);
  })(candidate);
}

// --- EventFactory class (Je) ---

class EventFactory {
  user: AnalyticsUserLike | undefined;
  createMessageId: () => string;

  constructor(options: { user?: AnalyticsUserLike; createMessageId: () => string }) {
    this.user = options.user;
    this.createMessageId = options.createMessageId;
  }

  track(
    event: string,
    properties: AnalyticsRecord = {},
    options: AnalyticsOptions = {},
    integrations: AnalyticsRecord = {}
  ): AnalyticsEvent {
    return this.normalize({
      ...this.baseEvent(),
      event,
      type: 'track',
      properties: properties ?? {},
      options: { ...options },
      integrations: { ...integrations }
    });
  }

  page(
    category: string | null,
    name: string | null,
    properties: AnalyticsRecord = {},
    options: AnalyticsOptions = {},
    integrations: AnalyticsRecord = {}
  ): AnalyticsEvent {
    const event: AnalyticsEvent = {
      type: 'page',
      properties: { ...properties },
      options: { ...options },
      integrations: { ...integrations }
    };
    if (null !== category) {
      event.category = category;
      event.properties = event.properties ?? {};
      event.properties.category = category;
    }
    if (null !== name) event.name = name;
    return this.normalize({ ...this.baseEvent(), ...event });
  }

  screen(
    category: string | null,
    name: string | null,
    properties: AnalyticsRecord = {},
    options: AnalyticsOptions = {},
    integrations: AnalyticsRecord = {}
  ): AnalyticsEvent {
    const event: AnalyticsEvent = {
      type: 'screen',
      properties: { ...properties },
      options: { ...options },
      integrations: { ...integrations }
    };
    if (null !== category) event.category = category;
    if (null !== name) event.name = name;
    return this.normalize({ ...this.baseEvent(), ...event });
  }

  identify(
    userId: string,
    traits: AnalyticsRecord = {},
    options: AnalyticsOptions = {},
    integrations: AnalyticsRecord = {}
  ): AnalyticsEvent {
    return this.normalize({
      ...this.baseEvent(),
      type: 'identify',
      userId,
      traits: traits ?? {},
      options: { ...options },
      integrations
    });
  }

  group(
    groupId: string,
    traits: AnalyticsRecord = {},
    options: AnalyticsOptions = {},
    integrations: AnalyticsRecord = {}
  ): AnalyticsEvent {
    return this.normalize({
      ...this.baseEvent(),
      type: 'group',
      traits: traits ?? {},
      options: { ...options },
      integrations: { ...integrations },
      groupId
    });
  }

  alias(
    userId: string,
    previousId: string | null,
    options: AnalyticsOptions = {},
    integrations: AnalyticsRecord = {}
  ): AnalyticsEvent {
    const event: AnalyticsEvent = {
      userId,
      type: 'alias',
      options: { ...options },
      integrations: { ...integrations }
    };
    if (null !== previousId) event.previousId = previousId;
    return void 0 === userId
      ? this.normalize({ ...event, ...this.baseEvent() })
      : this.normalize({ ...this.baseEvent(), ...event });
  }

  private baseEvent(): AnalyticsRecord & {
    anonymousId?: string;
    integrations: AnalyticsRecord;
    options: AnalyticsOptions;
    userId?: string;
  } {
    const event: AnalyticsRecord & {
      anonymousId?: string;
      integrations: AnalyticsRecord;
      options: AnalyticsOptions;
      userId?: string;
    } = { integrations: {}, options: {} };
    if (!this.user) return event;
    const user = this.user;
    const userId = user.id();
    const anonymousId = user.anonymousId();
    if (userId) event.userId = userId;
    if (anonymousId) event.anonymousId = anonymousId;
    return event;
  }

  private context(options: AnalyticsOptions): [AnalyticsRecord, AnalyticsRecord] {
    const reserved = new Set(['userId', 'anonymousId', 'timestamp']);
    const keys = Object.keys(options);
    const ctx = isPlainObject(options.context) ? { ...options.context } : {};
    const toplevel: AnalyticsRecord = {};
    keys.forEach((key) => {
      if ('context' !== key && 'integrations' !== key) {
        if (reserved.has(key)) {
          toplevel[key] = options[key];
        } else {
          ctx[key] = options[key];
        }
      }
    });
    return [ctx, toplevel];
  }

  private normalize(event: AnalyticsEvent): AnalyticsEvent {
    const eventIntegrations = isPlainObject(event.integrations) ? event.integrations : {};
    const integrations = Object.keys(eventIntegrations).reduce<Record<string, boolean>>((acc, key) => {
      acc[key] = Boolean(event.integrations?.[key]);
      return acc;
    }, {});

    // Filter out undefined options
    const eventOptions = isPlainObject(event.options) ? event.options : {};
    const filteredOptions = Object.keys(eventOptions).reduce<AnalyticsOptions>((acc, key) => {
      const value = eventOptions[key];
      if (value !== undefined) {
        acc[key] = value;
      }
      return acc;
    }, {});

    const mergedIntegrations = {
      ...integrations,
      ...(isPlainObject(filteredOptions.integrations) ? filteredOptions.integrations : {})
    };

    const [ctx, toplevel] =
      Object.keys(filteredOptions).length > 0 ? this.context(filteredOptions) : [{}, {}];

    const { options: _options, ...rest } = event;
    const normalized: AnalyticsEvent = {
      timestamp: new Date(),
      ...rest,
      integrations: mergedIntegrations,
      context: ctx,
      ...toplevel,
      messageId: this.createMessageId()
    };

    validateEvent(normalized);
    return normalized;
  }
}

// --- Promise timeout helper (Xe) ---

function promiseTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(Error('Promise timed out'));
    }, timeout);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(reject);
  });
}

// --- Callback with delay helper (Qe) ---

function callbackWithDelay<TContext extends CallbackContext>(
  ctx: TContext,
  callback: (ctx: TContext) => unknown,
  delay: number
): Promise<TContext> {
  return new Promise<void>((resolve) => setTimeout(resolve, delay))
    .then(() => {
      return promiseTimeout(
        (function () {
          try {
            return Promise.resolve(callback(ctx));
          } catch (err) {
            return Promise.reject(err);
          }
        })(),
        1000
      );
    })
    .catch((err) => {
      ctx?.log?.('warn', 'Callback Error', {
        error: err
      });
      ctx?.stats?.increment('callback_error');
    })
    .then(() => ctx);
}

// --- Emitter class (Ze) ---

type CallbackFunction = {
  bivarianceHack(...args: unknown[]): void;
}['bivarianceHack'];

class Emitter {
  callbacks: Record<string, CallbackFunction[]> = {};
  warned: boolean = false;
  maxListeners: number;

  constructor(options?: { maxListeners?: number }) {
    this.maxListeners = options?.maxListeners ?? 10;
  }

  private warnIfPossibleMemoryLeak(event: string): void {
    if (!this.warned && this.maxListeners && this.callbacks[event].length > this.maxListeners) {
      this.warned = true;
    }
  }

  on(event: string, callback: CallbackFunction): this {
    if (this.callbacks[event]) {
      this.callbacks[event].push(callback);
      this.warnIfPossibleMemoryLeak(event);
    } else {
      this.callbacks[event] = [callback];
    }
    return this;
  }

  once(event: string, callback: CallbackFunction): this {
    const wrapper = (...args: unknown[]) => {
      this.off(event, wrapper);
      callback.apply(this, args);
    };
    return this.on(event, wrapper);
  }

  off(event: string, callback: CallbackFunction): this {
    const filtered = (this.callbacks[event] ?? []).filter((cb) => cb !== callback);
    this.callbacks[event] = filtered;
    return this;
  }

  emit(event: string, ...args: unknown[]): this {
    (this.callbacks[event] ?? []).forEach((cb) => {
      cb.apply(this, args);
    });
    return this;
  }
}

// --- Backoff helper (et) ---

function calculateBackoff(options: {
  minTimeout?: number;
  factor?: number;
  attempt: number;
  maxTimeout?: number;
}): number {
  const jitter = Math.random() + 1;
  const minTimeout = options.minTimeout ?? 500;
  const factor = options.factor ?? 2;
  const maxTimeout = options.maxTimeout ?? Infinity;
  return Math.min(jitter * minTimeout * Math.pow(factor, options.attempt), maxTimeout);
}

// --- Priority Queue (rt) ---

const ON_REMOVE_FROM_FUTURE = 'onRemoveFromFuture';

class PriorityQueue extends Emitter {
  future: Context[] = [];
  maxAttempts: number;
  queue: Context[];
  seen: Record<string, number>;

  constructor(maxAttempts: number, queue: Context[], seen?: Record<string, number>) {
    super();
    this.maxAttempts = maxAttempts;
    this.queue = queue;
    this.seen = seen ?? {};
  }

  push(...items: Context[]): boolean[] {
    const results = items.map((item) => {
      if (this.updateAttempts(item) > this.maxAttempts || this.includes(item)) return false;
      this.queue.push(item);
      return true;
    });
    this.queue = this.queue.sort((a, b) => this.getAttempts(a) - this.getAttempts(b));
    return results;
  }

  pushWithBackoff(item: Context): boolean {
    if (0 === this.getAttempts(item)) return this.push(item)[0];
    const attempts = this.updateAttempts(item);
    if (attempts > this.maxAttempts || this.includes(item)) return false;
    const delay = calculateBackoff({ attempt: attempts - 1 });
    setTimeout(() => {
      this.queue.push(item);
      this.future = this.future.filter((f) => f.id !== item.id);
      this.emit(ON_REMOVE_FROM_FUTURE);
    }, delay);
    this.future.push(item);
    return true;
  }

  getAttempts(item: Context): number {
    return this.seen[item.id] ?? 0;
  }

  updateAttempts(item: Context): number {
    this.seen[item.id] = this.getAttempts(item) + 1;
    return this.getAttempts(item);
  }

  includes(item: Context): boolean {
    return (
      this.queue.includes(item) ||
      this.future.includes(item) ||
      Boolean(this.queue.find((q) => q.id === item.id)) ||
      Boolean(this.future.find((f) => f.id === item.id))
    );
  }

  pop(): Context | undefined {
    return this.queue.shift();
  }

  get length(): number {
    return this.queue.length;
  }

  get todo(): number {
    return this.queue.length + this.future.length;
  }
}

// --- Logger (ot) ---

class Logger {
  _logs: LogEntry[] = [];

  log(level: string, message: string, extras?: unknown): void {
    this._logs.push({ level, message, time: new Date(), extras });
  }

  get logs(): LogEntry[] {
    return this._logs;
  }

  flush(): void {
    if (this.logs.length > 1) {
      const table = this._logs.reduce<Record<string, Omit<LogEntry, 'time'> & { json: string }>>(
        (acc, entry) => {
          const row = {
          ...entry,
          json: JSON.stringify(entry.extras, null, ' '),
          extras: entry.extras
        };
          const { time: _time, ...rowWithoutTime } = row;
          let key = entry.time?.toISOString() ?? '';
          if (acc[key]) key = `${key}-${Math.random()}`;
          acc[key] = rowWithoutTime;
          return acc;
        },
        {}
      );
      if (console.table) console.table(table);
    } else {
      this.logs.forEach((entry) => {
        const { level, message, extras } = entry;
        if ('info' === level || 'debug' === level) return;
        const consoleWriter = 'error' === level ? console.error : console.warn;
        consoleWriter(message, extras ?? '');
      });
    }
    this._logs = [];
  }
}

// --- Stats classes (base + NullStats nt) ---

class Stats {
  metrics: MetricEntry[] = [];

  increment(metric: string, value: number = 1, tags?: string[]): void {
    this.metrics.push({
      metric,
      value,
      tags: tags ?? [],
      type: 'counter',
      timestamp: Date.now()
    });
  }

  gauge(metric: string, value: number, tags?: string[]): void {
    this.metrics.push({
      metric,
      value,
      tags: tags ?? [],
      type: 'gauge',
      timestamp: Date.now()
    });
  }

  flush(): void {
    const formatted = this.metrics.map((m) => ({
      ...m,
      tags: m.tags.join(',')
    }));
    if (console.table) console.table(formatted);
    this.metrics = [];
  }

  serialize(): Array<{ m: string; v: number; t: string[]; k: 'g' | 'c'; e: number }> {
    return this.metrics.map((m) => ({
      m: m.metric,
      v: m.value,
      t: m.tags,
      k: 'gauge' === m.type ? 'g' : 'c',
      e: m.timestamp
    }));
  }
}

class NullStats extends Stats {
  gauge(): void {}
  increment(): void {}
  flush(): void {}
  serialize(): ReturnType<Stats['serialize']> {
    return [];
  }
}

// --- ContextCancelation (it) ---

class ContextCancelation {
  retry: boolean;
  type: string;
  reason: string;

  constructor(options: { retry?: boolean; type?: string; reason?: string }) {
    this.retry = options.retry ?? true;
    this.type = options.type ?? 'plugin Error';
    this.reason = options.reason ?? '';
  }
}

// --- Context class (at) ---

function generateId(): string {
  return Math.random().toString(36).substring(2);
}

class Context {
  attempts: number = 0;
  event: AnalyticsEvent;
  _id: string;
  logger: Logger;
  stats: Stats;
  _failedDelivery?: { reason: unknown };

  constructor(
    event: AnalyticsEvent,
    id: string = generateId(),
    stats: Stats = new NullStats(),
    logger: Logger = new Logger()
  ) {
    this.event = event;
    this._id = id;
    this.logger = logger;
    this.stats = stats;
  }

  static system(): void {}

  isSame(other: Context): boolean {
    return other.id === this.id;
  }

  cancel(error?: unknown): never {
    if (error) throw error;
    throw new ContextCancelation({ reason: 'Context Cancel' });
  }

  log(level: string, message: string, extras?: unknown): void {
    this.logger.log(level, message, extras);
  }

  get id(): string {
    return this._id;
  }

  updateEvent(path: string, value: unknown): AnalyticsEvent {
    if ('integrations' === path.split('.')[0]) {
      const integrationName = path.split('.')[1];
      if (false === this.event.integrations?.[integrationName]) return this.event;
    }
    // Deep set (simplified - uses lodash-like set in original)
    const parts = path.split('.');
    let current: AnalyticsRecord = this.event;
    for (let i = 0; i < parts.length - 1; i++) {
      const next = current[parts[i]];
      if (!isPlainObject(next)) current[parts[i]] = {};
      current = current[parts[i]] as AnalyticsRecord;
    }
    current[parts[parts.length - 1]] = value;
    return this.event;
  }

  failedDelivery(): { reason: unknown } | undefined {
    return this._failedDelivery;
  }

  setFailedDelivery(delivery: { reason: unknown }): void {
    this._failedDelivery = delivery;
  }

  logs(): LogEntry[] {
    return this.logger.logs;
  }

  flush(): void {
    this.logger.flush();
    this.stats.flush();
  }

  toJSON(): AnalyticsRecord {
    return {
      id: this._id,
      event: this.event,
      logs: this.logger.logs,
      metrics: this.stats.metrics
    };
  }
}

// --- Plugin execution helpers (st, ct) ---

function invokePlugin(
  ctx: Context,
  plugin: AnalyticsPlugin
): Promise<Context | ContextCancelation | unknown> {
  ctx.log('debug', 'plugin', { plugin: plugin.name });
  const startTime = new Date().getTime();
  const handler = getPluginHandler(plugin, ctx.event.type);
  if (void 0 === handler) return Promise.resolve(ctx);

  let pluginResultPromise: Promise<Context | ContextCancelation>;
  try {
    pluginResultPromise = Promise.resolve(handler(ctx));
  } catch (err) {
    pluginResultPromise = Promise.reject(err);
  }

  return pluginResultPromise
    .then((result) => {
      const elapsed = new Date().getTime() - startTime;
      if (result instanceof Context) {
        result.stats.gauge('plugin_time', elapsed, [`plugin:${plugin.name}`]);
      }
      return result;
    })
    .catch((err: unknown) => {
      if (err instanceof ContextCancelation && 'middleware_cancellation' === err.type) throw err;
      if (err instanceof ContextCancelation) {
        ctx.log('warn', err.type, { plugin: plugin.name, error: err });
        return err;
      }
      ctx.log('error', 'plugin Error', { plugin: plugin.name, error: err });
      ctx.stats.increment('plugin_error', 1, [`plugin:${plugin.name}`]);
      return err;
    });
}

function invokePluginWithCancel(ctx: Context, plugin: AnalyticsPlugin): Promise<Context> {
  return invokePlugin(ctx, plugin).then((result) => {
    if (result instanceof Context) return result;
    ctx.log('debug', 'Context canceled');
    ctx.stats.increment('context_canceled');
    ctx.cancel(result);
  }) as Promise<Context>;
}

// --- EventQueue (ut) ---

class EventQueue extends Emitter {
  criticalTasks: {
    done: () => Promise<void> | undefined;
    run: <T>(fn: () => T) => T;
  };
  plugins: AnalyticsPlugin[] = [];
  failedInitializations: string[] = [];
  flushing: boolean = false;
  queue: PriorityQueue;

  constructor(queue: PriorityQueue) {
    super();
    let pendingCount = 0;
    let donePromise: Promise<void> | undefined;
    let doneResolve: (() => void) | undefined;

    this.criticalTasks = {
      done: () => donePromise,
      run: <T>(fn: () => T): T => {
        const result = fn();
        if (hasPromiseFinally(result)) {
          if (1 === ++pendingCount) {
            donePromise = new Promise<void>((resolve) => {
              doneResolve = resolve;
            });
          }
          result.finally(() => {
            if (0 === --pendingCount && doneResolve) doneResolve();
          });
        }
        return result;
      }
    };

    this.plugins = [];
    this.failedInitializations = [];
    this.flushing = false;
    this.queue = queue;
    this.queue.on(ON_REMOVE_FROM_FUTURE, () => {
      this.scheduleFlush(0);
    });
  }

  async register(ctx: Context, plugin: AnalyticsPlugin, instance: unknown): Promise<void> {
    await Promise.resolve(plugin.load ? plugin.load(ctx, instance) : undefined)
      .then(() => {
        this.plugins.push(plugin);
      })
      .catch((err: unknown) => {
        if ('destination' === plugin.type) {
          this.failedInitializations.push(plugin.name);
          ctx.log('warn', 'Failed to load destination', {
            plugin: plugin.name,
            error: err
          });
          return;
        }
        throw err;
      });
  }

  async deregister(ctx: Context, plugin: AnalyticsPlugin, instance: unknown): Promise<void> {
    try {
      if (plugin.unload) {
        await Promise.resolve(plugin.unload(ctx, instance));
      }
      this.plugins = this.plugins.filter((p) => p.name !== plugin.name);
    } catch (err) {
      ctx.log('warn', 'Failed to unload destination', {
        plugin: plugin.name,
        error: err
      });
    }
  }

  async dispatch(ctx: Context): Promise<Context> {
    ctx.log('debug', 'Dispatching');
    ctx.stats.increment('message_dispatched');
    this.queue.push(ctx);
    const promise = this.subscribeToDelivery(ctx);
    this.scheduleFlush(0);
    return promise;
  }

  async subscribeToDelivery(ctx: Context): Promise<Context> {
    return new Promise((resolve) => {
      const handler = (flushedCtx: Context, _success: boolean) => {
        if (flushedCtx.isSame(ctx)) {
          this.off('flush', handler);
          resolve(flushedCtx);
        }
      };
      this.on('flush', handler);
    });
  }

  async dispatchSingle(ctx: Context): Promise<Context> {
    ctx.log('debug', 'Dispatching');
    ctx.stats.increment('message_dispatched');
    this.queue.updateAttempts(ctx);
    ctx.attempts = 1;
    return this.deliver(ctx).catch((err) => {
      if (this.enqueuRetry(err, ctx)) return this.subscribeToDelivery(ctx);
      ctx.setFailedDelivery({ reason: err });
      return ctx;
    });
  }

  isEmpty(): boolean {
    return 0 === this.queue.length;
  }

  scheduleFlush(delay: number = 500): void {
    if (this.flushing) return;
    this.flushing = true;
    setTimeout(() => {
      this.flush().then(() => {
        setTimeout(() => {
          this.flushing = false;
          if (this.queue.length) this.scheduleFlush(0);
        }, 0);
      });
    }, delay);
  }

  async deliver(ctx: Context): Promise<Context> {
    await this.criticalTasks.done();
    const startTime = Date.now();
    try {
      ctx = await this.flushOne(ctx);
      const elapsed = Date.now() - startTime;
      this.emit('delivery_success', ctx);
      ctx.stats.gauge('delivered', elapsed);
      ctx.log('debug', 'Delivered', ctx.event);
      return ctx;
    } catch (err) {
      const error = err;
      ctx.log('error', 'Failed to deliver', error);
      this.emit('delivery_failure', ctx, error);
      ctx.stats.increment('delivery_failed');
      throw err;
    }
  }

  enqueuRetry(err: unknown, ctx: Context): boolean {
    if (err instanceof ContextCancelation && !err.retry) return false;
    return this.queue.pushWithBackoff(ctx);
  }

  async flush(): Promise<Context[]> {
    if (0 === this.queue.length) return [];
    const ctx = this.queue.pop();
    if (!ctx) return [];
    ctx.attempts = this.queue.getAttempts(ctx);

    try {
      const delivered = await this.deliver(ctx);
      this.emit('flush', delivered, true);
      return [delivered];
    } catch (err) {
      if (!this.enqueuRetry(err, ctx)) {
        ctx.setFailedDelivery({ reason: err });
        this.emit('flush', ctx, false);
      }
      return [];
    }
  }

  isReady(): boolean {
    return true;
  }

  availableExtensions(integrations: AnalyticsRecord): AvailableExtensions {
    const filtered = this.plugins.filter((plugin) => {
      if ('destination' !== plugin.type && 'Segment.io' !== plugin.name) return true;
      let override: unknown = undefined;
      plugin.alternativeNames?.forEach((altName: string) => {
        if (void 0 !== integrations[altName]) override = integrations[altName];
      });
      return (
        integrations[plugin.name] ??
        override ??
        ('Segment.io' === plugin.name || false !== integrations.All)
      );
    });

    const grouped: Record<string, AnalyticsPlugin[]> = {};
    filtered.forEach((plugin) => {
      const type = plugin.type;
      const key = 'string' !== typeof type ? JSON.stringify(type) : type;
      if (void 0 !== key) {
        grouped[key] = [...(grouped[key] ?? []), plugin];
      }
    });

    return {
      before: grouped['before'] ?? [],
      enrichment: grouped['enrichment'] ?? [],
      destinations: grouped['destination'] ?? [],
      after: grouped['after'] ?? []
    };
  }

  async flushOne(ctx: Context): Promise<Context> {
    if (!this.isReady()) throw new Error('Not ready');
    if (ctx.attempts > 1) this.emit('delivery_retry', ctx);

    const extensions = this.availableExtensions(ctx.event.integrations ?? {});

    // Before plugins
    for (const plugin of extensions.before) {
      const result = await invokePluginWithCancel(ctx, plugin);
      if (result instanceof Context) ctx = result;
      this.emit('message_enriched', ctx, plugin);
    }

    // Enrichment plugins
    for (const plugin of extensions.enrichment) {
      const result = await invokePlugin(ctx, plugin);
      if (result instanceof Context) ctx = result;
      this.emit('message_enriched', ctx, plugin);
    }

    // Re-evaluate extensions after enrichment
    const updatedExtensions = this.availableExtensions(ctx.event.integrations ?? {});

    // Destination plugins (async)
    await new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        const promises = updatedExtensions.destinations.map((plugin) => invokePlugin(ctx, plugin));
        Promise.all(promises)
          .then(() => resolve())
          .catch(reject);
      }, 0);
    });

    ctx.stats.increment('message_delivered');
    this.emit('message_delivered', ctx);

    // After plugins
    const afterPromises = updatedExtensions.after.map((plugin) => invokePlugin(ctx, plugin));
    await Promise.all(afterPromises);

    return ctx;
  }
}

// --- Segment Analytics version ---

const ANALYTICS_VERSION = '1.3.0';

// --- Batch class (dt) ---

class Batch {
  id: string = generateId();
  items: Array<{ context: Context; resolver: (ctx: Context) => void }> = [];
  sizeInBytes: number = 0;
  maxEventCount: number;

  constructor(maxEventCount: number) {
    this.maxEventCount = Math.max(1, maxEventCount);
  }

  tryAdd(item: { context: Context; resolver: (ctx: Context) => void }): {
    success: boolean;
    message?: string;
  } {
    if (this.length === this.maxEventCount) {
      return {
        success: false,
        message: `Event limit of ${this.maxEventCount} has been exceeded.`
      };
    }
    const size = this.calculateSize(item.context);
    if (size > 32768) {
      return { success: false, message: 'Event exceeds maximum event size of 32 KB' };
    }
    if (this.sizeInBytes + size > 491520) {
      return { success: false, message: 'Event has caused batch size to exceed 480 KB' };
    }
    this.items.push(item);
    this.sizeInBytes += size;
    return { success: true };
  }

  get length(): number {
    return this.items.length;
  }

  calculateSize(ctx: Context): number {
    return encodeURI(JSON.stringify(ctx.event)).split(/%..|i/).length;
  }

  getEvents(): AnalyticsEvent[] {
    return this.items.map(({ context }) => context.event);
  }

  getContexts(): Context[] {
    return this.items.map((item) => item.context);
  }

  resolveEvents(): void {
    this.items.forEach(({ resolver, context }) => resolver(context));
  }
}

// --- Sleep helper (ht) ---

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- No-op (pt) ---

function noop(): void {}

// --- Publisher (ft) ---

class Publisher {
  _emitter: Emitter;
  _maxRetries: number;
  _flushAt: number;
  _flushInterval: number;
  _auth: string;
  _url: string;
  _httpRequestTimeout: number;
  _disable: boolean;
  _httpClient: SegmentHttpClient;
  _batch?: Batch;
  pendingFlushTimeout?: ReturnType<typeof setTimeout>;
  _flushPendingItemsCount?: number;

  constructor(
    options: {
      host?: string;
      path?: string;
      maxRetries: number;
      flushAt: number;
      flushInterval: number;
      writeKey: string;
      httpRequestTimeout?: number;
      httpClient: SegmentHttpClient;
      disable?: boolean;
    },
    emitter: Emitter
  ) {
    this._emitter = emitter;
    this._maxRetries = options.maxRetries;
    this._flushAt = Math.max(options.flushAt, 1);
    this._flushInterval = options.flushInterval;

    // Base64 encode writeKey
    const authString = `${options.writeKey}:`;
    this._auth = btoa(authString);

    const host = options.host ?? 'https://api.segment.io';
    const path = options.path ?? '/v1/batch';
    this._url = new URL(path || '', host).href.replace(/\/$/, '');
    this._httpRequestTimeout = options.httpRequestTimeout ?? 10000;
    this._disable = Boolean(options.disable);
    this._httpClient = options.httpClient;
  }

  createBatch(): Batch {
    if (this.pendingFlushTimeout) clearTimeout(this.pendingFlushTimeout);
    const batch = new Batch(this._flushAt);
    this._batch = batch;
    this.pendingFlushTimeout = setTimeout(() => {
      if (batch === this._batch) this._batch = void 0;
      this.pendingFlushTimeout = void 0;
      if (batch.length) this.send(batch).catch(noop);
    }, this._flushInterval);
    return batch;
  }

  clearBatch(): void {
    if (this.pendingFlushTimeout) clearTimeout(this.pendingFlushTimeout);
    this._batch = void 0;
  }

  flush(count?: number): void {
    if (!count) return;
    this._flushPendingItemsCount = count;
    if (!this._batch) return;
    if (this._batch.length === count) {
      this.send(this._batch).catch(noop);
      this.clearBatch();
    }
  }

  enqueue(ctx: Context): Promise<Context> {
    const batch = this._batch ?? this.createBatch();

    let resolvePromise: (ctx: Context) => void;
    const promise = new Promise<Context>((resolve) => {
      resolvePromise = resolve;
    });

    const item = { context: ctx, resolver: resolvePromise! };

    if (batch.tryAdd(item).success) {
      const shouldFlush =
        batch.length === this._flushAt || batch.length === this._flushPendingItemsCount;
      if (shouldFlush) {
        this.send(batch).catch(noop);
        this.clearBatch();
      }
      return promise;
    }

    // Current batch is full, send it and create new one
    if (batch.length) {
      this.send(batch).catch(noop);
      this.clearBatch();
    }

    const newBatch = this.createBatch();
    const addResult = newBatch.tryAdd(item);
    if (addResult.success) {
      if (newBatch.length === this._flushPendingItemsCount) {
        this.send(newBatch).catch(noop);
        this.clearBatch();
      }
      return promise;
    }

    ctx.setFailedDelivery({
      reason: new Error(addResult.message ?? 'Failed to add analytics event to batch')
    });
    return Promise.resolve(ctx);
  }

  async send(batch: Batch): Promise<void> {
    if (this._flushPendingItemsCount) {
      this._flushPendingItemsCount -= batch.length;
    }

    const events = batch.getEvents();
    const maxAttempts = this._maxRetries + 1;
    let attempt = 0;

    while (attempt < maxAttempts) {
      let lastError: unknown;
      attempt++;

      try {
        if (this._disable) return batch.resolveEvents();

        const request: SegmentHttpRequest = {
          url: this._url,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${this._auth}`,
            'User-Agent': 'analytics-node-next/latest'
          },
          data: { batch: events, sentAt: new Date() },
          httpRequestTimeout: this._httpRequestTimeout
        };

        this._emitter.emit('http_request', {
          body: request.data,
          method: request.method,
          url: request.url,
          headers: request.headers
        });

        const response = await this._httpClient.makeRequest(request);
        if (response.status >= 200 && response.status < 300) {
          return batch.resolveEvents();
        }
        if (400 === response.status) {
          return failBatch(batch, new Error(`[${response.status}] ${response.statusText}`));
        }
        lastError = new Error(`[${response.status}] ${response.statusText}`);
      } catch (err) {
        lastError = err;
      }

      if (attempt === maxAttempts) {
        return failBatch(batch, lastError);
      }

      await sleep(calculateBackoff({ attempt, minTimeout: 25, maxTimeout: 1000 }));
    }
  }
}

function failBatch(batch: Batch, error: unknown): void {
  batch.getContexts().forEach((ctx) => ctx.setFailedDelivery({ reason: error }));
  batch.resolveEvents();
}

// --- Runtime detection (bt) ---

function detectRuntime(): string {
  if ('object' === typeof process && process && 'string' === typeof process.version) return 'node';
  if ('object' === typeof window) return 'browser';
  if ('undefined' !== typeof runtimeGlobal.WebSocketPair) return 'cloudflare-worker';
  if ('string' === typeof runtimeGlobal.EdgeRuntime) return 'vercel-edge';
  if (
    'undefined' !== typeof runtimeGlobal.WorkerGlobalScope &&
    'function' === typeof importScripts
  )
    return 'web-worker';
  return 'unknown';
}

// --- Segment.io plugin factory (wt) ---

function createSegmentPlugin(publisher: Publisher): AnalyticsPlugin {
  function processEvent(ctx: Context): Promise<Context> {
    ctx.updateEvent('context.library.name', '@segment/analytics-node');
    ctx.updateEvent('context.library.version', ANALYTICS_VERSION);
    const runtime = detectRuntime();
    if ('node' === runtime && typeof process?.version === 'string') {
      ctx.updateEvent('_metadata.nodeVersion', process.version);
    }
    ctx.updateEvent('_metadata.jsRuntime', runtime);
    return publisher.enqueue(ctx);
  }

  return {
    name: 'Segment.io',
    type: 'destination',
    version: '1.0.0',
    isLoaded: () => true,
    load: () => Promise.resolve(),
    alias: processEvent,
    group: processEvent,
    identify: processEvent,
    page: processEvent,
    screen: processEvent,
    track: processEvent
  };
}

// --- Node message ID generator (yt) ---

const generateNodeMessageId = (): string => `node-next-${Date.now()}-${generateId()}`;

// --- NodeEventFactory (vt) ---

class NodeEventFactory extends EventFactory {
  constructor() {
    super({ createMessageId: generateNodeMessageId });
  }
}

// --- NodeContext (It) ---

class NodeContext extends Context {
  static system(): NodeContext {
    return new NodeContext({ type: 'track', event: 'system' });
  }
}

// --- Dispatch helper (_t) ---

const dispatchEvent = async (
  event: AnalyticsEvent,
  queue: EventQueue,
  emitter: Emitter,
  callback?: AnalyticsDispatchCallback
): Promise<void> => {
  try {
    const ctx = new NodeContext(event);
    const startTime = Date.now();

    let result: Context;
    if (queue.isEmpty()) {
      result = await queue.dispatchSingle(ctx);
    } else {
      result = await queue.dispatch(ctx);
    }

    if (callback) {
      const elapsed = Date.now() - startTime;
      const remainingTimeout = Math.max(300 - elapsed, 0);
      result = await callbackWithDelay(
        result,
        (resultCtx: Context) => {
          const failed = resultCtx.failedDelivery();
          return callback(failed ? failed.reason : void 0, resultCtx);
        },
        remainingTimeout
      );
    }

    const failed = result.failedDelivery();
    if (failed) {
      emitter.emit('error', {
        code: 'delivery_failure',
        reason: failed.reason,
        ctx: result
      });
    } else {
      emitter.emit(event.type, result);
    }
  } catch (err) {
    emitter.emit('error', { code: 'unknown', reason: err });
  }
};

// --- NodeEmitter (kt) ---

class NodeEmitter extends Emitter {}

// --- NodePriorityQueue (Tt) ---

class NodePriorityQueue extends PriorityQueue {
  constructor() {
    super(1, []);
  }

  getAttempts(item: Context): number {
    return item.attempts ?? 0;
  }

  updateAttempts(item: Context): number {
    item.attempts = this.getAttempts(item) + 1;
    return this.getAttempts(item);
  }
}

// --- NodeEventQueue (Et) ---

class NodeEventQueue extends EventQueue {
  constructor() {
    super(new NodePriorityQueue());
  }
}

// --- AbortSignal polyfill (xt) ---

class AbortSignalPolyfill {
  onabort: ((event: AbortSignalEvent) => void) | null = null;
  aborted: boolean = false;
  eventEmitter: Emitter = new Emitter();

  toString(): string {
    return '[object AbortSignal]';
  }

  get [Symbol.toStringTag](): string {
    return 'AbortSignal';
  }

  removeEventListener(eventName: string, listener: (event: AbortSignalEvent) => void): void {
    this.eventEmitter.off(eventName, listener);
  }

  addEventListener(eventName: string, listener: (event: AbortSignalEvent) => void): void {
    this.eventEmitter.on(eventName, listener);
  }

  dispatchEvent(eventType: string): void {
    const event: AbortSignalEvent = { type: eventType, target: this };
    if ('abort' === eventType && this.onabort) {
      this.onabort(event);
    }
    this.eventEmitter.emit(eventType, event);
  }
}

// --- AbortController polyfill (Ct) ---

class AbortControllerPolyfill {
  signal: AbortSignalPolyfill = new AbortSignalPolyfill();

  abort(): void {
    if (!this.signal.aborted) {
      this.signal.aborted = true;
      this.signal.dispatchEvent('abort');
    }
  }

  toString(): string {
    return '[object AbortController]';
  }

  get [Symbol.toStringTag](): string {
    return 'AbortController';
  }
}

// --- Fetch wrapper (St) ---

const fetchWithFallback = async (
  ...args: [RequestInfo | URL, (RequestInit & { signal?: AbortSignalLike })?]
): Promise<SegmentHttpResponse> => {
  if (globalThis.fetch) return globalThis.fetch(...args);
  if ('string' !== typeof runtimeGlobal.EdgeRuntime) {
    // node-fetch fallback — not needed in Chrome extension context
    throw new Error('fetch is not available');
  }
  throw new Error('Invariant: an edge runtime that does not support fetch should not exist');
};

// --- HTTP Client (At) ---

class HttpClient {
  _fetch: FetchLike;

  constructor(fetchFn?: FetchLike) {
    this._fetch = fetchFn ?? fetchWithFallback;
  }

  async makeRequest(request: SegmentHttpRequest): Promise<SegmentHttpResponse> {
    const [signal, timer] = (() => {
      if ('cloudflare-worker' === detectRuntime()) return [undefined, undefined];
      const controller = new (globalThis.AbortController || AbortControllerPolyfill)();
      const timeout = setTimeout(() => {
        controller.abort();
      }, request.httpRequestTimeout);
      if (
        'object' === typeof timeout &&
        timeout !== null &&
        'unref' in timeout &&
        'function' === typeof timeout.unref
      ) {
        timeout.unref();
      }
      return [controller.signal, timeout];
    })();

    const fetchOptions: RequestInit & { signal?: AbortSignalLike } = {
      method: request.method,
      headers: request.headers,
      body: JSON.stringify(request.data),
      signal
    };

    return this._fetch(request.url, fetchOptions).finally(() => {
      if (timer !== undefined) clearTimeout(timer);
    });
  }
}

// --- Analytics class (Mt) ---

class Analytics extends NodeEmitter {
  _isClosed: boolean = false;
  _pendingEvents: number = 0;
  _isFlushing: boolean = false;
  _eventFactory: NodeEventFactory;
  _queue: NodeEventQueue;
  _publisher: Publisher;
  _closeAndFlushDefaultTimeout: number;
  ready: Promise<void>;

  constructor(options: {
    writeKey: string;
    host?: string;
    path?: string;
    maxRetries?: number;
    flushAt?: number;
    maxEventsInBatch?: number;
    flushInterval?: number;
    httpRequestTimeout?: number;
    httpClient?: FetchLike | SegmentHttpClient;
    disable?: boolean;
  }) {
    super();

    if (!options.writeKey) {
      throw new ValidationError('writeKey', 'writeKey is missing.');
    }

    this._eventFactory = new NodeEventFactory();
    this._queue = new NodeEventQueue();

    const flushInterval = options.flushInterval ?? 10000;
    this._closeAndFlushDefaultTimeout = 1.25 * flushInterval;

    const publisherOptions = {
      writeKey: options.writeKey,
      host: options.host,
      path: options.path,
      maxRetries: options.maxRetries ?? 3,
      flushAt: options.flushAt ?? options.maxEventsInBatch ?? 15,
      httpRequestTimeout: options.httpRequestTimeout,
      disable: options.disable,
      flushInterval,
      httpClient: isFetchLike(options.httpClient)
        ? new HttpClient(options.httpClient)
        : (options.httpClient ?? new HttpClient())
    };

    const publisher = new Publisher(publisherOptions, this);
    const plugin = createSegmentPlugin(publisher);
    this._publisher = publisher;

    this.ready = this.register(plugin).then(() => {});
    this.emit('initialize', options);

    // Bind all methods
    const proto = this.constructor.prototype;
    const self = this as Analytics & Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(proto)) {
      if ('constructor' !== name) {
        const descriptor = Object.getOwnPropertyDescriptor(proto, name);
        if (descriptor && 'function' === typeof descriptor.value) {
          const bound = (self[name] as (...args: unknown[]) => unknown).bind(this);
          self[name] = bound;
        }
      }
    }
  }

  get VERSION(): string {
    return ANALYTICS_VERSION;
  }

  closeAndFlush(options?: { timeout?: number }): Promise<void> {
    return this.flush({
      timeout: options?.timeout ?? this._closeAndFlushDefaultTimeout,
      close: true
    });
  }

  async flush(options?: { timeout?: number; close?: boolean }): Promise<void> {
    if (this._isFlushing) return;
    this._isFlushing = true;
    if (options?.close) this._isClosed = true;

    this._publisher.flush(this._pendingEvents);

    const drainPromise = new Promise<void>((resolve) => {
      if (this._pendingEvents) {
        this.once('drained', () => resolve());
      } else {
        resolve();
      }
    }).finally(() => {
      this._isFlushing = false;
    });

    if (options?.timeout) {
      return promiseTimeout(drainPromise, options.timeout).catch(() => {});
    }
    return drainPromise;
  }

  _dispatch(event: AnalyticsEvent, callback?: AnalyticsDispatchCallback): void {
    if (this._isClosed) {
      this.emit('call_after_close', event);
      return;
    }
    this._pendingEvents++;
    dispatchEvent(event, this._queue, this, callback)
      .catch((err) => err)
      .finally(() => {
        this._pendingEvents--;
        if (!this._pendingEvents) this.emit('drained');
      });
  }

  alias(
    params: {
      userId: string;
      previousId?: string;
      context?: AnalyticsRecord;
      timestamp?: Date;
      integrations?: AnalyticsRecord;
    },
    callback?: AnalyticsDispatchCallback
  ): void {
    const event = this._eventFactory.alias(params.userId, params.previousId ?? null, {
      context: params.context,
      integrations: params.integrations,
      timestamp: params.timestamp
    });
    this._dispatch(event, callback);
  }

  group(
    params: {
      timestamp?: Date;
      groupId: string;
      userId?: string;
      anonymousId?: string;
      traits?: AnalyticsRecord;
      context?: AnalyticsRecord;
      integrations?: AnalyticsRecord;
    },
    callback?: AnalyticsDispatchCallback
  ): void {
    const event = this._eventFactory.group(params.groupId, params.traits ?? {}, {
      context: params.context,
      anonymousId: params.anonymousId,
      userId: params.userId,
      timestamp: params.timestamp,
      integrations: params.integrations
    });
    this._dispatch(event, callback);
  }

  identify(
    params: {
      userId: string;
      anonymousId?: string;
      traits?: AnalyticsRecord;
      context?: AnalyticsRecord;
      timestamp?: Date;
      integrations?: AnalyticsRecord;
    },
    callback?: AnalyticsDispatchCallback
  ): void {
    const event = this._eventFactory.identify(params.userId, params.traits ?? {}, {
      context: params.context,
      anonymousId: params.anonymousId,
      userId: params.userId,
      timestamp: params.timestamp,
      integrations: params.integrations
    });
    this._dispatch(event, callback);
  }

  page(
    params: {
      userId?: string;
      anonymousId?: string;
      category?: string;
      name?: string;
      properties?: AnalyticsRecord;
      context?: AnalyticsRecord;
      timestamp?: Date;
      integrations?: AnalyticsRecord;
    },
    callback?: AnalyticsDispatchCallback
  ): void {
    const event = this._eventFactory.page(
      params.category ?? null,
      params.name ?? null,
      params.properties,
      {
        context: params.context,
        anonymousId: params.anonymousId,
        userId: params.userId,
        timestamp: params.timestamp,
        integrations: params.integrations
      }
    );
    this._dispatch(event, callback);
  }

  screen(
    params: {
      userId?: string;
      anonymousId?: string;
      category?: string;
      name?: string;
      properties?: AnalyticsRecord;
      context?: AnalyticsRecord;
      timestamp?: Date;
      integrations?: AnalyticsRecord;
    },
    callback?: AnalyticsDispatchCallback
  ): void {
    const event = this._eventFactory.screen(
      params.category ?? null,
      params.name ?? null,
      params.properties,
      {
        context: params.context,
        anonymousId: params.anonymousId,
        userId: params.userId,
        timestamp: params.timestamp,
        integrations: params.integrations
      }
    );
    this._dispatch(event, callback);
  }

  track(
    params: {
      userId?: string;
      anonymousId?: string;
      event: string;
      properties?: AnalyticsRecord;
      context?: AnalyticsRecord;
      timestamp?: Date;
      integrations?: AnalyticsRecord;
    },
    callback?: AnalyticsDispatchCallback
  ): void {
    const event = this._eventFactory.track(params.event, params.properties, {
      context: params.context,
      userId: params.userId,
      anonymousId: params.anonymousId,
      timestamp: params.timestamp,
      integrations: params.integrations
    });
    this._dispatch(event, callback);
  }

  async register(...plugins: AnalyticsPlugin[]): Promise<void> {
    return this._queue.criticalTasks.run(async () => {
      const ctx = NodeContext.system();
      const promises = plugins.map((plugin) => this._queue.register(ctx, plugin, this));
      await Promise.all(promises);
      this.emit(
        'register',
        plugins.map((p) => p.name)
      );
    });
  }

  async deregister(...pluginNames: string[]): Promise<void> {
    const ctx = NodeContext.system();
    const promises = pluginNames.map((name) => {
      const plugin = this._queue.plugins.find((p) => p.name === name);
      if (plugin) return this._queue.deregister(ctx, plugin, this);
      ctx.log('warn', `plugin ${name} not found`);
    });
    await Promise.all(promises);
    this.emit('deregister', pluginNames);
  }
}

// (Analytics initialization and first export block removed - duplicates of sections below)
// =============================================================================
// Section: Segment Analytics, MCP Bridge, Tool Registry, ToolExecutor, Main Logic & Exports
// Lines 6293-7317 of compiled JS
// =============================================================================

// --- State: Analytics ---
// eslint-disable-next-line prefer-const -- analyticsClient would be reassigned if analytics were enabled
let analyticsClient: Analytics | null = null;
const analyticsInitPromise: Promise<void> | null = null;
let analyticsUserId: string | null = null;

function getAnalyticsClient(): Analytics | null {
  return analyticsClient;
}

// --- Segment custom HTTP client (Pt) ---
const segmentHttpClient = async (
  url: string,
  options: RequestInit
): Promise<SegmentHttpResponse> => {
  const response = await fetch(url, options);
  return {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
    json: () => response.json(),
    text: () => response.text()
  };
};

// --- initializeAnalytics (Gt) ---
// Telemetry disabled — Segment analytics is upstream production telemetry.
// Each analytics event was triggering HTTP POSTs and keeping the service worker alive.
const initializeAnalytics = async (): Promise<void> => {
  // no-op: analytics disabled
};

// --- identifyUser (Bt) ---
const identifyUser = async (): Promise<void> => {
  const analytics = getAnalyticsClient();
  if (analytics) {
    try {
      const profile = await (async () => {
        try {
          const token = await getAccessToken();
          if (!token) return null;
          const profileUrl = `${getConfig().apiBaseUrl}/api/oauth/profile`;
          const response = await fetch(profileUrl, {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          return response.ok ? await response.json() : null;
        } catch {
          return null;
        }
      })();
      const anonymousId = await getOrCreateAnonymousId();
      const extensionVersion = chrome.runtime.getManifest().version;
      if (profile) {
        const userId = profile.account.uuid;
        analyticsUserId = userId;
        analytics.identify({
          userId,
          anonymousId,
          traits: { ...getProfileTraits(profile), extensionVersion }
        });
      } else {
        analyticsUserId = null;
      }
    } catch (_err) {
      // silently fail
    }
  }
};

// --- trackEvent ($t) --- EXPORT
export const trackEvent = async (
  eventName: string,
  properties: Record<string, unknown> = {}
): Promise<void> => {
  try {
    if (!analyticsClient) await initializeAnalytics();
    const analytics = getAnalyticsClient();
    if (!analytics) return;
    const anonymousId = await getOrCreateAnonymousId();
    const extensionVersion = chrome.runtime.getManifest().version;
    const trackData: {
      anonymousId: string;
      event: string;
      properties: Record<string, unknown>;
      userId?: string;
    } = {
      anonymousId,
      event: eventName,
      properties: { ...properties, extension_version: extensionVersion }
    };
    if (analyticsUserId) {
      trackData.userId = analyticsUserId;
    }
    analytics.track(trackData);
  } catch (_err) {
    // silently fail
  }
};

// --- Feature Flags ---
let featureFlagManager: InstanceType<typeof FeatureFlagManager> | null = null;

async function fetchFeatures(): Promise<FeatureResponse<FeatureCollection>> {
  const config = getConfig();
  const token = await getAccessToken();
  if (!token) throw new Error('No valid OAuth token available for feature fetch');
  const response = await fetch(`${config.apiBaseUrl}/api/bootstrap/features/claude_in_chrome`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  if (401 === response.status) {
    await removeStorageValues([StorageKeys.ACCESS_TOKEN, StorageKeys.TOKEN_EXPIRY]);
    throw new Error('OAuth token rejected by server (401)');
  }
  if (!response.ok) throw new Error(`Failed to fetch features: ${response.status}`);
  const responseBody: unknown = await response.json();
  if (!isFeatureResponse(responseBody)) {
    throw new Error('Feature response has unexpected shape');
  }
  return responseBody;
}

function getFeatureFlagManager(): InstanceType<typeof FeatureFlagManager> {
  if (!featureFlagManager) {
    featureFlagManager = new FeatureFlagManager({ fetchFeatures });
  }
  return featureFlagManager;
}

// --- getFeatureValue (qt) --- EXPORT
export async function getFeatureValue(featureName: string): Promise<Record<string, unknown>> {
  const manager = getFeatureFlagManager();
  await manager.initialize();
  const result =
    (await manager.getFeatureValueAsync<Record<string, unknown>>(featureName, {})) ?? {};
  const isNonEmpty =
    result &&
    typeof result === 'object' &&
    Object.keys(result).some((key) => result[key] !== undefined && result[key] !== null);
  return isNonEmpty ? result : {};
}

// --- refreshFeatures (Ft) --- EXPORT
export async function refreshFeatures(): Promise<void> {
  const manager = getFeatureFlagManager();
  await manager.refresh();
}

export { getFeatureFlagManager, initializeAnalytics, identifyUser };
