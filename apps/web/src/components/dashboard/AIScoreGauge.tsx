"use client";

interface AIScoreGaugeProps {
  score: number; // 0–100
  label?: string;
  size?: number;
}

/**
 * Semi-circle gauge showing the avg. AI candidate score.
 * Matches the reference design: thick blue arc, score in center, quality label below.
 */
export function AIScoreGauge({ score, label, size = 140 }: AIScoreGaugeProps) {
  const clampedScore = Math.min(100, Math.max(0, score));
  const radius = 52;
  const cx = size / 2;
  const cy = size / 2 + 10;
  const strokeWidth = 12;

  // Semi-circle arc: from 180° to 0° (left to right along bottom half of circle)
  // We draw on a semi-circle (180° sweep)
  const startAngle = -180;
  const endAngle = 0;
  const sweepDeg = (clampedScore / 100) * 180;

  function polarToCart(angleDeg: number, r: number) {
    const rad = (angleDeg * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad),
    };
  }

  const start = polarToCart(startAngle, radius);
  const end = polarToCart(startAngle + sweepDeg, radius);
  const trackEnd = polarToCart(endAngle, radius);
  const largeArc = sweepDeg > 180 ? 1 : 0;
  const trackLargeArc = 1; // full 180 is always large

  const trackPath = `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${trackLargeArc} 1 ${trackEnd.x} ${trackEnd.y}`;
  const fillPath =
    sweepDeg > 0
      ? `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`
      : "";

  const quality =
    clampedScore >= 85 ? "High Quality Matches" : clampedScore >= 65 ? "Good Matches" : "Review Recommended";
  const qualityColor =
    clampedScore >= 85 ? "#10b981" : clampedScore >= 65 ? "#2563eb" : "#f59e0b";

  return (
    <div className="flex flex-col items-center">
      <svg
        width={size}
        height={size * 0.65}
        viewBox={`0 0 ${size} ${size * 0.65}`}
        aria-label={`AI Score: ${clampedScore}%`}
        role="img"
      >
        {/* Track */}
        <path
          d={trackPath}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className="text-muted-foreground/20"
        />
        {/* Fill */}
        {fillPath && (
          <path
            d={fillPath}
            fill="none"
            stroke="#2563eb"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            style={{ filter: "drop-shadow(0 0 6px rgba(37,99,235,0.4))" }}
          />
        )}
        {/* Score text */}
        <text
          x={cx}
          y={cy + 4}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="22"
          fontWeight="700"
          fill="currentColor"
          fontFamily="inherit"
          style={{ letterSpacing: "-0.03em" }}
        >
          {clampedScore}%
        </text>
      </svg>
      <p className="mt-1 text-xs font-semibold" style={{ color: qualityColor }}>
        {label ?? quality}
      </p>
    </div>
  );
}
