import { describe, expect, it } from "vitest";
import type { HolidayLookup } from "@/domain/holidays/business-day";
import { collectionStatus, type CollectionIssue } from "@/domain/revenue/collection";

// 07-22(D-746 · D-735 · C-P2-11 · K23) — 수금 지연 판정 한 벌. 공휴일은 고정 Set을 HolidayLookup 꼴로 감싸 주입한다(DB 없음).
const NO_HOLIDAYS: HolidayLookup = () => new Set();
function holidays(...dates: string[]): HolidayLookup {
  const set = new Set(dates);
  return () => set;
}

let seq = 0;
function issue(entryDate: string, amountKrw: number, createdAt?: string): CollectionIssue {
  seq += 1;
  return {
    entryDate,
    amountKrw,
    createdAt: new Date(createdAt ?? `${entryDate}T09:00:00Z`),
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
  };
}

function shuffled<T>(items: readonly T[]): T[][] {
  // 모든 순열 — 줄 순서와 무관함을 단언한다.
  if (items.length <= 1) return [items.slice()];
  return items.flatMap((item, index) => shuffled([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest]));
}

describe("collectionStatus — 기본(발행일 + 기한 일수)", () => {
  const issues = [issue("2026-03-01", 1000)];

  it("예정일 당일은 지연이 아니다(오늘 > 예정일만)", () => {
    expect(collectionStatus({ issues, paidSupplyKrw: 0, dueDays: 60, today: "2026-04-30", lookup: NO_HOLIDAYS })).toEqual({
      overdue: false,
      dueDate: "2026-04-30",
    });
  });

  it("예정일 다음 날부터 지연이다", () => {
    expect(collectionStatus({ issues, paidSupplyKrw: 0, dueDays: 60, today: "2026-05-01", lookup: NO_HOLIDAYS })).toEqual({
      overdue: true,
      dueDate: "2026-04-30",
    });
  });
});

describe("collectionStatus — 여러 발행 · 주말 당김(C-P2-11)", () => {
  const issues = [issue("2026-03-01", 600), issue("2026-04-01", 400)];
  const at = (today: string) => collectionStatus({ issues, paidSupplyKrw: 600, dueDays: 60, today, lookup: NO_HOLIDAYS });

  it("덜 받은 첫 줄(04-01) + 60 = 05-31(일) → 주말이면 앞 영업일 05-29(금)", () => {
    expect(at("2026-05-15")).toEqual({ overdue: false, dueDate: "2026-05-29" });
    expect(at("2026-05-29")).toEqual({ overdue: false, dueDate: "2026-05-29" });
    expect(at("2026-05-30")).toEqual({ overdue: true, dueDate: "2026-05-29" });
  });
});

describe("collectionStatus — 공휴일 당김(C-P2-11)", () => {
  it("예정일이 평일 공휴일이면 앞 영업일", () => {
    // 04-01 + 30 = 05-01(금) — 공휴일 → 04-30(목). 기한 설정 30이면 30일 기준.
    const result = collectionStatus({
      issues: [issue("2026-04-01", 1000)],
      paidSupplyKrw: 0,
      dueDays: 30,
      today: "2026-05-01",
      lookup: holidays("2026-05-01"),
    });
    expect(result).toEqual({ overdue: true, dueDate: "2026-04-30" });
  });

  it("공휴일 앞이 주말이면 그 앞 금요일", () => {
    // 03-05 + 60 = 05-04(월) 공휴일 → 일 · 토 건너 05-01(금).
    const result = collectionStatus({
      issues: [issue("2026-03-05", 1000)],
      paidSupplyKrw: 0,
      dueDays: 60,
      today: "2026-05-02",
      lookup: holidays("2026-05-04"),
    });
    expect(result).toEqual({ overdue: true, dueDate: "2026-05-01" });
  });
});

describe("collectionStatus — K23 음수 발행 줄(덮는 금액에 더해 앞 발행부터)", () => {
  it("전액 취소 — 발행 합계 0 ≤ 입금 0이면 지연 없음 · dueDate null", () => {
    const result = collectionStatus({
      issues: [issue("2026-03-01", 1000), issue("2026-03-05", -1000)],
      paidSupplyKrw: 0,
      dueDays: 60,
      today: "2026-12-31",
      lookup: NO_HOLIDAYS,
    });
    expect(result).toEqual({ overdue: false, dueDate: null });
  });

  it("전액 취소 후 같은 날 재발행 — 기준은 재발행 날(03-05 → 05-04), 같은 날 두 줄 순서를 바꿔도 같다", () => {
    const original = issue("2026-03-01", 1000);
    const cancel = issue("2026-03-05", -1000, "2026-03-05T10:00:00Z");
    const reissue = issue("2026-03-05", 1000, "2026-03-05T09:00:00Z");
    const cancelFirst = issue("2026-03-05", -1000, "2026-03-05T08:00:00Z");
    for (const lines of [...shuffled([original, cancel, reissue]), ...shuffled([original, cancelFirst, reissue])]) {
      expect(collectionStatus({ issues: lines, paidSupplyKrw: 0, dueDays: 60, today: "2026-05-05", lookup: NO_HOLIDAYS })).toEqual({
        overdue: true,
        dueDate: "2026-05-04",
      });
    }
  });

  it("부분 감액 — 덮는 금액 900 < 1,000이면 기준 03-01, 입금 700이면 지연 없음(발행 합계 700 ≤ 입금)", () => {
    const issues = [issue("2026-03-01", 1000), issue("2026-03-10", -300)];
    expect(collectionStatus({ issues, paidSupplyKrw: 600, dueDays: 60, today: "2026-05-01", lookup: NO_HOLIDAYS })).toEqual({
      overdue: true,
      dueDate: "2026-04-30",
    });
    expect(collectionStatus({ issues, paidSupplyKrw: 700, dueDays: 60, today: "2026-05-01", lookup: NO_HOLIDAYS })).toEqual({
      overdue: false,
      dueDate: null,
    });
  });

  it("같은 날 양수 세 줄 · 입금이 그 사이까지 덮음 — 줄 순서를 어떻게 섞어도 같은 dueDate", () => {
    const sameDay = [issue("2026-03-01", 300), issue("2026-03-01", 300), issue("2026-03-01", 400)];
    for (const lines of shuffled(sameDay)) {
      expect(collectionStatus({ issues: lines, paidSupplyKrw: 500, dueDays: 60, today: "2026-05-01", lookup: NO_HOLIDAYS })).toEqual({
        overdue: true,
        dueDate: "2026-04-30",
      });
    }
  });

  it("같은 날 줄과 다른 날 줄이 섞여도 순서와 무관 — (entry_date · 만든 시각 · id) 순 누적", () => {
    const lines = [issue("2026-03-01", 500), issue("2026-04-01", 500, "2026-03-01T00:00:00Z"), issue("2026-03-01", 500, "2026-04-02T00:00:00Z")];
    for (const order of shuffled(lines)) {
      // 03-01 두 줄(1,000)이 입금 1,000으로 덮이고 04-01이 덜 받은 첫 줄 → 05-31(일) → 05-29.
      expect(collectionStatus({ issues: order, paidSupplyKrw: 1000, dueDays: 60, today: "2026-06-01", lookup: NO_HOLIDAYS })).toEqual({
        overdue: true,
        dueDate: "2026-05-29",
      });
    }
  });

  it("한계(플래그된 가정 AQ-32) — 앞 발행을 일부 받은 채 뒤 발행 취소: 줄 연결이 없어 기준은 뒤 발행 날(03-10)", () => {
    // 덮는 금액 = 600 + 500 = 1,100 → 03-01(1,000)은 덮이고 03-10(누적 1,500)이 첫 미수. 03-10 + 60 = 05-09(토) → 05-08(금).
    const result = collectionStatus({
      issues: [issue("2026-03-01", 1000), issue("2026-03-10", 500), issue("2026-03-20", -500)],
      paidSupplyKrw: 600,
      dueDays: 60,
      today: "2026-05-09",
      lookup: NO_HOLIDAYS,
    });
    expect(result).toEqual({ overdue: true, dueDate: "2026-05-08" });
  });
});

describe("collectionStatus — 경계", () => {
  it("입금 ≥ 발행이면 지연 없음", () => {
    expect(
      collectionStatus({ issues: [issue("2026-01-01", 1000)], paidSupplyKrw: 1000, dueDays: 60, today: "2026-12-31", lookup: NO_HOLIDAYS }),
    ).toEqual({ overdue: false, dueDate: null });
    expect(
      collectionStatus({ issues: [issue("2026-01-01", 1000)], paidSupplyKrw: 1500, dueDays: 60, today: "2026-12-31", lookup: NO_HOLIDAYS }),
    ).toEqual({ overdue: false, dueDate: null });
  });

  it("발행 줄이 없으면 지연 없음", () => {
    expect(collectionStatus({ issues: [], paidSupplyKrw: 0, dueDays: 60, today: "2026-12-31", lookup: NO_HOLIDAYS })).toEqual({
      overdue: false,
      dueDate: null,
    });
  });

  it("금액 0 줄은 덜 받은 첫 줄이 되지 않는다", () => {
    const result = collectionStatus({
      issues: [issue("2026-03-01", 0), issue("2026-04-01", 1000)],
      paidSupplyKrw: 0,
      dueDays: 60,
      today: "2026-06-01",
      lookup: NO_HOLIDAYS,
    });
    expect(result).toEqual({ overdue: true, dueDate: "2026-05-29" });
  });

  it("예정일이 해를 넘으면 그 해의 lookup으로 당긴다", () => {
    const byYear: HolidayLookup = (year) => (year === 2027 ? new Set(["2027-01-29"]) : new Set());
    // 2026-11-30 + 60 = 2027-01-29(금) 공휴일 → 01-28(목).
    const result = collectionStatus({ issues: [issue("2026-11-30", 1000)], paidSupplyKrw: 0, dueDays: 60, today: "2027-02-01", lookup: byYear });
    expect(result).toEqual({ overdue: true, dueDate: "2027-01-28" });
  });
});
