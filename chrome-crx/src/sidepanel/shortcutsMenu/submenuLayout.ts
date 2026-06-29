import {
  SUBMENU_MAX_WIDTH,
  SUBMENU_GAP,
  VIEWPORT_PAD,
  SUBMENU_ROW_ESTIMATE_PX,
  SUBMENU_MAX_HEIGHT_PX,
  SUBMENU_DIVIDER_ESTIMATE_PX,
  SUBMENU_INNER_PAD_PX
} from './constants';

export interface SubmenuLayoutInput {
  anchorRect: DOMRect;
  paletteRect?: DOMRect;
  submenuItemsCount: number;
  hasDivider: boolean;
  contentScrollHeight?: number;
}

export interface SubmenuLayoutResult {
  side: 'left' | 'right';
  maxWidth: number;
  verticalDirection: 'down' | 'up';
  topOffset: number;
  maxHeight: number;
}

export function computeSubmenuLayout(input: SubmenuLayoutInput): SubmenuLayoutResult {
  const { anchorRect, paletteRect, submenuItemsCount, hasDivider, contentScrollHeight } = input;
  const vw = typeof window !== 'undefined' ? window.innerWidth : SUBMENU_MAX_WIDTH;

  const clipRight = paletteRect?.right ?? vw;
  const clipLeft = paletteRect?.left ?? 0;
  const effectiveRight = Math.min(vw, clipRight) - VIEWPORT_PAD;
  const effectiveLeft = Math.max(0, clipLeft) + VIEWPORT_PAD;

  const roomRight = effectiveRight - anchorRect.right - SUBMENU_GAP;
  const roomLeft = anchorRect.left - effectiveLeft - SUBMENU_GAP;

  const preferRight = roomRight >= SUBMENU_MAX_WIDTH + SUBMENU_GAP || roomRight >= roomLeft;
  const side: 'left' | 'right' = preferRight ? 'right' : 'left';

  const maxWidth = preferRight
    ? Math.max(160, Math.min(SUBMENU_MAX_WIDTH, roomRight))
    : Math.max(160, Math.min(SUBMENU_MAX_WIDTH, roomLeft));

  const estimatedRows = submenuItemsCount;
  const estimatedHeight = Math.min(
    SUBMENU_MAX_HEIGHT_PX,
    estimatedRows * SUBMENU_ROW_ESTIMATE_PX +
      (hasDivider ? SUBMENU_DIVIDER_ESTIMATE_PX : 0) +
      SUBMENU_INNER_PAD_PX * 2
  );
  const actualHeight = contentScrollHeight ?? estimatedHeight;
  const desiredHeight = Math.min(SUBMENU_MAX_HEIGHT_PX, Math.max(actualHeight, estimatedHeight));

  const maxAllowedBottom = window.innerHeight - VIEWPORT_PAD;
  const maxAllowedTop = VIEWPORT_PAD;
  const roomBelow = Math.max(0, maxAllowedBottom - anchorRect.top);
  const roomAbove = Math.max(0, anchorRect.bottom - maxAllowedTop);
  const preferDown = roomBelow >= desiredHeight;
  const verticalDirection: 'down' | 'up' = preferDown ? 'down' : 'up';

  const directionalRoom = verticalDirection === 'down' ? roomBelow : roomAbove;
  const nextMaxHeight = Math.max(120, Math.min(SUBMENU_MAX_HEIGHT_PX, directionalRoom));
  const renderHeight = Math.min(desiredHeight, nextMaxHeight);

  let nextOffset = verticalDirection === 'down' ? 0 : anchorRect.height - renderHeight;
  let nextTop = anchorRect.top + nextOffset;
  let nextBottom = nextTop + renderHeight;

  if (nextTop < maxAllowedTop) {
    nextOffset += maxAllowedTop - nextTop;
    nextTop = anchorRect.top + nextOffset;
    nextBottom = nextTop + renderHeight;
  }
  if (nextBottom > maxAllowedBottom) {
    nextOffset -= nextBottom - maxAllowedBottom;
  }

  return {
    side,
    maxWidth,
    verticalDirection,
    topOffset: nextOffset,
    maxHeight: nextMaxHeight
  };
}
