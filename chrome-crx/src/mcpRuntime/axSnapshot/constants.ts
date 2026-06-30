export const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'checkbox',
  'radio',
  'combobox',
  'listbox',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'searchbox',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'treeitem'
]);

export const CONTENT_ROLES = new Set([
  'heading',
  'cell',
  'gridcell',
  'columnheader',
  'rowheader',
  'listitem',
  'article',
  'region',
  'main',
  'navigation'
]);

export const INVISIBLE_CHARS = /\uFEFF|\u200B|\u200C|\u200D|\u2060|\u00A0/g;

export const MAX_SCAN_NODES = 3000;

export const BATCH_LINK_URLS = 20;

export const SNAPSHOT_NORMALIZE_RE =
  /,?\s*(?:ref=ref_\d+|focused(?:=(?:true|false))?|value="(?:[^"\\]|\\.)*")/g;

export const EMPTY_ATTRS_RE = / \[\]/g;
