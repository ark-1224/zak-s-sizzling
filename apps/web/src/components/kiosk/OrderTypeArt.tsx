// Drawings for the "Where will you eat today?" choice, in the same flat style as the
// welcome screen's sizzling plate: dine in is a set place (the plate on its board with a
// fork and spoon), take out is Zak's paper bag with the flame mark. Decorative only.
export function DineInArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 170" className={className} aria-hidden="true" role="presentation">
      {/* Spoon and fork either side */}
      <g fill="#8f8a82">
        <ellipse cx="22" cy="58" rx="11" ry="16" />
        <rect x="19" y="70" width="6" height="84" rx="3" />
        <rect x="211" y="70" width="6" height="84" rx="3" />
        <path d="M201 34h4v34h4V34h4v34h4V34h4v40a10 10 0 0 1-10 10h-0a10 10 0 0 1-10-10z" />
      </g>
      {/* Board, plate, food */}
      <ellipse cx="120" cy="112" rx="88" ry="40" fill="#6b3d22" />
      <ellipse cx="120" cy="106" rx="88" ry="40" fill="#9a5b32" />
      <path d="M44 100c30-8 60-2 82-7s50-6 74 3" stroke="#7d4626" strokeWidth="2.5" fill="none" opacity="0.7" />
      <ellipse cx="120" cy="96" rx="66" ry="28" fill="#1a100b" />
      <ellipse cx="120" cy="92" rx="66" ry="28" fill="#3a2a22" />
      <ellipse cx="120" cy="92" rx="56" ry="22" fill="#241812" />
      {[
        [96, 86, 8, "#8a3a17"],
        [112, 96, 7, "#b5541f"],
        [138, 88, 8, "#7a3312"],
        [150, 98, 6, "#c8692a"],
        [104, 102, 6, "#a04a1b"],
        [132, 102, 7, "#6e2c10"],
      ].map(([cx, cy, r, fill]) => (
        <rect
          key={`${cx}-${cy}`}
          x={Number(cx) - Number(r)}
          y={Number(cy) - Number(r) * 0.7}
          width={Number(r) * 2}
          height={Number(r) * 1.4}
          rx={Number(r) * 0.45}
          fill={String(fill)}
        />
      ))}
      <ellipse cx="122" cy="88" rx="15" ry="9" fill="#fbf4e6" />
      <ellipse cx="124" cy="87" rx="6" ry="4.5" fill="#e9a23b" />
      {/* Steam */}
      <g fill="none" stroke="#c9b08a" strokeWidth="4" strokeLinecap="round" opacity="0.8">
        <path d="M104 52c-7-8 7-13 0-22s6-14 0-21" />
        <path d="M136 52c-7-8 7-13 0-22s6-14 0-21" />
      </g>
    </svg>
  );
}

export function TakeOutArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 170" className={className} aria-hidden="true" role="presentation">
      {/* Shadow */}
      <ellipse cx="120" cy="160" rx="70" ry="8" fill="#000" opacity="0.12" />
      {/* Bag body with a folded top edge */}
      <path d="M62 52h116l-8 104a6 6 0 0 1-6 5H76a6 6 0 0 1-6-5z" fill="#c98f52" />
      <path d="M62 52h116l-2 18H64z" fill="#b57a40" />
      <path d="M150 52h28l-8 104a6 6 0 0 1-6 5h-18z" fill="#b57a40" opacity="0.55" />
      {/* Handles */}
      <g fill="none" stroke="#7a2a14" strokeWidth="6" strokeLinecap="round">
        <path d="M92 58V44a28 28 0 0 1 56 0v14" />
      </g>
      {/* Zak's flame mark on a honey badge */}
      <circle cx="118" cy="110" r="27" fill="#2b1912" />
      <circle cx="118" cy="110" r="22" fill="#e0a85a" />
      <path
        d="M118 92c4 8 13 11 13 22a13 13 0 0 1-26 0c0-6 3-9 6-12 0 5 2 8 5 9-1-7 0-13 2-19z"
        fill="#b84a20"
      />
      <path d="M118 108c2 4 6 5 6 10a6 6 0 0 1-12 0c0-3 2-5 4-6z" fill="#f1dbaa" />
    </svg>
  );
}
