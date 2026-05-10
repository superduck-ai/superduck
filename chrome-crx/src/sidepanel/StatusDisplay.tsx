import React from 'react';
import { motion } from 'framer-motion';
import type { SupportedLocale } from '../index-react-dom-intl';

export function ShimmerText({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-center text-always-white/0 bg-gradient-to-r bg-[length:400%_100%] from-30% via-always-white/70 to-80% bg-clip-text bg-no-repeat bg-text-400 from-text-400 to-text-400"
      style={{
        animationName: 'shimmertext',
        animationDuration: '2.25s',
        animationIterationCount: 'infinite'
      }}
    >
      {children}
    </span>
  );
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
