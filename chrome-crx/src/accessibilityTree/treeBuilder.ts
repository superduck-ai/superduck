import { cleanupDeadRefs, getElementRef, getOrCreateElementMap } from './refStore';
import {
  getElementName,
  getElementRole,
  getViewport,
  isSensitiveField,
  normalizeTextForTree,
  shouldIncludeElement
} from './elementUtils';
import type {
  AccessibilityTreeResult,
  TreeFilter,
  TreeLineContext,
  TraversalOptions
} from './types';

function appendSelectOptions(
  lines: string[],
  selectElement: HTMLSelectElement,
  depth: number
): void {
  for (let optionIndex = 0; optionIndex < selectElement.options.length; optionIndex += 1) {
    const optionElement = selectElement.options[optionIndex];
    let optionLine = `${' '.repeat(depth + 1)}option`;
    const optionText = optionElement.textContent?.trim() ?? '';

    if (!optionText) {
      continue;
    }

    optionLine += ` "${normalizeTextForTree(optionText)}"`;

    if (optionElement.selected) {
      optionLine += ' (selected)';
    }

    if (optionElement.value && optionElement.value !== optionText) {
      optionLine += ` value="${optionElement.value.replace(/"/g, '\\"')}"`;
    }

    lines.push(optionLine);
  }
}

function escapeAttrValue(value: string): string {
  return value.replace(/"/g, '\\"').replace(/\s+/g, ' ');
}

function appendElementLine(lines: string[], element: Element, depth: number): void {
  const role = getElementRole(element);
  const name = getElementName(element);
  const refId = getElementRef(getOrCreateElementMap(), element);
  const sensitive = isSensitiveField(element);

  let line = `${' '.repeat(depth)}${role}`;

  if (name) {
    line += ` "${normalizeTextForTree(name)}"`;
  }

  line += ` [${refId}]`;

  if (sensitive) {
    line += ' [sensitive]';
  }

  const href = element.getAttribute('href');
  if (href) {
    line += ` href="${escapeAttrValue(href)}"`;
  }

  const type = element.getAttribute('type');
  if (type) {
    line += ` type="${escapeAttrValue(type)}"`;
  }

  if (!sensitive) {
    const placeholder = element.getAttribute('placeholder');
    if (placeholder) {
      line += ` placeholder="${escapeAttrValue(placeholder)}"`;
    }
  }

  lines.push(line);

  if (element.tagName.toLowerCase() === 'select') {
    appendSelectOptions(lines, element as HTMLSelectElement, depth);
  }
}

function buildTreeLines(element: Element, depth: number, context: TreeLineContext): void {
  if (depth > context.maxDepth || !element.tagName) {
    return;
  }

  const includeCurrentElement =
    shouldIncludeElement(element, context.options) ||
    (context.options.refId !== null && depth === 0);

  if (includeCurrentElement) {
    appendElementLine(context.lines, element, depth);
  }

  if (!element.children || depth >= context.maxDepth) {
    return;
  }

  const childDepth = includeCurrentElement ? depth + 1 : depth;

  for (let index = 0; index < element.children.length; index += 1) {
    buildTreeLines(element.children[index], childDepth, context);
  }
}

function toErrorResult(error: string): AccessibilityTreeResult {
  return {
    error,
    pageContent: '',
    viewport: getViewport()
  };
}

export function generateAccessibilityTree(
  filter?: TreeFilter,
  depth?: number,
  maxChars?: number,
  refId?: string | null
): AccessibilityTreeResult {
  const lines: string[] = [];
  const maxDepth = depth != null ? depth : 15;
  const options: TraversalOptions = {
    filter: filter || 'all',
    refId: refId ?? null
  };

  if (options.refId) {
    const elementMap = getOrCreateElementMap();
    const weakRef = elementMap[options.refId];

    if (!weakRef) {
      return toErrorResult(
        `Element with ref_id '${options.refId}' not found. It may have been removed from the page. Use read_page without ref_id to get the current page state.`
      );
    }

    const element = weakRef.deref();
    if (!element) {
      return toErrorResult(
        `Element with ref_id '${options.refId}' no longer exists. It may have been removed from the page. Use read_page without ref_id to get the current page state.`
      );
    }

    buildTreeLines(element, 0, { lines, maxDepth, options });
  } else if (document.body) {
    buildTreeLines(document.body, 0, { lines, maxDepth, options });
  }

  cleanupDeadRefs();

  const pageContent = lines.join('\n');
  if (maxChars != null && pageContent.length > maxChars) {
    const prefix = `Output exceeds ${maxChars} character limit (${pageContent.length} characters). `;

    if (options.refId) {
      return toErrorResult(
        `${prefix}The specified element has too much content. Try specifying a smaller depth parameter or focus on a more specific child element.`
      );
    }

    if (depth !== undefined) {
      return toErrorResult(
        `${prefix}Try specifying an even smaller depth parameter or use ref_id to focus on a specific element.`
      );
    }

    return toErrorResult(
      `${prefix}Try specifying a depth parameter (e.g., depth: 5) or use ref_id to focus on a specific element from the page.`
    );
  }

  return {
    pageContent,
    viewport: getViewport()
  };
}
