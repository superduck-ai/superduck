import React from "react";

interface ShimmerTextProps {
  isDarkMode: boolean;
  text: string;
}

export function ShimmerText({ isDarkMode, text }: ShimmerTextProps) {
  return (
    <span
      className="text-sm italic font-superduck-response relative inline-block mb-1"
      style={{
        color: "transparent",
        background: isDarkMode
          ? "linear-gradient(90deg, #faf9f5 0%, #faf9f5 35%, #808080 50%, #faf9f5 65%, #faf9f5 100%)"
          : "linear-gradient(90deg, #141413 0%, #141413 35%, #888888 50%, #141413 65%, #141413 100%)",
        backgroundSize: "200% 100%",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
        animation: "shimmerSweep 2.25s ease-in-out infinite",
      }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
  @keyframes shimmerSweep {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
`,
        }}
      />
      {text}
    </span>
  );
}
