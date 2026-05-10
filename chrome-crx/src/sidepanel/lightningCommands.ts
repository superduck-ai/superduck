const COMMAND_PREFIX_REGEX = /^(ST|NT|LT|DC|TC|RC|PL|C|H|T|K|S|D|Z|N|J|W)\b/;

const COMMAND_REGEXES: Record<string, RegExp> = {
  C: /^C\s+(\d+)[\s,]+(\d+)$/,
  RC: /^RC\s+(\d+)[\s,]+(\d+)$/,
  DC: /^DC\s+(\d+)[\s,]+(\d+)$/,
  TC: /^TC\s+(\d+)[\s,]+(\d+)$/,
  H: /^H\s+(\d+)[\s,]+(\d+)$/,
  T: /^T\s+([\s\S]+)$/,
  K: /^K\s+(.+)$/,
  S: /^S\s+(UP|DOWN|LEFT|RIGHT)\s+(\d+)\s+(\d+)[\s,]+(\d+)$/i,
  D: /^D\s+(\d+)[\s,]+(\d+)[\s,]+(\d+)[\s,]+(\d+)$/,
  Z: /^Z\s+(\d+)[\s,]+(\d+)[\s,]+(\d+)[\s,]+(\d+)$/,
  ST: /^ST\s+(\d+)$/,
  NT: /^NT\s+(.+)$/,
  LT: /^LT$/,
  N: /^N\s+(.+)$/,
  J: /^J\s+([\s\S]+)$/,
  W: /^W$/,
  PL: /^PL\s+([\s\S]+)$/
};

const MULTI_LINE_COMMANDS = new Set(['T', 'J', 'PL']);

export interface ParsedCommand {
  type: string;
  args: Record<string, any>;
}

export interface ParseResult {
  commands: ParsedCommand[];
  description: string;
}

function parseCommand(prefix: string, line: string): ParsedCommand | null {
  const regex = COMMAND_REGEXES[prefix];
  if (!regex) return null;
  const match = line.match(regex);
  if (!match)
    return {
      type: 'error',
      args: { text: `Malformed command: "${line}". Check the syntax and try again.` }
    };
  switch (prefix) {
    case 'C':
      return { type: 'left_click', args: { coordinate: [Number(match[1]), Number(match[2])] } };
    case 'RC':
      return { type: 'right_click', args: { coordinate: [Number(match[1]), Number(match[2])] } };
    case 'DC':
      return { type: 'double_click', args: { coordinate: [Number(match[1]), Number(match[2])] } };
    case 'TC':
      return { type: 'triple_click', args: { coordinate: [Number(match[1]), Number(match[2])] } };
    case 'H':
      return { type: 'hover', args: { coordinate: [Number(match[1]), Number(match[2])] } };
    case 'T':
      return { type: 'type', args: { text: match[1] } };
    case 'K':
      return { type: 'key', args: { text: match[1].trim() } };
    case 'S':
      return {
        type: 'scroll',
        args: {
          scroll_direction: match[1].toLowerCase(),
          scroll_amount: Number(match[2]),
          coordinate: [Number(match[3]), Number(match[4])]
        }
      };
    case 'D':
      return {
        type: 'left_click_drag',
        args: {
          start_coordinate: [Number(match[1]), Number(match[2])],
          coordinate: [Number(match[3]), Number(match[4])]
        }
      };
    case 'Z':
      return {
        type: 'zoom',
        args: { region: [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])] }
      };
    case 'ST':
      return { type: 'select_tab', args: { tabId: Number(match[1]) } };
    case 'NT':
      return { type: 'new_tab', args: { url: match[1].trim() } };
    case 'LT':
      return { type: 'list_tabs', args: {} };
    case 'N':
      return { type: 'navigate', args: { url: match[1].trim() } };
    case 'J':
      return { type: 'js', args: { text: match[1] } };
    case 'W':
      return { type: 'wait', args: {} };
    case 'PL':
      return { type: 'plan', args: { text: match[1] } };
    default:
      return null;
  }
}

export function parseCompactCommands(text: string): ParseResult {
  const lines = text
    .replace(/\n<<END>>\s*$/, '')
    .trim()
    .split('\n');
  const commands: ParsedCommand[] = [];
  const descriptionLines: string[] = [];
  let foundCommand = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) continue;

    if (/^(C|RC|DC|TC|H|S|D|Z)\b/.test(line)) {
      line = line.replace(/[()]/g, '').trim();
    }

    const prefixMatch = line.match(COMMAND_PREFIX_REGEX);
    if (!prefixMatch) {
      if (!foundCommand) descriptionLines.push(lines[i]);
      continue;
    }

    foundCommand = true;
    const prefix = prefixMatch[1];

    if (MULTI_LINE_COMMANDS.has(prefix)) {
      let accumulated = line;
      while (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (!nextLine || COMMAND_PREFIX_REGEX.test(nextLine) || nextLine === '<<END>>') break;
        accumulated += '\n' + lines[i + 1];
        i++;
      }
      line = accumulated;
    }

    const parsed = parseCommand(prefix, line);
    if (parsed) commands.push(parsed);
  }

  return { commands, description: descriptionLines.join('\n').trim() };
}

export function commandTypeToToolName(type: string): string | null {
  switch (type) {
    case 'left_click':
    case 'right_click':
    case 'double_click':
    case 'triple_click':
    case 'hover':
    case 'type':
    case 'key':
    case 'scroll':
    case 'left_click_drag':
    case 'zoom':
      return 'computer';
    case 'navigate':
    case 'new_tab':
      return 'navigate';
    case 'js':
      return 'execute_javascript';
    case 'plan':
      return 'update_plan';
    default:
      return null;
  }
}

export function getSettleTimes(commands: ParsedCommand[]): { minMs: number; maxMs: number } {
  const types = new Set(commands.map((c) => c.type));
  if (types.has('left_click')) return { minMs: 200, maxMs: 500 };
  if (types.has('js')) return { minMs: 100, maxMs: 500 };
  if (types.has('navigate') || types.has('new_tab')) return { minMs: 0, maxMs: 500 };
  if (types.has('scroll')) return { minMs: 100, maxMs: 0 };
  return { minMs: 0, maxMs: 0 };
}

export function filterSyntheticMessages(messages: any[]): any[] {
  return messages
    .filter((m: any) => !m._synthetic)
    .map((m: any) => {
      let msg = m;
      if (msg._syntheticResult) {
        msg = { ...msg };
        delete msg._syntheticResult;
      }
      if (Array.isArray(msg.content)) {
        if (msg.content.some((c: any) => c._autoScreenshot)) {
          msg = {
            ...msg,
            content: msg.content.map((c: any) => {
              if (!c._autoScreenshot) return c;
              const cleaned = { ...c };
              delete cleaned._autoScreenshot;
              return cleaned;
            })
          };
        }
      }
      return msg;
    });
}

function blockContainsImage(block: any): boolean {
  if (!block || typeof block !== 'object') return false;
  if (block.type === 'image') return true;
  if (block.type === 'tool_result' && Array.isArray(block.content)) {
    return block.content.some((nestedBlock: any) => blockContainsImage(nestedBlock));
  }
  return false;
}

function pruneImagesFromBlock(block: any): any {
  if (!block || typeof block !== 'object') return block;
  if (block.type === 'image') return null;
  if (block.type === 'tool_result' && Array.isArray(block.content)) {
    const prunedContent = block.content
      .map((nestedBlock: any) => pruneImagesFromBlock(nestedBlock))
      .filter((nestedBlock: any) => nestedBlock !== null);
    return {
      ...block,
      content: prunedContent.length > 0 ? prunedContent : ''
    };
  }
  return block;
}

export function manageScreenshotHistory(messages: any[], screenshotHistory: number): any[] {
  if (screenshotHistory === 0) return messages;

  const imageIndices: number[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (Array.isArray(msg.content) && msg.content.some((block: any) => blockContainsImage(block))) {
      imageIndices.push(i);
    }
  }

  const keepSet = new Set(imageIndices.slice(0, screenshotHistory));

  return messages
    .map((msg, idx) => {
      if (keepSet.has(idx)) return msg;
      if (Array.isArray(msg.content)) {
        const filtered = msg.content
          .map((block: any) => pruneImagesFromBlock(block))
          .filter((block: any) => block !== null);
        if (filtered.length === 0) return null;
        return { ...msg, content: filtered };
      }
      return msg;
    })
    .filter(Boolean);
}
