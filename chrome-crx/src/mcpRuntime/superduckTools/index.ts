import { superduckActiveContextTool } from './activeContextTool';
import { superduckBackgroundFetchTool } from './backgroundFetchTool';
import { superduckListTabsTool } from './listTabsTool';
import { superduckOpenTool } from './openTool';
import { superduckClickTool } from './clickTool';
import { superduckFillTool } from './fillTool';
import { superduckPressTool } from './pressTool';
import { superduckDownloadsTool } from './downloadsTool';
import { superduckHistoryTool } from './historyTool';

export { superduckActiveContextTool } from './activeContextTool';
export { superduckBackgroundFetchTool } from './backgroundFetchTool';
export { superduckListTabsTool } from './listTabsTool';
export { superduckOpenTool } from './openTool';
export { superduckClickTool } from './clickTool';
export { superduckFillTool } from './fillTool';
export { superduckPressTool } from './pressTool';

export const superduckTools = [
  superduckActiveContextTool,
  superduckBackgroundFetchTool,
  superduckListTabsTool,
  superduckOpenTool,
  superduckClickTool,
  superduckFillTool,
  superduckPressTool,
  superduckDownloadsTool,
  superduckHistoryTool
];

export const superduckToolNames = superduckTools.map((t) => t.name);
