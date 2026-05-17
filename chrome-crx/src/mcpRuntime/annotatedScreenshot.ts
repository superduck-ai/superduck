import { cdpDebugger } from './cdp';
import { getRefMetaByTab } from './refBridge';
import type { CdpDomGetContentQuadsResult } from './cdpTypes';

interface Annotation {
  number: number;
  ref: string;
  role: string;
  name: string;
  box: { x: number; y: number; width: number; height: number };
}

export async function captureAnnotatedScreenshot(
  tabId: number
): Promise<{
  base64Image: string;
  imageFormat: string;
  legend: string;
  annotations: Annotation[];
} | null> {
  const refMeta = getRefMetaByTab(tabId);
  if (!refMeta || refMeta.size === 0) return null;

  const annotations: Annotation[] = [];

  const entries = Array.from(refMeta.entries()).sort((a, b) => {
    const numA = parseInt(a[0].replace('ref_', ''), 10) || 0;
    const numB = parseInt(b[0].replace('ref_', ''), 10) || 0;
    return numA - numB;
  });

  const batchSize = 30;
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async ([refId, meta]) => {
        if (!meta.backendNodeId) return null;
        try {
          const quads = await cdpDebugger.sendCommand<CdpDomGetContentQuadsResult>(
            tabId,
            'DOM.getContentQuads',
            { backendNodeId: meta.backendNodeId }
          );
          const quad = quads?.quads?.[0];
          if (!quad || quad.length < 8) return null;

          const xs = [quad[0], quad[2], quad[4], quad[6]];
          const ys = [quad[1], quad[3], quad[5], quad[7]];
          const minX = Math.min(...xs);
          const minY = Math.min(...ys);
          const maxX = Math.max(...xs);
          const maxY = Math.max(...ys);
          const width = maxX - minX;
          const height = maxY - minY;

          if (width <= 0 || height <= 0) return null;

          const number = parseInt(refId.replace('ref_', ''), 10);
          return {
            number,
            ref: refId,
            role: meta.role,
            name: meta.name,
            box: {
              x: Math.round(minX),
              y: Math.round(minY),
              width: Math.round(width),
              height: Math.round(height)
            }
          } as Annotation;
        } catch {
          return null;
        }
      })
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) annotations.push(r.value);
    }
  }

  if (annotations.length === 0) return null;

  const overlayScript = (items: Annotation[]) => {
    const id = '__superduck_annotations__';
    const existing = document.getElementById(id);
    if (existing) existing.remove();
    const sx = window.scrollX || 0;
    const sy = window.scrollY || 0;
    const container = document.createElement('div');
    container.id = id;
    container.style.cssText =
      'position:absolute;top:0;left:0;width:0;height:0;pointer-events:none;z-index:2147483647;';
    for (const it of items) {
      const dx = it.box.x + sx;
      const dy = it.box.y + sy;
      const box = document.createElement('div');
      box.style.cssText = `position:absolute;left:${dx}px;top:${dy}px;width:${it.box.width}px;height:${it.box.height}px;border:2px solid rgba(255,0,0,0.8);box-sizing:border-box;pointer-events:none;`;
      const label = document.createElement('div');
      label.textContent = String(it.number);
      const labelTop = dy < 14 ? '2px' : '-14px';
      label.style.cssText = `position:absolute;top:${labelTop};left:-2px;background:rgba(255,0,0,0.9);color:#fff;font:bold 11px/14px monospace;padding:0 4px;border-radius:2px;white-space:nowrap;`;
      box.appendChild(label);
      container.appendChild(box);
    }
    document.documentElement.appendChild(container);
    return true;
  };

  const removeOverlay = async () => {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const el = document.getElementById('__superduck_annotations__');
          if (el) el.remove();
        }
      });
    } catch {
      // cleanup best-effort
    }
  };

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: overlayScript,
      args: [annotations]
    });

    const screenshotResult = await cdpDebugger.screenshot(tabId);
    await removeOverlay();

    const legend = annotations
      .map((a) => `[${a.number}] ${a.ref} ${a.role} "${a.name}"`)
      .join('\n');

    return {
      base64Image: screenshotResult.base64,
      imageFormat: screenshotResult.format,
      legend,
      annotations
    };
  } catch {
    await removeOverlay();
    return null;
  }
}
