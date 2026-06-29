import type { SnapshotOptions, TreeNode } from './types';
import { stripInvisibleChars } from './treeBuilder';

export function renderTree(
  treeNodes: TreeNode[],
  rootIndices: number[],
  options: SnapshotOptions
): string {
  let output = '';

  for (const rootIdx of rootIndices) {
    output += renderNode(treeNodes, rootIdx, 0, options);
  }

  return output;
}

function renderNode(
  treeNodes: TreeNode[],
  idx: number,
  indent: number,
  options: SnapshotOptions
): string {
  const node = treeNodes[idx];

  const passthrough = () => {
    let out = '';
    for (const childIdx of node.children) {
      out += renderNode(treeNodes, childIdx, indent, options);
    }
    return out;
  };

  if (!node.role) return passthrough();
  if (node.role === 'StaticText' && !stripInvisibleChars(node.name)) return passthrough();
  if (node.role === 'generic' && !node.hasRef && node.children.length <= 1) return passthrough();
  if (node.role === 'RootWebArea' || node.role === 'WebArea') return passthrough();

  if (options.depth !== undefined && indent > options.depth) {
    return '';
  }

  if (options.filter === 'interactive' && !node.hasRef) return passthrough();

  const prefix = '  '.repeat(indent);
  let line = `${prefix}- ${node.role}`;

  const displayName = stripInvisibleChars(node.name);
  if (displayName) {
    const escaped = JSON.stringify(displayName);
    line += ` ${escaped}`;
  }

  const attrs: string[] = [];
  if (node.level !== null) attrs.push(`level=${node.level}`);
  if (node.checked !== null) attrs.push(`checked=${node.checked}`);
  if (node.expanded !== null) attrs.push(`expanded=${node.expanded}`);
  if (node.selected === true) attrs.push('selected');
  if (node.disabled === true) attrs.push('disabled');
  if (node.required === true) attrs.push('required');
  if (node.refId) attrs.push(`ref=${node.refId}`);
  if (node.url) attrs.push(`url=${node.url}`);
  if (attrs.length > 0) line += ` [${attrs.join(', ')}]`;

  if (node.valueText && node.valueText !== node.name) {
    line += `: ${node.valueText}`;
  }

  let output = line + '\n';

  for (const childIdx of node.children) {
    output += renderNode(treeNodes, childIdx, indent + 1, options);
  }

  return output;
}

export function compactTree(tree: string, interactive: boolean): string {
  const lines = tree.split('\n').filter((l) => l.length > 0);
  if (lines.length === 0) return '';

  const keep = new Array(lines.length).fill(false);

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('ref=') || lines[i].includes(': ')) {
      keep[i] = true;
      const myIndent = countIndent(lines[i]);
      for (let j = i - 1; j >= 0; j--) {
        const ancestorIndent = countIndent(lines[j]);
        if (ancestorIndent < myIndent) {
          keep[j] = true;
          if (ancestorIndent === 0) break;
        }
      }
    }
  }

  const result = lines.filter((_, i) => keep[i]).join('\n');

  if (!result.trim() && interactive) {
    return '(no interactive elements)';
  }

  return result;
}

function countIndent(line: string): number {
  const trimmed = line.trimStart();
  return (line.length - trimmed.length) / 2;
}
