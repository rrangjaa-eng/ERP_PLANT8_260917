"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { ListScreen } from "@/ui/list-screen/ListScreen";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { Table } from "@/ui/table/Table";
import type { TableColumn } from "@/ui/table/types";
import { useEditableWidth } from "@/ui/table/use-editable-width";
import { Num } from "@/ui/num/Num";
import { Button, buttonLinkClassName } from "@/ui/button/Button";
import { useCommaInput } from "@/ui/input/use-comma-input";
import { Pagination } from "@/ui/pagination/Pagination";
import { pageRangeText } from "@/ui/pagination/page-window";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { STATUS_KIND, type StatusWord } from "@/ui/status-tag/status-map";
import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import type { PaymentTargetRowDto } from "@/domain/expenses/dto";
import type { BatchPaymentResult } from "@/domain/payments/batch";
import type { ApprovingPaymentWeek, SelectedTransferSum } from "@/domain/payments/targets";
import type { ConfirmEvidenceResult } from "@/domain/evidence-reviews";
import type { PaymentAccount } from "@/domain/payments";
import { AccountNumberCell } from "@/app/(app)/admin/vendors/account-number";
import { revealVendorAccountNumberAction } from "@/app/(app)/admin/vendors/actions";
import { revealPersonAccountNumberAction } from "@/app/(app)/admin/people/[id]/actions";
import { AMOUNT_HIDDEN, DIFF_REASON_REQUIRED, NOT_BUSINESS_DAY, THIS_WEEK_PASSED, TRANSFER_NOT_NUMBER, TRANSFER_NOT_POSITIVE } from "@/domain/payments/action-row";
import { formatKrw } from "@/lib/format-number";
import { Toast } from "@/ui/toast/Toast";
import {
  completePaymentsBatchAction,
  exportBankTransferFileAction,
  moveToThisWeekAction,
  previewTransferPayeesAction,
  revertScheduledPayDatesAction,
  sumSelectedTransfersAction,
} from "./actions";
import {
  applyBatchResult,
  diffCount,
  editReason,
  editTransfer,
  firstOffPageIssue,
  nextSumSeq,
  offPageSnapshotRows,
  otherPageCount,
  readStoredSelection,
  reconcileAcrossPages,
  restoreSelection,
  selectionKey,
  snapshotCounts,
  sumKeyOf,
  sumRequestRows,
  transferNumber,
  writeStoredSelection,
  type SelectionState,
} from "./payment-selection";
import { BatchPaymentDialog, rememberPayDate, rememberedPayDate } from "./batch-payment-dialog";
import { EvidenceConfirmDialog } from "./evidence-confirm-dialog";
import { StatusFilter, type FilterSelect } from "./status-filter";
import { PAYMENT_TARGET_COLUMN_LABELS, PAYMENT_TARGET_VIEW } from "./list-columns";
import styles from "./expenses.module.css";

// 06-15(UI-SPEC S1 · S2): 「지급 대상」 보기 — 05 ListScreen 틀 그대로(제목 `지출결의`, 부제 없음). 선택 열은 06-29 `Table.selection`,
// 1차 `지급 완료 N`은 06-29 `ListScreen.primaryAction` 버튼 갈래 — 둘 다 ≥1024에서만(DR-36, 그 미만은 보기 전용 · 폰은 행 → 문서 화면).
// 행을 고를 수 있는지 · 이유는 서버 행 값(selectable · reason)을 그대로 쓴다 — 클라이언트는 판정하지 않는다. 처리 응답 뒤 처리된 행은 빠지고
// 막힌 행은 자리를 지키며 행 아래 이유 한 줄(위험 색)이 서고, 선택은 응답이 다시 판정한 selectable로 06-29 reconcileSelection이 다시 세운다(H-3).
// 결과 글자는 처음부터 DOM에 있는 빈 aria-live 영역에 쓴다(필터 다음 자리 — 1차와 떨어짐, M-2). 토스트 없음(C12).
// 06-17: P4 행의 이체액 · 차이 사유 편집(04.6 편집 표 칸 — 기본값 = 지급 총액, 고치면 그 행이 저절로 골라짐), 고른 건 이체액 합 · 행별 차이는
// 서버 액션(sumSelectedTransfersAction) 응답 — 합계 번호(고른 id 집합 · 고른 행 이체액이 바뀔 때만 +1)로 낡은 응답을 버린다(O-18 — 화면은 금액을
// 셈하지 않고 건수만 센다). 06-20: 지급 방식 칸의 계좌(PaymentAccountValue) — 「지급 완료」 보기는 paid-list.tsx.

// 07-16(J11): approving = 그 주 결재 중 참고 행(07-01 approvingByWeek) — 하위 그룹 머리글 · 상태 낱말. 고를 수 없고(체크박스 없음) 합계에 들지 않는다.
export type PaymentTargetScreenRow = Partial<PaymentTargetRowDto> & {
  id: string;
  group: string;
  groupTone?: "warning";
  approving?: { header: string; status: string };
};

// 06.5-06: 이체 파일 막힘도 같은 맵 · 같은 줄 자리 — 끝 링크(link)가 있고, 지급 게이트가 아니라 selectable은 참이다(UI-SPEC V5 「막힌 건」).
type Blocked = {
  reason: string;
  selectable: boolean;
  selectableReason: string | null;
  newPayableKrw: number | null;
  row: PaymentTargetScreenRow;
  index: number;
  link?: { label: string; href: string } | null;
};

type ResultLine = { time: string; processed: number; blocked: number };

// 06.5-06(EP3-C4): 이체 파일 결과 — 내려받은 뒤 화면 상태에는 시각 · 줄 수 · 문서 수 · 막힌 수만 남긴다(파일 바이트는 버린다).
type TransferFileResult = { time: string; lineCount: number; docCount: number; blocked: number };

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// 서버가 준 base64 → Blob 다운로드(action-log ExportButton과 같은 방식). URL은 누른 직후 거둔다.
function downloadBase64(base64: string, filename: string) {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: XLSX_TYPE }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const NO_RESPONSE = "결과를 받지 못함 · 새로 고침";

// 07-16(J9 · K6 · N4 · U8): 「이번 주로」 결과 — 옮긴 건(되돌리기 재료: 이전 값 · 새 version) · 막힌 건 수. 전부 거부 · 응답 없음은 실패 꼴(사유 · 다시 보낼
// 입력 — 요청째 서버 거부일 때만, 그 밖은 null). 되돌리기도 같은 꼴. 결과 줄은 다음 제자리 행동이나 화면 이탈까지 남는다(U7 — 시간으로 지우지 않음).
type MovedItem = { expenseId: string; before: string | null; version: number };
type MoveResult =
  | { kind: "moved"; moved: MovedItem[]; blocked: number }
  | { kind: "failed"; reason: string; retry: { expenseId: string; version: number }[] | null }
  | { kind: "revertFailed"; reason: string; retry: { expenseId: string; date: string | null; version: number }[] | null }
  // 검토 M-1: 되돌리기 일부 거부 — 되돌린 건수 · 막힌 건수(막힌 건은 행 오류 줄).
  | { kind: "revertPartial"; reverted: number; blocked: number };

// 막힌 행 오류 줄 낱말 — 영업일 · 과거(이번 주 지급일 지남) 거부는 UI-SPEC SC-01 낱말 `영업일이 아닌 날`, 그 밖(version 충돌 등)은 서버 사유 그대로.
function moveReasonText(reason: string): string {
  return reason === NOT_BUSINESS_DAY || reason === THIS_WEEK_PASSED ? "영업일이 아닌 날" : reason;
}

// 「이번 주로」로 옮길 수 있는 행 — 마감 지나 밀린 건(07-01 pushReason cutoff)만. 계산 실패 행(R15)은 없다.
function movable(row: PaymentTargetScreenRow): boolean {
  return row.paymentPushReason === "cutoff" && row.paymentScheduleFailed !== true && typeof row.version === "number";
}

// 07-16(J11 · K9): 결재 중 하위 그룹 — 서버가 정한 쪽(week.page — 그 주 그룹이 끝나는 쪽, 그 주 지급 대상이 없으면 1쪽) 하나에만 선다(감사 #4).
// 같은 라벨 지급 대상 그룹 맨 아래 `결재 중 · 합계 제외`, 그 주 그룹이 없으면 머리글 `{주 라벨} · 결재 중 · 합계 제외`로 주 차례(이번 주 → 다음 주) 자리에.
const APPROVING_HEADER = "결재 중 · 합계 제외";

function weekRank(label: string): number {
  if (label.startsWith("이번 주")) return 0;
  if (label.startsWith("다음 주")) return 1;
  return label === "그 뒤" ? 2 : -1;
}

function approvingRows(week: ApprovingPaymentWeek, header: string): PaymentTargetScreenRow[] {
  return week.rows.map((row) => ({
    id: row.id ?? "",
    group: week.label,
    ...(row.number !== undefined ? { number: row.number } : {}),
    ...(row.title !== undefined ? { title: row.title } : {}),
    ...(row.payableKrw !== undefined ? { payableKrw: row.payableKrw } : {}),
    approving: { header, status: row.status ?? "결재 중" },
  }));
}

function withApproving(rows: readonly PaymentTargetScreenRow[], weeks: readonly ApprovingPaymentWeek[], page: number): PaymentTargetScreenRow[] {
  const out = [...rows];
  for (const week of weeks) {
    if (week.page !== page) continue;
    const last = out.findLastIndex((row) => !row.approving && row.group === week.label);
    if (last >= 0) {
      out.splice(last + 1, 0, ...approvingRows(week, APPROVING_HEADER));
      continue;
    }
    const rank = weekRank(week.label);
    const at = out.findIndex((row) => !row.approving && weekRank(row.group) > rank);
    out.splice(at < 0 ? out.length : at, 0, ...approvingRows(week, `${week.label} · ${APPROVING_HEADER}`));
  }
  return out;
}

function ApprovingStatus({ status }: { status: string }) {
  return Object.hasOwn(STATUS_KIND, status) ? <StatusTag status={status as StatusWord} variant="text" /> : <span className={styles.approvingText}>{status}</span>;
}

// 합 요청 모음(계획 판단 — reversible): 고른 행 · 이체액이 바뀐 뒤 이만큼 모아 마지막 합계 번호 하나만 보낸다.
const SUM_DEBOUNCE_MS = 300;

const EMPTY_SELECTION: SelectionState = { selectedIds: [], edits: {} };

// 차이는 부호를 붙인다(`-3,300` · `+1,200` — 금액 표시 절 「차이」, S5 SignedNum과 같은 꼴). 값은 서버 diffKrw.
// 06-20(UI-SPEC 「표시 — 지급 방식 · 계좌」): 계좌이체 칸 — 1행 `{은행} ****-**-{뒤4}` + 권한자 3차 `번호 보기`(03 AccountNumberCell 그대로),
// 2행 예금주(한 줄 말줄임 + title). 직원 지급처는 03 해제 대신 사람 해제 액션(06.5 D-6517). 계좌가 없으면 `계좌 없음 · 계좌 등록은 관리자`(버튼 없음 — 지급을 막지 않는다, M-7). S1 칸과 S5 계좌 행이 같이 쓴다.
export function PaymentAccountValue({ account }: { account: PaymentAccount }) {
  if (account.status === "none") {
    return (
      <span className={styles.accountNone} data-payment-account="">
        계좌 없음 · 계좌 등록은 관리자
      </span>
    );
  }
  return (
    <div data-payment-account="">
      <div className={styles.accountLine}>
        {account.bank ? <span className={styles.nowrap}>{account.bank}</span> : null}
        <AccountNumberCell
          id={account.ownerId}
          masked={account.masked}
          canReveal={account.canReveal}
          revealAction={account.ownerKind === "user" ? revealPersonAccountNumberAction : revealVendorAccountNumberAction}
        />
      </div>
      {account.holder ? (
        <span className={styles.vendorCell} title={account.holder}>
          {account.holder}
        </span>
      ) : null}
    </div>
  );
}

// 07-23 SC-01 · N2 · V9: 결제 방법 열 계좌 아래 한 값 `확인 전 > 계좌 바뀜` — 지급처 거래처가 확인 전이면 `확인 전`, 확인됐고 계좌가 바뀐 뒤 첫 지급 전이면 `계좌 바뀜`.
// 둘 다 표시만 — 지급 선택 · 처리 판정은 손대지 않는다(G13 사후 확인). 키가 없으면(vendor.value 숨김) 그리지 않는다.
function vendorFlagOf(row: Pick<PaymentTargetScreenRow, "vendorConfirmed" | "accountChanged">): "확인 전" | "계좌 바뀜" | null {
  if (row.vendorConfirmed === false) return "확인 전";
  return row.accountChanged === true ? "계좌 바뀜" : null;
}

// 계좌 아래 줄 — 새 클래스 없이 블록 한 줄(계좌 값 아래에 선다).
function VendorFlag({ row }: { row: Pick<PaymentTargetScreenRow, "vendorConfirmed" | "accountChanged"> }) {
  const flag = vendorFlagOf(row);
  return flag ? (
    <div data-vendor-flag="">
      <StatusTag status={flag} variant="text" />
    </div>
  ) : null;
}

// 폰 접힌 줄 · 좁은 폭 요약 — 1행만(번호 보기 없음, 폰은 행이 문서 화면 링크).
function accountSummary(account: PaymentAccount): string {
  return account.status === "none" ? "계좌 없음 · 계좌 등록은 관리자" : [account.bank, account.masked].filter(Boolean).join(" ");
}

function SignedNum({ value }: { value: number }) {
  return <Num value={value > 0 ? `+${formatKrw(value)}` : formatKrw(value)} />;
}

// 이체액 편집 칸 — 05 쉼표 입력 훅(숫자 · 쉼표만 들어간다). Enter · 칸을 떠나면 확정, Esc는 표가 되돌린다(§7-3).
function TransferEditCell({ initial, onCommit }: { initial: string; onCommit: (value: string) => void }) {
  const { inputRef, value, onChange, rawValue } = useCommaInput("krw", initial);
  return (
    <input
      ref={inputRef}
      aria-label="이체액"
      type="text"
      inputMode="numeric"
      autoComplete="off"
      autoFocus
      className={styles.cellInputNumeric}
      value={value}
      onChange={onChange}
      onBlur={() => onCommit(rawValue)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onCommit(rawValue);
        }
      }}
    />
  );
}

function ReasonEditCell({ initial, onCommit }: { initial: string; onCommit: (value: string) => void }) {
  return (
    <input
      aria-label="차이 사유"
      type="text"
      autoComplete="off"
      autoFocus
      maxLength={480}
      className={styles.cellInput}
      defaultValue={initial}
      onBlur={(event) => onCommit(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onCommit(event.currentTarget.value);
        }
      }}
    />
  );
}

// 받은 행에서 처리된 행을 빼고, 받은 목록에서 사라진 막힌 행(그사이 다른 사람이 지급 · 종결)은 원래 자리에 남긴다.
function mergeRows(rows: readonly PaymentTargetScreenRow[], processed: ReadonlySet<string>, blocked: ReadonlyMap<string, Blocked>): PaymentTargetScreenRow[] {
  // 지급일 세율로 막힌 행은 지급 총액 셀이 새 값(06-15 newPayableKrw) — 다시 받은 목록(오늘 기준)이 덮지 않는다.
  const merged = rows
    .filter((row) => !processed.has(row.id))
    .map((row) => {
      const newPayable = blocked.get(row.id)?.newPayableKrw;
      return typeof newPayable === "number" ? { ...row, payableKrw: newPayable } : row;
    });
  const present = new Set(merged.map((row) => row.id));
  const ghosts = [...blocked.entries()].filter(([id]) => !present.has(id)).sort((a, b) => a[1].index - b[1].index);
  for (const [, ghost] of ghosts) merged.splice(Math.min(ghost.index, merged.length), 0, ghost.row);
  return merged;
}

function selectableWith(blocked: ReadonlyMap<string, Blocked>) {
  return (row: PaymentTargetScreenRow): true | { reason: string } => {
    const after = blocked.get(row.id);
    if (after && !after.selectable) return { reason: after.selectableReason ?? row.reason ?? after.reason };
    if (row.selectable === true) return true;
    return { reason: row.reason ?? "" };
  };
}

function href(query: Record<string, string>, page?: number): string {
  const params = new URLSearchParams(query);
  if (page && page > 1) params.set("page", String(page));
  return `/expenses?${params.toString()}`;
}

// 문서 화면 왕복(C-1) — `/expenses/{id}?from=pay&{지금 보기 · 필터 · 쪽}`.
function docHref(id: string, query: Record<string, string>, page: number): string {
  const params = new URLSearchParams({ from: "pay", ...query });
  if (page > 1) params.set("page", String(page));
  return `/expenses/${id}?${params.toString()}`;
}

// 수화가 끝났는가(서버 · 수화 중 첫 렌더는 거짓 — 저장소를 모른다). ui/table use-dirty-storage와 같은 방식.
const subscribeNothing = () => () => {};

// 폰(<700)인가 — 폰은 행 전체가 문서 화면 링크(06-15 phoneRowLink · `from=pay` 없음). 서버 · 수화 중에는 PC로 본다.
const subscribePhone = (onChange: () => void) => {
  const media = window.matchMedia("(max-width: 699.98px)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};
export function usePhoneWidth(): boolean {
  return useSyncExternalStore(subscribePhone, () => window.matchMedia("(max-width: 699.98px)").matches, () => false);
}

// M-1 — 처리 뒤 빈 쪽에서 행이 있는 마지막 쪽으로 주소를 고치면 화면이 새로 마운트된다(page.tsx Suspense 키 = 필터 · 쪽). 결과 글자 · 이유 줄은
// 그 한 번만 모듈 기억으로 넘긴다(같은 필터 키일 때만 — 지급일 기억 O-3과 같은 자리). 이유 줄은 다시 받은 쪽에 그 행이 있을 때만 붙는다.
// showIssues(검토 M-1) — 1차를 눌렀는데 지금 쪽 밖 고른 행에 칸 오류가 있어 그 행 쪽으로 옮긴 때: 다시 마운트되면 칸 오류를 세우고 첫 오류 칸으로.
let carried: { key: string; result: ResultLine | null; blocked: ReadonlyMap<string, Blocked>; showIssues?: boolean } | null = null;

function carryOver(next: typeof carried) {
  carried = next;
}

const CARRIED_ISSUES = "issues";

function takeCarried(
  key: string,
  rows: readonly PaymentTargetScreenRow[],
): { result: ResultLine | null; blocked: ReadonlyMap<string, Blocked>; focus: string | null } {
  if (carried?.key !== key) return { result: null, blocked: new Map(), focus: null };
  const present = new Set(rows.map((row) => row.id));
  const blocked = new Map([...carried.blocked].filter(([id]) => present.has(id)));
  // 검토 D-5 — 처리 뒤 옮긴 쪽에서도 DR-6 포커스: 첫 막힌 행 체크박스, 없으면 1차.
  const focus = carried.showIssues ? CARRIED_ISSUES : carried.result ? (rows.find((row) => blocked.has(row.id))?.id ?? "primary") : null;
  return { result: carried.result, blocked, focus };
}

// H-2 — 격자 포커스 칸(편집 칸이 아닌 링크 셀 · 증빙 칸 3차)의 Enter = 그 칸 안 `[data-cell-action]` 누르기. 표를 감싼 요소가 캡처 단계에서
// 먼저 받는다(ui/table 무변경 — 격자 키 훅은 편집 칸도 막힌 칸도 아닌 칸의 Enter에서 아무것도 하지 않는다). 조합 중 · 수정 키 · 편집 칸 안 입력 ·
// Space · Ctrl+Enter는 손대지 않는다(06-29 고르기 · 1차 · 04.6 편집 키 그대로).
function pressCellAction(event: React.KeyboardEvent<HTMLDivElement>) {
  if (event.key !== "Enter" || event.ctrlKey || event.altKey || event.shiftKey || event.nativeEvent.isComposing) return;
  const target = event.target;
  if (!(target instanceof HTMLElement) || !target.matches("td[data-grid-focus]")) return;
  const action = target.querySelector<HTMLElement>("[data-cell-action]");
  if (!action) return;
  event.preventDefault();
  event.stopPropagation();
  action.click();
}

export type PaymentTargetsScreenProps = {
  views: readonly string[];
  selects: FilterSelect[];
  // 06.5-08(D-6508): 검색 칸 값(필터 줄 맨 앞). 정규화한 검색어 — 없으면 빈 문자열.
  searchValue: string;
  // 지금 필터(보기 · 팀 · 증빙 · 검색어) — 쪽 링크가 같은 필터를 싣는다.
  query: Record<string, string>;
  rows: PaymentTargetScreenRow[];
  total: { count: number; sumKrw: number } | null;
  hasAny: boolean;
  page: { page: number; pageCount: number; total: number; pageSize: number };
  prepaidDueDays: number;
  today: string;
  // 빈 화면 행동 이동 곳 — 지급 완료 보기(V-1 `?status=`). URLSearchParams로 인코딩한 값이어야 한다(원시 공백 · 한글 href는 프리페치가 끝나지 않는다).
  paidHref: string;
  // 지급일 칸 오류 글자 — 05 DATE_FORMAT_ERROR(서버 상수).
  dateError: string;
  // 06.5-06(결정 맥락 8 · DM-4): `이체 파일 받기` 고정 게이트 — 서버 canExportBankTransferFile 값(행 내용과 무관).
  canExportTransferFile: boolean;
  /** 06.1-05(P-3) — 필터 줄 끝 하위 목록 `증빙 {N}`(증빙 등록 권한자만 — 없으면 undefined). */
  evidenceLink?: { label: string; href: string };
  /** 07-06(K6) — 이번 주 지급일. 그 날이 지났으면 null이고 `이번 주로`를 어디에도 그리지 않는다. */
  thisWeekMove: { payDate: string } | null;
  /** 07-01(J11) — 지금 승인되면 이번 주 · 다음 주에 들어갈 결재 중 건(주 라벨별). 지급 대상 · 합계에는 들지 않는다. */
  approvingByWeek: ApprovingPaymentWeek[];
};

export function PaymentTargetsScreen(props: PaymentTargetsScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const wide = useEditableWidth();
  const phone = usePhoneWidth();
  // O-3 — 모달 지급일은 모달 밖 한 곳에 기억한다(같은 필터에서 쪽을 넘겨도 남고, 필터 변경 · 새로 고침 때 잊는다).
  const memoryKey = selectionKey(props.query);
  const [carry] = useState(() => takeCarried(memoryKey, props.rows));
  useEffect(() => carryOver(null), []);
  const [selection, setSelection] = useState<SelectionState>(EMPTY_SELECTION);
  const [processed, setProcessed] = useState<ReadonlySet<string>>(new Set());
  const [blocked, setBlocked] = useState<ReadonlyMap<string, Blocked>>(carry.blocked);
  const [result, setResult] = useState<ResultLine | null>(carry.result);
  const [transferResult, setTransferResult] = useState<TransferFileResult | null>(null);
  const [transferFailed, setTransferFailed] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [rejection, setRejection] = useState<string | null>(null);
  const [moveResult, setMoveResult] = useState<MoveResult | null>(null);
  // 감사 #5: 옮긴 행의 `이번 주로`는 그 행과 함께 사라진다 — 결과 줄을 그린 뒤 `되돌리기`로 포커스(rAF가 렌더보다 먼저 돌면 body로 빠진다).
  const focusUndoRef = useRef(false);
  useEffect(() => {
    if (!focusUndoRef.current) return;
    focusUndoRef.current = false;
    document.getElementById("payment-move-undo")?.focus();
  }, [moveResult]);
  // 재감사 R1: 되돌리면 결과 줄이 사라진다 — 새로 받은 목록에 되돌린 행의 `이번 주로`가 다시 그려진 뒤 그 버튼으로 포커스(body로 빠지지 않게).
  const focusRevertedRef = useRef<string | null>(null);
  useEffect(() => {
    const id = focusRevertedRef.current;
    if (id === null) return;
    const button = document.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"] [data-pay-push] button`);
    if (!button) return;
    focusRevertedRef.current = null;
    button.focus();
  });
  // 막힌 행(id → 오류 줄 낱말) — 다음 이번 주로 · 지급 · 이체 파일 때 지운다.
  const [moveBlocked, setMoveBlocked] = useState<ReadonlyMap<string, string>>(new Map());
  // 요청 중인 행 id(U6 — 그 컨트롤 aria-busy) · 연타 이중 요청 막기는 ref(같은 렌더 안 두 번째 누름도 막는다).
  const [movingIds, setMovingIds] = useState<ReadonlySet<string>>(new Set());
  const [reverting, setReverting] = useState(false);
  const movingRef = useRef(false);
  const [snapshot, setSnapshot] = useState<{ ids: string[]; rows: PaymentTargetScreenRow[]; edits: SelectionState["edits"]; seq: number; otherPage: number }>({
    ids: [],
    rows: [],
    edits: {},
    seq: 0,
    otherPage: 0,
  });
  // 칸 오류는 1차를 누른 뒤에 세운다(사유 칸 — S5와 같은 결). 값이 바뀌면 표가 첫 오류 칸으로 포커스한다.
  const [showErrors, setShowErrors] = useState(false);
  const [issueSignal, setIssueSignal] = useState(0);
  // 합의 세율 기준일 — 마지막으로 처리 요청에 쓴 지급일. 다시 마운트되면 모달 지급일 기억(O-3)과 같은 날(검토 L-2 — 없으면 오늘).
  const [sumPayDate, setSumPayDate] = useState<string | null>(() => rememberedPayDate(memoryKey, props.today));
  const [payDate, setPayDate] = useState(() => rememberedPayDate(memoryKey, props.today));
  const rootRef = useRef<HTMLDivElement>(null);
  const focusAfterCloseRef = useRef<string | null>(null);
  // 다시 마운트된 뒤 한 번 옮길 포커스(takeCarried) — 되살린 선택이 선 뒤에.
  const carryFocusRef = useRef(carry.focus);
  // 처리 응답마다 1 — 합을 다시 불러 지금 쪽 밖에 남은 선택의 version · 지급 총액을 새 응답 값으로 바꾼다.
  const [batchTick, setBatchTick] = useState(0);
  // 지금 쪽 밖 행의 마지막 서버 상태(합 응답 rowStates) — 고를 수 있음 · version · 지급 총액.
  const [offPage, setOffPage] = useState<ReadonlyMap<string, SelectedTransferSum["rowStates"][number]>>(new Map());

  // 제자리 증빙 확인(DR-4) — 연 행(id · 연 순간 행 version)과 확인 응답으로 덮을 행 값.
  const [evidenceTarget, setEvidenceTarget] = useState<{ id: string; version: number } | null>(null);
  const [evidencePatch, setEvidencePatch] = useState<ReadonlyMap<string, { version: number; evidenceStatus: string; selectable: boolean; reason: string | null }>>(new Map());

  // 되살리기(C-1 · r2 F-2) — 같은 탭 같은 키의 보관을 수화 뒤 한 번 읽어 선택 · 편집으로 세운다. 다음 합 응답의 rowStates가 고를 수 있는 행만 남긴다.
  const hydrated = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const [restorePending, setRestorePending] = useState(true);
  if (hydrated && restorePending) {
    setRestorePending(false);
    const stored = readStoredSelection(window.sessionStorage, memoryKey);
    if (stored) setSelection({ selectedIds: stored.selectedIds, edits: stored.edits });
  }
  useEffect(() => {
    if (!hydrated || restorePending) return;
    writeStoredSelection(window.sessionStorage, memoryKey, selection, props.page.page);
  }, [hydrated, restorePending, memoryKey, selection, props.page.page]);
  // 이탈 경고는 탭 닫기 · 다른 사이트로 떠날 때만(앱 안 이동은 보관이 받는다) — 사람이 적은 편집값이 있을 때.
  const hasEdits = Object.keys(selection.edits).length > 0;
  useEffect(() => {
    if (!hasEdits) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasEdits]);
  // M-1 — 처리 뒤 다시 받은 쪽이 비어 서버가 마지막 쪽으로 보냈으면 주소도 그 쪽으로.
  const askedPage = Number(searchParams.get("page") ?? "1");
  useEffect(() => {
    if (!Number.isInteger(askedPage) || askedPage <= props.page.page) return;
    carryOver({ key: memoryKey, result, blocked });
    router.replace(href(props.query, props.page.page));
  }, [askedPage, props.page.page, props.query, router, memoryKey, result, blocked]);
  useEffect(() => {
    const target = carryFocusRef.current;
    if (!wide || restorePending || target === null) return;
    carryFocusRef.current = null;
    if (target === CARRIED_ISSUES) {
      setShowErrors(true);
      setIssueSignal((value) => value + 1);
      return;
    }
    focusAfterCloseRef.current = target;
    focusAfterClose();
  }, [wide, restorePending]);

  // 제자리 증빙 확인 응답(새 version · 상태 · 고를 수 있음)을 다시 받은 목록이 따라올 때까지 그 행에 덮는다 — 뒤이은 일괄 처리가 옛 version으로 막히지 않게.
  const rows = mergeRows(props.rows, processed, blocked).map((row) => {
    const patch = evidencePatch.get(row.id);
    return patch && (row.version ?? 0) < patch.version ? { ...row, ...patch } : row;
  });
  const selectable = selectableWith(blocked);
  // 다른 쪽 id 유지 — 지금 쪽 행은 그 행 판정, 지금 쪽 밖 id는 마지막 합 응답이 거짓이라 할 때만 빠진다.
  const chosen = reconcileAcrossPages(
    selection.selectedIds,
    rows.map((row) => ({ id: row.id, selectable: selectable(row) === true })),
    new Map([...offPage.entries()].flatMap(([id, state]) => (typeof state.selectable === "boolean" ? [[id, state.selectable] as const] : []))),
  );
  const chosenRows = rows.filter((row) => chosen.includes(row.id));
  const effective: SelectionState = { selectedIds: chosen, edits: selection.edits };

  // 합계 번호 — 고른 id 집합 · 고른 행 이체액(· 합 기준일 · 처리 응답)이 바뀔 때만 1 는다. 렌더에서 파생(effect 없음).
  const [sumTicket, setSumTicket] = useState(() => ({ seq: 0, key: sumKeyOf(EMPTY_SELECTION) }));
  const ticket = nextSumSeq(sumTicket, sumKeyOf(effective, `${sumPayDate ?? ""}#${batchTick}`));
  if (ticket !== sumTicket) setSumTicket(ticket);
  const seq = ticket.seq;
  const [sum, setSum] = useState<SelectedTransferSum | null>(null);
  const [sumFailedSeq, setSumFailedSeq] = useState<number | null>(null);
  const seqRef = useRef(seq);
  const pendingSumRef = useRef<{ timer: ReturnType<typeof setTimeout>; send: () => void } | null>(null);
  useEffect(() => {
    seqRef.current = seq;
  });

  function requestSum(forSeq: number, requestRows: { id: string; transferKrw?: number }[], sumDate: string | null) {
    setSumFailedSeq(null);
    sumSelectedTransfersAction({ seq: forSeq, rows: requestRows, ...(sumDate ? { payDate: sumDate } : {}) }).then(
      (result) => {
        // 응답 번호가 지금 합계 번호가 아니면 버린다(늦게 온 옛 합).
        if (forSeq !== seqRef.current) return;
        const data = result?.data;
        if (!data || data.seq !== forSeq) {
          setSumFailedSeq(forSeq);
          return;
        }
        setSum(data);
        setOffPage((current) => new Map([...current, ...data.rowStates.flatMap((state) => (state.id ? [[state.id, state] as const] : []))]));
        // 되살리기 — 이 합에 물은 id 중 서버가 지금 고를 수 없다고 한 행(처리됨 · 막힘 · 범위 밖 · 응답에 없음)의 선택 · 편집은 버린다.
        // 묻지 않은 id(요청 뒤에 고른 행 · 고르지 않은 편집)는 그대로 둔다 — 다음 합이 판정한다.
        const asked = new Set(requestRows.map((row) => row.id));
        setSelection((current) => {
          const askedOnly = { selectedIds: current.selectedIds.filter((id) => asked.has(id)), edits: Object.fromEntries(Object.entries(current.edits).filter(([id]) => asked.has(id))) };
          const restored = restoreSelection(askedOnly, data.rowStates);
          const keep = new Set([...restored.selectedIds, ...current.selectedIds.filter((id) => !asked.has(id))]);
          const edits = Object.fromEntries(Object.entries(current.edits).filter(([id]) => !asked.has(id) || id in restored.edits));
          const unchanged = keep.size === current.selectedIds.length && Object.keys(edits).length === Object.keys(current.edits).length;
          return unchanged ? current : { selectedIds: current.selectedIds.filter((id) => keep.has(id)), edits };
        });
      },
      () => {
        if (forSeq === seqRef.current) setSumFailedSeq(forSeq);
      },
    );
  }

  useEffect(() => {
    const requestRows = sumRequestRows(effective);
    if (seq === 0 || requestRows.length === 0) return;
    const payDate = sumPayDate;
    const send = () => {
      pendingSumRef.current = null;
      requestSum(seq, requestRows, payDate);
    };
    const timer = setTimeout(send, SUM_DEBOUNCE_MS);
    pendingSumRef.current = { timer, send };
    return () => {
      clearTimeout(timer);
      if (pendingSumRef.current?.timer === timer) pendingSumRef.current = null;
    };
    // 합계 번호가 오를 때만 보낸다 — 그 번호의 입력은 이 렌더의 선택 · 편집이다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq]);

  // 모달 닫힘(06-29 ConfirmDialog가 onClose 뒤 트리거로 포커스를 돌린다) 다음 차례에 정한 자리로 옮긴다.
  function focusAfterClose() {
    const target = focusAfterCloseRef.current;
    focusAfterCloseRef.current = null;
    if (!target) return;
    setTimeout(() => {
      const root = rootRef.current;
      if (!root) return;
      // 「transfer:{id}」 = 그 행 이체액 셀 · 「link:{id}」 = 그 행 링크(제자리 증빙 확인 뒤) · 「evidence:{id}」 = 그 행 증빙 칸 3차(제자리 모달 Esc)
      // · 그 밖 id = 그 행 체크박스.
      const [kind, id] = target.includes(":") ? target.split(":") : ["checkbox", target];
      const tr = root.querySelector(`[data-row-id="${CSS.escape(id ?? "")}"]`)?.closest("tr");
      const element =
        target === "primary"
          ? [...root.querySelectorAll<HTMLElement>('[data-ui="primary-button"]')].find((candidate) => !candidate.closest("dialog"))
          : kind === "transfer"
            ? tr?.querySelector<HTMLElement>('td:has([data-testid="payment-transfer-cell"])')
            : kind === "link"
              ? tr?.querySelector<HTMLElement>("a[data-row-link]")
              : kind === "evidence"
                ? tr?.querySelector<HTMLElement>("button[data-cell-action]")
                : tr?.querySelector<HTMLElement>('input[type="checkbox"]');
      element?.focus();
    }, 0);
  }

  // 모아 둔 요청을 바로 보낸다(모달을 여는 순간).
  function flushSum() {
    const pending = pendingSumRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pending.send();
  }

  function retrySum() {
    requestSum(seq, sumRequestRows(effective), sumPayDate);
  }

  const sumNow = sum !== null && sum.seq === seq ? sum : null;

  // 「Error — 이체액 칸」 — 고친 칸 글자가 양의 정수가 아니면(칸이 숫자 · 쉼표만 받으므로 빈 값 · 0).
  function transferIssue(row: PaymentTargetScreenRow): string | null {
    const edit = selection.edits[row.id];
    if (!edit) return null;
    const value = transferNumber(edit.transfer);
    if (value === null) return TRANSFER_NOT_NUMBER;
    if (value <= 0) return TRANSFER_NOT_POSITIVE;
    return null;
  }

  // 이체액이 서버 지급 총액과 다르면 차이 사유 칸이 서고 필수다(같음 비교 — 차이 값은 서버가 셈한다, S5 diffReasonNeeded 선례).
  function reasonNeeded(row: PaymentTargetScreenRow): boolean {
    const edit = selection.edits[row.id];
    const value = edit ? transferNumber(edit.transfer) : null;
    return value !== null && value > 0 && typeof row.payableKrw === "number" && value !== row.payableKrw;
  }

  function reasonIssue(row: PaymentTargetScreenRow): string | null {
    return reasonNeeded(row) && (selection.edits[row.id]?.reason ?? "").trim() === "" ? DIFF_REASON_REQUIRED : null;
  }

  function editable(row: PaymentTargetScreenRow): boolean {
    return wide && selectable(row) === true;
  }

  function commitCell(rowId: string, columnKey: string, value: string) {
    const row = rows.find((candidate) => candidate.id === rowId);
    if (!row) return;
    if (columnKey === "transfer") {
      const shown = selection.edits[rowId]?.transfer ?? (typeof row.payableKrw === "number" ? String(row.payableKrw) : "");
      if (value === shown) return;
      let next = editTransfer(selection, { id: rowId, transfer: value, selectable: selectable(row) === true, page: props.page.page });
      // 되돌려 지급 총액과 같아지면 적은 사유는 버린다(D-605).
      if (transferNumber(value) === row.payableKrw) next = editReason(next, { id: rowId, reason: "" });
      setSelection(next);
    }
    if (columnKey === "diffReason") setSelection(editReason(selection, { id: rowId, reason: value, page: props.page.page }));
  }

  const { execute, isExecuting } = useAction(completePaymentsBatchAction, {
    onSuccess: ({ data }) => {
      if (!data) {
        setRejection(NO_RESPONSE);
        return;
      }
      applyResult(data);
    },
    onError: ({ error }) => setRejection(error.serverError ?? NO_RESPONSE),
  });

  function applyResult(data: BatchPaymentResult) {
    const before = mergeRows(props.rows, processed, new Map());
    const nextProcessed = new Set([...processed, ...data.processedIds]);
    const nextBlocked = new Map<string, Blocked>();
    for (const item of data.blocked) {
      const index = before.findIndex((row) => row.id === item.expenseId);
      const row = before[index] ?? snapshot.rows.find((candidate) => candidate.id === item.expenseId);
      if (!row) continue;
      nextBlocked.set(item.expenseId, {
        reason: item.reason,
        selectable: item.selectable,
        selectableReason: item.selectableReason,
        newPayableKrw: item.newPayableKrw,
        row: item.newPayableKrw === null ? row : { ...row, payableKrw: item.newPayableKrw },
        index: Math.max(index, 0),
      });
    }
    const nextRows = mergeRows(props.rows, nextProcessed, nextBlocked);
    setProcessed(nextProcessed);
    setBlocked(nextBlocked);
    setSelection(applyBatchResult(selection, data));
    // 남은 선택의 합은 이번 지급일 세율로 다시 받는다(재시도가 새 지급 총액 · version으로 간다 — 지금 쪽 밖 행 포함).
    setSumPayDate(payDate);
    setBatchTick((tick) => tick + 1);
    setResult({ time: data.time, processed: data.processed, blocked: data.blocked.length });
    // DR-6 — 모달이 닫힌 뒤 포커스: 첫 막힌 행 체크박스(aria-disabled여도), 막힌 행이 없으면 1차 버튼.
    focusAfterCloseRef.current = nextRows.find((row) => nextBlocked.has(row.id))?.id ?? "primary";
    setDialogOpen(false);
    router.refresh();
  }

  // 검토 M-1 — 지금 쪽 밖 고른 행에 칸 오류가 있으면 처리 요청 대신 그 행을 고친 쪽으로 가 그 칸 오류를 세운다(요청 전체 거부 · 일반 글자가 아니라).
  // 고친 쪽을 모르거나 지금 쪽이면(그사이 행이 옮김) 옮기지 않는다 — 서버 zod가 막는다(지급 0건).
  function goToOffPageIssue(state: SelectionState): boolean {
    const issue = firstOffPageIssue(state, props.rows.map((row) => row.id), offPage);
    if (issue === null || issue.page === null || issue.page === props.page.page) return false;
    carryOver({ key: memoryKey, result, blocked, showIssues: true });
    router.push(href(props.query, issue.page));
    return true;
  }

  function openDialog() {
    if (chosen.length === 0 || isExecuting) return;
    // 고른 행에 오류 칸이 있으면 모달 없이 첫 오류 칸으로(04 DR-5와 같은 결).
    if (chosenRows.some((row) => transferIssue(row) !== null || reasonIssue(row) !== null)) {
      setShowErrors(true);
      setIssueSignal((value) => value + 1);
      return;
    }
    if (goToOffPageIssue(effective)) return;
    flushSum();
    setSnapshot({ ids: chosen, rows: chosenRows, edits: selection.edits, seq, otherPage: otherPageCount(chosen, props.rows.map((row) => row.id)) });
    setRejection(null);
    setDialogOpen(true);
    readSubtotals();
  }

  // 06.5-06(V14 · SP-65-7 · R-5): 대화상자를 여는 순간 지급처 소계를 확정 액션과 따로 읽는다 — 2건 이상 지급처만 한 행.
  // 읽는 동안 · 실패면 칸이 없을 뿐(오류 문구 · 1차 막힘 없음). 열 때마다 차례를 세어 마지막 응답만 받는다(앞 선택 소계가 새 선택에 서지 않게).
  const subtotalTicketRef = useRef(0);
  const [subtotalLines, setSubtotalLines] = useState<string[]>([]);
  const { executeAsync: previewPayees } = useAction(previewTransferPayeesAction);
  function readSubtotals() {
    const ticket = ++subtotalTicketRef.current;
    setSubtotalLines([]);
    const sent = transferRequestRows(chosen, chosenRows, selection.edits);
    if (sent.length === 0) return;
    previewPayees({ rows: sent })
      .then((response) => {
        if (ticket !== subtotalTicketRef.current || !response?.data) return;
        setSubtotalLines(
          response.data.flatMap((group) => {
            // 투영 DTO는 칸이 빠질 수 있다(정보 항목 숨김) — 합이나 건수가 없으면 그 행을 세우지 않는다.
            if (group.count === undefined || group.count < 2 || group.totalKrw === undefined) return [];
            // 지급처 이름은 서버 묶음 값 — 지금 쪽 밖 문서만 있는 지급처도 이름이 선다(검토 P3-2). 투영으로 빠지면 `—`(SYSTEM §2-4).
            return [`${group.vendorName ?? group.payeeUserName ?? "—"} ${formatKrw(group.totalKrw)} · ${group.count}건`];
          }),
        );
      })
      .catch(() => {
        // 끊김 · 액션 ID 불일치 — 칸 없이 둔다(SP-65-7 실패).
      });
  }

  // 06.5-06: 이체 파일 · 소계 읽기가 보내는 행 — 지금 쪽 고른 행 + 지금 쪽 밖은 마지막 합 응답이 고를 수 있다고 한 행(`지급 완료`와 같은 꼴).
  function transferRequestRows(ids: string[], onPage: PaymentTargetScreenRow[], edits: SelectionState["edits"]) {
    const offRows: PaymentTargetScreenRow[] = offPageSnapshotRows(
      ids,
      onPage.map((row) => row.id),
      offPage,
    ).map((row) => ({ ...row, group: "" }));
    return [...onPage, ...offRows].flatMap((row) =>
      typeof row.version === "number" && typeof row.payableKrw === "number"
        ? [{ expenseId: row.id, expenseVersion: row.version, expectedPayableKrw: row.payableKrw, ...transferPart(row, edits) }]
        : [],
    );
  }

  // 스냅숏 한 행 — 고친 이체액(양의 정수)과, 지급 총액과 다르면 그 사유.
  function transferPart(row: PaymentTargetScreenRow, edits: SelectionState["edits"] = snapshot.edits): { transferKrw?: number; diffReason?: string } {
    const edit = edits[row.id];
    const value = edit ? transferNumber(edit.transfer) : null;
    if (value === null || value <= 0) return {};
    return value === row.payableKrw ? { transferKrw: value } : { transferKrw: value, diffReason: (edit?.reason ?? "").trim() };
  }

  function confirm(payDate: string) {
    if (isExecuting) return;
    // 모달을 연 뒤 온 합 응답으로 지금 쪽 밖 행의 지급 총액을 알게 된 때도 칸 오류면 그 쪽으로(검토 M-1).
    if (goToOffPageIssue({ selectedIds: snapshot.ids, edits: snapshot.edits })) {
      setDialogOpen(false);
      return;
    }
    // 지금 쪽 밖의 고른 행은 마지막 합 응답(rowStates)이 지금 고를 수 있다고 한 행만, 그 응답의 version · 지급 총액으로 보낸다
    // (1차는 그 합이 온 뒤에야 켜진다 — 검토 L-1: selectable 거짓 행은 싣지 않는다).
    const offRows: PaymentTargetScreenRow[] = offPageSnapshotRows(
      snapshot.ids,
      snapshot.rows.map((row) => row.id),
      offPage,
    ).map((row) => ({ ...row, group: "" }));
    const sent = [...snapshot.rows, ...offRows].flatMap((row) =>
      typeof row.version === "number" && typeof row.payableKrw === "number"
        ? [{ expenseId: row.id, expenseVersion: row.version, expectedPayableKrw: row.payableKrw, ...transferPart(row) }]
        : [],
    );
    if (sent.length === 0) return;
    // 이유 줄 · 결과 글자는 다음 시도 때 지운다(04 DR-16 수명).
    setBlocked(new Map());
    setResult(null);
    setTransferResult(null);
    setMoveResult(null);
    setMoveBlocked(new Map());
    setRejection(null);
    execute({ payDate, rows: sent });
  }

  // 06.5-06(UI-SPEC V5): `이체 파일 받기` — 확인 창 없이 지금 고른 행(모든 쪽)의 스냅숏을 보낸다(`지급 완료`와 같은 행 꼴 · 지금 편집값).
  // 고른 행에 칸 오류가 있으면 `지급 완료`처럼 요청 없이 첫 오류 칸으로 간다(고칠 칸이 이 화면에 있다). 그래도 서버에 닿은 사유 없는 편집액은
  // 그 행만 막힌 건(V5 6번)이 된다 — 액션 스키마는 요청째 거부하지 않는다(검토 P2-2).
  const { execute: exportFile, isExecuting: exporting } = useAction(exportBankTransferFileAction, {
    onSuccess: ({ data }) => {
      if (!data) {
        setTransferFailed(true);
        return;
      }
      if (data.lineCount > 0) downloadBase64(data.base64, data.filename);
      // 막힌 건은 지급 막힘과 같은 맵 · 같은 행 아래 줄(지금 쪽 행만) — 선택은 풀지 않는다(파일 제외 사유일 뿐 지급 게이트가 아니다).
      const nextBlocked = new Map<string, Blocked>();
      for (const item of data.blocked) {
        const index = rows.findIndex((row) => row.id === item.expenseId);
        const row = rows[index];
        if (!row) continue;
        nextBlocked.set(item.expenseId, { reason: item.text, selectable: true, selectableReason: null, newPayableKrw: null, row, index, link: item.link });
      }
      setBlocked(nextBlocked);
      setTransferResult({ time: data.time, lineCount: data.lineCount, docCount: data.docCount, blocked: data.blocked.length });
      // 담김 줄(transferFileAt)은 서버 기록에서 온다 — 목록을 다시 받는다.
      if (data.lineCount > 0) router.refresh();
    },
    onError: () => setTransferFailed(true),
  });

  function requestTransferFile() {
    if (chosen.length === 0 || exporting) return;
    if (chosenRows.some((row) => transferIssue(row) !== null || reasonIssue(row) !== null)) {
      setShowErrors(true);
      setIssueSignal((value) => value + 1);
      return;
    }
    if (goToOffPageIssue(effective)) return;
    const sent = transferRequestRows(chosen, chosenRows, selection.edits);
    if (sent.length === 0) return;
    setBlocked(new Map());
    setResult(null);
    setTransferResult(null);
    setMoveResult(null);
    setMoveBlocked(new Map());
    setTransferFailed(false);
    exportFile({ rows: sent });
  }

  // 07-16(J9 · D-742 · N4 · U6 · U8): 이번 주로 — 확인 창 없이 서버가 건마다 판정 · 저장하고, 결과는 표 위 결과 줄(토스트 없음).
  // 옮긴 행은 선택을 풀고 막힌 행은 선택을 유지한 채 제목 아래 오류 줄. 목록은 다시 받는다(옮긴 행이 이번 주 그룹 · `수동 지정`으로).
  async function moveRows(items: { expenseId: string; version: number }[]) {
    if (items.length === 0 || movingRef.current) return;
    movingRef.current = true;
    setMovingIds(new Set(items.map((item) => item.expenseId)));
    setResult(null);
    setTransferResult(null);
    setBlocked(new Map());
    let response: Awaited<ReturnType<typeof moveToThisWeekAction>> | undefined;
    try {
      response = await moveToThisWeekAction({ items });
    } catch {
      response = undefined;
    }
    movingRef.current = false;
    setMovingIds(new Set());
    const data = response?.data;
    if (!data) {
      setMoveBlocked(new Map());
      // 검토 L-1: 응답이 끊기면 서버는 저장했을 수 있다 — 옛 version으로 다시 보내지 않고(전부 충돌) 목록을 다시 받는다.
      // `다시 시도`는 서버가 요청째 거부한 때(아무것도 저장 안 됨)만.
      const serverError = response?.serverError;
      setMoveResult({ kind: "failed", reason: serverError ?? NO_RESPONSE, retry: serverError ? items : null });
      if (!serverError) router.refresh();
      return;
    }
    setMoveBlocked(new Map(data.rejected.map((item) => [item.expenseId, moveReasonText(item.reason)])));
    const first = data.rejected[0];
    focusUndoRef.current = data.moved.length > 0;
    // 검토 L-2: 건마다 거부(영업일 · 지남 · 밀림 아님 · version 충돌)는 같은 입력으로 다시 보내도 같은 이유로 거부된다 — `다시 시도` 없음.
    setMoveResult(data.moved.length === 0 && first ? { kind: "failed", reason: moveReasonText(first.reason), retry: null } : { kind: "moved", moved: data.moved, blocked: data.rejected.length });
    const movedIds = new Set(data.moved.map((item) => item.expenseId));
    if (movedIds.size > 0) setSelection((current) => ({ ...current, selectedIds: current.selectedIds.filter((id) => !movedIds.has(id)) }));
    router.refresh();
  }

  // 되돌리기 — 옮긴 건만 이전 값(자동이면 null)으로. 다 되면 결과 줄이 사라지고, 일부 거부면 `되돌림 N건 · 막힘 M건`(막힌 행 오류 줄), 전부 거부면 `되돌리기 실패 · {원인}`(되돌리기 없음 — SYSTEM §7-8).
  async function revertMoved(items: { expenseId: string; date: string | null; version: number }[]) {
    if (items.length === 0 || movingRef.current) return;
    movingRef.current = true;
    setReverting(true);
    let response: Awaited<ReturnType<typeof revertScheduledPayDatesAction>> | undefined;
    try {
      response = await revertScheduledPayDatesAction({ items });
    } catch {
      response = undefined;
    }
    movingRef.current = false;
    setReverting(false);
    const data = response?.data;
    if (!data) {
      // 검토 L-1: 이번 주로와 같은 갈래 — 끊긴 응답은 다시 받기, `다시 시도`는 요청째 거부만.
      const serverError = response?.serverError;
      setMoveResult({ kind: "revertFailed", reason: serverError ?? NO_RESPONSE, retry: serverError ? items : null });
      if (!serverError) router.refresh();
      return;
    }
    setMoveBlocked(new Map(data.rejected.map((item) => [item.expenseId, moveReasonText(item.reason)])));
    const first = data.rejected[0];
    setMoveResult(
      !first
        ? null
        : data.reverted.length > 0
          ? { kind: "revertPartial", reverted: data.reverted.length, blocked: data.rejected.length }
          : { kind: "revertFailed", reason: first.reason, retry: null },
    );
    focusRevertedRef.current = data.reverted[0]?.expenseId ?? null;
    router.refresh();
  }

  // 제목 아래 2행(PC · 태블릿 — 폰은 접힌 줄 맨 앞, SYSTEM §7-3 폰 전략): `마감 지나 밀림` · `예정일 계산 실패`(R15) · 행 `이번 주로` · 막힌 행 오류 줄.
  function titleSecondLine(row: PaymentTargetScreenRow) {
    const failed = row.paymentScheduleFailed === true;
    const pushed = !failed && row.paymentPushReason === "cutoff";
    const moveError = moveBlocked.get(row.id) ?? null;
    const canMove = !phone && props.thisWeekMove !== null && movable(row);
    if (!failed && !pushed && moveError === null) return null;
    const busy = movingIds.has(row.id);
    return (
      <>
        {failed || pushed ? (
          <span className={styles.wideSecondLine} data-pay-push="">
            {failed ? <span className={styles.scheduleFailed}>예정일 계산 실패</span> : <StatusTag status="마감 지나 밀림" variant="text" />}
            {canMove && typeof row.version === "number" ? (
              <>
                {" · "}
                <Button
                  variant="tertiary"
                  aria-label={`${row.title ?? row.number ?? ""} 이번 주로`.trim()}
                  aria-busy={busy ? "true" : undefined}
                  pending={busy}
                  onClick={() => void moveRows([{ expenseId: row.id, version: row.version ?? 0 }])}
                >
                  이번 주로
                </Button>
              </>
            ) : null}
          </span>
        ) : null}
        {moveError !== null ? <span className={`${styles.wideSecondLine} ${styles.moveError}`}>{moveError}</span> : null}
      </>
    );
  }

  function scheduledCell(row: PaymentTargetScreenRow) {
    return (
      <span className={styles.nowrap}>
        <Num value={row.scheduledPaymentDate ? row.scheduledPaymentDate.slice(5) : null} />
        {row.scheduledPaymentManual ? (
          <>
            {" "}
            <StatusTag status="수동 지정" variant="text" />
          </>
        ) : null}
      </span>
    );
  }

  // 폰 접힌 줄 맨 앞 글자(K5) — PC 2행과 같은 낱말, 행동은 없다(폰은 행 → 문서 화면).
  function phoneLead(row: PaymentTargetScreenRow) {
    if (row.paymentScheduleFailed === true) return <span className={styles.scheduleFailed}>예정일 계산 실패</span>;
    if (row.paymentPushReason === "cutoff") return <StatusTag status="마감 지나 밀림" variant="text" />;
    return null;
  }

  // 증빙 칸 3차(`확인 전`만) — ≥1024는 제자리 모달, 700~1023은 문서 화면 왕복 링크. 폰은 행 링크(3차 없음).
  // 06.5 D-6520 — 빈 증빙 금액이 더는 막지 않아 R10-F2 갈래(문서 화면 링크)가 없다(DTO 칸은 06.5-02가 지운다).
  function evidenceAction(row: PaymentTargetScreenRow) {
    if (row.evidenceStatus !== "확인 전" || phone) return null;
    const label = `${row.number ?? ""} 증빙 확인`.trim();
    if (wide && typeof row.version === "number") {
      const version = row.version;
      return (
        <Button variant="tertiary" aria-label={label} data-cell-action="" onClick={() => setEvidenceTarget({ id: row.id, version })}>
          증빙 확인
        </Button>
      );
    }
    return (
      <Link href={docHref(row.id, props.query, props.page.page)} className={buttonLinkClassName("tertiary")} aria-label={label} data-cell-action="">
        증빙 확인
      </Link>
    );
  }

  // 확인 성공(S1) — 응답 version · 상태로 행을 덮고 「상태 → 1차」를 다시 읽는다: 고를 수 있으면 저절로 골라지고(합계 번호 +1) 포커스 = 이체액 셀,
  // 짝 막힘(R10-R1 · N3)이면 선택 없이 짝 이유 · 포커스 = 그 행 링크. 토스트 없음. 목록은 다시 받는다.
  function confirmedEvidence(id: string, result: ConfirmEvidenceResult) {
    const open = result.actionRow.row === "P4" && result.actionRow.blockReason === null;
    setEvidencePatch((current) =>
      new Map(current).set(id, { version: result.version, evidenceStatus: result.evidenceStatus, selectable: open, reason: open ? null : (result.actionRow.blockReason ?? null) }),
    );
    if (open) setSelection((current) => (current.selectedIds.includes(id) ? current : { ...current, selectedIds: [...current.selectedIds, id] }));
    focusAfterCloseRef.current = open ? `transfer:${id}` : `link:${id}`;
    setEvidenceTarget(null);
    router.refresh();
  }

  const evidenceRow = evidenceTarget ? rows.find((row) => row.id === evidenceTarget.id) : undefined;
  // 증빙 확인 모달은 연 동안만 그린다 — 그리지 않게 된 커밋(06-29 ConfirmDialog가 트리거 · 제목으로 포커스를 돌린 뒤) 다음에 정한 자리로 옮긴다.
  useEffect(() => {
    if (evidenceTarget === null) focusAfterClose();
  }, [evidenceTarget]);

  const amountColumn = props.total !== null;
  const columns: TableColumn<PaymentTargetScreenRow>[] = [
    {
      key: "number",
      header: PAYMENT_TARGET_COLUMN_LABELS.number,
      priority: "p3",
      collapseBelow: 1280,
      // 식별자형 링크 3차(H-2) — 문서 화면 왕복 `from=pay`. 격자 칸 Enter = 이 링크(pressCellAction).
      cell: (row) =>
        row.approving ? (
          <span className={styles.approvingText}>
            <Num value={row.number ?? null} />
          </span>
        ) : row.number ? (
          <Link href={docHref(row.id, props.query, props.page.page)} className={styles.link} aria-label={`${row.number} 지출결의 열기`} data-cell-action="">
            <Num value={row.number} />
          </Link>
        ) : (
          <Num value={null} />
        ),
    },
    {
      key: "title",
      header: PAYMENT_TARGET_COLUMN_LABELS.title,
      priority: "p1",
      // 이 1행도 같은 문서 화면 왕복 링크(H-2 — 번호가 숨는 <1280에서는 이것이 유일한 길). 폰은 06-15 행 링크 그대로(`from=pay` 없음 — 일괄 지급이 없다).
      // 폰은 한 줄 말줄임이라 전체 값을 title로도(검토 D-6). PC는 줄바꿈(SYSTEM §7-3 「항목명은 줄바꿈 허용」)이라 다 보인다.
      // 07-16(J11): 결재 중 참고 행은 링크 · 행동 없이 muted 글자만.
      cell: (row) =>
        row.approving ? (
          <span className={`${styles.titleCell} ${styles.approvingText}`} title={phone ? (row.title ?? undefined) : undefined}>
            {row.title ?? "—"}
          </span>
        ) : (
          <span className={styles.titleCell} data-row-id={row.id}>
            <Link
              href={phone ? `/expenses/${row.id}` : docHref(row.id, props.query, props.page.page)}
              className={styles.link}
              title={phone ? (row.title ?? undefined) : undefined}
              data-row-link=""
              data-cell-action=""
            >
              {row.title ?? "—"}
            </Link>
            {titleSecondLine(row)}
          </span>
        ),
    },
    {
      key: "vendor",
      header: PAYMENT_TARGET_COLUMN_LABELS.vendor,
      priority: "p3",
      collapseBelow: 1280,
      // 한 줄 말줄임 — 전체 값은 title(검토 D-6).
      cell: (row) => (
        <span className={styles.vendorCell} title={row.vendorName ?? row.payeeUserName ?? undefined}>
          {row.vendorName ?? row.payeeUserName ?? "—"}
        </span>
      ),
    },
    {
      key: "method",
      header: PAYMENT_TARGET_COLUMN_LABELS.method,
      priority: "p2",
      cell: (row) => (
        <>
          {row.account ? <PaymentAccountValue account={row.account} /> : <span className={styles.nowrap}>{row.paymentMethodName ?? "—"}</span>}
          <VendorFlag row={row} />
        </>
      ),
      // 결재 중 행은 지급 방식 · 예정일이 없다 — 접힌 줄을 세우지 않는다(감사 #6, 상태 · 금액은 주 행 p1 칸).
      summary: (row) => {
        if (row.approving) return null;
        const text = row.account ? accountSummary(row.account) : (row.paymentMethodName ?? "—");
        const lead = phoneLead(row);
        const flag = vendorFlagOf(row);
        return lead || flag ? (
          <>
            {lead ? (
              <>
                {lead}
                {" · "}
              </>
            ) : null}
            {text}
            {flag ? (
              <>
                {" · "}
                <StatusTag status={flag} variant="text" />
              </>
            ) : null}
          </>
        ) : (
          text
        );
      },
    },
    {
      key: "payment",
      header: PAYMENT_TARGET_COLUMN_LABELS.payment,
      priority: "p2",
      // 07-16(SC-01): 수동 지정 건은 값 뒤 `수동 지정`(muted 글자 — 07-06 D-742).
      cell: scheduledCell,
      summary: (row) => (row.approving ? null : scheduledCell(row)),
    },
    {
      key: "evidence",
      header: PAYMENT_TARGET_COLUMN_LABELS.evidence,
      priority: "p1",
      cell: (row) => (
        <span className={styles.evidenceCell}>
          {row.approving ? <ApprovingStatus status={row.approving.status} /> : null}
          {row.evidenceStatus ? <StatusTag status={row.evidenceStatus as StatusWord} variant="text" /> : null}
          {evidenceAction(row)}
        </span>
      ),
    },
    ...(amountColumn
      ? ([
          {
            key: "payable",
            header: PAYMENT_TARGET_COLUMN_LABELS.payable,
            priority: "p1",
            align: "right",
            cell: (row) => (row.approving ? <span className={styles.approvingText}><Num value={row.payableKrw ?? null} /></span> : <Num value={row.payableKrw ?? null} />),
          },
          {
            key: "transfer",
            header: PAYMENT_TARGET_COLUMN_LABELS.transfer,
            priority: "p3",
            collapseBelow: 1024,
            align: "right",
            editability: (row) => (editable(row) ? "edit" : "readonly"),
            editCell: (row, ctx) => (
              <TransferEditCell
                initial={selection.edits[row.id]?.transfer ?? (typeof row.payableKrw === "number" ? String(row.payableKrw) : "")}
                onCommit={ctx.onCommit}
              />
            ),
            cell: (row) => {
              const edit = selection.edits[row.id];
              const value = edit ? transferNumber(edit.transfer) : (row.payableKrw ?? null);
              return (
                <span data-testid="payment-transfer-cell">
                  <Num value={edit && value === null ? edit.transfer || "—" : value} />
                </span>
              );
            },
            // 셀 2행 `차이 {±}` — 서버 합 응답의 행별 차이(0이면 없음). 요청 중에는 이전 값을 흐리게.
            secondaryLine: (row) => {
              const diff = chosen.includes(row.id) && sum ? sum.diffs[row.id] : undefined;
              if (diff === undefined || diff === 0) return null;
              return (
                <span className={[styles.diffLine, sumNow ? "" : styles.stale].join(" ")}>
                  {"차이 "}
                  <SignedNum value={diff} />
                </span>
              );
            },
          },
        ] satisfies TableColumn<PaymentTargetScreenRow>[])
      : []),
    {
      key: "diffReason",
      header: PAYMENT_TARGET_COLUMN_LABELS.diffReason,
      priority: "p3",
      collapseBelow: 1024,
      editability: (row) => (editable(row) && reasonNeeded(row) ? "edit" : "readonly"),
      editCell: (row, ctx) => <ReasonEditCell initial={selection.edits[row.id]?.reason ?? ""} onCommit={ctx.onCommit} />,
      cell: (row) => {
        if (!reasonNeeded(row)) return "—";
        const reason = selection.edits[row.id]?.reason ?? "";
        return (
          <span className={styles.reasonCell} title={reason || undefined} data-testid="payment-diff-reason-cell">
            {reason}
          </span>
        );
      },
    },
  ];

  const filters = (
    <>
      <StatusFilter value={PAYMENT_TARGET_VIEW} views={props.views} selects={props.selects} searchValue={props.searchValue} endLink={props.evidenceLink} />
      {wide && props.canExportTransferFile ? (
        <span className={styles.transferSlot}>
          <Button
            variant="secondary"
            pending={exporting}
            onClick={requestTransferFile}
            {...(chosen.length === 0 ? { disabled: true, disabledReason: "고른 건 없음", reasonTone: "info" as const } : {})}
          >
            이체 파일 받기
          </Button>
        </span>
      ) : null}
      {wide && props.thisWeekMove !== null && chosenRows.some(movable) ? (
        <span className={styles.transferSlot}>
          <Button
            variant="tertiary"
            aria-busy={movingIds.size > 0 ? "true" : undefined}
            pending={movingIds.size > 0}
            onClick={() => void moveRows(chosenRows.filter(movable).map((row) => ({ expenseId: row.id, version: row.version ?? 0 })))}
          >
            이번 주로
          </Button>
        </span>
      ) : null}
      <p role="status" aria-live="polite" className={styles.batchResult}>
        {moveResult?.kind === "moved" ? (
          <>
            <span className={styles.batchDone}>{`이번 주로 · ${moveResult.moved.length}건 옮김`}</span>
            {moveResult.blocked > 0 ? (
              <>
                {" · "}
                <span className={styles.batchBlocked}>{`막힘 ${moveResult.blocked}건`}</span>
              </>
            ) : null}{" "}
            <Button
              id="payment-move-undo"
              variant="tertiary"
              pending={reverting}
              onClick={() => void revertMoved(moveResult.moved.map((item) => ({ expenseId: item.expenseId, date: item.before, version: item.version })))}
            >
              되돌리기
            </Button>
          </>
        ) : moveResult?.kind === "failed" ? (
          <span className={styles.batchBlocked}>
            {`이번 주로 실패 · ${moveResult.reason}`}
            {moveResult.retry ? (
              <>
                {" · "}
                <Button variant="tertiary" pending={movingIds.size > 0} onClick={() => void moveRows(moveResult.retry ?? [])}>
                  다시 시도
                </Button>
              </>
            ) : null}
          </span>
        ) : moveResult?.kind === "revertPartial" ? (
          <>
            <span className={styles.batchDone}>{`되돌림 ${moveResult.reverted}건`}</span>
            {" · "}
            <span className={styles.batchBlocked}>{`막힘 ${moveResult.blocked}건`}</span>
          </>
        ) : moveResult?.kind === "revertFailed" ? (
          <span className={styles.batchBlocked}>
            {`되돌리기 실패 · ${moveResult.reason}`}
            {moveResult.retry ? (
              <>
                {" · "}
                <Button variant="tertiary" pending={reverting} onClick={() => void revertMoved(moveResult.retry ?? [])}>
                  다시 시도
                </Button>
              </>
            ) : null}
          </span>
        ) : result ? (
          <>
            <span className={styles.batchDone}>{`${result.time} 지급 완료 ${result.processed}건`}</span>
            {result.blocked > 0 ? (
              <>
                {" · "}
                <span className={styles.batchBlocked}>{`막힘 ${result.blocked}건`}</span>
              </>
            ) : null}
          </>
        ) : transferResult ? (
          <>
            {/* 06.5-06(V5 · V14): 지급처마다 한 줄 — 줄 수와 문서 수가 같으면 한 번만 쓴다. */}
            <span className={styles.batchDone}>
              {transferResult.lineCount === transferResult.docCount
                ? `${transferResult.time} 이체 파일 ${transferResult.docCount}건`
                : `${transferResult.time} 이체 파일 ${transferResult.lineCount}줄 · 문서 ${transferResult.docCount}건`}
            </span>
            {transferResult.blocked > 0 ? (
              <>
                {" · "}
                <span className={styles.batchBlocked}>{`막힘 ${transferResult.blocked}건`}</span>
              </>
            ) : null}
          </>
        ) : null}
      </p>
      {transferFailed ? <Toast message="이체 파일 받기 · 실패 · 다시 시도" tone="error" onDismiss={() => setTransferFailed(false)} /> : null}
    </>
  );

  // 07-16(J11): 결재 중 하위 그룹을 끼운 표 행(선택 · 합 · 편집은 rows만 — 결재 중 행은 표에만 선다).
  const tableRows = withApproving(rows, props.approvingByWeek, props.page.page);
  const approvingCount = props.approvingByWeek.reduce((count, week) => count + week.count, 0);
  const approvingSum = props.approvingByWeek.every((week) => week.sumKrw !== null) ? props.approvingByWeek.reduce((sum, week) => sum + (week.sumKrw ?? 0), 0) : null;
  // K9 — 합계 면 아래 한 줄 `결재 중 N건 · 합계 제외 {합}`(통화 기호 없음 — SYSTEM §2-4). 금액 권한이 없으면 합 없이.
  const approvingLine =
    approvingCount > 0 ? (
      <p className={styles.approvingTotal}>
        {`결재 중 ${approvingCount}건 · 합계 제외`}
        {approvingSum !== null ? (
          <>
            {" "}
            <Num value={approvingSum} />
          </>
        ) : null}
      </p>
    ) : null;
  const groupKey = (row: PaymentTargetScreenRow) => (row.approving ? `${row.group}\u0000${row.approving.header}` : row.group);
  const groupHeader = (row: PaymentTargetScreenRow) =>
    row.approving ? (
      <span className={styles.approvingText}>{row.approving.header}</span>
    ) : row.groupTone === "warning" ? (
      <span className={styles.warningGroup}>{row.group}</span>
    ) : (
      row.group
    );

  // 지급 대상 없이 결재 중만 — 빈 화면 글자 + 하위 그룹 표(고르기 · 1차 없음). 필터로 결재 중만 남은 때도 같다(다른 지급 대상은 필터 밖).
  if (rows.length === 0 && tableRows.length > 0) {
    return (
      <ListScreen title="지출결의" filters={filters} summary={approvingLine}>
        <ListEmpty
          message={props.hasAny ? "조건에 맞는 건이 없습니다" : "이번 주 지급 대상 없음"}
          action={props.hasAny ? { label: "필터 지우기", href: href({ status: PAYMENT_TARGET_VIEW }) } : { label: "지급 완료 보기", href: props.paidHref }}
        />
        <Table caption="지급 대상" columns={columns} rows={tableRows} getRowId={(row) => row.id} groupBy={groupKey} groupHeader={groupHeader} />
      </ListScreen>
    );
  }

  if (!props.hasAny && rows.length === 0) {
    return (
      <ListScreen title="지출결의" filters={filters} empty={<ListEmpty message="지급할 건이 없습니다" action={{ label: "지급 완료 보기", href: props.paidHref }} />}>
        {null}
      </ListScreen>
    );
  }

  if (rows.length === 0) {
    return (
      <ListScreen title="지출결의" filters={filters}>
        <ListEmpty message="조건에 맞는 건이 없습니다" action={{ label: "필터 지우기", href: href({ status: PAYMENT_TARGET_VIEW }) }} />
      </ListScreen>
    );
  }

  // 결과 줄 ① · ②는 모든 쪽 고른 행으로 센다 — 지금 쪽 밖 행은 합 응답 rowStates의 견적 줄 · 선결제(검토 D-2).
  const { lineCount, prepaidCount } = snapshotCounts([
    ...snapshot.rows,
    ...offPageSnapshotRows(
      snapshot.ids,
      snapshot.rows.map((row) => row.id),
      offPage,
    ),
  ]);

  return (
    <div ref={rootRef}>
      <ListScreen
        title="지출결의"
        filters={filters}
        primaryAction={
          wide
            ? {
                label: chosen.length === 0 ? "지급 완료" : `지급 완료 ${chosen.length}`,
                onClick: openDialog,
                shortcut: "Ctrl+Enter",
                // 금액을 못 보는 지급 권한자는 모든 행이 막힌다 — 1차 이유는 고른 수가 아니라 그 권한(문서 화면 1차와 같은 글자).
                ...(!amountColumn ? { disabledReason: AMOUNT_HIDDEN } : chosen.length === 0 ? { disabledReason: "고른 건 없음", reasonTone: "info" as const } : {}),
                pending: isExecuting,
              }
            : undefined
        }
        summary={
          props.total ? (
            <section aria-label="합계" className={styles.totals}>
              <p className={styles.totalsTitle}>{`합계 (${PAYMENT_TARGET_VIEW} · ${props.total.count}건)`}</p>
              <p className={styles.totalsAmount}>
                {"지급 총액 "}
                <Num value={props.total.sumKrw} />
              </p>
              {approvingLine}
              {/* 보기 전용 폭(<1024)에는 선택 열 · 1차가 없으므로 고른 건 합계 줄도 없다(검토 D-9). */}
              {wide && chosen.length > 0 ? (
                <p className={styles.selectedSum}>
                  {sumFailedSeq === seq ? (
                    <>
                      <span className={styles.selectedSumLabel}>{`고른 ${chosen.length}건 · 합계를 받지 못함 · `}</span>
                      <Button variant="secondary" onClick={retrySum}>
                        다시 시도
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className={styles.selectedSumLabel}>{`고른 ${chosen.length}건 · 이체액`}</span>{" "}
                      <span className={[styles.selectedSumAmount, sumNow ? "" : styles.stale].join(" ")}>{sum ? <Num value={sum.totalKrw} /> : "…"}</span>
                    </>
                  )}
                </p>
              ) : null}
            </section>
          ) : (
            (approvingLine ?? undefined)
          )
        }
        pagination={
          <Pagination
            label="지급 대상"
            page={props.page.page}
            pageCount={props.page.pageCount}
            href={(target) => href(props.query, target)}
            rangeText={pageRangeText({ page: props.page.page, pageSize: props.page.pageSize, total: props.page.total, unit: "건" })}
          />
        }
      >
        <div onKeyDownCapture={pressCellAction}>
          <Table
            caption="지급 대상"
            columns={columns}
            rows={tableRows}
            getRowId={(row) => row.id}
            groupBy={groupKey}
            groupHeader={groupHeader}
            phoneRowLink
            enableGridKeyboard={wide}
            onCellCommit={commitCell}
            cellIssue={(row, columnKey) => {
              const message =
                columnKey === "transfer" ? transferIssue(row) : columnKey === "diffReason" && showErrors && chosen.includes(row.id) ? reasonIssue(row) : null;
              return message ? { kind: "error", message } : undefined;
            }}
            firstIssueSignal={issueSignal}
            {...(wide
              ? {
                  hint: [
                    { label: "이동", keys: "Tab ↑↓←→" },
                    { label: "고르기", keys: "Space" },
                    { label: "취소", keys: "Esc" },
                  ],
                  selection: {
                    selectedIds: chosen,
                    selectable,
                    onChange: (ids: string[]) => setSelection({ ...selection, selectedIds: ids }),
                    rowLabel: (row: PaymentTargetScreenRow) => row.title ?? row.number ?? row.id,
                    blockedReason: (row: PaymentTargetScreenRow) => {
                      const after = blocked.get(row.id);
                      if (!after) return null;
                      const gateReason = selectable(row);
                      // 선택 칸 이유와 같은 글자면 한 번만(같은 말을 두 자리에 쓰지 않는다).
                      return gateReason !== true && gateReason.reason === after.reason ? null : after.reason;
                    },
                    // 06.5-06(SP-65-5 ①): 이체 파일 막힘의 고치러 가는 길 — 새 탭(선택 · 편집 · 결과 글자를 지킨다).
                    blockedLink: (row: PaymentTargetScreenRow) => {
                      const link = blocked.get(row.id)?.link;
                      return link ? { ...link, newTab: true } : null;
                    },
                    noteReason: (row: PaymentTargetScreenRow) => (row.transferFileAt ? `${row.transferFileAt} 이체 파일에 담김` : null),
                    onPrimary: openDialog,
                    hidden: (row: PaymentTargetScreenRow) => row.approving !== undefined,
                  },
                }
              : {})}
          />
        </div>
        <BatchPaymentDialog
          open={dialogOpen}
          onClose={() => {
            if (isExecuting) return;
            setDialogOpen(false);
            subtotalTicketRef.current += 1;
            setSubtotalLines([]);
            focusAfterClose();
          }}
          count={snapshot.ids.length}
          // 모달을 연 순간 합계 번호의 서버 합만(아직이면 undefined — 부제 `…` · 1차 막힘). 실패면 「거부 — 이체액 합계 응답 없음」.
          totalKrw={sum !== null && sum.seq === snapshot.seq ? sum.totalKrw : undefined}
          sumFailed={sumFailedSeq === snapshot.seq}
          otherPageCount={snapshot.otherPage}
          diffCount={sum !== null && sum.seq === snapshot.seq ? diffCount(snapshot.ids, sum.diffs) : 0}
          payDate={payDate}
          today={props.today}
          onPayDateChange={(value) => {
            setPayDate(value);
            rememberPayDate(memoryKey, value);
          }}
          onRetrySum={retrySum}
          lineCount={lineCount}
          subtotalLines={subtotalLines}
          prepaidCount={prepaidCount}
          prepaidDueDays={props.prepaidDueDays}
          pending={isExecuting}
          rejection={rejection}
          dateError={props.dateError}
          onConfirm={confirm}
        />
        {/* 연 동안만 그린다 — 닫힌 dialog 요소(접근 이름 「증빙 확인」)가 화면 라벨 찾기에 섞이지 않게. */}
        {evidenceTarget ? (
          <EvidenceConfirmDialog
            // 다른 사람이 먼저 확인해 다시 받은 행이 `확인 전`이 아니면 닫는다(저절로 골라지지 않는다 — 포커스 = 그 행 링크).
            open={evidenceRow === undefined || evidenceRow.evidenceStatus === "확인 전"}
            expenseId={evidenceTarget.id}
            rowVersion={evidenceRow?.version ?? evidenceTarget.version}
            onClose={() => {
              setEvidenceTarget(null);
              // `확인 전`이 아니게 됐으면 그 행 링크, 아직이면(Esc · 취소) 그 행 3차 — 연 동안 3차가 새로 그려져도 행으로 다시 찾는다(검토 D-4).
              if (focusAfterCloseRef.current === null && evidenceRow)
                focusAfterCloseRef.current = evidenceRow.evidenceStatus !== "확인 전" ? `link:${evidenceTarget.id}` : `evidence:${evidenceTarget.id}`;
            }}
            onConfirmed={(result) => confirmedEvidence(evidenceTarget.id, result)}
          />
        ) : null}
      </ListScreen>
    </div>
  );
}

// 「Error — 목록 로드」 — 지급 대상을 읽지 못함: 표 자리 한 줄 + 2차 `다시 시도`(같은 화면 다시 받기).
export function PaymentTargetsLoadError() {
  const router = useRouter();
  return (
    <DetailScreen title="지출결의">
      <ListEmpty message="지급 대상 불러오지 못함" action={{ label: "다시 시도", onClick: () => router.refresh() }} tone="error" />
    </DetailScreen>
  );
}
