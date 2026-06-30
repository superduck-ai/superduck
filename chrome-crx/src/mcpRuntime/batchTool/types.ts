import type { ToolResult } from '../pageToolsSupport/types';

export interface BatchAction {
  tool: string;
  input: Record<string, unknown>;
  id?: string;
  waitAfter?: 'auto' | 'load' | 'none';
}

export interface BatchToolParams {
  actions: BatchAction[];
  tabId?: number;
  onError?: 'stop' | 'continue';
  resultMode?: 'summary' | 'detailed';
  screenshot?: 'last' | 'none';
}

export interface BatchStepResult {
  index: number;
  id?: string;
  tool: string;
  ok: boolean;
  output?: string;
  error?: string;
  errorCode?: string;
  tabContext?: ToolResult['tabContext'];
  imageId?: string;
  stoppedReason?: string;
  permission?: {
    tool?: string;
    url?: string;
  };
}

export interface BatchValidationError {
  error: string;
  errorCode: string;
}
