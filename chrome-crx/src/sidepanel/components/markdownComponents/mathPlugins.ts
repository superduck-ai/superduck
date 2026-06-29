import React, { useState } from 'react';
import type { PluggableList } from 'unified';
import type { RemarkMathPlugin, RehypeKatexPlugin, RehypeKatexOptions } from './types';

let mathPluginsCache: { remarkMath: RemarkMathPlugin; rehypeKatex: RehypeKatexPlugin } | null =
  null;
let mathPluginsPromise: Promise<{
  remarkMath: RemarkMathPlugin;
  rehypeKatex: RehypeKatexPlugin;
} | null> | null = null;

export function useMathPlugins(): {
  remarkMath?: RemarkMathPlugin;
  rehypeKatex?: RehypeKatexPlugin;
} {
  const [plugins, setPlugins] = useState<{
    remarkMath?: RemarkMathPlugin;
    rehypeKatex?: RehypeKatexPlugin;
  }>(() => mathPluginsCache ?? {});

  React.useEffect(() => {
    if (mathPluginsCache) return;
    if (!mathPluginsPromise) {
      mathPluginsPromise = Promise.all([import('remark-math'), import('rehype-katex')]).then(
        ([rm, rk]) => {
          mathPluginsCache = {
            remarkMath: rm.default,
            rehypeKatex: rk.default
          };
          return mathPluginsCache;
        }
      );
    }
    const promise = mathPluginsPromise;
    promise.then((result) => {
      if (result) setPlugins(result);
    });
  }, []);

  return plugins;
}

export function buildRemarkPlugins(remarkMath?: RemarkMathPlugin): PluggableList {
  const plugins: PluggableList = [];
  // remark-gfm is added externally
  if (remarkMath) {
    plugins.push(remarkMath);
  }
  return plugins;
}

export function buildRehypePlugins(rehypeKatex?: RehypeKatexPlugin): PluggableList {
  const plugins: PluggableList = [];
  if (rehypeKatex) {
    const options: RehypeKatexOptions = { errorColor: 'inherit' };
    plugins.push([rehypeKatex, options]);
  }
  return plugins;
}
