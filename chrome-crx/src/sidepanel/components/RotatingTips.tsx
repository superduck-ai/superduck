import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface RotatingTipsProps {
  tips: string[];
  intervalMs?: number;
}

export function RotatingTips({ tips, intervalMs = 4000 }: RotatingTipsProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (tips.length <= 1) return;
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % tips.length);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [tips.length, intervalMs]);

  return (
    <div className="absolute inset-0 flex items-start pointer-events-none overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.span
          key={index}
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -12, opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className="text-sm text-text-400 italic whitespace-nowrap leading-[24px]"
        >
          {tips[index]}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
