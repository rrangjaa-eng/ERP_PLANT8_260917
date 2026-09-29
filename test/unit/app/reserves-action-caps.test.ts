import { describe, expect, it, vi } from "vitest";
import type { ZodType } from "zod";

// 묶음 ④ /review R8 — 리저브 일괄 저장은 거래처 행을 잠근 채 줄마다 쓴다. 요청 하나의 줄·보관 수에 상한이 없으면
// 큰 요청이 잠금을 오래 잡는다. 액션 가장자리 스키마가 줄(rows)·보관(archived) 각각 300개까지만 받는다.
// 액션 모듈은 서버 전용 의존을 끌고 오므로 흉내만 두고 .schema()에 넘긴 스키마를 붙잡아 검증한다.
const captured: { schema?: ZodType } = {};
vi.mock("@/lib/actions/client", () => ({
  authedActionClient: {
    schema: (schema: ZodType) => {
      captured.schema = schema;
      return { action: () => undefined };
    },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/domain/quotes/lines", () => ({ SaveRejectedError: class extends Error {} }));
vi.mock("@/domain/reserves", () => ({
  listReserves: vi.fn(),
  saveReserves: vi.fn(),
  ReserveBalanceRejectedError: class extends Error {},
  RESERVE_INPUT_REASONS: { entryNotFound: "줄", clientNotFound: "클라이언트", projectMismatch: "프로젝트", directionInvalid: "구분" },
}));
vi.mock("@/app/(app)/pnl/reserves/actions.registry", () => ({}));

await import("@/app/(app)/pnl/reserves/actions");

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";

function row(index: number) {
  const suffix = String(index).padStart(12, "0");
  return {
    id: `22222222-2222-4222-8222-${suffix}`,
    isNew: true as const,
    clientId: CLIENT_ID,
    entryDate: "2026-03-01",
    direction: "deposit" as const,
    amount: { currency: "KRW" as const, amount: 1_000, fxRate: 1 },
  };
}

function archived(index: number) {
  return { id: `33333333-3333-4333-8333-${String(index).padStart(12, "0")}`, version: 1 };
}

describe("saveReservesAction 입력 상한(리뷰 R8)", () => {
  it("줄 300개 · 보관 300개는 받는다", () => {
    const parsed = captured.schema?.safeParse({ rows: Array.from({ length: 300 }, (_, i) => row(i)), archived: Array.from({ length: 300 }, (_, i) => archived(i)) });
    expect(parsed?.success).toBe(true);
  });

  it("줄 301개는 거부한다", () => {
    expect(captured.schema?.safeParse({ rows: Array.from({ length: 301 }, (_, i) => row(i)) }).success).toBe(false);
  });

  it("보관 301개는 거부한다", () => {
    expect(captured.schema?.safeParse({ rows: [], archived: Array.from({ length: 301 }, (_, i) => archived(i)) }).success).toBe(false);
  });

  // Codex #4 — 배열 수준 오류는 어느 칸에도 붙지 않으므로 화면이 그대로 보일 상한 이유여야 한다(zod 기본 영어 문구 아님).
  function arrayMessages(input: unknown, key: "rows" | "archived") {
    const parsed = captured.schema?.safeParse(input);
    const issues = parsed?.success ? [] : (parsed?.error.issues ?? []);
    return issues.filter((issue) => issue.path.length === 1 && issue.path[0] === key).map((issue) => issue.message);
  }

  it("(Codex #4) 줄 301개의 거부 이유는 rows 경로 한 줄 `저장 전부 거부 · 저장당 300줄 상한`", () => {
    expect(arrayMessages({ rows: Array.from({ length: 301 }, (_, i) => row(i)) }, "rows")).toEqual(["저장 전부 거부 · 저장당 300줄 상한"]);
  });

  it("(Codex #4) 보관 301개의 거부 이유도 archived 경로 한 줄 같은 문구", () => {
    expect(arrayMessages({ rows: [], archived: Array.from({ length: 301 }, (_, i) => archived(i)) }, "archived")).toEqual(["저장 전부 거부 · 저장당 300줄 상한"]);
  });
});

// 묶음 ④ /review R12 — 보관 요청의 가장자리 검증 오류는 화면이 그 줄의 칸 오류로 붙인다. id든 version이든 이유는
// 「줄을 찾을 수 없음 · 새로 고침」(RESERVE_INPUT_REASONS.entryNotFound) 하나다 — zod 기본 영어 문구가 화면에 나가지 않는다.
describe("saveReservesAction 보관 요청 검증 이유(리뷰 R12)", () => {
  function archivedIssues(entry: unknown) {
    const parsed = captured.schema?.safeParse({ rows: [], archived: [entry] });
    return parsed?.success ? [] : (parsed?.error.issues ?? []);
  }

  it("정수가 아닌 version은 entryNotFound 이유", () => {
    expect(archivedIssues({ id: archived(0).id, version: 1.5 }).map((issue) => issue.message)).toEqual(["줄"]);
  });

  it("숫자가 아닌 version도 entryNotFound 이유", () => {
    expect(archivedIssues({ id: archived(0).id, version: "1" }).map((issue) => issue.message)).toEqual(["줄"]);
  });
});
