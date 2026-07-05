import { describe, expect, it } from 'vitest';
import {
  resolveFileUploadRefTarget,
  resolveFileUploadRefTargetSource
} from './fileUploadRefTarget';

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
  return el;
}

function withDocument(getElementById: (id: string) => MockInput | null, fn: () => void): void {
  const previous = globalThis.document;
  globalThis.document = {
    getElementById: (id: string) => {
      const node = getElementById(id);
      return node ? asElement(node) : null;
    }
  } as Document;
  try {
    fn();
  } finally {
    globalThis.document = previous;
  }
}

describe('resolveFileUploadRefTarget', () => {
  it('accepts a direct file input ref', () => {
    const input = asElement({ tagName: 'INPUT', type: 'file' });
    expect(resolveFileUploadRefTarget(input, 1)).toEqual({
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
        expect(resolveFileUploadRefTarget(label, 1)).toEqual({
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
    expect(resolveFileUploadRefTarget(label, 1)).toEqual({
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
    expect(resolveFileUploadRefTarget(button, 1)).toEqual({
      fileInput: input,
      clickTarget: button
    });
  });

  it('rejects multiple paths on a single-file input', () => {
    const input = asElement({ tagName: 'INPUT', type: 'file', multiple: false });
    expect(resolveFileUploadRefTarget(input, 2)).toMatchObject({
      error: expect.stringMatching(/does not accept multiple files/i)
    });
  });

  it('returns a clear error when no file input is found', () => {
    const div = asElement({ tagName: 'DIV' });
    expect(resolveFileUploadRefTarget(div, 1)).toMatchObject({
      error: expect.stringMatching(/No file input found/i)
    });
  });

  it('matches the injected page-script resolver source', () => {
    const input = asElement({ tagName: 'INPUT', type: 'file' });
    const resolveInPage = (
      new Function(
        `return (${resolveFileUploadRefTargetSource})`
      ) as () => typeof resolveFileUploadRefTarget
    )();
    expect(resolveInPage(input, 1)).toEqual(resolveFileUploadRefTarget(input, 1));
  });
});
