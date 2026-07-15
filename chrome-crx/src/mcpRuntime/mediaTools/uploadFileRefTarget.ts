export type UploadFileRefTargetResult =
  | { error: string }
  | { fileInput: HTMLInputElement; clickTarget: Element };

export type UploadFileRefMarkResult = {
  error?: string;
  success?: boolean;
  separateClickTarget?: boolean;
};

/**
 * Resolve a file input and its click target from a ref element.
 *
 * Canonical implementation for extension-context code paths and tests.
 * The page-injected helpers below each carry an inlined copy of this logic
 * (as a nested function) because chrome.scripting.executeScript serializes
 * the function and strips module closures — they cannot import this, and
 * rebuilding it via `new Function` is blocked by page CSP (unsafe-eval).
 * The equivalence test asserts the inlined copies match this one.
 */
export function resolveUploadFileRefTarget(
  element: Element,
  pathCount: number
): UploadFileRefTargetResult {
  return resolveFileInputTarget(element, pathCount);
}

/**
 * Pure resolver, shared shape used by the canonical impl and exposed for the
 * equivalence test. Page-injected helpers inline an equivalent nested fn.
 */
function resolveFileInputTarget(element: Element, pathCount: number): UploadFileRefTargetResult {
  let fileInput: HTMLInputElement | undefined;
  let clickTarget: Element | undefined;

  if (element.tagName === 'INPUT') {
    const input = element as HTMLInputElement;
    if (input.type === 'file') {
      fileInput = input;
      clickTarget = element;
    } else {
      return {
        error: `Element is not a file input. Found: <input type="${input.type || 'text'}">`
      };
    }
  } else if (element.tagName === 'LABEL') {
    const label = element as HTMLLabelElement;
    const control = label.control;
    if (control && control.tagName === 'INPUT' && (control as HTMLInputElement).type === 'file') {
      fileInput = control as HTMLInputElement;
      clickTarget = label;
    } else {
      const htmlFor = label.getAttribute('for');
      if (htmlFor) {
        const linked = document.getElementById(htmlFor);
        if (linked && linked.tagName === 'INPUT' && (linked as HTMLInputElement).type === 'file') {
          fileInput = linked as HTMLInputElement;
          clickTarget = label;
        }
      }
    }
    if (!fileInput) {
      const nestedInLabel = label.querySelectorAll('input[type="file"]');
      if (nestedInLabel.length === 1) {
        fileInput = nestedInLabel[0] as HTMLInputElement;
        clickTarget = label;
      } else if (nestedInLabel.length > 1) {
        return {
          error: `Element contains ${nestedInLabel.length} file inputs; ref must target a single file input`
        };
      }
    }
  } else {
    const nested = element.querySelectorAll('input[type="file"]');
    if (nested.length === 1) {
      fileInput = nested[0] as HTMLInputElement;
      clickTarget = element;
    } else if (nested.length > 1) {
      return {
        error: `Element contains ${nested.length} file inputs; ref must target a single file input`
      };
    }
  }

  if (!fileInput || !clickTarget) {
    const tag = element.tagName.toLowerCase();
    const typeAttr =
      element.tagName === 'INPUT' && (element as HTMLInputElement).type
        ? ` type="${(element as HTMLInputElement).type}"`
        : '';
    return { error: `No file input found for ref. Found: <${tag}${typeAttr}>` };
  }

  if (pathCount > 1 && !fileInput.multiple) {
    return {
      error: `File input does not accept multiple files but ${pathCount} paths were provided`
    };
  }

  return { fileInput, clickTarget };
}

/** Test-only export so the equivalence test can drive the shared resolver. */
export const __resolveFileInputTargetForTest = resolveFileInputTarget;

/**
 * Injected via chrome.scripting.executeScript. MUST be self-contained: no
 * imports, no module closures, no eval. The resolver is a nested function
 * (nested fn definitions survive serialization; only module refs are dropped).
 */
export function markUploadFileRefInPage(
  refId: string,
  uploadAttr: string,
  clickAttr: string,
  pathCount: number
): UploadFileRefMarkResult {
  function resolveAndMark(element: Element, count: number): UploadFileRefMarkResult {
    let fileInput: HTMLInputElement | undefined;
    let clickTarget: Element | undefined;

    if (element.tagName === 'INPUT') {
      const input = element as HTMLInputElement;
      if (input.type === 'file') {
        fileInput = input;
        clickTarget = element;
      } else {
        return {
          error: `Element is not a file input. Found: <input type="${input.type || 'text'}">`
        };
      }
    } else if (element.tagName === 'LABEL') {
      const label = element as HTMLLabelElement;
      const control = label.control;
      if (control && control.tagName === 'INPUT' && (control as HTMLInputElement).type === 'file') {
        fileInput = control as HTMLInputElement;
        clickTarget = label;
      } else {
        const htmlFor = label.getAttribute('for');
        if (htmlFor) {
          const linked = document.getElementById(htmlFor);
          if (
            linked &&
            linked.tagName === 'INPUT' &&
            (linked as HTMLInputElement).type === 'file'
          ) {
            fileInput = linked as HTMLInputElement;
            clickTarget = label;
          }
        }
      }
      if (!fileInput) {
        const nestedInLabel = label.querySelectorAll('input[type="file"]');
        if (nestedInLabel.length === 1) {
          fileInput = nestedInLabel[0] as HTMLInputElement;
          clickTarget = label;
        } else if (nestedInLabel.length > 1) {
          return {
            error: `Element contains ${nestedInLabel.length} file inputs; ref must target a single file input`
          };
        }
      }
    } else {
      const nested = element.querySelectorAll('input[type="file"]');
      if (nested.length === 1) {
        fileInput = nested[0] as HTMLInputElement;
        clickTarget = element;
      } else if (nested.length > 1) {
        return {
          error: `Element contains ${nested.length} file inputs; ref must target a single file input`
        };
      }
    }

    if (!fileInput || !clickTarget) {
      const tag = element.tagName.toLowerCase();
      const typeAttr =
        element.tagName === 'INPUT' && (element as HTMLInputElement).type
          ? ` type="${(element as HTMLInputElement).type}"`
          : '';
      return { error: `No file input found for ref. Found: <${tag}${typeAttr}>` };
    }

    if (count > 1 && !fileInput.multiple) {
      return {
        error: `File input does not accept multiple files but ${count} paths were provided`
      };
    }

    fileInput.setAttribute(uploadAttr, '1');
    const separateClickTarget = clickTarget !== fileInput;
    if (separateClickTarget) clickTarget.setAttribute(clickAttr, '1');
    return { success: true, separateClickTarget };
  }

  const pageWindow = window as Window & {
    __superduckElementMap?: Record<string, WeakRef<Element>>;
  };
  const elementMap = pageWindow.__superduckElementMap;
  if (!elementMap?.[refId]) {
    return { error: `Element ref not found: "${refId}". The element may have been removed.` };
  }
  const element = elementMap[refId].deref();
  if (!element) {
    delete elementMap[refId];
    return { error: `Element has been garbage collected: "${refId}"` };
  }
  if (!document.contains(element)) {
    delete elementMap[refId];
    return { error: `Element is no longer in the document: "${refId}"` };
  }

  return resolveAndMark(element, pathCount);
}

/**
 * Injected via chrome.scripting.executeScript. MUST be self-contained.
 * Walks up the DOM from the hit element to find the nearest file input.
 */
export function markUploadFileAtCoordinateInPage(
  x: number,
  y: number,
  uploadAttr: string,
  clickAttr: string,
  pathCount: number
): UploadFileRefMarkResult {
  function resolveAndMark(element: Element, count: number): UploadFileRefMarkResult {
    let fileInput: HTMLInputElement | undefined;
    let clickTarget: Element | undefined;

    if (element.tagName === 'INPUT') {
      const input = element as HTMLInputElement;
      if (input.type === 'file') {
        fileInput = input;
        clickTarget = element;
      } else {
        return {
          error: `Element is not a file input. Found: <input type="${input.type || 'text'}">`
        };
      }
    } else if (element.tagName === 'LABEL') {
      const label = element as HTMLLabelElement;
      const control = label.control;
      if (control && control.tagName === 'INPUT' && (control as HTMLInputElement).type === 'file') {
        fileInput = control as HTMLInputElement;
        clickTarget = label;
      } else {
        const htmlFor = label.getAttribute('for');
        if (htmlFor) {
          const linked = document.getElementById(htmlFor);
          if (
            linked &&
            linked.tagName === 'INPUT' &&
            (linked as HTMLInputElement).type === 'file'
          ) {
            fileInput = linked as HTMLInputElement;
            clickTarget = label;
          }
        }
      }
      if (!fileInput) {
        const nestedInLabel = label.querySelectorAll('input[type="file"]');
        if (nestedInLabel.length === 1) {
          fileInput = nestedInLabel[0] as HTMLInputElement;
          clickTarget = label;
        } else if (nestedInLabel.length > 1) {
          return {
            error: `Element contains ${nestedInLabel.length} file inputs; ref must target a single file input`
          };
        }
      }
    } else {
      const nested = element.querySelectorAll('input[type="file"]');
      if (nested.length === 1) {
        fileInput = nested[0] as HTMLInputElement;
        clickTarget = element;
      } else if (nested.length > 1) {
        return {
          error: `Element contains ${nested.length} file inputs; ref must target a single file input`
        };
      }
    }

    if (!fileInput || !clickTarget) {
      const tag = element.tagName.toLowerCase();
      const typeAttr =
        element.tagName === 'INPUT' && (element as HTMLInputElement).type
          ? ` type="${(element as HTMLInputElement).type}"`
          : '';
      return { error: `No file input found for ref. Found: <${tag}${typeAttr}>` };
    }

    if (count > 1 && !fileInput.multiple) {
      return {
        error: `File input does not accept multiple files but ${count} paths were provided`
      };
    }

    fileInput.setAttribute(uploadAttr, '1');
    const separateClickTarget = clickTarget !== fileInput;
    if (separateClickTarget) clickTarget.setAttribute(clickAttr, '1');
    return { success: true, separateClickTarget };
  }

  function isSuperduckOverlay(el: Element): boolean {
    return (
      el.id === 'superduck-agent-overlay-root' ||
      el.id === 'superduck-agent-blocking-overlay' ||
      !!el.closest('#superduck-agent-overlay-root')
    );
  }

  const docX = x + window.scrollX;
  const docY = y + window.scrollY;
  window.scrollTo({
    left: Math.max(0, docX - window.innerWidth / 2),
    top: Math.max(0, docY - window.innerHeight / 2),
    behavior: 'instant'
  });
  const pointX = docX - window.scrollX;
  const pointY = docY - window.scrollY;

  let hit: Element | null = null;
  for (const el of document.elementsFromPoint(pointX, pointY)) {
    if (isSuperduckOverlay(el)) continue;
    if (el === document.body || el === document.documentElement) continue;
    hit = el;
    break;
  }
  if (!hit) {
    return { error: `No element at coordinates (${x}, ${y})` };
  }

  let current: Element | null = hit;
  while (current) {
    const result = resolveAndMark(current, pathCount);
    if (result.success) return result;
    if (result.error && !/No file input found/i.test(result.error)) {
      return result;
    }
    current = current.parentElement;
  }

  return { error: `No file input found near coordinates (${x}, ${y})` };
}
