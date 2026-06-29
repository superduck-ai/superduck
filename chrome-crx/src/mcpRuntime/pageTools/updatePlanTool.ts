import { PermissionTools } from '../domainPermissions';
import { domainCategoryCache } from '../tabState';
import type { ToolDefinition, ToolResult, ToolSchemaProperty } from '../pageToolsSupport/types';
import { type UpdatePlanToolInput, isRecord } from './types';

const updatePlanInputSchema: {
  type: 'object';
  properties: Record<string, ToolSchemaProperty>;
  required: string[];
} = {
  type: 'object',
  properties: {
    domains: {
      type: 'array',
      items: { type: 'string' },
      description:
        "List of domains you will visit (e.g., ['github.com', 'stackoverflow.com']). These domains will be approved for the session when the user accepts the plan."
    },
    approach: {
      type: 'array',
      items: { type: 'string' },
      description:
        'High-level description of what you will do. Focus on outcomes and key actions, not implementation details. Be concise - aim for 3-7 items.'
    }
  },
  required: ['domains', 'approach']
};

export const updatePlanTool: ToolDefinition<UpdatePlanToolInput> = {
  name: 'update_plan',
  description:
    'Present a plan to the user for approval before taking actions. The user will see the domains you intend to visit and your approach. Once approved, you can proceed with actions on the approved domains without additional permission prompts.',
  parameters: updatePlanInputSchema.properties,
  async execute(input, context): Promise<ToolResult> {
    const validationError = (function validatePlan(
      plan: UpdatePlanToolInput | Record<string, unknown>
    ) {
      const planData = isRecord(plan) ? plan : {};
      const domains = planData.domains;
      const approach = planData.approach;
      const errors: Record<string, string> = {};
      if (!Array.isArray(domains)) {
        errors.domains = 'Required field missing or not an array';
      }
      if (!Array.isArray(approach)) {
        errors.approach = 'Required field missing or not an array';
      }
      if (Object.keys(errors).length > 0) {
        return {
          error: {
            type: 'validation_error',
            message: "Invalid plan format. Both 'domains' and 'approach' are required arrays.",
            fields: errors
          }
        };
      }
      return null;
    })(input);

    if (validationError) return { error: JSON.stringify(validationError.error) };

    const { domains, approach } = input;

    const domainsWithCategories = await (async function categorize(domainList: string[]) {
      const results: Array<{ domain: string; category?: string }> = [];
      for (const domain of domainList) {
        try {
          const url = domain.startsWith('http') ? domain : `https://${domain}`;
          const category = await domainCategoryCache.getCategory(url);
          results.push({ domain, category });
        } catch {
          results.push({ domain });
        }
      }
      return results;
    })(domains);

    return {
      type: 'permission_required',
      tool: PermissionTools.PLAN_APPROVAL,
      url: '',
      toolUseId: context?.toolUseId,
      actionData: { plan: { domains: domainsWithCategories, approach } }
    };
  },
  setPromptsConfig(config: Record<string, unknown>) {
    if (typeof config.toolDescription === 'string') {
      this.description = config.toolDescription;
    }
    if (isRecord(config.inputPropertyDescriptions)) {
      const inputPropertyDescriptions = config.inputPropertyDescriptions;
      const props = updatePlanInputSchema.properties;
      if (typeof inputPropertyDescriptions.domains === 'string') {
        props.domains.description = inputPropertyDescriptions.domains;
      }
      if (typeof inputPropertyDescriptions.approach === 'string') {
        props.approach.description = inputPropertyDescriptions.approach;
      }
    }
  },
  toProviderSchema() {
    return {
      type: 'custom',
      name: this.name,
      description: this.description,
      input_schema: updatePlanInputSchema
    };
  }
};
