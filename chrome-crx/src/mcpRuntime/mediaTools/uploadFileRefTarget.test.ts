import { describe, expect, it } from 'vitest';
import {
  markUploadFileAtCoordinateInPage,
  markUploadFileRefInPage,
  resolveUploadFileRefTarget,
  resolveUploadFileRefTargetSource
} from './uploadFileRefTarget';

type MockInput = {
  tagName: string;
  type?: string;
  multiple?: boolean;
  id?: string;
  htmlFor?: string;
  control?: MockInput | null;
  children?: MockInput[];
  getElementById?: (id: string) => MockInput | null;
};

function asElement(node: MockInput): Element {
  const el = node as unknown as Element & MockInput;
  el.querySelectorAll = (selector: string) => {
    if ('input[type="file"]' !== selector) return [] as unknown as NodeListOf<Element>;
    const found: Element[] = [];
    const walk = (current: MockInput) => {
      for (const child of current.children ?? []) {
        if ('INPUT' === child.tagName && 'file' === child.type) {
          found.push(asElement(child));
        }
        walk(child);
      }
    };
    walk(node);
    return found as unknown as NodeListOf<Element>;
  };
  if ('LABEL' === node.tagName) {
    el.getAttribute = (name: string) => ('for' === name ? (node.htmlFor ?? null) : null);
    if (node.control) {
      Object.defineProperty(el, 'control', {
        get: () => asElement(node.control!)
      });
    } else if (node.children?.length === 1 && 'INPUT' === node.children[0].tagName) {
      Object.defineProperty(el, 'control', {
        get: () => asElement(node.children![0])
      });
    } else {
      Object.defineProperty(el, 'control', { get: () => null });
    }
  }
  if (node.id) (el as unknown as { id: string }).id = node.id;
  if (undefined !== node.multiple) {
    Object.defineProperty(el, 'multiple', { value: node.multiple });
  }
  if ('INPUT' === node.tagName && node.type) {
    Object.defineProperty(el, 'type', { value: node.type });
  }
  el.setAttribute = (name: string, value: string) => {
    (el as unknown as Record<string, string>)[name] = value;
  };
  el.closest = () => null;
  if ('LABEL' !== node.tagName) {
    el.getAttribute = (name: string) => (el as unknown as Record<string, string>)[name] ?? null;
  }
  return el;
}

function withDocument(getElementById: (id: string) => MockInput | null, fn: () => void): void {
  const previous = globalThis.document;
  globalThis.document = {
    getElementById: (id: string) => {
      const node = getElementById(id);
      return node ? asElement(node) : null;
    },
    contains: () => true
  } as unknown as Document;
  try {
    fn();
  } finally {
    globalThis.document = previous;
  }
}

function withElementMap(refId: string, element: Element, fn: () => void): void {
  const previousWindow = globalThis.window;
  (globalThis as unknown as { window: Window }).window = {
    __superduckElementMap: { [refId]: new WeakRef(element) }
  } as unknown as Window & { __superduckElementMap: Record<string, WeakRef<Element>> };
  const previousDocument = globalThis.document;
  globalThis.document = {
    ...previousDocument,
    contains: () => true
  } as unknown as Document;
  try {
    fn();
  } finally {
    (globalThis as unknown as { window: Window }).window = previousWindow;
    globalThis.document = previousDocument;
  }
}

describe('resolveUploadFileRefTarget', () => {
  it('accepts a direct file input ref', () => {
    const input = asElement({ tagName: 'INPUT', type: 'file' });
    expect(resolveUploadFileRefTarget(input, 1)).toEqual({
      fileInput: input,
      clickTarget: input
    });
  });

  it('retargets label[for] to the linked file input and clicks the label', () => {
    const inputNode: MockInput = { tagName: 'INPUT', type: 'file', id: 'linked-input' };
    const labelNode: MockInput = { tagName: 'LABEL', htmlFor: 'linked-input' };
    withDocument(
      (id) => ('linked-input' === id ? inputNode : null),
      () => {
        const label = asElement(labelNode);
        const input = asElement(inputNode);
        expect(resolveUploadFileRefTarget(label, 1)).toEqual({
          fileInput: input,
          clickTarget: label
        });
      }
    );
  });

  it('retargets label wrapping a nested file input', () => {
    const inputNode: MockInput = { tagName: 'INPUT', type: 'file' };
    const label = asElement({
      tagName: 'LABEL',
      children: [inputNode]
    });
    const input = asElement(inputNode);
    expect(resolveUploadFileRefTarget(label, 1)).toEqual({
      fileInput: input,
      clickTarget: label
    });
  });

  it('retargets button containing a single nested file input', () => {
    const inputNode: MockInput = { tagName: 'INPUT', type: 'file' };
    const button = asElement({
      tagName: 'BUTTON',
      children: [inputNode]
    });
    const input = asElement(inputNode);
    expect(resolveUploadFileRefTarget(button, 1)).toEqual({
      fileInput: input,
      clickTarget: button
    });
  });

  it('rejects multiple paths on a single-file input', () => {
    const input = asElement({ tagName: 'INPUT', type: 'file', multiple: false });
    expect(resolveUploadFileRefTarget(input, 2)).toMatchObject({
      error: expect.stringMatching(/does not accept multiple files/i)
    });
  });

  it('returns a clear error when no file input is found', () => {
    const div = asElement({ tagName: 'DIV' });
    expect(resolveUploadFileRefTarget(div, 1)).toMatchObject({
      error: expect.stringMatching(/No file input found/i)
    });
  });

  // Regression guard: the page-injected helpers rebuild this function from its
  // serialized source. If the source ever fails to round-trip (e.g. captures a
  // module closure, or a refactor breaks .toString()), the page path silently
  // diverges. This asserts the rebuilt function matches the original across
  // every input shape we care about.
  it('round-trips through its serialized source for every input shape', () => {
    const rebuilt = (
      new Function(
        `return (${resolveUploadFileRefTargetSource})`
      ) as () => typeof resolveUploadFileRefTarget
    )();

    const cases: { name: string; build: () => Element; count: number }[] = [
      {
        name: 'direct file input',
        build: () => asElement({ tagName: 'INPUT', type: 'file' }),
        count: 1
      },
      {
        name: 'non-file input',
        build: () => asElement({ tagName: 'INPUT', type: 'text' }),
        count: 1
      },
      {
        name: 'button wrapping input',
        build: () =>
          asElement({ tagName: 'BUTTON', children: [{ tagName: 'INPUT', type: 'file' }] }),
        count: 1
      },
      { name: 'div without input', build: () => asElement({ tagName: 'DIV' }), count: 1 },
      {
        name: 'single-file input, multiple paths',
        build: () => asElement({ tagName: 'INPUT', type: 'file', multiple: false }),
        count: 2
      }
    ];

    for (const c of cases) {
      const original = resolveUploadFileRefTarget(c.build(), c.count);
      const rebuiltResult = rebuilt(c.build(), c.count);
      // Compare the result shape, not element identity (each build() yields a new mock).
      if ('error' in original) {
        expect(rebuiltResult).toMatchObject({ error: original.error });
      } else {
        expect(rebuiltResult).not.toHaveProperty('error');
      }
    }
  });
});

describe('markUploadFileRefInPage', () => {
  it('marks a direct file input ref for CDP selectors', () => {
    const input = asElement({ tagName: 'INPUT', type: 'file' });
    withElementMap('ref_1', input, () => {
      const result = markUploadFileRefInPage(
        'ref_1',
        'data-upload',
        'data-click',
        1,
        resolveUploadFileRefTargetSource
      );
      expect(result).toEqual({ success: true, separateClickTarget: false });
      expect(input.getAttribute('data-upload')).toBe('1');
    });
  });

  it('matches resolveUploadFileRefTarget for the same element', () => {
    const input = asElement({ tagName: 'INPUT', type: 'file' });
    withElementMap('ref_1', input, () => {
      markUploadFileRefInPage(
        'ref_1',
        'data-upload',
        'data-click',
        1,
        resolveUploadFileRefTargetSource
      );
      const resolved = resolveUploadFileRefTarget(input, 1);
      expect(resolved).toEqual({ fileInput: input, clickTarget: input });
    });
  });
});

describe('markUploadFileAtCoordinateInPage', () => {
  it('marks a label wrapping a file input at the given coordinate', () => {
    const inputNode: MockInput = { tagName: 'INPUT', type: 'file' };
    const label = asElement({
      tagName: 'LABEL',
      children: [inputNode]
    });
    const input = asElement(inputNode);
    const previousDocument = globalThis.document;
    const previousWindow = globalThis.window;
    globalThis.window = {
      scrollX: 0,
      scrollY: 800,
      innerWidth: 1280,
      innerHeight: 800,
      scrollTo: () => undefined
    } as unknown as Window & typeof globalThis;
    globalThis.document = {
      elementFromPoint: () => label,
      elementsFromPoint: () => [label],
      getElementById: () => null
    } as unknown as Document;
    try {
      const result = markUploadFileAtCoordinateInPage(
        10,
        1046,
        'data-upload',
        'data-click',
        1,
        resolveUploadFileRefTargetSource
      );
      expect(result).toEqual({ success: true, separateClickTarget: true });
      expect(input.getAttribute('data-upload')).toBe('1');
      expect((label as unknown as Record<string, string>)['data-click']).toBe('1');
    } finally {
      globalThis.document = previousDocument;
      globalThis.window = previousWindow;
    }
  });
});
