import type { ModelInvoker } from '../session';

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

export interface WorkflowStep {
  action: 'click' | 'type' | 'navigate' | 'create_tab' | 'narration';
  selector?: string;
  value?: string;
  screenshot?: string;
  description: string;
  url: string;
  tabId?: number;
  elementText?: string;
  elementAttributes?: Record<string, string>;
  timestamp: number;
  viewportDimensions?: { width: number; height: number };
  clickPosition?: { x: number; y: number };
  isEnhancing?: boolean;
  speechTranscript?: string;
  isPending?: boolean;
}

export interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  steps: WorkflowStep[];
  startTime: number | null;
}

export interface ElementInfo {
  tagName: string;
  text?: string;
  attributes?: Record<string, string>;
  selector: string;
  boundingRect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface CapturedEvent {
  type: string;
  element: ElementInfo;
  url: string;
  tabId: number;
  timestamp: number;
  clickCoordinates?: { x: number; y: number };
  viewportWidth?: number;
  viewportHeight?: number;
  typedText?: string;
  typedInElement?: ElementInfo;
}

export interface KeystrokeUpdate {
  type: 'KEYSTROKE_UPDATE';
  text: string;
  element: ElementInfo;
  isFinal: boolean;
}

export interface UseWorkflowRecordingProps {
  tabId: number;
  onComplete?: (steps: WorkflowStep[]) => void;
  createMessage?: ModelInvoker;
}
