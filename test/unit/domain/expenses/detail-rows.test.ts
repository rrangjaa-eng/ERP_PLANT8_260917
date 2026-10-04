import { describe, expect, it } from "vitest";
import { moneyFromRow } from "@/domain/money";
import { buildExpenseDetailRows } from "@/domain/expenses/detail";

// 05-05 C1: 결재 시트 상세 — 투영 결과(Partial)만 읽는 순수 함수. 빠진 필드는 행째 없고 null이면 `—`(muted).

const krw = moneyFromRow({ currency: "KRW", foreignAmount: null, fxRate: "1.0000", amountKrw: 12_400_000 });
const usd = moneyFromRow({ currency: "USD", foreignAmount: "4200.00", fxRate: "1318.4000", amountKrw: 5_537_280 });
const full = {
  number: "26001-0004",
  projectNumber: "26001",
  projectName: "아이오닉9 미디어 론칭 쇼케이스",
  lineNo: 1,
  itemName: "무대설치",
  installment: false,
  installmentSeq: null,
  vendorName: "스테이지원",
  evidenceTypeName: "세금계산서",
  supply: krw,
  taxLine: "부가세 10% 1,240,000 · 지급 총액 13,640,000 · 세금계산서 규칙",
  scheduledPaymentDate: "2026-09-19",
  paymentMethodName: "계좌이체",
  note: null,
  drafterName: "박서연",
  createdAt: new Date("2026-09-15T02:20:00Z"),
};

describe("buildExpenseDetailRows", () => {
  it("제목 · 부제 · 문서 화면 읽기 칸 순서의 문자열 행", () => {
    const built = buildExpenseDetailRows(full);
    expect(built.title).toBe("지출결의 — 아이오닉9 미디어 론칭 쇼케이스 · 무대설치");
    expect(built.subtitle).toBe("26001-0004 · 박서연");
    expect(built.rows).toEqual([
      { label: "프로젝트", value: "26001 아이오닉9 미디어 론칭 쇼케이스", tone: "default" },
      { label: "견적 줄", value: "1 무대설치", tone: "default" },
      { label: "거래처", value: "스테이지원", tone: "default" },
      { label: "증빙 종류", value: "세금계산서", tone: "default" },
      { label: "공급가액", value: "12,400,000", tone: "default" },
      { label: "공급가액", value: full.taxLine, tone: "default" },
      { label: "지급 예정일", value: "2026-09-19", tone: "default" },
      { label: "지급 방식", value: "계좌이체", tone: "default" },
      { label: "비고", value: "—", tone: "muted" },
    ]);
  });

  it("분할이면 견적 줄 다음에 분할 지급 행", () => {
    const rows = buildExpenseDetailRows({ ...full, installment: true, installmentSeq: 2 }).rows;
    expect(rows.slice(0, 3).map((row) => row.label)).toEqual(["프로젝트", "견적 줄", "분할 지급"]);
    expect(rows[2]?.value).toBe("2회차");
  });

  it("외화면 같은 라벨 둘째 행에 외화 금액과 환율", () => {
    const rows = buildExpenseDetailRows({ ...full, supply: usd }).rows.filter((row) => row.label === "공급가액");
    expect(rows.map((row) => row.value)).toEqual(["5,537,280", "USD 4,200.00 @1,318.4", full.taxLine]);
  });

  it("금액 투영이 빠지면 공급가액 행 · 계산 한 줄이 행째 없다", () => {
    const hidden: Partial<typeof full> = { ...full };
    delete hidden.supply;
    delete hidden.taxLine;
    const built = buildExpenseDetailRows(hidden);
    expect(built.rows.some((row) => row.label === "공급가액")).toBe(false);
    expect(JSON.stringify(built)).not.toContain("12,400,000");
  });

  it("값이 null이면 — (muted), 투영에서 빠진 필드는 행이 없다", () => {
    const rest: Partial<Omit<typeof full, "evidenceTypeName" | "scheduledPaymentDate">> & { evidenceTypeName: null; scheduledPaymentDate: null } = {
      ...full,
      evidenceTypeName: null,
      scheduledPaymentDate: null,
    };
    delete rest.vendorName;
    const built = buildExpenseDetailRows(rest);
    expect(built.rows.some((row) => row.label === "거래처")).toBe(false);
    expect(built.rows.find((row) => row.label === "증빙 종류")).toEqual({ label: "증빙 종류", value: "—", tone: "muted" });
    expect(built.rows.find((row) => row.label === "지급 예정일")).toEqual({ label: "지급 예정일", value: "—", tone: "muted" });
  });
});
