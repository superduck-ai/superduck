import { extractAppName, trackEvent } from '../../mcpRuntime';

export function trackLightningToolCall({
  toolName,
  success,
  extra,
  sessionId,
  permissionMode,
  currentDomain,
  currentUrl
}: {
  toolName: string;
  success: boolean;
  extra?: Record<string, unknown>;
  sessionId: string | null;
  permissionMode: string;
  currentDomain: string | null;
  currentUrl: string | null;
}) {
  const props: Record<string, unknown> = {
    name: toolName,
    sessionId,
    permissions: permissionMode,
    quick_mode: true,
    success
  };
  if (currentDomain) props.domain = currentDomain;
  if (currentUrl) {
    const appName = extractAppName(currentUrl);
    if (appName) props.app = appName;
  }
  if (extra) Object.assign(props, extra);
  void trackEvent('superduck.chat.tool_called', props);
}
