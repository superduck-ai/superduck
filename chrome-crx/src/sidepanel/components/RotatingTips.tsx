import { useState, useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

interface RotatingTipsProps {
  tips: string[];
  intervalMs?: number;
}

export function RotatingTips({ tips, intervalMs = 4000 }: RotatingTipsProps) {
  const [index, setIndex] = useState(0);
  const shouldReduceMotion = useReducedMotion();

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
          data-testid="rotating-tip"
          key={index}
          initial={shouldReduceMotion ? false : { y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { y: -12, opacity: 0 }}
          transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.3, ease: 'easeInOut' }}
          className="whitespace-nowrap text-sm leading-6 text-muted-foreground"
        >
          {tips[index]}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
