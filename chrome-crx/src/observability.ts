import * as Sentry from '@sentry/browser';
import { trace, context, SpanStatusCode, SpanKind, type Span } from '@opentelemetry/api';
import { HoneycombWebSDK } from '@honeycombio/opentelemetry-web';
import { getConfig } from './extensionServices';

export function initSentry(): void {
  const integrations = Sentry.getDefaultIntegrations({}).filter(
    (i) => !['BrowserApiErrors', 'Breadcrumbs', 'GlobalHandlers'].includes(i.name)
  );
  Sentry.init({
    dsn: 'https://60bea3ee4ef1022e4035b23ba50f44d0@o1158394.ingest.us.sentry.io/4509876992278529',
    integrations,
    initialScope: {
      tags: { extension_version: chrome.runtime.getManifest().version }
    },
    beforeSend: (event) => {
      event.contexts = {
        ...event.contexts,
        extension: {
          id: chrome.runtime.id,
          version: chrome.runtime.getManifest().version,
          environment: 'production'
        }
      };
      return event;
    }
  });
}

const SERVICE_NAME = 'superduck-browser-extension';

export async function withTracing<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  parentSpan?: Span
): Promise<T> {
  return trace
    .getTracer(SERVICE_NAME)
    .startActiveSpan(
      name,
      { kind: SpanKind.INTERNAL },
      parentSpan ? trace.setSpan(context.active(), parentSpan) : context.active(),
      async (span) => {
        try {
          const result = await fn(span);
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (error: unknown) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : String(error)
          });
          span.recordException(error instanceof Error ? error : String(error));
          throw error;
        } finally {
          span.end();
        }
      }
    );
}

export function generateTraceHeaders(_traceId?: string): {
  traceId: string;
  headers: Record<string, string>;
} {
  const hexChars = '0123456789abcdef';
  const newTraceId = Array.from(
    { length: 32 },
    () => hexChars[Math.floor(16 * Math.random())]
  ).join('');
  const spanId = Array.from({ length: 16 }, () => hexChars[Math.floor(16 * Math.random())]).join(
    ''
  );
  const headers: Record<string, string> = {
    traceparent: `00-${newTraceId}-${spanId}-01`,
    'x-cloud-trace-context': `${newTraceId}/${parseInt(spanId, 16).toString()};o=1`,
    baggage: 'forceTrace=true',
    'x-refinery-force-trace': 'true'
  };
  return { traceId: newTraceId, headers };
}

export function initHoneycomb(): void {
  const config = getConfig();
  const manifest = chrome.runtime.getManifest();
  try {
    new HoneycombWebSDK({
      debug: config.environment !== 'production',
      apiKey: 'hcaik_01k4x5jaf9v7sdymjzmxvktd6whp9x2y75jj8y5f8y7aaf1zy6aedg9858',
      serviceName: SERVICE_NAME,
      sampleRate: 1,
      resourceAttributes: {
        'extension.version': manifest.version,
        'build.type': 'external'
      },
      webVitalsInstrumentationConfig: { enabled: false }
    }).start();
  } catch {
    return;
  }
}

export { SpanStatusCode } from '@opentelemetry/api';
