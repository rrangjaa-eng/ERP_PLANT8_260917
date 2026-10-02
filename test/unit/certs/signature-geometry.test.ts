import { describe, expect, it } from "vitest";
import {
  BASELINE_Y,
  EXPORT_SCALE,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  PEN_START,
  gridCellName,
  moveCursor,
  toLogical,
  toScreen,
} from "@/app/c/[token]/signature-geometry";

// 04.3-06 Task 3 ① — 서명 칸 논리 영역 520×200 좌표(순수, 브라우저 API 없음).

describe("상수", () => {
  it("논리 영역 520×200 · 기준선 155 · 내보내기 2배 · 펜 시작 (24, 155)", () => {
    expect([LOGICAL_WIDTH, LOGICAL_HEIGHT, BASELINE_Y, EXPORT_SCALE]).toEqual([520, 200, 155, 2]);
    expect(PEN_START).toEqual({ x: 24, y: 155 });
  });
});

describe("toLogical — 배율 하나(폭 ÷ 520) · 영역 안으로 잘라 넣기", () => {
  it("폭 416(배율 0.8)에서 (208, 80) → (260, 100)", () => {
    expect(toLogical({ x: 208, y: 80 }, 416)).toEqual({ x: 260, y: 100 });
  });

  it("영역 밖은 잘라 넣는다", () => {
    expect(toLogical({ x: -10, y: 500 }, 416)).toEqual({ x: 0, y: 200 });
  });

  it("폭이 416 → 208 → 832로 바뀌어도 논리 점은 그대로이고 화면 점 = 논리 × 새 배율(원은 원)", () => {
    const logical = toLogical({ x: 208, y: 80 }, 416);
    for (const width of [416, 208, 832]) {
      const screen = toScreen(logical, width);
      const scale = width / 520;
      expect(screen).toEqual({ x: logical.x * scale, y: logical.y * scale });
      expect(toLogical(screen, width)).toEqual(logical);
    }
    // 가로 · 세로 같은 배율 — 반지름 10인 원의 두 축 거리가 같다.
    const center = { x: 100, y: 100 };
    const right = toScreen({ x: 110, y: 100 }, 208);
    const down = toScreen({ x: 100, y: 110 }, 208);
    const c = toScreen(center, 208);
    expect(right.x - c.x).toBeCloseTo(down.y - c.y);
  });
});

describe("moveCursor — 방향키 8 · Shift 24 · 두 키 대각선 · 가장자리", () => {
  it("ArrowRight → x + 8", () => {
    expect(moveCursor({ x: 24, y: 155 }, ["ArrowRight"], { shift: false })).toEqual({ x: 32, y: 155, edge: false });
  });

  it("Shift → 24 이동", () => {
    expect(moveCursor({ x: 24, y: 155 }, ["ArrowRight"], { shift: true })).toEqual({ x: 48, y: 155, edge: false });
  });

  it("두 방향키 → 대각선", () => {
    expect(moveCursor({ x: 24, y: 155 }, ["ArrowRight", "ArrowUp"], { shift: false })).toEqual({
      x: 32,
      y: 147,
      edge: false,
    });
  });

  it("가장자리에서 더 가면 그대로 + edge", () => {
    expect(moveCursor({ x: 0, y: 155 }, ["ArrowLeft"], { shift: false })).toEqual({ x: 0, y: 155, edge: true });
    expect(moveCursor({ x: 516, y: 196 }, ["ArrowRight", "ArrowDown"], { shift: false })).toEqual({
      x: 520,
      y: 200,
      edge: true,
    });
  });
});

describe("gridCellName — 3×3 위치 이름", () => {
  it.each([
    [{ x: 260, y: 100 }, "가운데"],
    [{ x: 10, y: 190 }, "왼쪽 아래"],
    [{ x: 10, y: 10 }, "왼쪽 위"],
    [{ x: 510, y: 10 }, "오른쪽 위"],
    [{ x: 260, y: 190 }, "가운데 아래"],
    [{ x: 510, y: 100 }, "오른쪽 가운데"],
  ])("%o → %s", (point, name) => {
    expect(gridCellName(point)).toBe(name);
  });
});
