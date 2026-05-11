import React, { useEffect, useImperativeHandle, forwardRef } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder, { type PlaceholderOptions } from '@tiptap/extension-placeholder';
import { Node, mergeAttributes, type JSONContent } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { ReactRenderer } from '@tiptap/react';
import Suggestion, { SuggestionOptions } from '@tiptap/suggestion';
import tippy, { Instance as TippyInstance } from 'tippy.js';
import './RichTextInput.css';

const SHORTCUT_CHIP_FLASH_CLASS = 'shortcut-chip-flash';

function triggerShortcutChipFlash(element: HTMLElement | null) {
  if (!element) return;
  element.classList.remove(SHORTCUT_CHIP_FLASH_CLASS);
  void element.offsetWidth;
  element.classList.add(SHORTCUT_CHIP_FLASH_CLASS);
}

// ShortcutChip 自定义节点
const ShortcutChip = Node.create({
  name: 'shortcutChip',

  group: 'inline',

  inline: true,

  atom: true,

  addAttributes() {
    return {
      command: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-command'),
        renderHTML: (attributes) => {
          return {
            'data-command': attributes.command
          };
        }
      },
      label: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-label'),
        renderHTML: (attributes) => {
          return {
            'data-label': attributes.label
          };
        }
      }
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="shortcut-chip"]'
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const displayLabel =
      HTMLAttributes['data-label'] || HTMLAttributes.label || HTMLAttributes['data-command'];
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'shortcut-chip',
        class: 'shortcut-chip'
      }),
      `/${displayLabel}`
    ];
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('span');
      dom.setAttribute('data-type', 'shortcut-chip');
      dom.setAttribute('data-command', node.attrs.command);
      dom.setAttribute('data-label', node.attrs.label || node.attrs.command);
      dom.className = 'shortcut-chip';
      dom.textContent = `/${node.attrs.label || node.attrs.command}`;

      const handleMouseDown = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();

        const pos = typeof getPos === 'function' ? getPos() : null;
        if (typeof pos !== 'number') return;

        const { state, dispatch } = editor.view;
        dispatch(state.tr.setSelection(NodeSelection.create(state.doc, pos)));
        editor.view.focus();
        triggerShortcutChipFlash(dom);
      };

      const handleAnimationEnd = () => {
        requestAnimationFrame(() => {
          dom.classList.remove(SHORTCUT_CHIP_FLASH_CLASS);
        });
      };

      dom.addEventListener('mousedown', handleMouseDown);
      dom.addEventListener('animationend', handleAnimationEnd);

      return {
        dom,
        selectNode: () => {
          triggerShortcutChipFlash(dom);
        },
        deselectNode: () => {
          dom.classList.remove(SHORTCUT_CHIP_FLASH_CLASS);
        },
        stopEvent: (event) => event.type === 'mousedown',
        destroy: () => {
          dom.removeEventListener('mousedown', handleMouseDown);
          dom.removeEventListener('animationend', handleAnimationEnd);
        }
      };
    };
  }
});

export interface RichTextInputHandle {
  focus: () => void;
  clear: () => void;
  insertShortcut: (command: string, label?: string) => void;
  hasShortcutChips: () => boolean;
  getContent: () => string;
  setContent: (content: string) => void;
}

interface RichTextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
  onCommandTrigger?: (query: string) => void;
  onCommandExit?: () => void;
}

export const RichTextInput = forwardRef<RichTextInputHandle, RichTextInputProps>(
  ({ value, onChange, onSubmit, placeholder, disabled, onCommandTrigger, onCommandExit }, ref) => {
    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          // 禁用不需要的功能
          blockquote: false,
          codeBlock: false,
          heading: false,
          horizontalRule: false,
          listItem: false,
          orderedList: false,
          bulletList: false
        }),
        Placeholder.configure({
          placeholder: placeholder || ''
        }),
        ShortcutChip
      ],
      content: value,
      editorProps: {
        attributes: {
          class:
            'w-full resize-none focus:outline-none focus:ring-0 focus:border-transparent text-text-100 overflow-y-auto text-sm max-w-none bg-transparent',
          style: 'min-height: 24px; max-height: 50vh; outline: none;'
        },
        handleKeyDown: (view, event) => {
          // Enter 提交（不按 Shift）
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            onSubmit();
            return true;
          }
          return false;
        }
      },
      onUpdate: ({ editor }) => {
        // 获取纯文本内容，但保留 shortcut chips
        const content = getEditorContent(editor);
        onChange(content);
      },
      editable: !disabled
    });

    // 暴露方法给父组件
    useImperativeHandle(
      ref,
      () => ({
        focus: () => {
          editor?.commands.focus();
        },
        clear: () => {
          editor?.commands.clearContent();
        },
        insertShortcut: (command: string, label?: string) => {
          editor
            ?.chain()
            .focus()
            .insertContent({
              type: 'shortcutChip',
              attrs: { command, label: label || command }
            })
            .insertContent(' ')
            .run(); // 插入芯片后添加空格

          requestAnimationFrame(() => {
            const chips = editor?.view.dom.querySelectorAll<HTMLElement>('[data-type="shortcut-chip"]');
            const insertedChip = chips?.[chips.length - 1] ?? null;
            triggerShortcutChipFlash(insertedChip);
          });
        },
        hasShortcutChips: () => {
          return !!editor?.view.dom.querySelector('[data-type="shortcut-chip"]');
        },
        getContent: () => {
          return getEditorContent(editor);
        },
        setContent: (content: string) => {
          editor?.commands.setContent(content);
        }
      }),
      [editor]
    );

    // 同步外部 value 变化
    useEffect(() => {
      if (editor && value !== getEditorContent(editor)) {
        editor.commands.setContent(value);
      }
    }, [value, editor]);

    // 同步 placeholder 变化（语言切换时更新）
    useEffect(() => {
      if (editor) {
        const placeholderExt = editor.extensionManager.extensions.find(
          (ext) => ext.name === 'placeholder'
        );
        if (placeholderExt) {
          const placeholderOptions = placeholderExt.options as PlaceholderOptions;
          placeholderOptions.placeholder = placeholder || '';
          editor.view.dispatch(editor.state.tr);
        }
      }
    }, [placeholder, editor]);

    return <EditorContent editor={editor} />;
  }
);

RichTextInput.displayName = 'RichTextInput';

// 辅助函数：从编辑器获取内容（保留 /command 格式）
function getEditorContent(editor: Editor | null): string {
  if (!editor) return '';

  const json = editor.getJSON();
  let text = '';

  function traverse(node: JSONContent) {
    if (node.type === 'shortcutChip') {
      const command = node.attrs?.command;
      if (typeof command === 'string') {
        text += `/${command}`;
      }
    } else if (node.type === 'text' && typeof node.text === 'string') {
      text += node.text;
    } else if (Array.isArray(node.content)) {
      node.content.forEach(traverse);
    }

    // 段落之间添加换行
    if (node.type === 'paragraph' && text && !text.endsWith('\n')) {
      text += '\n';
    }
  }

  traverse(json);
  return text.trim();
}
