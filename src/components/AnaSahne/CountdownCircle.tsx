// SVG circle countdown timer with color transitions
// Uses pure SVG/CSS stroke-dashoffset animation (no Framer Motion)
// Circumference = 2 * PI * radius; stroke-dashoffset: 0 = full, circumference = empty

import { cn } from "@/lib/utils";

interface CountdownCircleProps {
  timeLeft: number | null;
  isActive: boolean;
  size?: number;
}

export default function CountdownCircle({
  timeLeft,
  isActive,
  size = 120,
}: CountdownCircleProps) {
  const strokeWidth = 6;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const isLoading = timeLeft === null && isActive;
  const showInactive = !isActive;

  // Color tiers: green (>30s), yellow (10-30s), red (<10s)
  const getColor = () => {
    if (showInactive || isLoading) return "#6b7280";
    if (timeLeft > 30) return "#22c55e";
    if (timeLeft > 10) return "#eab308";
    return "#ef4444";
  };

  const color = getColor();

  // stroke-dashoffset: 0 when full (60s), circumference when empty (0s)
  const clamped = Math.max(0, Math.min(60, timeLeft ?? 60));
  const dashOffset = circumference * (1 - clamped / 60);

  // Center display text
  let label: string;
  if (showInactive) {
    label = "\u2014:\u2014"; // em-dash separator
  } else if (isLoading) {
    label = "";
  } else {
    const mins = Math.floor(timeLeft / 60);
    const secs = Math.floor(timeLeft % 60);
    label = `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className={cn(isLoading && "animate-spin")}
      >
        {/* Background track — hidden during loading */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="#374151"
          strokeWidth={strokeWidth}
          opacity={isLoading ? 0 : 0.2}
        />
        {/* Progress arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={isLoading ? circumference * 0.3 : circumference}
          strokeDashoffset={isLoading ? 0 : dashOffset}
          style={{
            transition:
              !isLoading
                ? "stroke-dashoffset 0.5s ease, stroke 0.3s ease"
                : "none",
          }}
        />
      </svg>
      {/* Center label (outside SVG to avoid rotating with loading spinner) */}
      <span
        className="absolute inset-0 flex items-center justify-center font-bold tabular-nums leading-none"
        style={{
          color,
          fontSize: size * 0.18,
          transition: "color 0.3s ease",
        }}
      >
        {label || (
          <span className="inline-block size-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
        )}
      </span>
    </div>
  );
}
