import type { ReactNode } from 'react';
import { compactBroomSvg } from './assets';

export function SlashIcon() {
  return (
    <span
      aria-hidden="true"
      className="select-none -translate-y-px text-[15px] font-normal leading-none text-muted-foreground"
    >
      /
    </span>
  );
}

export function InlineSvgIcon({
  svg,
  className = 'inline-flex h-[15px] w-[15px] text-muted-foreground'
}: {
  svg: string;
  className?: string;
}) {
  // Keep SVG presentation generic so caller-provided className controls size/color.
  const svgWithStyle = svg.replace(
    /<svg/,
    `<svg style="width: 100%; height: 100%; color: currentColor; display: block; flex-shrink: 0;"`
  );

  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center ${className}`}
      dangerouslySetInnerHTML={{ __html: svgWithStyle }}
    />
  );
}

export function SpecialCommandIcon({ command }: { command: string }) {
  if (command === 'compact') {
    return (
      <InlineSvgIcon
        svg={compactBroomSvg}
        className="inline-flex h-[13px] w-[13px] text-muted-foreground"
      />
    );
  }

  return <SlashIcon />;
}

export function MenuIconBox({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center text-muted-foreground">
      {children}
    </div>
  );
}
