# Phase 6: 지급·증빙·법인카드·구매 요청 - Pattern Map

**Mapped:** 2026-09-24
**Files analyzed:** 21 (S1~S19 화면 + 지원 domain/repositories 모듈)
**Analogs found:** 18 / 21 (main 실측) — 3건은 main에 아직 없음(의존 브랜치만 존재, 아래 "No Analog Found" 참고)

## 전제: Phase 4/5/04.1 의존

RESEARCH.md `## Phase 4·5 의존 가정` 표가 이미 상세히 다룬다. 이 PATTERNS.md는 **main에 실제로 있는 코드**만 분석 패턴으로 인용한다. `quote_lines`·지출결의 문서(expenses)·결재 인스턴스(approvals) 스키마는 main에 아직 없으므로, 아래 "지출결의 문서"·"결재 상태" 관련 파일은 분석은 하되 애널로그가 없는 항목으로 명시한다. `app/(app)/expenses/page.tsx`·`app/(app)/cards/page.tsx`는 이미 존재하지만 자리표시자(placeholder, `ListEmpty`만)다 — Phase 6이 실제 내용을 채운다.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `domain/rules/register.ts` (규칙 4건 추가: `payment.approval-required`·`payment.evidence-required`·`card.dual-link-block`·`project.pre-settle-check`) | 도메인 규칙 등록 | request-response (판정) | `domain/rules/register.ts:17-24` (`project.completed-lock`, 같은 파일에 추가) | exact |
| `domain/payments/index.ts` (신규 — 지급 대상 조회·일괄 지급 완료·지급 취소) | service | CRUD + batch | `domain/revenue/index.ts` (역산·DTO·트랜잭션 경계) | role-match |
| `domain/evidence/waiver.ts` (신규 — 증빙 확인·면제) | service | CRUD | `domain/corp-cards/index.ts` (권한 체크 → 리포지토리 호출 → recordAction) | role-match |
| `domain/corp-card-usages/index.ts` (신규 — 카드 사용 등록·연결) | service | CRUD | `domain/corp-cards/index.ts` (구조), `domain/revenue/index.ts` (역산) | role-match(구조+계산 두 analog 조합) |
| `domain/purchase-requests/index.ts` (신규 — 구매 요청 신청/구매완료/취소) | service | CRUD + event-driven(상태 전이) | `domain/corp-cards/index.ts` + `repositories/document-counters.ts`(번호 부여) | role-match |
| `domain/revenue/issue-requests.ts` (신규 — 매출 발행 요청) | service | CRUD | `domain/revenue/index.ts` (같은 모듈 확장, 트랜잭션 경계 재사용) | exact(같은 파일 확장) |
| `domain/settings/keys.ts` (키 추가: 증빙 필수 on/off·10MB·14일·온라인구매 협력사명) | config | CRUD | `domain/settings/keys.ts:192-223` (`PROJECT_FORCE_COMPLETE_ALLOW_*`, 같은 파일) | exact |
| `repositories/payments.ts` `repositories/corp-card-usages.ts` `repositories/purchase-requests.ts` (신규) | model/repository | CRUD | `repositories/corp-cards.ts` | role-match |
| `app/(app)/expenses/page.tsx` (S1 지급 대상 목록으로 교체) | route/component (RSC) | request-response | `app/(app)/admin/corp-cards/page.tsx` (목록+토글 폼 RSC) | role-match |
| `app/(app)/expenses/actions.ts` (신규 — 일괄 지급 완료 S2 등) | controller (server action) | request-response(batch) | `app/(app)/admin/corp-cards/actions.ts` | exact |
| `app/(app)/cards/page.tsx` (S8 법인카드 사용 목록으로 교체) | route/component | request-response | `app/(app)/admin/corp-cards/page.tsx` | exact |
| `app/(app)/cards/actions.ts` (S9 카드 사용 등록·수정) | controller | request-response | `app/(app)/admin/corp-cards/actions.ts` | exact |
| `app/(app)/cards/card-usage-form.tsx` (S9 폼) | component | request-response | `app/(app)/admin/corp-cards/card-form.tsx` | exact |
| `app/(app)/cards/purchases/page.tsx` (S11 구매 요청 목록, 신규 디렉터리) | route/component | request-response | `app/(app)/admin/corp-cards/page.tsx` | role-match |
| `app/(app)/cards/purchases/actions.ts` (S12 구매 요청 신청, S13 구매 완료) | controller | request-response | `app/(app)/admin/corp-cards/actions.ts` | role-match |
| `app/(app)/projects/[id]/revenue-section.tsx` (S16 발행 요청 표 추가) | component | request-response | 같은 파일 확장 — `app/(app)/projects/[id]/revenue-section.tsx` (기존) | exact(같은 파일) |
| `app/(app)/projects/issue-requests/page.tsx` (S17 발행 요청 목록, 신규) | route/component | request-response | `app/(app)/admin/corp-cards/page.tsx` | role-match |
| `app/(app)/projects/[id]/pre-settle-check.tsx` (S18 완료 전 점검 섹션, 신규) | component | request-response | 없음(신규 UI 패턴, 아래 참고) — 가장 가까운 형태 참조는 `domain/rules/gate.ts`의 `GateDecision` 소비부 | partial |
| `domain/action-log/record.ts` (핵심 행동 종류 — `payment_process`·`purchase_process` 이미 있음, 증빙 확인/면제/지급취소는 `document_update`로 남길지 결정) | utility | event-driven(log write) | `domain/action-log/record.ts:1-30` (기존 상수 목록에 신규 항목 없이 사용) | exact |
| `domain/quotes/lines.ts` (견적 줄 상태 열 파생 조회 함수 추가, A-602 재확인 후) | service | transform(파생 조회) | main에 없음(Phase 4 미완) | no-analog |
| 지출결의 문서 UPDATE(지급 완료·차이 사유·취소) | service | CRUD | main에 없음(Phase 5 미완) | no-analog |
| 결재 상태 판정("결재 통과") | service | CRUD | main에 없음(04.1 미완) | no-analog |

## Pattern Assignments

### `domain/rules/register.ts` (규칙 등록)

**Analog:** `domain/rules/register.ts:1-25` (자기 자신 — 같은 파일에 사이드이펙트 등록을 추가)

**전체 패턴:**
```typescript
// Source: domain/rules/register.ts:1-24 (main, 실측)
import { registerGateRule } from "@/domain/rules/gate";

export type ProjectCompletedLockCtx = {
  status: string;
  actorCanAddOutOfQuoteLine?: boolean;
};

registerGateRule<unknown, ProjectCompletedLockCtx>({
  name: "project.completed-lock",
  check: (_doc, ctx) => {
    if (ctx.status !== "settled") return { allowed: true };
    if (ctx.actorCanAddOutOfQuoteLine) return { allowed: true };
    return { allowed: false, reason: "완료(정산) · 견적 줄이 잠김" };
  },
});
```
Phase 6은 같은 파일에 `payment.approval-required`·`payment.evidence-required`·`card.dual-link-block`·`project.pre-settle-check` 네 규칙을 같은 형태로 이어 붙인다. `gate.ts`가 `UnknownGateRuleError`를 던지므로 등록 누락은 즉시 실패로 드러난다(`domain/rules/gate.ts:14-16,32-38`).

**Pitfall 4 대응 (`project.pre-settle-check`):** `GateDecision`은 `{allowed, reason: string}` 하나뿐이다(`gate.ts:7`). 미결 점검 세 조건(D-611~613)을 화면에 "각각 몇 건"으로 보여줘야 하므로, 이 게이트 규칙은 **점검 결과 DTO(별도 서비스 함수)를 먼저 계산해 최종 allow/block만 판정**하도록 설계한다 — `check()` 함수 자체에 세 조건을 인라인하지 않는다.

---

### `domain/payments/index.ts` (신규 — 지급 대상·일괄 지급 완료·지급 취소)

**Analog:** `domain/revenue/index.ts` (구조 전체), `domain/corp-cards/index.ts` (쓰기 함수 형태)

**Imports 패턴** (`domain/revenue/index.ts:1-33`):
```typescript
import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { project, type DtoSpec } from "@/domain/permissions/project";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { registerDto } from "@/domain/permissions/dto-registry";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { moneyFromRow, moneyToColumns, round, grossFromTotal, type Money, type Currency } from "@/domain/money";
import { applyTaxRule } from "@/domain/money/tax";
import { getSettingValue as defaultGetSettingValue } from "@/domain/settings/registry";
import { withTransaction } from "@/lib/db-transaction";
```

**역산 + 차이(delta) 패턴** (`domain/revenue/index.ts:80-95`, D-605·D-607이 요구하는 정확한 선례):
```typescript
async function computeGrossFromPayment(totalKrw, entryDate, deps) {
  const vatRate = await getValue(TAX_VAT_RATE, { asOf: entryDate });
  const unit = await getValue(TAX_ROUNDING_VAT_UNIT, { asOf: entryDate });
  const grossKrw = grossFromTotal(totalKrw, vatRate, unit, "round");
  const recomputedVat = round(grossKrw * vatRate, unit, "round");
  const recomputedTotal = grossKrw + recomputedVat;
  return { grossKrw, recomputeDeltaKrw: recomputedTotal - totalKrw };
}
// "재계산 오차는 조정하지 않는다" 계약을 그대로 따른다 — 차이는 반환만, 값
// 보정은 호출자(화면)가 사유를 받아 별도로 기록한다.
```
`domain/payments`의 지급 완료 처리는 이 패턴을 그대로 복제한다: `totalKrw`(실제 이체액) → `grossFromTotal()` → 계산값(payable)과 비교해 `deltaKrw` 반환 → 화면이 사유 입력을 강제.

**일괄 처리 + 부분 성공 패턴 (D-604):** main에 정확히 같은 "여러 건 중 일부만 막힘" 선례는 없다. `withTransaction`(`lib/db-transaction.ts:8-10`)은 단일 트랜잭션 헬퍼이므로, RESEARCH.md Supporting 표의 권고대로 **건별 트랜잭션**(각 건을 개별 `withTransaction` 또는 개별 리포지토리 UPDATE)으로 설계하고, 게이트 판정을 루프 안에서 건마다 호출해 막힌 건의 사유만 배열에 모은다.

**DTO + 정보 노출표 등록** (`domain/revenue/index.ts:131-145`):
```typescript
export const REVENUE_DTO_SPEC: DtoSpec<RevenueProjectable, RevenueDto> = {
  fields: [
    { key: "contract", from: "contract", infoItem: "project.value" },
    { key: "issuedEntries", from: "issuedEntries", infoItem: "revenue.issued_amount" },
    // ...
  ],
};
registerDto({ name: "RevenueDto", fields: REVENUE_DTO_SPEC.fields.map((f) => ({ key: f.key, infoItem: f.infoItem })) });
```
지급 대상 DTO도 이 형태로 `PaymentDto`를 만들고 `registerDto()`에 등록한다(누수 스캔 생성기가 순회하는 레지스트리, D-38).

**에러 클래스 패턴** (`domain/corp-cards/index.ts:20-38`):
```typescript
export class ForbiddenError extends UserFacingError {}
export class InvalidCardOwnerError extends UserFacingError {}
export class DuplicateCorpCardError extends UserFacingError {}
export class ArchivedCorpCardError extends UserFacingError {}
```
`domain/payments`도 같은 결로 `ForbiddenError`·`PaymentGateBlockedError`(또는 `gate.ts`의 기존 `GateBlockedError` 재사용)·`PaymentAlreadyProcessedError` 등을 도메인별로 선언한다.

---

### `domain/corp-card-usages/index.ts` (신규 — 카드 사용 등록)

**Analog:** `domain/corp-cards/index.ts` 전체 구조

**소유자 XOR 검증 패턴** (`domain/corp-cards/index.ts:42-54`, EXP-07의 "셋 중 하나만" 요구와 형태가 같다):
```typescript
export type CardOwnerInput = { holderUserId?: string | null; teamId?: string | null };
export type CardOwnerKind = "personal" | "team";

export function cardOwnerKind(input: CardOwnerInput): CardOwnerKind {
  const hasHolder = Boolean(input.holderUserId);
  const hasTeam = Boolean(input.teamId);
  if (hasHolder === hasTeam) {
    throw new InvalidCardOwnerError("법인카드는 소지자 또는 팀 중 정확히 하나를 가져야 합니다.");
  }
  return hasHolder ? "personal" : "team";
}
```
카드 사용 등록의 "견적 줄 / 견적 외 비용 / 팀 비용 중 하나"(D-608)는 이 XOR 판정 함수를 3항으로 확장한 형태(정확히 하나 참)로 순수·동기 함수를 만들어 재사용한다.

**중복 감지 + 사용자 메시지 치환 패턴** (`domain/corp-cards/index.ts:145-155`):
```typescript
try {
  row = await repoInsertCorpCard(viewer, { ...input, kind });
} catch (e) {
  if (isUniqueViolation(e, "corp_cards_issuer_last4_key")) {
    throw new DuplicateCorpCardError("이미 등록된 카드입니다 · 발급사와 뒤 4자리를 확인하세요");
  }
  throw e;
}
```
증빙 SHA-256 중복(EVID 계열, Phase 5 소관이지만 Phase 6 화면이 그 오류를 받는다면)도 같은 `isUniqueViolation` + 도메인 오류 치환 패턴을 따른다.

**서버 판정(Pitfall 3) 패턴 — 화면 숨김과 별개로 액션에서 재확인** (`domain/corp-cards/index.ts:176-184`):
```typescript
const existing = await findCorpCardById(viewer, id);
if (!existing || existing.archivedAt !== null) {
  throw new ArchivedCorpCardError("보관되었거나 존재하지 않는 법인카드는 수정할 수 없습니다.");
}
```
`card.dual-link-block` 게이트도 이 형태로 — 견적 줄 id로 기존 연결 문서를 다시 조회해 판정하고, 카드 사용 등록·지출결의 제출 두 액션 모두에서 호출한다(D-609, Pitfall 3).

---

### `domain/purchase-requests/index.ts` (신규 — 구매 요청)

**Analog:** `domain/corp-cards/index.ts`(도메인 구조) + `repositories/document-counters.ts`(번호 부여)

**원자적 번호 부여 패턴** (`repositories/document-counters.ts:38-60`):
```typescript
export async function allocateNumber(viewer, counterKey, period, tx = db) {
  await tx.insert(documentCounters)
    .values({ counterKey, period, value: 0 })
    .onConflictDoNothing({ target: [documentCounters.counterKey, documentCounters.period] });
  const [row] = await tx.update(documentCounters)
    .set({ value: sql`${documentCounters.value} + 1` /* 실제는 RETURNING */ })
    .where(and(eq(documentCounters.counterKey, counterKey), eq(documentCounters.period, period)))
    .returning();
  return row.value;
}
```
**반드시 문서 INSERT와 같은 트랜잭션에서 호출**(`lib/db-transaction.ts`의 `withTransaction` 경유) — 번호만 먼저 커밋되면 "번호는 있는데 문서가 없는" 상태가 생긴다(D-42 규약). 구매 요청 번호 `26001-C0001`은 `counterKey`를 새 문자열(예: `"purchase_request"`, A-612 미확정)로 등록해 같은 함수를 재사용한다.

**문 가르기(온라인구매 협력사 판정)는 순수 함수로 분리** — `cardOwnerKind()`(위 인용)와 같은 결: DB 접근 없이 견적 줄의 협력사 코드 + 설정값(`온라인구매` 키)만 받아 "구매 요청"/"지출결의" 중 어느 문서 종류인지 반환하는 동기 함수를 만들고, 액션 계층이 그 결과로 분기한다.

---

### `domain/revenue/issue-requests.ts` (신규 — 매출 발행 요청, D-610)

**Analog:** `domain/revenue/index.ts` 같은 파일(모듈 확장) — 특히 `computeVat`(66-78행)과 `saveRevenue` 계열의 트랜잭션 경계

같은 파일의 `VAT_SURCHARGE_RULE`·`computeVat` 패턴을 그대로 참조해 세금 계산 없이도(발행 요청은 "요청"일 뿐 금액 확정 아님) 같은 임포트·같은 `ForbiddenError`/`ProjectNotFoundError` 재사용 원칙을 따른다. 발행 요청이 발행 줄에 "연결"되는 시점(요청 닫힘)은 `repoInsertRevenueEntry`/`repoUpdateRevenueEntryIfVersionMatches`(`domain/revenue/index.ts:29-31` import)와 같은 리포지토리 계층 호출로 마무리한다.

---

### `domain/settings/keys.ts` (신규 키 4~5개)

**Analog:** `domain/settings/keys.ts:191-223` (강행 허용 키 3종, 같은 파일에 추가)

```typescript
// Source: domain/settings/keys.ts:191-201 (main, 실측)
export const PROJECT_FORCE_COMPLETE_ALLOW_OPEN_EXPENSES: SettingDef<boolean> = {
  key: "project.force_complete.allow_open_expenses",
  kind: "simple",
  schema: z.boolean(),
  label: "미결 지출결의가 있어도 완료 처리 허용",
  hint: "켜면 미결 지출결의가 있어도 프로젝트를 완료 처리할 수 있습니다.",
  namespace: "완료 처리 강행",
  default: false,
  readBy: { phase: "6" },
};
```
Phase 6의 새 키(증빙 필수 on/off 기본 true·10MB·선결제 14일·온라인구매 협력사명)는 같은 `SettingDef<T>` 형태로 이 파일에 추가하고 `namespace`를 새로 만든다(예: `"증빙"`, `"법인카드"`). `readBy: { phase: "6" }` 관례를 그대로 쓴다.

---

### `app/(app)/expenses/page.tsx` + `app/(app)/expenses/actions.ts` (S1·S2·S3 — 지급 대상 목록·일괄 지급 완료)

**Analog:** `app/(app)/admin/corp-cards/page.tsx` (목록 + `?new=1`/`?editId=` 토글 폼) · `app/(app)/admin/corp-cards/actions.ts` (서버 액션)

**RSC 목록 페이지 골격** (`app/(app)/admin/corp-cards/page.tsx:38-60`):
```typescript
export default async function CorpCardsPage({ searchParams }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await can(session.viewer, "admin.corp-cards", "view"))) notFound();

  const { includeInactive: includeInactiveParam, new: newParam, editId } = await searchParams;
  const showCreateForm = newParam === "1";

  const [cards, canWrite, people, orgUnits, teams, canArchive] = await Promise.all([
    listCorpCards(session.viewer, { includeInactive }),
    can(session.viewer, "admin.corp-cards", "write"),
    // ...
  ]);
  // ...
}
export const dynamic = "force-dynamic";
```
현재 `app/(app)/expenses/page.tsx`는 `requireSession()` + `ListEmpty` 자리표시자뿐이다(19줄, 전체 인용):
```typescript
// Source: app/(app)/expenses/page.tsx:1-19 (main, 실측, 전체)
import { requireSession } from "@/lib/viewer";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { PageHeader } from "@/ui/page-header/PageHeader";

export default async function ExpensesPage() {
  await requireSession();
  return (
    <>
      <PageHeader title="지출결의" subtitle="지급요청·결재 진행 현황" />
      <ListEmpty message="등록된 지출결의가 없습니다" action={{ label: "법인카드 보기", href: "/cards" }} />
    </>
  );
}
```
Phase 6은 이 파일을 `admin/corp-cards/page.tsx` 골격(위 인용)으로 교체하되 `?view=pay`(S1)·`?view=paid`(S3) 쿼리로 지급 대상/지급 완료 두 보기를 가른다(§6-1 「이번 주 지급」 그룹, UI-SPEC S1 참조). `requireSession()` 대신 `getSession()` + `can()` 패턴(권한 분기 필요)으로 바꾼다 — 지급 권한자만 S1을 본다.

**서버 액션 골격** (`app/(app)/admin/corp-cards/actions.ts:1-30`, 전체가 작아 인용):
```typescript
"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authedActionClient } from "@/lib/actions/client";
import { createCorpCard } from "@/domain/corp-cards";
import "./actions.registry";

export const createCorpCardAction = authedActionClient
  .schema(z.object({ issuer: z.string().min(1, "발급사를 입력하세요.") /* ... */ }))
  .action(async ({ parsedInput, ctx }) => {
    const dto = await createCorpCard(ctx.viewer, parsedInput);
    revalidatePath("/admin/corp-cards");
    return dto;
  });
```
`app/(app)/expenses/actions.ts`(신규)의 일괄 지급 완료 액션(S2)도 이 형태를 그대로 쓴다. 배열 입력(`z.array(...)`)을 받아 `domain/payments`의 일괄 처리 함수를 호출하고, 반환값에 건별 성공/실패 배열을 담아 화면이 "막힌 건은 이유와 함께 남긴다"(D-604)를 렌더할 수 있게 한다.

---

### `app/(app)/cards/page.tsx` + `card-usage-form.tsx` + `actions.ts` (S8·S9 — 카드 사용 목록·등록)

**Analog:** `app/(app)/admin/corp-cards/page.tsx` + `card-form.tsx` + `actions.ts` (동일 폴더, `admin/` 접두어만 다름)

현재 `app/(app)/cards/page.tsx`도 같은 자리표시자 구조다(19줄, `expenses/page.tsx`와 동형). `admin/corp-cards` 3파일 세트(`page.tsx`·`card-form.tsx`·`actions.ts`)를 그대로 이식하되, "카드 마스터 CRUD"(관리자 전용)가 아니라 "카드 사용 등록"(전 직원, 자기 카드/팀 카드)으로 권한 메뉴 키만 바꾼다(`CARDS_MENU = "admin.corp-cards"` → 신규 메뉴 키, 예: `"cards.usage"`).

**`?editId=` 토글 + href 헬퍼 패턴** (`app/(app)/admin/corp-cards/page.tsx:22-36`):
```typescript
function corpCardsHref(includeInactive, opts) {
  const params = new URLSearchParams();
  if (includeInactive) params.set("includeInactive", "1");
  if (opts?.isNew) params.set("new", "1");
  if (opts?.editId) params.set("editId", opts.editId);
  const query = params.toString();
  if (!query) return "/admin/corp-cards";
  const anchor = opts?.editId ? "#corp-card-owner-form" : "#corp-card-form";
  return `/admin/corp-cards?${query}${anchor}`;
}
```
S9("연결 고르기 — 프로젝트·견적 줄 「바꾸기」" 모달, S10)도 같은 쿼리 파라미터 + 앵커 패턴으로 설계한다.

---

### `app/(app)/cards/purchases/` (S11·S12·S13 — 구매 요청, 신규 디렉터리)

**Analog:** `app/(app)/admin/corp-cards/` 3파일 세트(구조 재사용), `repositories/document-counters.ts`(번호)

기존에 이 경로는 없다. `admin/corp-cards`와 같은 3파일 세트(`page.tsx`+`page`용 폼 컴포넌트+`actions.ts`)를 새로 만들되, "구매 완료"(S13)는 `app/(app)/cards/card-usage-form.tsx`(S9와 동일 컴포넌트, "구매 완료 모드"로 재사용)를 참조한다 — UI-SPEC S13이 "S9 재사용"이라고 명시한다.

---

## Shared Patterns

### 게이트 판정 — 서버 액션에서 재확인, 화면 숨김에만 기대지 않는다
**Source:** `domain/corp-cards/index.ts:176-184` (보관된 카드 재확인), `domain/rules/register.ts` + `domain/rules/gate.ts`
**Apply to:** `domain/payments`(지급 게이트 2건), `domain/corp-card-usages`(이중 연결 차단), `domain/purchase-requests`, `project.pre-settle-check`
```typescript
// 화면이 "카드 사용 등록" 버튼을 숨겨도, 서버 액션이 다시 조회해 판정한다
const existing = await findCorpCardById(viewer, id);
if (!existing || existing.archivedAt !== null) {
  throw new ArchivedCorpCardError("...");
}
```

### 금액 역산 + 재계산 오차 표시(조정 안 함)
**Source:** `domain/revenue/index.ts:80-95` (`computeGrossFromPayment`), `domain/money/index.ts:120-127` (`grossFromTotal`)
**Apply to:** `domain/payments`(지급 완료액 역산, D-605), `domain/corp-card-usages`(카드 결제 합계 역산, D-607), `domain/purchase-requests`(구매 완료 카드 금액 역산)
```typescript
const grossKrw = grossFromTotal(totalKrw, vatRate, unit, "round");
const recomputedTotal = grossKrw + round(grossKrw * vatRate, unit, "round");
const recomputeDeltaKrw = recomputedTotal - totalKrw; // 조정하지 않고 그대로 반환
```

### DTO 투영 + 누수 스캔 등록
**Source:** `domain/revenue/index.ts:131-145` (`REVENUE_DTO_SPEC` + `registerDto()`), `domain/corp-cards/index.ts:68-85`
**Apply to:** 이 페이즈가 만드는 모든 새 DTO(`PaymentDto`·`CorpCardUsageDto`·`PurchaseRequestDto`·`RevenueIssueRequestDto`)
```typescript
export const XxxDtoSpec: DtoSpec<Row, Dto> = { fields: [{ key, from, infoItem }, ...] };
registerDto({ name: "XxxDto", fields: XxxDtoSpec.fields.map((f) => ({ key: f.key, infoItem: f.infoItem })) });
```

### RSC 목록 + `?new=1`/`?editId=` 토글 폼
**Source:** `app/(app)/admin/corp-cards/page.tsx:22-60`
**Apply to:** `expenses/page.tsx`, `cards/page.tsx`, `cards/purchases/page.tsx`, `projects/issue-requests/page.tsx`

### 서버 액션 + `revalidatePath` + `actions.registry.ts` 분리
**Source:** `app/(app)/admin/corp-cards/actions.ts:1-30`
**Apply to:** 모든 신규 `actions.ts` 파일. `import "./actions.registry"` 관례(누수 스캔이 server-only 체인을 직접 import 못 함, 03-03 선례)도 따른다.

### 행동 로그
**Source:** `domain/action-log/record.ts:10-27` (`CORE_ACTION_TYPES`)
**Apply to:** 지급 완료·구매 완료는 이미 등록된 `payment_process`·`purchase_process` 그대로 쓴다(`[VERIFIED: domain/action-log/record.ts:19-20]`). 증빙 확인/면제/지급 취소는 이 목록에 정확히 대응하는 종류가 없다 — 계획 단계에서 `document_update`로 남길지 새 종류를 추가할지 정한다(RESEARCH.md Supporting 표와 동일 이슈).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `domain/quotes/lines.ts` 상태 열 파생 조회 함수 | service | transform | main `domain/quotes/lines.ts:58`은 `lineStatus: string`이 이미 있지만 파생 로직(A-602, D-64)은 Phase 4 브랜치 계획에만 있다 — main에 없음, 의존: Phase 4(`origin/claude/gsd-progress-e1nzgu`) |
| 지출결의 문서 UPDATE(지급 완료·차이 사유·잠금 해제) | service | CRUD | main에 지출결의(`expenses`) 스키마 자체가 없다 — 의존: Phase 5(CONTEXT만, PLAN 없음) |
| 결재 상태 조회("결재 통과" 판정 함수) | service | CRUD | main에 `db/schema/approvals.ts` 없음 — 의존: Phase 04.1(`origin/claude/phase-04.1-plan-1iqtwe`, 계획만, 미실행) |
| `app/(app)/projects/[id]/pre-settle-check.tsx` (S18) | component | request-response | 완료 전 점검처럼 "세 조건 각각의 미결 건수·목록"을 한 화면에 보여주는 선례가 main 화면에 없다(가장 가까운 것은 `admin/corp-cards/page.tsx`의 단순 목록뿐) — 신규 UI 패턴으로 계획 단계에서 새로 설계 |

## Metadata

**Analog search scope:** `domain/`(rules, corp-cards, revenue, money, settings, action-log), `repositories/`(corp-cards, document-counters), `app/(app)/`(admin/corp-cards, expenses, cards, projects)
**Files scanned:** 약 14개(Read/Grep 대상), 전부 500줄 이하 또는 부분 범위만 읽음
**Pattern extraction date:** 2026-09-24
