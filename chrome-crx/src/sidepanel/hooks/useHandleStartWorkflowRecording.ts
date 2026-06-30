import { useCallback } from 'react';
import { trackEvent } from '../../mcpRuntime';

export interface UseHandleStartWorkflowRecordingProps {
  setShowWorkflowModeSelectionModal: (value: boolean) => void;
  startRecording: (autoStart?: boolean) => Promise<void>;
}

/**
 * useHandleStartWorkflowRecording — 开始工作流录制
 * 关闭模式选择并启动录制
 */
export function useHandleStartWorkflowRecording({
  setShowWorkflowModeSelectionModal,
  startRecording
}: UseHandleStartWorkflowRecordingProps) {
  return useCallback(async () => {
    setShowWorkflowModeSelectionModal(false);
    void trackEvent('superduck.sidebar.workflow_record_started', {});
    await startRecording(true);
  }, [setShowWorkflowModeSelectionModal, startRecording]);
}
