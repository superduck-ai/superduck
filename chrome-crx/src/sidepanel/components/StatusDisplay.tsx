import React from 'react';
import { motion } from 'framer-motion';
import type { SupportedLocale } from '../../index-react-dom-intl';

export function ShimmerText({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={`shimmer text-center ${className || ''}`}>{children}</span>;
}

export function stripTrailingEllipsis(text: string): string {
  return text.replace(/\s*(?:\.\.\.|…)\s*$/, '');
}

export function ThinkingDots() {
  return (
    <span
      className="ml-1 inline-flex items-end align-middle text-[1.05em] leading-none"
      aria-hidden="true"
    >
      {[0, 1, 2].map((index) => (
        <motion.span
          key={index}
          className="inline-block min-w-[0.18em] text-current"
          initial={{ opacity: 0.28, y: 0 }}
          animate={{
            opacity: [0.28, 1, 0.28],
            y: [0, -1.5, 0]
          }}
          transition={{
            duration: 0.95,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: index * 0.14
          }}
        >
          .
        </motion.span>
      ))}
    </span>
  );
}

export function getStatusSummaryLanguageInstruction(locale: SupportedLocale): string {
  switch (locale) {
    case 'zh-CN':
      return 'Return the status in Simplified Chinese.';
    case 'en-US':
    default:
      return 'Return the status in English.';
  }
}
