export enum PermissionActionType {
  NAVIGATE = 'navigate',
  READ_PAGE_CONTENT = 'read_page_content',
  READ_CONSOLE_MESSAGES = 'read_console_messages',
  READ_NETWORK_REQUESTS = 'read_network_requests',
  CLICK = 'click',
  TYPE = 'type',
  UPLOAD_IMAGE = 'upload_image',
  DOMAIN_TRANSITION = 'domain_transition',
  PLAN_APPROVAL = 'plan_approval',
  EXECUTE_JAVASCRIPT = 'execute_javascript',
  REMOTE_MCP = 'remote_mcp'
}

export enum PermissionAction {
  ALLOW = 'allow',
  DENY = 'deny'
}

export enum PermissionDuration {
  ONCE = 'once',
  ALWAYS = 'always'
}

export function getPermissionActionText(action: PermissionActionType): string | undefined {
  const map: Record<string, string> = {
    [PermissionActionType.NAVIGATE]: 'navigate to',
    [PermissionActionType.READ_PAGE_CONTENT]: 'read page content on',
    [PermissionActionType.READ_CONSOLE_MESSAGES]: 'read debugging information on',
    [PermissionActionType.READ_NETWORK_REQUESTS]: 'read debugging information on',
    [PermissionActionType.CLICK]: 'click on',
    [PermissionActionType.TYPE]: 'type text into',
    [PermissionActionType.UPLOAD_IMAGE]: 'upload an image to',
    [PermissionActionType.DOMAIN_TRANSITION]: 'navigate from',
    [PermissionActionType.PLAN_APPROVAL]: 'approve plan for',
    [PermissionActionType.EXECUTE_JAVASCRIPT]: 'execute JavaScript on',
    [PermissionActionType.REMOTE_MCP]: 'access'
  };
  return map[action];
}

export const PERMISSION_MODES = ['follow_a_plan', 'skip_all_permission_checks'];
export const FOLLOW_A_PLAN = 'follow_a_plan';
