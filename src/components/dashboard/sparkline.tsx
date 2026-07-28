import { useId } from "react";

/**
 * Sparkline puramente apresentacional (SVG inline, sem biblioteca extra).
 * Consome apenas séries já carregadas — nenhuma consulta nova.
 */
export function Sparkline({
  values,
  color = "currentColor",
  className,
  label,
}: {
  values: number[];
  color?: string;
  className?: string;
  label?: string;
}) {
  const gid = useId().replace(/:/g, "");
  const pts = values.filter((v) => Number.isFinite(v));
  if (pts.length < 2) {
    return (
      <div className={className} aria-hidden>
        <div className="h-8 w-full rounded bg-muted/40" />
      </div>
    );
  }

  const w = 100;
  const h = 28;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const step = w / (pts.length - 1);

  const coords = pts.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / span) * (h - 4) - 2;
    return [x, y] as const;
  });

  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const last = coords[coords.length - 1];

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={className}
      role="img"
      aria-label={label ?? "Evolução do indicador no período"}
    >
      <defs>
        <linearGradient id={`spark-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${gid})`} stroke="none" />
      <path d={line} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r={1.8} fill={color} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
