// 04.3-06 Task 3 ① — 서명 칸의 순수 좌표 계산(브라우저 API 없음). 포인터 · 키보드
// 입력 모두 이 함수들을 거쳐 고정 논리 영역 520×200에 저장한다. 「서명 있음」은
// 여기서 재지 않는다 — 잉크 측정 하나(domain/certs/signature-ink.ts).

export const LOGICAL_WIDTH = 520;
export const LOGICAL_HEIGHT = 200;
export const BASELINE_Y = 155;
export const EXPORT_SCALE = 2; // 제출 PNG 1040×400
export const PEN_START = { x: 24, y: BASELINE_Y } as const;

const KEY_STEP = 8;
const KEY_STEP_SHIFT = 24;

export type LogicalPoint = { x: number; y: number };

function clamp(value: number, max: number): number {
  return Math.min(Math.max(value, 0), max);
}

// 캔버스 CSS 좌표 → 논리 좌표. 배율 s = 폭 ÷ 520 하나를 x · y에 쓴다.
export function toLogical(point: LogicalPoint, cssWidth: number): LogicalPoint {
  const s = cssWidth / LOGICAL_WIDTH;
  return { x: clamp(point.x / s, LOGICAL_WIDTH), y: clamp(point.y / s, LOGICAL_HEIGHT) };
}

export function toScreen(point: LogicalPoint, cssWidth: number): LogicalPoint {
  const s = cssWidth / LOGICAL_WIDTH;
  return { x: point.x * s, y: point.y * s };
}

const DIRECTION: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

export function isArrowKey(key: string): boolean {
  return key in DIRECTION;
}

// 눌린 방향키들(둘이면 대각선)로 펜을 옮긴다. 영역 밖으로 나가지 않고, 가려던
// 만큼 못 가면 edge.
export function moveCursor(
  point: LogicalPoint,
  keys: readonly string[],
  opts: { shift: boolean },
): LogicalPoint & { edge: boolean } {
  const step = opts.shift ? KEY_STEP_SHIFT : KEY_STEP;
  let dx = 0;
  let dy = 0;
  for (const key of keys) {
    const d = DIRECTION[key];
    if (!d) continue;
    dx += d[0];
    dy += d[1];
  }
  const wantX = point.x + Math.sign(dx) * step;
  const wantY = point.y + Math.sign(dy) * step;
  const x = clamp(wantX, LOGICAL_WIDTH);
  const y = clamp(wantY, LOGICAL_HEIGHT);
  return { x, y, edge: x !== wantX || y !== wantY };
}

const COLUMNS = ["왼쪽", "가운데", "오른쪽"] as const;
const ROWS = ["위", "가운데", "아래"] as const;

// 칸을 가로 셋 · 세로 셋으로 나눈 위치 이름(가운데는 「가운데」).
export function gridCellName(point: LogicalPoint): string {
  const col = Math.min(2, Math.floor((point.x / LOGICAL_WIDTH) * 3));
  const row = Math.min(2, Math.floor((point.y / LOGICAL_HEIGHT) * 3));
  if (col === 1 && row === 1) return "가운데";
  return `${COLUMNS[col]} ${ROWS[row]}`;
}
