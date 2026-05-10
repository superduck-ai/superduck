import { domainCategoryCache } from '../tabState';
import type { ToolDefinition } from './types';

export function formatTabsContext(
  tabs: any[],
  tabGroupId?: number,
  selectedTabId?: number
): string {
  const result: Record<string, any> = {
    availableTabs: tabs.map((tab: any) => ({
      tabId: tab.id,
      title: tab.title,
      url: tab.url
    }))
  };
  if (void 0 !== selectedTabId) result.selectedTabId = selectedTabId;
  if (void 0 !== tabGroupId) result.tabGroupId = tabGroupId;
  return JSON.stringify(result);
}

export function shouldShowPlanMode(mode: string, hasPlan: boolean): boolean {
  return 'follow_a_plan' === mode && !hasPlan;
}

export function getPlanModeSystemReminder(): string {
  return '<system-reminder>You are in planning mode. Before executing any tools, you must first present a plan to the user using the update_plan tool. The plan should include: domains (list of domains you will visit) and approach (high-level steps you will take).</system-reminder>';
}

export async function filterDomainsByCategory(domains: string[]): Promise<{
  approved: string[];
  filtered: string[];
}> {
  const approved: string[] = [];
  const filtered: string[] = [];
  for (const domain of domains) {
    try {
      const url = domain.startsWith('http') ? domain : `https://${domain}`;
      const category = await domainCategoryCache.getCategory(url);
      if (
        !category ||
        ('category1' !== category &&
          'category2' !== category &&
          'category_org_blocked' !== category)
      ) {
        approved.push(domain);
      } else {
        filtered.push(domain);
      }
    } catch {
      approved.push(domain);
    }
  }
  return { approved, filtered };
}

export async function filterAndApproveDomains(
  domains: string[],
  permissionManager: any
): Promise<string[]> {
  if (!domains || 0 === domains.length) return [];
  const { approved, filtered } = await filterDomainsByCategory(domains);
  filtered.length; // side effect from original (logging removed by minifier)
  permissionManager.setTurnApprovedDomains(approved);
  return approved;
}

export const toolsToProviderSchema = async (
  tools: ToolDefinition[],
  context?: any
): Promise<any[]> => {
  return await Promise.all(tools.map((tool) => tool.toProviderSchema(context)));
};

export const coerceToolInputTypes = (
  toolName: string,
  input: any,
  toolDefinitions: ToolDefinition[]
): any => {
  const toolDef = toolDefinitions.find((t) => t.name === toolName);
  if (!toolDef || !toolDef.parameters || 'object' !== typeof input || !input) return input;
  const coerced = { ...input };
  for (const [paramName, paramDef] of Object.entries(toolDef.parameters)) {
    if (paramName in coerced && paramDef && 'object' === typeof paramDef) {
      const value = coerced[paramName];
      const typeDef = paramDef as any;
      if ('number' === typeDef.type && 'string' === typeof value) {
        const num = Number(value);
        if (!isNaN(num)) coerced[paramName] = num;
      } else if ('boolean' === typeDef.type && 'string' === typeof value) {
        coerced[paramName] = 'true' === value;
      }
    }
  }
  return coerced;
};

export const parseArrayInput = (value: any, _context?: any): any[] => {
  if (Array.isArray(value)) return value;
  if ('string' === typeof value) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};
