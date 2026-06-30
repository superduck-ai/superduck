export function parseModifierKeys(modifierString: string): string[] {
  const parts = modifierString.toLowerCase().split('+');
  const validModifiers = [
    'ctrl',
    'control',
    'alt',
    'shift',
    'cmd',
    'meta',
    'command',
    'win',
    'windows'
  ];
  return parts.filter((part) => validModifiers.includes(part.trim()));
}

export function computeModifiersBitmask(modifiers: string[]): number {
  const modifierMap: Record<string, number> = {
    alt: 1,
    ctrl: 2,
    control: 2,
    meta: 4,
    cmd: 4,
    command: 4,
    win: 4,
    windows: 4,
    shift: 8
  };
  let bitmask = 0;
  for (const mod of modifiers) {
    bitmask |= modifierMap[mod] || 0;
  }
  return bitmask;
}
