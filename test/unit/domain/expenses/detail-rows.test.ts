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
      { label: "지급처", value: "스테이지원", tone: "default" },
      { label: "증빙 종류", value: "세금계산서", tone: "default" },
      { label: "공급가액", value: "12,400,000", tone: "default" },
      { label: "공급가액", value: full.taxLine, tone: "default" },
      { label: "지급 예정일", value: "2026-09-19", tone: "default" },
      { label: "지급 방식", value: "계좌이체", tone: "default" },
      { label: "비고", value: "—", tone: "muted" },
    ]);
  });

  it("직원 지급처면 지급처 행 값이 그 직원 이름이다(06.5 D-6517)", () => {
    const rows = buildExpenseDetailRows({ ...full, vendorName: null, payeeUserName: "김지급" }).rows;
    expect(rows.find((row) => row.label === "지급처")).toEqual({ label: "지급처", value: "김지급", tone: "default" });
  });

  it("회사 대납 문서(받는 인원 값이 있다)면 공급가액 행들 다음에 `받는 인원 {N}명`(06.5 V15)", () => {
    const labels = buildExpenseDetailRows({ ...full, recipientCount: 5 }).rows;
    expect(labels.map((row) => row.label)).toEqual(["프로젝트", "견적 줄", "지급처", "증빙 종류", "공급가액", "공급가액", "받는 인원", "지급 예정일", "지급 방식", "비고"]);
    expect(labels.find((row) => row.label === "받는 인원")).toEqual({ label: "받는 인원", value: "5명", tone: "default" });
  });

  it("받는 인원이 null(회사 대납 아님)이거나 투영에서 빠지면 행이 없다", () => {
    expect(buildExpenseDetailRows({ ...full, recipientCount: null }).rows.some((row) => row.label === "받는 인원")).toBe(false);
    expect(buildExpenseDetailRows(full).rows.some((row) => row.label === "받는 인원")).toBe(false);
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
    expect(built.rows.some((row) => row.label === "지급처")).toBe(false);
    expect(built.rows.find((row) => row.label === "증빙 종류")).toEqual({ label: "증빙 종류", value: "—", tone: "muted" });
    expect(built.rows.find((row) => row.label === "지급 예정일")).toEqual({ label: "지급 예정일", value: "—", tone: "muted" });
  });

  it("팀 비용 문서는 제목이 `지출결의 — {팀} · {내용}`, 프로젝트 값 `프로젝트 미연결 · {종류}`(muted) 뒤에 팀 · 사용일 · 내용 행이고 견적 줄 · 분할 지급은 없다", () => {
    const team = {
      ...full,
      number: "T26-0001",
      projectNumber: null,
      projectName: null,
      lineNo: null,
      itemName: null,
      teamName: "기획1팀",
      teamExpenseKindLabel: "팀 관리비",
      usageDate: "2026-09-26",
      content: "팀 회식",
      installment: true,
      installmentSeq: 2,
    };
    const built = buildExpenseDetailRows(team);
    expect(built.title).toBe("지출결의 — 기획1팀 · 팀 회식");
    expect(built.rows.slice(0, 6)).toEqual([
      { label: "프로젝트", value: "프로젝트 미연결 · 팀 관리비", tone: "muted" },
      { label: "팀", value: "기획1팀", tone: "default" },
      { label: "사용일", value: "2026-09-26", tone: "default" },
      { label: "내용", value: "팀 회식", tone: "default" },
      { label: "지급처", value: "스테이지원", tone: "default" },
      { label: "증빙 종류", value: "세금계산서", tone: "default" },
    ]);
    expect(built.rows.map((row) => row.label)).not.toContain("견적 줄");
    expect(buildExpenseDetailRows({ ...team, content: null }).title).toBe("지출결의 — 기획1팀");
  });
});

// 06.1-14(재검토 2회차 카드 G-N2 — 사용자 확정): G15 종류 문서에서 보이는 파일이 0이고 숨긴 파일이 있으면 증빙 자리에 잠김 행 한 줄.
describe("buildExpenseDetailRows — 비공개 증빙 잠김 행", () => {
  const file = { id: "f1", name: "개인카드 전표.jpg", sizeBytes: 1024, contentType: "image/jpeg" };

  it("파일 0 + 잠김 글자면 지급 방식 다음 · 비고 앞에 muted 증빙 행 하나", () => {
    const rows = buildExpenseDetailRows({ ...full, evidenceFiles: [], hiddenEvidenceNotice: "비공개 증빙 · 경영관리만" }).rows;
    expect(rows.map((row) => row.label)).toEqual(["프로젝트", "견적 줄", "지급처", "증빙 종류", "공급가액", "공급가액", "지급 예정일", "지급 방식", "증빙", "비고"]);
    expect(rows.find((row) => row.label === "증빙")).toEqual({ label: "증빙", value: "비공개 증빙 · 경영관리만", tone: "muted" });
  });

  it("보이는 파일이 하나라도 남으면 파일 행 하나뿐이다(잠김 행 없음 — 라벨 겹침 방지)", () => {
    const rows = buildExpenseDetailRows({ ...full, evidenceFiles: [file], hiddenEvidenceNotice: "비공개 증빙 · 경영관리만" }).rows;
    const evidence = rows.filter((row) => row.label === "증빙");
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.files).toHaveLength(1);
  });

  it("파일 0 · 잠김 글자 없음이면 증빙 행이 없다", () => {
    expect(buildExpenseDetailRows({ ...full, evidenceFiles: [], hiddenEvidenceNotice: null }).rows.some((row) => row.label === "증빙")).toBe(false);
    expect(buildExpenseDetailRows(full).rows.some((row) => row.label === "증빙")).toBe(false);
  });
});
