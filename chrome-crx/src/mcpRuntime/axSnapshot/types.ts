export interface AXValue {
  type: string;
  value?: string | number | boolean;
}

export interface AXProperty {
  name: string;
  value: AXValue;
}

export interface AXNode {
  nodeId: string | number;
  role?: AXValue;
  name?: AXValue;
  value?: AXValue;
  properties?: AXProperty[];
  childIds?: (string | number)[];
  backendDOMNodeId?: number;
  ignored?: boolean;
}

export interface DomNodeTree {
  nodeName?: string;
  nodeType?: number;
  nodeId?: number;
  backendNodeId?: number;
  children?: DomNodeTree[];
  contentDocument?: DomNodeTree;
}

export interface TreeNode {
  role: string;
  name: string;
  level: number | null;
  checked: string | null;
  expanded: boolean | null;
  selected: boolean | null;
  disabled: boolean | null;
  required: boolean | null;
  valueText: string | null;
  backendNodeId: number | null;
  children: number[];
  parentIdx: number | null;
  hasRef: boolean;
  refId: string | null;
  depth: number;
  cursorInteractive: boolean;
  url: string | null;
}

export interface SnapshotOptions {
  filter?: 'all' | 'interactive';
  compact?: boolean;
  depth?: number;
  maxChars?: number;
  startRef?: number;
  selector?: string;
  urls?: boolean;
}

export interface RefMapping {
  refId: string;
  backendNodeId: number;
  role: string;
  name: string;
  nth: number | null;
  isCursorInteractive: boolean;
  interactiveOnly: boolean;
}

export class SnapshotMaxCharsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotMaxCharsError';
  }
}

export interface SnapshotResult {
  content: string;
  refMappings: RefMapping[];
}

export interface HiddenInputInfo {
  type: 'radio' | 'checkbox';
  checked: boolean;
}
