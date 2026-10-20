// Zak's signature dish as a drawing: a cast-iron sizzling plate on its wooden board,
// with sisig on it and steam rising off it. It stands in for food photography on the
// welcome screen until real photos are uploaded, and returns small as the order bar's
// empty state. Decorative only; the steam stops under reduced motion.
interface SizzlingPlateProps {
  className?: string;
  /** Rising steam above the plate (the welcome screen's signature motion). */
  steam?: boolean;
}

// Fixed bits of the dish, so the drawing is the same on every render.
const CHUNKS: [number, number, number, string][] = [
  [168, 168, 13, "#8a3a17"],
  [196, 158, 11, "#b5541f"],
  [222, 170, 14, "#7a3312"],
  [246, 160, 10, "#c8692a"],
  [182, 190, 12, "#a04a1b"],
  [212, 194, 10, "#6e2c10"],
  [238, 188, 13, "#9c4419"],
  [264, 178, 11, "#7d3514"],
  [150, 186, 10, "#b25a24"],
  [276, 196, 9, "#8a3a17"],
  [200, 178, 9, "#d9823a"],
  [230, 148, 8, "#a04a1b"],
];
const ONIONS: [number, number, number][] = [
  [176, 150, 9],
  [256, 200, 8],
  [140, 170, 7],
  [290, 172, 7],
];
const CHILIES: [number, number][] = [
  [205, 205],
  [268, 155],
  [158, 158],
  [242, 205],
];

export function SizzlingPlate({ className, steam = false }: SizzlingPlateProps) {
  return (
    <svg viewBox="0 0 420 300" className={className} aria-hidden="true" role="presentation">
      {steam && (
        <g fill="none" stroke="#f7eedf" strokeWidth="7" strokeLinecap="round">
          {[
            ["M170 118c-14-16 14-26 0-44s12-28 0-42", "0s"],
            ["M214 112c-14-16 14-26 0-44s12-28 0-42", "1.1s"],
            ["M258 118c-14-16 14-26 0-44s12-28 0-42", "2.1s"],
          ].map(([d, delay]) => (
            <path
              key={delay}
              d={d}
              className="animate-steam motion-reduce:hidden"
              style={{ animationDelay: delay, transformBox: "fill-box", transformOrigin: "bottom" }}
              opacity="0"
            />
          ))}
        </g>
      )}

      {/* Wooden board */}
      <ellipse cx="214" cy="214" rx="198" ry="76" fill="#6b3d22" />
      <ellipse cx="214" cy="206" rx="198" ry="76" fill="#9a5b32" />
      <g stroke="#7d4626" strokeWidth="3" fill="none" opacity="0.7">
        <path d="M40 196c60-14 120-6 170-14s110-14 180 4" />
        <path d="M52 226c70-10 140 4 200-6s100-10 130 0" />
        <path d="M96 252c50-6 110 2 160-4" />
      </g>

      {/* Cast-iron plate: rim, then the cooking surface */}
      <ellipse cx="214" cy="186" rx="150" ry="58" fill="#1a100b" />
      <ellipse cx="214" cy="180" rx="150" ry="58" fill="#3a2a22" />
      <ellipse cx="214" cy="180" rx="132" ry="48" fill="#241812" />
      <ellipse cx="200" cy="168" rx="96" ry="26" fill="#2e211a" opacity="0.8" />

      {/* Sisig */}
      {CHUNKS.map(([cx, cy, r, fill]) => (
        <rect
          key={`${cx}-${cy}`}
          x={cx - r}
          y={cy - r * 0.7}
          width={r * 2}
          height={r * 1.4}
          rx={r * 0.45}
          fill={fill}
          transform={`rotate(${(cx * 7 + cy) % 40 - 20} ${cx} ${cy})`}
        />
      ))}
      {ONIONS.map(([cx, cy, r]) => (
        <ellipse key={`o${cx}`} cx={cx} cy={cy} rx={r} ry={r * 0.7} fill="none" stroke="#f3e6c8" strokeWidth="3" />
      ))}
      {CHILIES.map(([cx, cy]) => (
        <g key={`c${cx}`}>
          <ellipse cx={cx} cy={cy} rx="6" ry="4.5" fill="#c62f1b" />
          <ellipse cx={cx} cy={cy} rx="2.4" ry="1.8" fill="#f1dbaa" />
        </g>
      ))}

      {/* The egg in the middle */}
      <ellipse cx="214" cy="172" rx="30" ry="17" fill="#fbf4e6" />
      <ellipse cx="218" cy="170" rx="12" ry="9" fill="#e9a23b" />
      <ellipse cx="215" cy="167" rx="4" ry="2.6" fill="#f6cf7d" />

      {/* Calamansi halves */}
      <g>
        <circle cx="318" cy="198" r="13" fill="#6f8f2e" />
        <circle cx="318" cy="198" r="10" fill="#d6dc6a" />
        <path d="M318 188v20M308 198h20M311 191l14 14M325 191l-14 14" stroke="#b9c04a" strokeWidth="1.5" />
      </g>
    </svg>
  );
}
