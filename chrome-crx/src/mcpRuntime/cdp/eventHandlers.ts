import { extractDomain } from './helpers';
import { addConsoleMessage } from './consoleTracking';
import { addNetworkRequest, updateNetworkRequestStatus } from './networkTracking';
import { getWindowOpenEventsByTab } from './state';
import type {
  ConsoleApiCalledParams,
  ConsoleMessage,
  ExceptionThrownParams,
  LoadingFailedParams,
  NetworkRequest,
  RequestWillBeSentParams,
  ResponseReceivedParams,
  WindowOpenEvent
} from './types';

interface PageWindowOpenParams {
  url?: string;
  windowName?: string;
  userGesture?: boolean;
}

function addWindowOpenEvent(tabId: number, event: WindowOpenEvent): void {
  const events = getWindowOpenEventsByTab().get(tabId) ?? [];
  events.push(event);
  if (events.length > 20) events.shift();
  getWindowOpenEventsByTab().set(tabId, events);
}

export function registerDebuggerEventHandlers(): void {
  if (!globalThis.__cdpDebuggerEventHandler) {
    globalThis.__cdpDebuggerEventHandler = (
      source: chrome.debugger.Debuggee,
      method: string,
      params: unknown
    ) => {
      const tabId = source.tabId;
      if (!tabId) return;

      if ('Runtime.consoleAPICalled' === method) {
        const consoleParams = params as ConsoleApiCalledParams;
        const message: ConsoleMessage = {
          type: consoleParams.type || 'log',
          text:
            consoleParams.args
              ?.map((arg) => (void 0 !== arg.value ? String(arg.value) : arg.description || ''))
              .join(' ') || '',
          timestamp: consoleParams.timestamp || Date.now(),
          url: consoleParams.stackTrace?.callFrames?.[0]?.url,
          lineNumber: consoleParams.stackTrace?.callFrames?.[0]?.lineNumber,
          columnNumber: consoleParams.stackTrace?.callFrames?.[0]?.columnNumber,
          args: consoleParams.args
        };
        const domain = extractDomain(message.url);
        addConsoleMessage(tabId, domain, message);
      } else if ('Runtime.exceptionThrown' === method) {
        const exceptionDetails = (params as ExceptionThrownParams).exceptionDetails;
        const exceptionMessage: ConsoleMessage = {
          type: 'exception',
          text:
            exceptionDetails?.exception?.description ||
            exceptionDetails?.text ||
            'Unknown exception',
          timestamp: exceptionDetails?.timestamp || Date.now(),
          url: exceptionDetails?.url,
          lineNumber: exceptionDetails?.lineNumber,
          columnNumber: exceptionDetails?.columnNumber,
          stackTrace: exceptionDetails?.stackTrace?.callFrames
            ?.map(
              (frame) =>
                `    at ${frame.functionName || '<anonymous>'} (${frame.url}:${frame.lineNumber}:${frame.columnNumber})`
            )
            .join('\n')
        };
        const domain = extractDomain(exceptionMessage.url);
        addConsoleMessage(tabId, domain, exceptionMessage);
      } else if ('Network.requestWillBeSent' === method) {
        const requestParams = params as RequestWillBeSentParams;
        const requestId = requestParams.requestId;
        const request = requestParams.request;
        const documentURL = requestParams.documentURL;
        const networkRequest: NetworkRequest = {
          requestId,
          url: request.url,
          method: request.method
        };
        const pageUrl = documentURL || request.url;
        const domain = extractDomain(pageUrl);
        addNetworkRequest(tabId, domain, networkRequest);
      } else if ('Network.responseReceived' === method) {
        const responseParams = params as ResponseReceivedParams;
        updateNetworkRequestStatus(tabId, responseParams.requestId, responseParams.response.status);
      } else if ('Network.loadingFailed' === method) {
        const requestId = (params as LoadingFailedParams).requestId;
        updateNetworkRequestStatus(tabId, requestId, 503);
      } else if ('Page.windowOpen' === method) {
        const windowOpenParams = params as PageWindowOpenParams;
        if (windowOpenParams.url) {
          addWindowOpenEvent(tabId, {
            url: windowOpenParams.url,
            timestamp: Date.now(),
            windowName: windowOpenParams.windowName,
            userGesture: windowOpenParams.userGesture
          });
        }
      }
    };
    chrome.debugger.onEvent.addListener(globalThis.__cdpDebuggerEventHandler);
  }
}
