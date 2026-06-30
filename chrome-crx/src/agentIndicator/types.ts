export interface RuntimeMessage {
  type:
    | 'SHOW_AGENT_INDICATORS'
    | 'HIDE_AGENT_INDICATORS'
    | 'HIDE_FOR_TOOL_USE'
    | 'SHOW_AFTER_TOOL_USE'
    | 'SHOW_STATIC_INDICATOR'
    | 'HIDE_STATIC_INDICATOR'
    | 'STATIC_INDICATOR_HEARTBEAT'
    | 'STOP_AGENT'
    | 'SWITCH_TO_MAIN_TAB'
    | 'DISMISS_STATIC_INDICATOR_FOR_GROUP'
    | 'ANIMATE_CURSOR_TO'
    | 'CONTENT_PING';
  isMcp?: boolean;
  fromTabId?: string;
  x?: number;
  y?: number;
  action?: string;
}

export interface MessageResponse {
  success: boolean;
}
