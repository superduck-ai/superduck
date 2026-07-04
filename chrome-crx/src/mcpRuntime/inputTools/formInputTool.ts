import { PermissionTools, checkUrlSecurity } from '../domainPermissions';
import { tabGroupManager } from '../tabState';
import { cdpDebugger } from '../cdp';
import { getRefBackendNodeId } from '../screenshot/refBridge';
import type { ToolContext, ToolDefinition, ToolResult } from '../pageTools';
import {
  type FormInputValue,
  type FormInputToolParams,
  type FormInputScriptResult,
  isFormInputScriptResult
} from './types';
import { execWithStaleRecovery } from './frameUtils';

// =============================================================================
// Tool: form_input (Ee)
// =============================================================================
export const formInputTool: ToolDefinition<FormInputToolParams> = {
  name: 'form_input',
  description:
    "Set values in form elements using element reference ID from the read_page or find tools. If you don't have a valid tab ID, use tabs_context first to get available tabs.",
  parameters: {
    ref: {
      type: 'string',
      description: 'Element reference ID from the read_page or find tools (e.g., "ref_1", "ref_2")'
    },
    value: {
      type: ['string', 'boolean', 'number'],
      description:
        'The value to set. For checkboxes use boolean, for selects use option value or text, for other inputs use appropriate string/number'
    },
    tabId: {
      type: 'number',
      description:
        "Tab ID to set form value in. Must be a tab in the current group. Use tabs_context first if you don't have a valid tab ID."
    }
  },
  execute: async (input: FormInputToolParams, context: ToolContext): Promise<ToolResult> => {
    try {
      const params = input;
      if (!params?.ref) throw new Error('ref parameter is required');
      if (void 0 === params.value || null === params.value)
        throw new Error('Value parameter is required');
      if (!context?.tabId) throw new Error('No active tab found');

      const effectiveTabId = await tabGroupManager.getEffectiveTabIdForContext(
        params.tabId,
        context.tabId,
        { sessionId: context.browserSessionScope?.sessionId }
      );
      const tab = await chrome.tabs.get(effectiveTabId);
      if (!tab.id) throw new Error('Active tab has no ID');
      const activeTabId = tab.id;
      const tabUrl = tab.url;
      if (!tabUrl) throw new Error('No URL available for active tab');

      const toolUseId = context?.toolUseId;
      const permissionResult = await context.permissionManager.checkPermission(tabUrl, toolUseId);
      if (!permissionResult.allowed) {
        if (permissionResult.needsPrompt) {
          return {
            type: 'permission_required',
            tool: PermissionTools.TYPE,
            url: tabUrl,
            toolUseId,
            actionData: { ref: params.ref, value: params.value }
          };
        }
        return { error: 'Permission denied for form input on this domain' };
      }

      const originalUrl = tab.url;
      if (!originalUrl) return { error: 'Unable to get original URL for security check' };

      const securityCheck = await checkUrlSecurity(activeTabId, originalUrl, 'form input action');
      if (securityCheck) return securityCheck;

      const formInputScript = (ref: string, value: FormInputValue): FormInputScriptResult => {
        try {
          let element: Element | null = null;
          if (window.__superduckElementMap?.[ref]) {
            element = window.__superduckElementMap[ref].deref() || null;
            if (!element || !document.contains(element)) {
              delete window.__superduckElementMap[ref];
              element = null;
            }
          }
          if (!element)
            return {
              error: `No element found with reference: "${ref}". The element may have been removed from the page.`
            };

          element.scrollIntoView({ behavior: 'smooth', block: 'center' });

          // Native setter 绕过 React/Vue 受控组件的 value 劫持
          const nativeInputSetter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            'value'
          )?.set;
          const nativeTextareaSetter = Object.getOwnPropertyDescriptor(
            HTMLTextAreaElement.prototype,
            'value'
          )?.set;
          const setNativeValue = (el: HTMLInputElement | HTMLTextAreaElement, val: string) => {
            const setter =
              el instanceof HTMLTextAreaElement ? nativeTextareaSetter : nativeInputSetter;
            if (setter) setter.call(el, val);
            else el.value = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          };

          if (element instanceof HTMLSelectElement) {
            const prevValue = element.value;
            const options = Array.from(element.options);
            let found = false;
            const strValue = String(value);
            for (let i = 0; i < options.length; i++) {
              if (options[i].value === strValue || options[i].text === strValue) {
                element.selectedIndex = i;
                found = true;
                break;
              }
            }
            if (!found) {
              return {
                error: `Option "${strValue}" not found. Available options: ${options.map((o) => `"${o.text}" (value: "${o.value}")`).join(', ')}`
              };
            }
            element.focus();
            element.dispatchEvent(new Event('change', { bubbles: true }));
            element.dispatchEvent(new Event('input', { bubbles: true }));
            return {
              output: `Selected option "${strValue}" in dropdown (previous: "${prevValue}")`
            };
          }

          if (element instanceof HTMLInputElement && 'checkbox' === element.type) {
            const prevChecked = element.checked;
            if ('boolean' !== typeof value)
              return { error: 'Checkbox requires a boolean value (true/false)' };
            element.checked = value;
            element.focus();
            element.dispatchEvent(new Event('change', { bubbles: true }));
            element.dispatchEvent(new Event('input', { bubbles: true }));
            return {
              output: `Checkbox ${element.checked ? 'checked' : 'unchecked'} (previous: ${prevChecked})`
            };
          }

          if (element instanceof HTMLInputElement && 'radio' === element.type) {
            const prevChecked = element.checked;
            const groupName = element.name;
            element.checked = true;
            element.focus();
            element.dispatchEvent(new Event('change', { bubbles: true }));
            element.dispatchEvent(new Event('input', { bubbles: true }));
            return {
              success: true,
              action: 'form_input',
              ref,
              element_type: 'radio',
              previous_value: prevChecked,
              new_value: element.checked,
              message: 'Radio button selected' + (groupName ? ` in group "${groupName}"` : '')
            };
          }

          if (
            element instanceof HTMLInputElement &&
            ('date' === element.type ||
              'time' === element.type ||
              'datetime-local' === element.type ||
              'month' === element.type ||
              'week' === element.type)
          ) {
            const prevValue = element.value;
            setNativeValue(element, String(value));
            element.focus();
            return {
              output: `Set ${element.type} to "${element.value}" (previous: ${prevValue})`
            };
          }

          if (element instanceof HTMLInputElement && 'range' === element.type) {
            const prevValue = element.value;
            const numValue = Number(value);
            if (isNaN(numValue)) return { error: 'Range input requires a numeric value' };
            setNativeValue(element, String(numValue));
            element.focus();
            return {
              success: true,
              action: 'form_input',
              ref,
              element_type: 'range',
              previous_value: prevValue,
              new_value: element.value,
              message: `Set range to ${element.value} (min: ${element.min}, max: ${element.max})`
            };
          }

          if (element instanceof HTMLInputElement && 'number' === element.type) {
            const prevValue = element.value;
            const numValue = Number(value);
            if (isNaN(numValue) && '' !== value)
              return { error: 'Number input requires a numeric value' };
            setNativeValue(element, String(value));
            element.focus();
            return {
              output: `Set number input to ${element.value} (previous: ${prevValue})`
            };
          }

          if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
            const prevValue = element.value;
            setNativeValue(element, String(value));
            element.focus();
            if (
              element instanceof HTMLTextAreaElement ||
              (element instanceof HTMLInputElement &&
                ['text', 'search', 'url', 'tel', 'password'].includes(element.type))
            ) {
              element.setSelectionRange(element.value.length, element.value.length);
            }
            return {
              output: `Set ${element instanceof HTMLTextAreaElement ? 'textarea' : (element as HTMLInputElement).type || 'text'} value to "${element.value}" (previous: "${prevValue}")`
            };
          }

          // file input: 标记为需要 CDP 处理
          if (element instanceof HTMLInputElement && 'file' === element.type) {
            return {
              success: true,
              action: 'file_input_needs_cdp',
              ref,
              element_type: 'file'
            };
          }

          // contentEditable: 清空后标记为需要 CDP Input.insertText
          if (element instanceof HTMLElement && element.isContentEditable) {
            const prevValue = element.textContent || '';
            element.focus();
            document.execCommand('selectAll', false, undefined);
            document.execCommand('delete', false, undefined);
            return {
              success: true,
              action: 'contenteditable_needs_cdp',
              ref,
              element_type: 'contenteditable',
              previous_value: prevValue,
              new_value: String(value)
            };
          }

          return {
            error: `Element type "${element.tagName}" is not a supported form input`
          };
        } catch (err) {
          return {
            error: `Error setting form value: ${err instanceof Error ? err.message : 'Unknown error'}`
          };
        }
      };

      const formResult = await execWithStaleRecovery<
        FormInputScriptResult,
        [string, FormInputValue]
      >(
        activeTabId,
        params.ref,
        formInputScript,
        [params.ref, params.value],
        isFormInputScriptResult
      );

      if (!formResult) throw new Error('Failed to execute form input');

      // CDP 后处理: contentEditable 和 file input 需要 CDP 命令
      if (formResult.action === 'contenteditable_needs_cdp') {
        try {
          await cdpDebugger.sendCommand(activeTabId, 'Input.insertText', {
            text: String(params.value)
          });
          formResult.output = `Set contentEditable to "${String(params.value).substring(0, 50)}${String(params.value).length > 50 ? '...' : ''}" (previous: "${formResult.previous_value}")`;
          formResult.action = 'form_input';
        } catch (cdpErr) {
          return {
            error: `Failed to insert text into contentEditable: ${cdpErr instanceof Error ? cdpErr.message : 'Unknown error'}`
          };
        }
      } else if (formResult.action === 'file_input_needs_cdp') {
        try {
          const backendNodeId = getRefBackendNodeId(activeTabId, params.ref);
          if (backendNodeId === null) return { error: 'Cannot resolve element for file upload' };
          const files = Array.isArray(params.value)
            ? params.value.map(String)
            : [String(params.value)];
          await cdpDebugger.sendCommand(activeTabId, 'DOM.setFileInputFiles', {
            files,
            backendNodeId
          });
          formResult.output = `Uploaded file(s): ${files.join(', ')}`;
          formResult.action = 'form_input';
        } catch (cdpErr) {
          return {
            error: `Failed to upload file: ${cdpErr instanceof Error ? cdpErr.message : 'Unknown error'}`
          };
        }
      }

      const validTabs = await tabGroupManager.getValidTabsWithMetadata(context.tabId);
      return {
        ...formResult,
        tabContext: {
          currentTabId: context.tabId,
          executedOnTabId: effectiveTabId,
          availableTabs: validTabs,
          tabCount: validTabs.length
        }
      };
    } catch (err) {
      return {
        error: `Failed to execute form input: ${err instanceof Error ? err.message : 'Unknown error'}`
      };
    }
  },
  toProviderSchema: async () => ({
    name: 'form_input',
    description:
      "Set values in form elements using element reference ID from the read_page tool. If you don't have a valid tab ID, use tabs_context first to get available tabs.",
    input_schema: {
      type: 'object',
      properties: {
        ref: {
          type: 'string',
          description: 'Element reference ID from the read_page tool (e.g., "ref_1", "ref_2")'
        },
        value: {
          type: ['string', 'boolean', 'number'],
          description:
            'The value to set. For checkboxes use boolean, for selects use option value or text, for other inputs use appropriate string/number'
        },
        tabId: {
          type: 'number',
          description:
            "Tab ID to set form value in. Must be a tab in the current group. Use tabs_context first if you don't have a valid tab ID."
        }
      },
      required: ['ref', 'value', 'tabId']
    }
  })
};
