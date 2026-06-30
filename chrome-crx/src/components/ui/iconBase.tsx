import React, { createContext, forwardRef, useContext } from 'react';

export interface IconBaseProps extends Omit<React.ComponentPropsWithoutRef<'svg'>, 'color'> {
  alt?: string;
  color?: string;
  size?: number | string;
  weight?: string;
  mirrored?: boolean;
  weights: Map<string, React.ReactNode>;
}

export const PhosphorIconContext = createContext({
  color: 'currentColor',
  size: '1em',
  weight: 'regular',
  mirrored: false
});

export const IconBase = forwardRef<SVGSVGElement, IconBaseProps>((props, ref) => {
  const { alt, color, size, weight, mirrored, children, weights, ...rest } = props;
  const ctx = useContext(PhosphorIconContext);

  return React.createElement(
    'svg',
    {
      ref,
      xmlns: 'http://www.w3.org/2000/svg',
      width: size ?? ctx.size,
      height: size ?? ctx.size,
      fill: color ?? ctx.color,
      viewBox: '0 0 256 256',
      transform: mirrored || ctx.mirrored ? 'scale(-1, 1)' : undefined,
      ...rest
    },
    alt && React.createElement('title', null, alt),
    children,
    weights.get(weight ?? ctx.weight)
  );
});
IconBase.displayName = 'IconBase';
