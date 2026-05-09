type TreeFilter = "all" | "interactive" | string;

interface ViewportSize {
  width: number;
  height: number;
}

interface AccessibilityTreeResult {
  error?: string;
  pageContent: string;
  viewport: ViewportSize;
}

interface TraversalOptions {
  filter: TreeFilter;
  refId: string | null;
}

interface TreeLineContext {
  lines: string[];
  maxDepth: number;
  options: TraversalOptions;
}

declare global {
  interface Window {
    __superduckElementMap?: Record<string, WeakRef<Element>>;
    __superduckRefCounter?: number;
    __generateAccessibilityTree?: (
      filter?: TreeFilter,
      depth?: number,
      maxChars?: number,
      refId?: string | null
    ) => AccessibilityTreeResult;
  }
}

(() => {
  const EXCLUDED_TAGS = new Set([
    "script",
    "style",
    "meta",
    "link",
    "title",
    "noscript"
  ]);

  const INTERACTIVE_TAGS = new Set([
    "a",
    "button",
    "input",
    "select",
    "textarea",
    "details",
    "summary"
  ]);

  const SEMANTIC_TAGS = new Set([
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "nav",
    "main",
    "header",
    "footer",
    "section",
    "article",
    "aside"
  ]);

  const ROLE_BY_TAG: Record<string, string> = {
    a: "link",
    article: "article",
    aside: "complementary",
    button: "button",
    footer: "contentinfo",
    form: "form",
    h1: "heading",
    h2: "heading",
    h3: "heading",
    h4: "heading",
    h5: "heading",
    h6: "heading",
    header: "banner",
    img: "image",
    label: "label",
    li: "listitem",
    main: "main",
    nav: "navigation",
    ol: "list",
    section: "region",
    select: "combobox",
    table: "table",
    textarea: "textbox",
    ul: "list"
  };

  function getViewport(): ViewportSize {
    return {
      height: window.innerHeight,
      width: window.innerWidth
    };
  }

  function getElementRole(element: Element): string {
    const role = element.getAttribute("role");
    if (role) {
      return role;
    }

    const tagName = element.tagName.toLowerCase();
    if (tagName === "input") {
      const inputType = element.getAttribute("type");
      if (inputType === "submit" || inputType === "button") {
        return "button";
      }
      if (inputType === "checkbox") {
        return "checkbox";
      }
      if (inputType === "radio") {
        return "radio";
      }
      if (inputType === "file") {
        return "button";
      }
      return "textbox";
    }

    return ROLE_BY_TAG[tagName] ?? "generic";
  }

  function getDirectTextContent(element: Element): string {
    let textContent = "";

    for (let index = 0; index < element.childNodes.length; index += 1) {
      const child = element.childNodes[index];
      if (child.nodeType === Node.TEXT_NODE) {
        textContent += child.textContent ?? "";
      }
    }

    return textContent;
  }

  function getElementName(element: Element): string {
    const tagName = element.tagName.toLowerCase();

    if (tagName === "select") {
      const selectElement = element as HTMLSelectElement;
      const selectedOption =
        selectElement.querySelector("option[selected]") ||
        selectElement.options[selectElement.selectedIndex];

      if (selectedOption?.textContent) {
        return selectedOption.textContent.trim();
      }
    }

    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel?.trim()) {
      return ariaLabel.trim();
    }

    const placeholder = element.getAttribute("placeholder");
    if (placeholder?.trim()) {
      return placeholder.trim();
    }

    const title = element.getAttribute("title");
    if (title?.trim()) {
      return title.trim();
    }

    const alt = element.getAttribute("alt");
    if (alt?.trim()) {
      return alt.trim();
    }

    if (element.id) {
      const labelElement = document.querySelector<HTMLLabelElement>(
        `label[for="${element.id}"]`
      );
      if (labelElement?.textContent?.trim()) {
        return labelElement.textContent.trim();
      }
    }

    if (tagName === "input") {
      const inputElement = element as HTMLInputElement;
      const inputType = element.getAttribute("type") ?? "";
      const inputValue = element.getAttribute("value");

      if (inputType === "submit" && inputValue?.trim()) {
        return inputValue.trim();
      }

      if (inputElement.value?.length < 50 && inputElement.value.trim()) {
        return inputElement.value.trim();
      }
    }

    if (["button", "a", "summary"].includes(tagName)) {
      const directText = getDirectTextContent(element);
      if (directText.trim()) {
        return directText.trim();
      }
    }

    if (/^h[1-6]$/.test(tagName)) {
      const headingText = element.textContent;
      if (headingText?.trim()) {
        return headingText.trim().substring(0, 100);
      }
    }

    if (tagName === "img") {
      return "";
    }

    const fallbackText = getDirectTextContent(element).trim();
    if (fallbackText.length >= 3) {
      if (fallbackText.length > 100) {
        return `${fallbackText.substring(0, 100)}...`;
      }
      return fallbackText;
    }

    return "";
  }

  function isVisible(element: Element): boolean {
    const computedStyle = window.getComputedStyle(element);
    const htmlElement = element as HTMLElement;

    return (
      computedStyle.display !== "none" &&
      computedStyle.visibility !== "hidden" &&
      computedStyle.opacity !== "0" &&
      htmlElement.offsetWidth > 0 &&
      htmlElement.offsetHeight > 0
    );
  }

  function isInteractive(element: Element): boolean {
    const tagName = element.tagName.toLowerCase();

    return (
      INTERACTIVE_TAGS.has(tagName) ||
      element.getAttribute("onclick") !== null ||
      element.getAttribute("tabindex") !== null ||
      element.getAttribute("role") === "button" ||
      element.getAttribute("role") === "link" ||
      element.getAttribute("contenteditable") === "true"
    );
  }

  function isSemantic(element: Element): boolean {
    const tagName = element.tagName.toLowerCase();

    return SEMANTIC_TAGS.has(tagName) || element.getAttribute("role") !== null;
  }

  function shouldIncludeElement(
    element: Element,
    options: TraversalOptions
  ): boolean {
    const tagName = element.tagName.toLowerCase();

    if (EXCLUDED_TAGS.has(tagName)) {
      return false;
    }

    if (options.filter !== "all" && element.getAttribute("aria-hidden") === "true") {
      return false;
    }

    if (options.filter !== "all" && !isVisible(element)) {
      return false;
    }

    if (options.filter !== "all" && !options.refId) {
      const rect = element.getBoundingClientRect();
      if (
        !(
          rect.top < window.innerHeight &&
          rect.bottom > 0 &&
          rect.left < window.innerWidth &&
          rect.right > 0
        )
      ) {
        return false;
      }
    }

    if (options.filter === "interactive") {
      return isInteractive(element);
    }

    if (isInteractive(element)) {
      return true;
    }

    if (isSemantic(element)) {
      return true;
    }

    if (getElementName(element).length > 0) {
      return true;
    }

    const role = getElementRole(element);
    return role !== "generic" && role !== "image";
  }

  function getOrCreateElementMap(): Record<string, WeakRef<Element>> {
    if (!window.__superduckElementMap) {
      window.__superduckElementMap = {};
    }

    return window.__superduckElementMap;
  }

  function getOrCreateRefCounter(): number {
    if (!window.__superduckRefCounter) {
      window.__superduckRefCounter = 0;
    }

    return window.__superduckRefCounter;
  }

  function findExistingRef(
    elementMap: Record<string, WeakRef<Element>>,
    element: Element
  ): string | null {
    for (const [refId, weakRef] of Object.entries(elementMap)) {
      if (weakRef.deref() === element) {
        return refId;
      }
    }

    return null;
  }

  function createRef(
    elementMap: Record<string, WeakRef<Element>>,
    element: Element
  ): string {
    const nextRefCounter = getOrCreateRefCounter() + 1;
    window.__superduckRefCounter = nextRefCounter;

    const refId = `ref_${nextRefCounter}`;
    elementMap[refId] = new WeakRef(element);

    return refId;
  }

  function getElementRef(
    elementMap: Record<string, WeakRef<Element>>,
    element: Element
  ): string {
    return findExistingRef(elementMap, element) ?? createRef(elementMap, element);
  }

  function normalizeTextForTree(rawText: string): string {
    return rawText.replace(/\s+/g, " ").substring(0, 100).replace(/"/g, '\\"');
  }

  function appendSelectOptions(
    lines: string[],
    selectElement: HTMLSelectElement,
    depth: number
  ): void {
    for (let optionIndex = 0; optionIndex < selectElement.options.length; optionIndex += 1) {
      const optionElement = selectElement.options[optionIndex];
      let optionLine = `${" ".repeat(depth + 1)}option`;
      const optionText = optionElement.textContent?.trim() ?? "";

      if (!optionText) {
        continue;
      }

      optionLine += ` "${normalizeTextForTree(optionText)}"`;

      if (optionElement.selected) {
        optionLine += " (selected)";
      }

      if (optionElement.value && optionElement.value !== optionText) {
        optionLine += ` value="${optionElement.value.replace(/"/g, '\\"')}"`;
      }

      lines.push(optionLine);
    }
  }

  function appendElementLine(
    lines: string[],
    elementMap: Record<string, WeakRef<Element>>,
    element: Element,
    depth: number
  ): void {
    const role = getElementRole(element);
    const name = getElementName(element);
    const refId = getElementRef(elementMap, element);

    let line = `${" ".repeat(depth)}${role}`;

    if (name) {
      line += ` "${normalizeTextForTree(name)}"`;
    }

    line += ` [${refId}]`;

    const href = element.getAttribute("href");
    if (href) {
      line += ` href="${href}"`;
    }

    const type = element.getAttribute("type");
    if (type) {
      line += ` type="${type}"`;
    }

    const placeholder = element.getAttribute("placeholder");
    if (placeholder) {
      line += ` placeholder="${placeholder}"`;
    }

    lines.push(line);

    if (element.tagName.toLowerCase() === "select") {
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
      appendElementLine(context.lines, getOrCreateElementMap(), element, depth);
    }

    if (!element.children || depth >= context.maxDepth) {
      return;
    }

    const childDepth = includeCurrentElement ? depth + 1 : depth;

    for (let index = 0; index < element.children.length; index += 1) {
      buildTreeLines(element.children[index], childDepth, context);
    }
  }

  function cleanupDeadRefs(): void {
    const elementMap = getOrCreateElementMap();

    for (const [refId, weakRef] of Object.entries(elementMap)) {
      if (!weakRef.deref()) {
        delete elementMap[refId];
      }
    }
  }

  function toErrorResult(error: string): AccessibilityTreeResult {
    return {
      error,
      pageContent: "",
      viewport: getViewport()
    };
  }

  function generateAccessibilityTree(
    filter?: TreeFilter,
    depth?: number,
    maxChars?: number,
    refId?: string | null
  ): AccessibilityTreeResult {
    const lines: string[] = [];
    const maxDepth = depth != null ? depth : 15;
    const options: TraversalOptions = {
      filter: filter || "all",
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

    const pageContent = lines.join("\n");
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

  getOrCreateElementMap();
  getOrCreateRefCounter();

  window.__generateAccessibilityTree = function (
    filter?: TreeFilter,
    depth?: number,
    maxChars?: number,
    refId?: string | null
  ): AccessibilityTreeResult {
    try {
      return generateAccessibilityTree(filter, depth, maxChars, refId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Error generating accessibility tree: ${message}`, {
        cause: error
      });
    }
  };
})();

export {};
