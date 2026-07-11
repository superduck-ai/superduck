import { describe, expect, it } from 'vitest';

// 模拟 MessageScroller 的滚动锁定状态转移逻辑
function transitionScrollState(
  state: {
    isPinned: boolean;
    programmaticScroll: boolean;
    lastScrollTop: number;
  },
  event: {
    type: 'programmatic_scroll' | 'user_gesture' | 'scroll';
    scrollTop?: number;
    scrollHeight?: number;
    clientHeight?: number;
  }
) {
  const nextState = { ...state };

  if (event.type === 'programmatic_scroll') {
    nextState.programmaticScroll = true;
    return nextState;
  }

  if (event.type === 'user_gesture') {
    nextState.programmaticScroll = false;
    return nextState;
  }

  if (event.type === 'scroll') {
    const scrollTop = event.scrollTop ?? 0;
    const scrollHeight = event.scrollHeight ?? 0;
    const clientHeight = event.clientHeight ?? 0;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isAtBottom = distanceFromBottom <= 8;

    if (nextState.programmaticScroll) {
      if (isAtBottom) {
        nextState.programmaticScroll = false;
      }
      return nextState;
    }

    const isScrollingUp = scrollTop < nextState.lastScrollTop;
    nextState.lastScrollTop = scrollTop;

    if (isAtBottom) {
      nextState.isPinned = true;
    } else if (distanceFromBottom > 50 && isScrollingUp) {
      nextState.isPinned = false;
    }
  }

  return nextState;
}

describe('MessageScroller logic', () => {
  it('should initialize with pinned state and programmatic scroll as false', () => {
    const state = { isPinned: true, programmaticScroll: false, lastScrollTop: 100 };
    expect(state.isPinned).toBe(true);
  });

  it('should not change pin status on programmatic scroll until bottom reached', () => {
    let state = { isPinned: true, programmaticScroll: false, lastScrollTop: 100 };

    // 触发程序滚动
    state = transitionScrollState(state, { type: 'programmatic_scroll' });
    expect(state.programmaticScroll).toBe(true);

    // 发生滚动事件，距离底部较远，尚未到达底部
    state = transitionScrollState(state, {
      type: 'scroll',
      scrollTop: 50,
      scrollHeight: 200,
      clientHeight: 100 // distanceFromBottom = 50
    });
    // 程序滚动仍在继续，且保持 Pinned 状态
    expect(state.programmaticScroll).toBe(true);
    expect(state.isPinned).toBe(true);

    // 发生滚动事件，到达底部 (distanceFromBottom <= 8)
    state = transitionScrollState(state, {
      type: 'scroll',
      scrollTop: 95,
      scrollHeight: 200,
      clientHeight: 100 // distanceFromBottom = 5
    });
    expect(state.programmaticScroll).toBe(false);
    expect(state.isPinned).toBe(true);
  });

  it('should unpin when manual scrolling up exceeds 50px buffer', () => {
    let state = { isPinned: true, programmaticScroll: false, lastScrollTop: 100 };

    // 用户手动向上微小滚动，距离底部 10px (不超过 50px)
    state = transitionScrollState(state, {
      type: 'scroll',
      scrollTop: 90,
      scrollHeight: 200,
      clientHeight: 100 // distanceFromBottom = 10
    });
    expect(state.isPinned).toBe(true);

    // 用户手动向上滚动，距离底部超过 50px (例如距离底部 60px)
    state = transitionScrollState(state, {
      type: 'scroll',
      scrollTop: 40,
      scrollHeight: 200,
      clientHeight: 100 // distanceFromBottom = 60
    });
    expect(state.isPinned).toBe(false);
  });

  it('should restore pin state when scrolled back to the very bottom', () => {
    let state = { isPinned: false, programmaticScroll: false, lastScrollTop: 40 };

    // 滚回到底部
    state = transitionScrollState(state, {
      type: 'scroll',
      scrollTop: 95,
      scrollHeight: 200,
      clientHeight: 100 // distanceFromBottom = 5
    });
    expect(state.isPinned).toBe(true);
  });

  it('should interrupt programmatic scroll on user wheel or touch gestures', () => {
    let state = { isPinned: true, programmaticScroll: false, lastScrollTop: 100 };

    // 触发程序滚动
    state = transitionScrollState(state, { type: 'programmatic_scroll' });
    expect(state.programmaticScroll).toBe(true);

    // 触发手势事件
    state = transitionScrollState(state, { type: 'user_gesture' });
    expect(state.programmaticScroll).toBe(false);
  });
});
