import { useId } from "react";

/**
 * Conceptual brand visual: a lens over contract code. Callers funnel into the
 * same line; with `--conflict` they all write one storage slot, with `--fix`
 * the writes spread over separate slots. It carries no measured numbers.
 *
 * State comes from CSS custom properties (`--conflict`, `--fix`, 0..1) so the
 * landing page can drive it from scroll progress without React re-renders.
 * `state` pins it for static (mobile / reduced-motion) layouts.
 */

const CHAR = 8.4; // Geist Mono advance at 14px (0.6em)
const X0 = 150;
const Y0 = 141;
const LINE_H = 30;
const HOT_LINE = 5;
const HOT_Y = Y0 + HOT_LINE * LINE_H;
const LANE_Y = HOT_Y - 5;
const HOT_X = X0 + 4 * CHAR;
const LENS = { cx: 310, cy: 262, r: 188 };
const CALLERS = [206, 246, 326, 366];
const SLOTS = [196, 241, 286, 331, 376];
const SHARED_SLOT = 2;
const SLOT_X = 600;

type Kind = "kw" | "id" | "p";
const CODE: { indent: number; parts: [string, Kind][] }[] = [
  { indent: 0, parts: [["contract", "kw"], [" Collectible {", "id"]] },
  { indent: 2, parts: [["uint256 public", "kw"], [" totalSupply;", "id"]] },
  { indent: 2, parts: [["mapping", "kw"], ["(", "p"], ["uint256", "kw"], [" => ", "p"], ["address", "kw"], [") owner;", "id"]] },
  { indent: 0, parts: [] },
  { indent: 2, parts: [["function", "kw"], [" mint() ", "id"], ["external", "kw"], [" {", "p"]] },
  { indent: 4, parts: [] }, // hot line, drawn separately
  { indent: 4, parts: [["owner[id] = msg.sender;", "id"]] },
  { indent: 2, parts: [["}", "p"]] },
  { indent: 0, parts: [["}", "p"]] },
];

const TICKS = Array.from({ length: 60 }, (_, i) => {
  const angle = (i * 6 * Math.PI) / 180;
  const major = i % 5 === 0;
  const r1 = LENS.r + 6;
  const r2 = LENS.r + (major ? 16 : 10);
  return {
    x1: LENS.cx + r1 * Math.cos(angle),
    y1: LENS.cy + r1 * Math.sin(angle),
    x2: LENS.cx + r2 * Math.cos(angle),
    y2: LENS.cy + r2 * Math.sin(angle),
    major,
  };
});

const lanes = "min(1, calc(var(--conflict, 0) + var(--fix, 0)))";

export default function LensVisual({
  state,
  decorative = false,
  className = "",
}: {
  state?: "scan" | "conflict" | "fix";
  decorative?: boolean;
  className?: string;
}) {
  const fanStart = HOT_X + 22 * CHAR;
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <div className={`lens ${className}`} data-state={state}>
      <svg
        viewBox="0 0 640 540"
        role={decorative ? undefined : "img"}
        aria-hidden={decorative ? true : undefined}
        aria-label={
          decorative
            ? undefined
            : "Illustration: a lens over contract code. Calls from different users converge on one line and write one shared storage slot; after a fix the writes spread across separate slots."
        }
      >
        <defs>
          <radialGradient id={`${uid}-glass`} cx="0.38" cy="0.32" r="0.8">
            <stop offset="0" stopColor="#A996FF" stopOpacity="0.13" />
            <stop offset="0.6" stopColor="#836EF9" stopOpacity="0.04" />
            <stop offset="1" stopColor="#836EF9" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${uid}-trail`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#836EF9" stopOpacity="0" />
            <stop offset="1" stopColor="#836EF9" stopOpacity="0.16" />
          </linearGradient>
          <clipPath id={`${uid}-clip`}>
            <circle cx={LENS.cx} cy={LENS.cy} r={LENS.r - 2} />
          </clipPath>
        </defs>

        {/* Lens body */}
        <circle cx={LENS.cx} cy={LENS.cy} r={LENS.r} fill={`url(#${uid}-glass)`} />
        <circle cx={LENS.cx} cy={LENS.cy} r={LENS.r} fill="none" stroke="#ffffff" strokeOpacity="0.14" />
        <circle cx={LENS.cx} cy={LENS.cy} r={LENS.r - 12} fill="none" stroke="#836EF9" strokeOpacity="0.22" strokeDasharray="2 6" />
        <g stroke="#ffffff">
          {TICKS.map((t, i) => (
            <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} strokeOpacity={t.major ? 0.34 : 0.14} />
          ))}
        </g>
        <path
          d={`M ${LENS.cx - 150} ${LENS.cy - 112} A ${LENS.r - 6} ${LENS.r - 6} 0 0 1 ${LENS.cx - 40} ${LENS.cy - LENS.r + 10}`}
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.22"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Scan */}
        <g clipPath={`url(#${uid}-clip)`}>
          <g className="lens-scan">
            <rect x={LENS.cx - LENS.r} y={-56} width={LENS.r * 2} height={56} fill={`url(#${uid}-trail)`} />
            <line x1={LENS.cx - LENS.r} x2={LENS.cx + LENS.r} y1={0} y2={0} stroke="#A996FF" strokeOpacity="0.55" />
          </g>
        </g>

        {/* Line the lens found */}
        <rect
          x={X0 - 10}
          y={HOT_Y - 17}
          width={330}
          height={24}
          rx={4}
          fill="#836EF9"
          style={{ opacity: `calc(0.16 * (1 - ${lanes}))` }}
        />
        <rect
          x={HOT_X - 3}
          y={HOT_Y - 16}
          width={11 * CHAR + 6}
          height={22}
          rx={4}
          fill="#FF7A85"
          fillOpacity="0.14"
          stroke="#FF7A85"
          strokeOpacity="0.55"
          style={{ opacity: "var(--conflict, 0)" }}
        />
        <rect
          x={HOT_X - 3}
          y={HOT_Y - 16}
          width={17 * CHAR + 6}
          height={22}
          rx={4}
          fill="#5EE3C1"
          fillOpacity="0.1"
          stroke="#5EE3C1"
          strokeOpacity="0.45"
          style={{ opacity: "var(--fix, 0)" }}
        />

        {/* Code */}
        <g className="lens-code" style={{ opacity: `calc(1 - 0.4 * ${lanes})` }}>
          {CODE.map((line, i) =>
            line.parts.length ? (
              <text key={i} x={X0 + line.indent * CHAR} y={Y0 + i * LINE_H}>
                {line.parts.map(([text, kind], j) => (
                  <tspan key={j} className={`lens-${kind}`}>
                    {text}
                  </tspan>
                ))}
              </text>
            ) : null
          )}
        </g>
        <g className="lens-code">
          <g style={{ opacity: "calc(1 - var(--fix, 0))" }}>
            <text x={HOT_X} y={HOT_Y} className="lens-id" textLength={11 * CHAR} lengthAdjust="spacingAndGlyphs">
              totalSupply
            </text>
            <text x={HOT_X + 11 * CHAR} y={HOT_Y} className="lens-p">
              ++;
            </text>
          </g>
          <g style={{ opacity: "var(--fix, 0)" }}>
            <text x={HOT_X} y={HOT_Y} className="lens-id" textLength={17 * CHAR} lengthAdjust="spacingAndGlyphs">
              shardCount[shard]
            </text>
            <text x={HOT_X + 17 * CHAR} y={HOT_Y} className="lens-p">
              ++;
            </text>
          </g>
        </g>

        {/* Callers funnel into the same function */}
        <g style={{ opacity: lanes }}>
          <text x={40} y={176} className="lens-label" textAnchor="middle">
            callers
          </text>
          {CALLERS.map((y) => (
            <g key={y}>
              <circle cx={40} cy={y} r={5} fill="#13111C" stroke="#A996FF" strokeOpacity="0.8" />
              <path
                className="lens-flow"
                d={`M 46 ${y} C 100 ${y}, 118 ${LANE_Y}, ${HOT_X - 8} ${LANE_Y}`}
                fill="none"
                stroke="#A996FF"
                strokeOpacity="0.7"
                strokeWidth="1.5"
              />
            </g>
          ))}
        </g>

        {/* Storage */}
        <g style={{ opacity: lanes }}>
          <text x={SLOT_X + 10} y={170} className="lens-label" textAnchor="middle">
            storage
          </text>
          {SLOTS.map((y) => (
            <rect key={y} x={SLOT_X} y={y - 10} width={20} height={20} rx={5} fill="#13111C" stroke="#ffffff" strokeOpacity="0.2" />
          ))}
        </g>

        {/* Conflict: every call writes the same slot */}
        <g style={{ opacity: "var(--conflict, 0)" }}>
          <path
            className="lens-flow"
            d={`M ${HOT_X + 14 * CHAR + 6} ${LANE_Y} L ${SLOT_X - 4} ${LANE_Y}`}
            stroke="#FF7A85"
            strokeWidth="2.5"
            strokeOpacity="0.9"
          />
          <rect x={SLOT_X} y={SLOTS[SHARED_SLOT] - 10} width={20} height={20} rx={5} fill="#FF7A85" fillOpacity="0.28" stroke="#FF7A85" />
          <circle className="lens-pulse" cx={SLOT_X + 10} cy={SLOTS[SHARED_SLOT]} r={16} fill="none" stroke="#FF7A85" strokeOpacity="0.5" />
        </g>

        {/* Fix: writes spread over separate slots */}
        <g style={{ opacity: "var(--fix, 0)" }}>
          {SLOTS.filter((_, i) => i !== SHARED_SLOT).map((y) => (
            <g key={y}>
              <path
                className="lens-flow"
                d={`M ${fanStart} ${LANE_Y} C ${fanStart + 90} ${LANE_Y}, ${SLOT_X - 110} ${y}, ${SLOT_X - 4} ${y}`}
                fill="none"
                stroke="#5EE3C1"
                strokeOpacity="0.8"
                strokeWidth="1.5"
              />
              <rect x={SLOT_X} y={y - 10} width={20} height={20} rx={5} fill="#5EE3C1" fillOpacity="0.22" stroke="#5EE3C1" strokeOpacity="0.8" />
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
