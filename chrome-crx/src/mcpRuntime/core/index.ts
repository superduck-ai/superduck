import { extractAppName, formatTabsOutput, normalizeUrl } from './urlUtils';
import { promptManager } from './promptManager';
import { categoryChecker } from '../tabState';
import {
  cdpDebugger,
  computerTool,
  javascriptTool,
  navigateTool,
  updatePlanTool,
  toolsToProviderSchema,
  shouldShowPlanMode,
  getPlanModeSystemReminder,
  filterAndApproveDomains,
  filterDomainsByCategory
} from '../browserAutomation';
import { getFeatureValue, refreshFeatures, trackEvent, initializeAnalytics } from '../analytics';
import {
  isAgentActive,
  setOnAgentBecameIdle,
  restoreActiveToolCountFromStorage
} from '../agentActivity';
import {
  getTabRelationship,
  isBlockedCategory,
  detectDomainTransition,
  getCategoryAndUpdateBlocklist,
  getBlockedPageUrl,
  createDomainTransitionPermission
} from '../domainPermissions';
import {
  migrateGroupFinalizationState,
  restoreActiveToolContextsFromStorage,
  resetMcpState
} from '../toolExecution/toolContextState';
import { allTools } from './tools';
import { createErrorResponse } from '../toolExecution/toolExecutor';
import { executeTool } from '../toolExecution/toolExecution';
import {
  connectBridge,
  reconnectMcp,
  isBridgeConnected,
  sendMcpNotificationViaBridge
} from '../bridge';
import '../navigationGuard';
import { coerceToolInput } from './utils';
import type { ToolProviderSchema } from '../pageToolsSupport/types';

export const initializeExtensionPermissions = initializeAnalytics;

function getToolSchemasForMcp(): Promise<ToolProviderSchema[]> {
  return toolsToProviderSchema(allTools);
}

export {
  cdpDebugger,
  connectBridge,
  reconnectMcp,
  isBridgeConnected,
  sendMcpNotificationViaBridge,
  updatePlanTool,
  coerceToolInput,
  createErrorResponse,
  executeTool,
  getToolSchemasForMcp,
  getFeatureValue,
  getTabRelationship,
  getCategoryAndUpdateBlocklist,
  isBlockedCategory,
  getBlockedPageUrl,
  detectDomainTransition,
  createDomainTransitionPermission,
  categoryChecker,
  initializeAnalytics,
  refreshFeatures,
  formatTabsOutput,
  extractAppName,
  normalizeUrl,
  promptManager,
  navigateTool,
  computerTool,
  shouldShowPlanMode,
  getPlanModeSystemReminder,
  filterAndApproveDomains,
  filterDomainsByCategory,
  javascriptTool,
  trackEvent,
  isAgentActive,
  setOnAgentBecameIdle,
  restoreActiveToolCountFromStorage,
  migrateGroupFinalizationState,
  restoreActiveToolContextsFromStorage,
  resetMcpState
};
