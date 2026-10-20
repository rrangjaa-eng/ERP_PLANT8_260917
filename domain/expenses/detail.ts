import type { DocumentDetailRow, DocumentDetailRows } from "@/domain/approvals/kinds";
import { formatForeignAmount, formatFxRate, formatKrw } from "@/lib/format-number";
import type { ExpenseDetailDto } from "@/domain/expenses/dto";

// 05-05 C1: 결재 시트 상세 행 — 투영 결과(Partial)만 읽는 순수 함수(ENG-17). 행은 문서 화면(S7) 읽기 칸 순서이고 값이 null이면
// `—`(muted), 투영에서 빠진 필드는 행째 만들지 않는다 — 금액이 빠지면 공급가액 행 · 계산 한 줄도 없다. 증빙 갈래 · 세율 바뀜은 05-10이 덧붙였다(팀 비용 행은 05-07).

const DASH = "—";

function textRow(label: string, value: string | null | undefined): DocumentDetailRow | null {
  if (value === undefined) return null;
  return value === null || value === "" ? { label, value: DASH, tone: "muted" } : { label, value, tone: "default" };
}

function compact(rows: (DocumentDetailRow | null)[]): DocumentDetailRow[] {
  return rows.filter((row): row is DocumentDetailRow => row !== null);
}

export function expenseDetailTitle(projected: Partial<ExpenseDetailDto>): string {
  if (projected.teamName) return `지출결의 — ${projected.teamName}${projected.content ? ` · ${projected.content}` : ""}`;
  return projected.projectName && projected.itemName ? `지출결의 — ${projected.projectName} · ${projected.itemName}` : "지출결의";
}

export function buildExpenseDetailRows(projected: Partial<ExpenseDetailDto>): DocumentDetailRows {
  const projectText =
    projected.projectName === undefined ? undefined : [projected.projectNumber, projected.projectName].filter(Boolean).join(" ") || null;
  const lineText = projected.itemName === undefined ? undefined : [projected.lineNo, projected.itemName].filter(Boolean).join(" ") || null;
  // 팀 비용 문서 — 프로젝트 값은 `프로젝트 미연결 · {종류}`(muted), 견적 줄 · 분할 지급 대신 팀 · 사용일 · 내용.
  const teamRows = projected.teamName
    ? compact([
        { label: "프로젝트", value: ["프로젝트 미연결", projected.teamExpenseKindLabel].filter(Boolean).join(" · "), tone: "muted" },
        textRow("팀", projected.teamName),
        textRow("사용일", projected.usageDate),
        textRow("내용", projected.content),
      ])
    : null;
  const rows = compact([
    ...(teamRows ?? [textRow("프로젝트", projectText), textRow("견적 줄", lineText)]),
    !teamRows && projected.installment ? textRow("분할 지급", projected.installmentSeq ? `${projected.installmentSeq}회차` : DASH) : null,
    // 06.5 결정 맥락 9 · D-6517: 지급처 = 거래처 이름 → 직원 이름(둘 다 투영에서 빠지면 행째 없다).
    textRow(
      "지급처",
      projected.vendorName ||
        projected.payeeUserName ||
        (projected.vendorName === undefined && projected.payeeUserName === undefined ? undefined : null),
    ),
    textRow("증빙 종류", projected.evidenceTypeName),
  ]);
  // 공급가액 — 원화 1행 + 외화면 같은 라벨 둘째 행 + 계산 한 줄 행(결재함 sheetRows가 같은 라벨을 한 칸의 여러 줄로 묶는다).
  if (projected.supply) {
    const { currency, amount, fxRate, amountKrw } = projected.supply;
    rows.push({ label: "공급가액", value: formatKrw(amountKrw), tone: "default" });
    if (currency !== "KRW") rows.push({ label: "공급가액", value: `${currency} ${formatForeignAmount(amount)} @${formatFxRate(fxRate)}`, tone: "default" });
  }
  if (projected.taxLine) rows.push({ label: "공급가액", value: projected.taxLine, tone: "default" });
  if (projected.taxDriftText) rows.push({ label: "공급가액", value: projected.taxDriftText, tone: "warning" });
  // 06.5 V15: 받는 인원 — 회사 대납 문서(값이 있을 때)만, 공급가액 행들 다음(폼의 칸 순서와 같다). 금액 숨김 계급은 투영에서 빠져 행이 없다.
  if (typeof projected.recipientCount === "number") rows.push({ label: "받는 인원", value: `${projected.recipientCount}명`, tone: "default" });
  // 증빙 갈래(05-10) — 살아 있는 파일이 있을 때만, 지급 방식 다음 · 비고 앞(문서 화면 순서).
  const evidenceRow: DocumentDetailRow | null = projected.evidenceFiles?.length
    ? {
        label: "증빙",
        value: projected.evidenceFiles.map((file) => file.name).join(" · "),
        tone: "default",
        files: projected.evidenceFiles.map((file) => ({ id: file.id, name: file.name, sizeBytes: file.sizeBytes, contentType: file.contentType })),
      }
    : projected.hiddenEvidenceNotice
      ? // 06.1-14(G15 · 카드 G-N2 추천안 ① — 사용자 확정): 보이는 파일이 0이고 숨긴 파일이 있으면 같은 자리에 잠김 한 줄(「증빙 없음」과 「있지만 못 봄」을 가른다).
        { label: "증빙", value: projected.hiddenEvidenceNotice, tone: "muted" as const }
      : null;
  rows.push(
    ...compact([textRow("지급 예정일", projected.scheduledPaymentDate), textRow("지급 방식", projected.paymentMethodName)]),
    ...(evidenceRow ? [evidenceRow] : []),
    ...compact([textRow("비고", projected.note)]),
  );
  return {
    title: expenseDetailTitle(projected),
    subtitle: [projected.number, projected.drafterName].filter(Boolean).join(" · "),
    rows,
  };
}
