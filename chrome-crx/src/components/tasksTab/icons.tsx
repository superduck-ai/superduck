import React from 'react';
import { IconBase } from '../ui';
import runShortcutSvg from '../../assets/IconRunShortcut.svg?raw';

const listBulletsWeights = new Map<string, React.ReactElement>([
  [
    'bold',
    React.createElement(
      React.Fragment,
      null,
      React.createElement('path', {
        d: 'M76,64A12,12,0,0,1,88,52H216a12,12,0,0,1,0,24H88A12,12,0,0,1,76,64Zm140,52H88a12,12,0,0,0,0,24H216a12,12,0,0,0,0-24Zm0,64H88a12,12,0,0,0,0,24H216a12,12,0,0,0,0-24ZM44,112a16,16,0,1,0,16,16A16,16,0,0,0,44,112Zm0-64A16,16,0,1,0,60,64,16,16,0,0,0,44,48Zm0,128a16,16,0,1,0,16,16A16,16,0,0,0,44,176Z'
      })
    )
  ],
  [
    'duotone',
    React.createElement(
      React.Fragment,
      null,
      React.createElement('path', { d: 'M216,64V192H88V64Z', opacity: '0.2' }),
      React.createElement('path', {
        d: 'M80,64a8,8,0,0,1,8-8H216a8,8,0,0,1,0,16H88A8,8,0,0,1,80,64Zm136,56H88a8,8,0,1,0,0,16H216a8,8,0,0,0,0-16Zm0,64H88a8,8,0,1,0,0,16H216a8,8,0,0,0,0-16ZM44,52A12,12,0,1,0,56,64,12,12,0,0,0,44,52Zm0,64a12,12,0,1,0,12,12A12,12,0,0,0,44,116Zm0,64a12,12,0,1,0,12,12A12,12,0,0,0,44,180Z'
      })
    )
  ],
  [
    'fill',
    React.createElement(
      React.Fragment,
      null,
      React.createElement('path', {
        d: 'M208,32H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM68,188a12,12,0,1,1,12-12A12,12,0,0,1,68,188Zm0-48a12,12,0,1,1,12-12A12,12,0,0,1,68,140Zm0-48A12,12,0,1,1,80,80,12,12,0,0,1,68,92Zm124,92H104a8,8,0,0,1,0-16h88a8,8,0,0,1,0,16Zm0-48H104a8,8,0,0,1,0-16h88a8,8,0,0,1,0,16Zm0-48H104a8,8,0,0,1,0-16h88a8,8,0,0,1,0,16Z'
      })
    )
  ],
  [
    'light',
    React.createElement(
      React.Fragment,
      null,
      React.createElement('path', {
        d: 'M82,64a6,6,0,0,1,6-6H216a6,6,0,0,1,0,12H88A6,6,0,0,1,82,64Zm134,58H88a6,6,0,0,0,0,12H216a6,6,0,0,0,0-12Zm0,64H88a6,6,0,0,0,0,12H216a6,6,0,0,0,0-12ZM44,54A10,10,0,1,0,54,64,10,10,0,0,0,44,54Zm0,128a10,10,0,1,0,10,10A10,10,0,0,0,44,182Zm0-64a10,10,0,1,0,10,10A10,10,0,0,0,44,118Z'
      })
    )
  ],
  [
    'regular',
    React.createElement(
      React.Fragment,
      null,
      React.createElement('path', {
        d: 'M80,64a8,8,0,0,1,8-8H216a8,8,0,0,1,0,16H88A8,8,0,0,1,80,64Zm136,56H88a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16Zm0,64H88a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16ZM44,52A12,12,0,1,0,56,64,12,12,0,0,0,44,52Zm0,64a12,12,0,1,0,12,12A12,12,0,0,0,44,116Zm0,64a12,12,0,1,0,12,12A12,12,0,0,0,44,180Z'
      })
    )
  ],
  [
    'thin',
    React.createElement(
      React.Fragment,
      null,
      React.createElement('path', {
        d: 'M84,64a4,4,0,0,1,4-4H216a4,4,0,0,1,0,8H88A4,4,0,0,1,84,64Zm132,60H88a4,4,0,0,0,0,8H216a4,4,0,0,0,0-8Zm0,64H88a4,4,0,0,0,0,8H216a4,4,0,0,0,0-8ZM44,120a8,8,0,1,0,8,8A8,8,0,0,0,44,120Zm0-64a8,8,0,1,0,8,8A8,8,0,0,0,44,56Zm0,128a8,8,0,1,0,8,8A8,8,0,0,0,44,184Z'
      })
    )
  ]
]);

const plusWeights = new Map<string, React.ReactElement>([
  [
    'bold',
    React.createElement(
      React.Fragment,
      null,
      React.createElement('path', {
        d: 'M228,128a12,12,0,0,1-12,12H140v76a12,12,0,0,1-24,0V140H40a12,12,0,0,1,0-24h76V40a12,12,0,0,1,24,0v76h76A12,12,0,0,1,228,128Z'
      })
    )
  ],
  [
    'duotone',
    React.createElement(
      React.Fragment,
      null,
      React.createElement('path', {
        d: 'M216,56V200a16,16,0,0,1-16,16H56a16,16,0,0,1-16-16V56A16,16,0,0,1,56,40H200A16,16,0,0,1,216,56Z',
        opacity: '0.2'
      }),
      React.createElement('path', {
        d: 'M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z'
      })
    )
  ],
  [
    'fill',
    React.createElement(
      React.Fragment,
      null,
      React.createElement('path', {
        d: 'M208,32H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM184,136H136v48a8,8,0,0,1-16,0V136H72a8,8,0,0,1,0-16h48V72a8,8,0,0,1,16,0v48h48a8,8,0,0,1,0,16Z'
      })
    )
  ],
  [
    'light',
    React.createElement(
      React.Fragment,
      null,
      React.createElement('path', {
        d: 'M222,128a6,6,0,0,1-6,6H134v82a6,6,0,0,1-12,0V134H40a6,6,0,0,1,0-12h82V40a6,6,0,0,1,12,0v82h82A6,6,0,0,1,222,128Z'
      })
    )
  ],
  [
    'regular',
    React.createElement(
      React.Fragment,
      null,
      React.createElement('path', {
        d: 'M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z'
      })
    )
  ],
  [
    'thin',
    React.createElement(
      React.Fragment,
      null,
      React.createElement('path', {
        d: 'M220,128a4,4,0,0,1-4,4H132v84a4,4,0,0,1-8,0V132H40a4,4,0,0,1,0-8h84V40a4,4,0,0,1,8,0v84h84A4,4,0,0,1,220,128Z'
      })
    )
  ]
]);

export const ListBulletsIcon = React.forwardRef<
  React.ElementRef<typeof IconBase>,
  Omit<React.ComponentPropsWithoutRef<typeof IconBase>, 'weights'>
>((props, ref) => React.createElement(IconBase, { ref, ...props, weights: listBulletsWeights }));
ListBulletsIcon.displayName = 'ListBulletsIcon';

export const PlusIcon = React.forwardRef<
  React.ElementRef<typeof IconBase>,
  Omit<React.ComponentPropsWithoutRef<typeof IconBase>, 'weights'>
>((props, ref) => React.createElement(IconBase, { ref, ...props, weights: plusWeights }));
PlusIcon.displayName = 'PlusIcon';

export function getRunShortcutSvgMarkup(size: number, viewBox = '3 3 18 18') {
  return runShortcutSvg
    .replace(
      '<svg',
      `<svg style="width:${size}px;height:${size}px;color:currentColor;display:block;flex-shrink:0;"`
    )
    .replace(/viewBox="[^"]+"/, `viewBox="${viewBox}"`);
}
