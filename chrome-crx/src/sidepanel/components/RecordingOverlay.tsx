import { useUIStore } from '../stores/uiStore';
import { WorkflowRecordingInterface } from '../workflowRecording/WorkflowRecordingInterface';
import type { WorkflowStep } from '../workflowRecording/WorkflowStepsList';
import type { useWorkflowRecording } from '../workflowRecording/useWorkflowRecording';

type RecordingState = ReturnType<typeof useWorkflowRecording>['recordingState'];

export interface RecordingOverlayProps {
  recordingState: RecordingState;
  isSpeechRecording: boolean;
  isSpeechSupported: boolean;
  hasSpeechPermission: boolean;
  currentInterimTranscript: string;
  onStop: () => void;
  onTogglePause: () => void;
  onToggleSpeech: () => void;
  onRemoveStep: (index: number) => void;
  onUpdateStep: (index: number, step: any) => void;
  onSave: (steps: WorkflowStep[], summary: string, workflowTitle?: string) => void;
  createMessage: (request: any) => Promise<any>;
  currentUrl: string;
  pageTitle: string;
}

/**
 * RecordingOverlay — 工作流录制界面浮层
 * 从 uiStore 读取 isGeneratingSummary 状态
 */
export function RecordingOverlay({
  recordingState,
  isSpeechRecording,
  isSpeechSupported,
  hasSpeechPermission,
  currentInterimTranscript,
  onStop,
  onTogglePause,
  onToggleSpeech,
  onRemoveStep,
  onUpdateStep,
  onSave,
  createMessage,
  currentUrl,
  pageTitle
}: RecordingOverlayProps) {
  const isGeneratingSummary = useUIStore((s) => s.isGeneratingSummary);
  const setIsGeneratingSummary = useUIStore((s) => s.setIsGeneratingSummary);

  if (!recordingState.isRecording) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-[5]">
      <WorkflowRecordingInterface
        recordingState={recordingState}
        isSpeechRecording={isSpeechRecording}
        isSpeechSupported={isSpeechSupported}
        hasSpeechPermission={hasSpeechPermission}
        currentInterimTranscript={currentInterimTranscript}
        onStop={onStop}
        onTogglePause={onTogglePause}
        onToggleSpeech={onToggleSpeech}
        onRemoveStep={onRemoveStep}
        onUpdateStep={onUpdateStep}
        onSave={onSave}
        createMessage={createMessage}
        isGeneratingSummary={isGeneratingSummary}
        setIsGeneratingSummary={setIsGeneratingSummary}
        currentUrl={currentUrl}
        pageTitle={pageTitle}
      />
    </div>
  );
}
