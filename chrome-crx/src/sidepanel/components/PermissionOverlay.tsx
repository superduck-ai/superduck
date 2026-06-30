import { usePermissionStore } from '../stores/permissionStore';
import { InlinePermissionPrompt } from '@/sidepanel/components/PermissionPrompt';
import type { PermissionMode } from '../sidepanelUtils';
import type { PermissionPromptData, PermissionGrantScope } from '../types';
import { PermissionDuration } from '../../extensionServices';

export interface PermissionOverlayProps {
  handlePermissionAllow: (
    duration: PermissionDuration,
    scope: PermissionGrantScope
  ) => Promise<void>;
  handlePermissionDeny: () => void;
  permissionMode: PermissionMode;
}

/**
 * PermissionOverlay — 权限请求浮层
 * 从 permissionStore 直接读取 permissionPrompt 状态
 */
export function PermissionOverlay({
  handlePermissionAllow,
  handlePermissionDeny,
  permissionMode
}: PermissionOverlayProps) {
  const permissionPrompt = usePermissionStore((s) => s.permissionPrompt);

  if (!permissionPrompt) {
    return null;
  }

  return (
    <div className="absolute bottom-0 left-0 right-0 z-[10]">
      <div className="mx-auto max-w-3xl md:px-2">
        <div className="mx-3 md:mx-0 border border-border-300 rounded-[14px] shadow-[0_4px_20px_0_rgba(0,0,0,0.04)] bg-bg-100">
          <InlinePermissionPrompt
            prompt={permissionPrompt as PermissionPromptData}
            onAllow={handlePermissionAllow}
            onDeny={handlePermissionDeny}
            disableAlwaysAllow={permissionMode === 'follow_a_plan'}
          />
        </div>
        <div className="bg-bg-100 h-3" />
      </div>
    </div>
  );
}
