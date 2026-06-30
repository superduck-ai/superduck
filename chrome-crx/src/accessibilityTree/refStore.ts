export function getOrCreateElementMap(): Record<string, WeakRef<Element>> {
  if (!window.__superduckElementMap) {
    window.__superduckElementMap = {};
  }

  return window.__superduckElementMap;
}

export function getOrCreateRefCounter(): number {
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

function createRef(elementMap: Record<string, WeakRef<Element>>, element: Element): string {
  const nextRefCounter = getOrCreateRefCounter() + 1;
  window.__superduckRefCounter = nextRefCounter;

  const refId = `ref_${nextRefCounter}`;
  elementMap[refId] = new WeakRef(element);

  return refId;
}

export function getElementRef(
  elementMap: Record<string, WeakRef<Element>>,
  element: Element
): string {
  return findExistingRef(elementMap, element) ?? createRef(elementMap, element);
}

export function cleanupDeadRefs(): void {
  const elementMap = getOrCreateElementMap();

  for (const [refId, weakRef] of Object.entries(elementMap)) {
    if (!weakRef.deref()) {
      delete elementMap[refId];
    }
  }
}
