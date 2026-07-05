export type FileUploadRefTargetResult =
  | { error: string }
  | { fileInput: HTMLInputElement; clickTarget: Element };

export function resolveFileUploadRefTarget(
  element: Element,
  pathCount: number
): FileUploadRefTargetResult {
  let fileInput: HTMLInputElement | undefined;
  let clickTarget: Element | undefined;

  if ('INPUT' === element.tagName) {
    const input = element as HTMLInputElement;
    if ('file' === input.type) {
      fileInput = input;
      clickTarget = element;
    } else {
      return {
        error: `Element is not a file input. Found: <input type="${input.type || 'text'}">`
      };
    }
  } else if ('LABEL' === element.tagName) {
    const label = element as HTMLLabelElement;
    const control = label.control;
    if (control && 'INPUT' === control.tagName && 'file' === (control as HTMLInputElement).type) {
      fileInput = control as HTMLInputElement;
      clickTarget = label;
    } else {
      const htmlFor = label.getAttribute('for');
      if (htmlFor) {
        const linked = document.getElementById(htmlFor);
        if (linked && 'INPUT' === linked.tagName && 'file' === (linked as HTMLInputElement).type) {
          fileInput = linked as HTMLInputElement;
          clickTarget = label;
        }
      }
    }
    if (!fileInput) {
      const nestedInLabel = label.querySelectorAll('input[type="file"]');
      if (1 === nestedInLabel.length) {
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
    if (1 === nested.length) {
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
      'INPUT' === element.tagName && (element as HTMLInputElement).type
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
