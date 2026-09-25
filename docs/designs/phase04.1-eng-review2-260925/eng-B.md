# 04.1 두 번째 /plan-eng-review — 갈래 B (04.1-02 · 04.1-04 · 04.1-05)

읽기 전용 검토. 브랜치 `claude/phase-04.1-plan-1iqtwe` @ 1ad17aa. 이미 판정된 항목(1차 리뷰 ENG-1~25, Codex 4회차, B-F04, A-FF01)과 사용자가 정한 결정(비례 연차, 입사일 기준 월차, 월차와 연차 분리, 기안자가 지금 담당이면 승인+회수)은 다시 올리지 않았다.

**집계: BLOCKER 0 · P2 4 · P3 13**

---

## 0. 범위 확인 (Scope check)

| 플랜 | 범위 | 판단 |
|---|---|---|
| 04.1-02 | 연차 신청, 결재함 승인·반려·회수·다시 신청, 공용 전이 함수, D1 관련자 판정, 연차 쓰기 권한의 도메인 강제, 액션 등록 가드, E2E 날짜 헬퍼 | 3 task / 약 145k 토큰으로 크다. 대신 트레이서 → 갈래 → 동시성 순서라 나눌 필요는 없다. 줄일 곳이 없다. |
| 04.1-04 | 설정 화면 결재선(이름 옵션, 비활성 칸, 경고), 이력형 적용 시작일 규칙(일반 저장과 가져오기 두 경로), Playwright `desktop-settings` 프로젝트 | 적절하다. 이력형에는 **세 번째 쓰기 경로**(`cancelHistorizedValue`)가 있는데 플랜이 다루지 않는다(T7). |
| 04.1-05 | 폰 결재 시트, `ui/approval-route`, `ui/confirm-dialog`(main에 없음을 확인), 문서 화면 행동 줄, `withDetails` 투영, 로딩·오류 경로, 접근성 | 크지만 한 흐름이다. 확인 다이얼로그는 main에 없다(`git ls-tree origin/main`에 `confirm-dialog` 0건) — 이 플랜이 만든다. |

실측으로 확인한 전제(맞음):
- `lib/actions/client.ts`의 `authedActionClient`는 크기 검사와 세션만 본다.
- `lib/actions/handle-server-error.ts:24`는 `if (e instanceof UserFacingError) return e.message;`다.
- `lib/actions/registry.ts`의 `registerAction({name, menu, action, dtoName})`이 있다.
- `requireSession`이 있다(`lib/viewer.ts:60`).
- `ui/button`의 `pending`은 실제 `disabled`다(`const isDisabled = pending || disabled;`).
- `ui/table`에 `groupBy`와 `onRowTap`이 있고, 그룹 머리글은 행에서 파생된다(빈 그룹은 머리글이 없다).
- `createRole`, `setPermissionCell`, `registerPerson`의 첫 줄 `canFn` 패턴이 있다.
- `repositories/roles.ts` `listRoles(viewer, {includeArchived})`와 `repositories/org-units.ts` `listOrgUnits(viewer, {scope})`의 시그니처가 플랜과 같다.
- `domain/settings/registry.ts:137-139`, `domain/settings/export.ts:116,140`의 줄 번호가 정확하다.
- `upsertSimpleValue`가 PK `onConflictDoUpdate`라서 두 관리자가 동시에 저장해도 23505가 나지 않는다.
- 설정 `page.tsx`는 96행, `settings-form-client.tsx`는 275행, `actions.ts`는 58행이다.
- 등록 파일이 없는 `actions.ts`는 `app/(app)/account/actions.ts`(`changePasswordAction`) 하나뿐이다. 나머지 모든 `export const …Action`은 옆 `actions.registry.ts`의 `name:`에 있다. 스크립트로 전수 확인했다.
- `import-cycles.test.ts`는 `import type`과 side-effect import를 세지 않는다(`if (match[2]) continue;`, 정규식이 `from`을 요구한다). 그래서 `resubmit.ts`의 `import "./index"`는 순환으로 잡히지 않는다.
- Next 16.3.5 `error.tsx`의 표준 인자는 `retry`다. 기존 코드도 `retry`를 쓴다.

---

## 1. 아키텍처

**A1 [P2] (confidence: 7/10) `.planning/phases/04.1-approvals-leave/04.1-02-PLAN.md:224` — 액션 반환값(토스트 재료)이 `approval.value`·`leave.value` 투영을 거치지 않는다**
- 플랜 인용(02:224): 「`approveAction`({instanceId, expectedVersion}) → `approveDocument` → 다음 담당 이름 또는 최종 여부·차감 일수를 돌려준다(토스트 문구 재료)」. 02:227에는 「성공하면 토스트 `연차 신청 · 결재 요청됨 → {1단 담당}`」가 있다.
- 비교 대상(01:84, CX-R3): 「담당 이름(`holderNames`)과 기안자 이름(`drafterName`)은 viewer가 `approval.value` 노출 투영 … 을 통과할 때만 실리고」.
- 기존 코드 인용(`test/integration/leak-scan.test.ts:138-140`): `if (action.dtoName !== null) { const dtoRegistered = DTO_REGISTRY.some((dto) => dto.name === action.dtoName);`. 액션 축은 등록 여부만 보고 실제 반환값의 투영은 검사하지 않는다.
- 문제:
  - 미리보기(04.1-06)에서는 `approval.value`가 꺼진 계급에게 이름을 숨긴다. 그런데 같은 사람이 제출하거나 승인하면 토스트로 다음 담당 이름을 받는다.
  - `N일 차감`은 `leave.value` 항목인데 같은 식으로 샌다.
  - 반려 토스트 `반려 · 박서연에게 돌아감`도 기안자 이름이다.
  - CX-R3로 막은 누수를 액션 반환 경로가 다시 연다.
- 고칠 방향:
  - 네 액션(`submitLeaveAction`·`resubmitLeaveAction`·`approveAction`·`rejectAction`)의 결과를 등록 DTO(`approvalActionResult`: `nextHolderNames`→`approval.value`, `deductedDays`→`leave.value`, `drafterName`→`approval.value`)로 요청 단위 메모와 함께 `project()`한다.
  - 필드가 빠지면 토스트는 `승인 · 결재 요청됨` / `승인 · 최종 승인` / `반려 · 기안자에게 돌아감`으로 줄인다(UI-SPEC 메모 필요).
  - 통합 사례를 더한다: 결재자 계급의 `approval.value`를 끄면 `approveDocument` 결과 `JSON.stringify`에 다음 담당 이름이 없다. `leave.value`를 끄면 일수가 없다.

**A2 [P2] (confidence: 7/10) `04.1-04-PLAN.md:255` — 가져오기의 과거 연도 가드가 설정 JSON 복원(ADMN-06 본래 용도)을 첫 해가 지나면 막는다**
- 플랜 인용(04:255): 「`past_year`면 그 항목이 **무변화 행**인지 본다 — `getSettingValue(def, {asOf: 그 날짜}, deps)`(대상 환경에서 그날 이미 유효한 값: 기존 행 또는 기본값)와 … 같으면 통과, 다르면 issue」.
- 기존 코드 인용:
  - `test/integration/settings-export.test.ts`: `it("(a) 내보내고 빈 환경에 가져오면 모든 키의 조회 결과가 원래 환경과 같다"`
  - `docs/OPERATIONS.md:245`: 「`importSettings`는 파일의 모든 키를 먼저 검증하고 하나라도 … **아무것도 쓰지 않는다**」
- 문제:
  - 오케스트레이터 편차(open-notes 8)는 시드 `2000-01-01` 행만 풀었다.
  - 예: 운영에서 2026년에 `leave.annual_days` `2027-01-01 = 16`을 넣었다. 2028년에 새 환경(빈 설정 표)으로 복원하면 2027 행은 지난 연도이고, 대상의 그날 값은 기본 15라서 16과 다르다. 그러면 **가져오기 전체가 거부된다**(전부 또는 없음).
  - 복원 리허설(04.4 페이즈)이나 환경 이전 때 설정을 옮길 방법이 없어진다. 기존 (a) 사례는 시드 행만 있어 녹색으로 남으므로 테스트가 이 회귀를 잡지 못한다.
- 고칠 방향(둘 중 하나):
  - `importSettings`에 명시적 복원 모드를 둔다. CLI 전용 `--restore`이고 SYSTEM viewer일 때만 `past_year` 무변화 검사를 건너뛴다. 기본은 엄격하게 둔다.
  - 또는 대상 환경에 그 키의 이력 행이 하나도 없을 때(새 환경)는 지난 연도 행을 허용한다.
  - 통합 (i) 사례를 더한다: 표를 비운 뒤 `[{2000-01-01,15},{2025-01-01,16}]`을 `deps.now`=2026-09-24로 가져오면 복원 모드에서 통과하고 이력이 같다.

**A3 [P2] (confidence: 6/10) `04.1-02-PLAN.md:239` — CEO-3 가드가 `"use client"` 파일의 `import type`까지 잡아, 클라이언트 번들에 `document-kinds` → `@/domain/leave` → DB 코드를 끌어오게 만든다**
- 플랜 인용(02:239): 「(a) `@/domain/approvals`(하위 경로 포함) 또는 `@/domain/leave/resubmit`을 import하는 파일은 `document-kinds`도 import한다」. 타입 전용 import와 클라이언트 파일에 대한 예외가 없다.
- 기존 코드 인용:
  - 선례가 있다: `app/(app)/projects/projects-table.tsx`: `import type { ProjectListItemWithGroup, ProjectAggregateDto } from "@/domain/projects";`("use client" 파일)
  - `test/unit/import-cycles.test.ts`: `if (match[2]) continue;`(타입 import는 제외하는 기존 관례)
- 문제:
  - 04.1-05의 `inbox-table.tsx` · `approval-sheet.tsx` · `document-actions.tsx`와 04.1-04의 `settings-form-client.tsx`는 클라이언트 컴포넌트다.
  - 이 파일들이 결재함 항목 타입이나 `activeWhen` 타입을 `@/domain/approvals…`에서 `import type`으로 가져오는 것은 기존 관례다. 그런데 그러면 가드가 실패한다.
  - 가드를 맞추려고 `import "@/app/(app)/document-kinds"`를 넣으면 `@/domain/leave` → repositories → `@/db/client`가 클라이언트로 들어간다. 그러면 `next build`가 Node 모듈 해석에 실패하거나 서버 코드가 번들에 섞인다.
- 고칠 방향: 가드의 검출 정규식에서 `import type …`을 빼고 `"use client"` 파일을 건너뛴다. 대신 클라이언트 파일이 `@/domain/approvals`의 **런타임** import를 하지 않는다는 단언을 더한다. 검출기 사례로 가짜 `"use client"` + `import type` 파일이 통과하는 것을 넣는다.

(아키텍처 참고, 문제 아님)
- 공용 전이 함수의 잠금 순서: 다시 신청은 `leave_requests` → `approval_instances`, 승인·반려·회수는 `approval_instances`만 잡는다. 반려 상태에서 승인은 (1)·(2)에서 UPDATE 전에 멈추므로 교착이 생기지 않는다.
- 결재함 `withDetails`의 세 층(구조 필드 → `project()` → `buildDetailRows`)은 기존 `domain/permissions/project.ts`와 맞다(`if (!(field.from in source)) continue;` `const ok = await visibleFn(viewer, field.infoItem);`). `project()`는 얕은 복사라서, 잔고 필드는 `LEAVE_REQUEST_BALANCE_DTO_SPEC`로 먼저 투영된 객체를 통째로 싣는다. 입사일·퇴직일은 그 명세에 없어 안전하다.

---

## 2. 코드 품질

**C1 [P2] (confidence: 8/10) `04.1-02-PLAN.md:346,368` — `buildConflictMessage`에 지금 상태 `submitted`(다시 신청 뒤)의 문구가 없다**
- 플랜 인용:
  - 02:346: 「`buildConflictMessage({status: "withdrawn", …})` → `박서연이 14:01에 회수함 · 새로 고침`, 승인 …, 반려 …, 최종 승인 …, 후보 아님 …」. 다섯 모양뿐이다.
  - 02:359: 「반려된 문서에 기안자가 같은 version으로 `resubmitLeave`를 `Promise.all` 두 번 → 정확히 하나 성공, 다른 쪽은 충돌 문구」. 문구가 정해져 있지 않다.
- 기존 문서 인용(`04.1-UI-SPEC.md:205`): 「`박서연이 14:01에 회수함 · 새로 고침` · `이수아가 14:01에 승인함 · 새로 고침` · `김팀장이 14:01에 반려함 · 새로 고침` · `지금 담당이 아님 · 새로 고침` · `최종 승인됨 · 새로 고침`」
- 문제: 다시 신청이 이긴 뒤의 지금 상태는 `submitted`이고 `updated_by`는 기안자다. 이 상태로 진 쪽이 두 경로에서 생긴다.
  - (a) 다시 신청 중복에서 진 쪽(기안자 본인)
  - (b) 팀장이 반려했고 기안자가 다시 신청했는데, 옛 탭(version 1)을 연 공동 1단 후보가 승인 → 관련자 → 상세 문구 갈래
  두 경우 모두 매핑이 없다. 그러면 `undefined`가 나오거나, 틀린 동사(`승인함`)가 나오거나, 원시 예외가 된다.
- 고칠 방향: `submitted` 상태이고 차수 > 1이면 `{기안자}이/가 HH:MM에 다시 신청함 · 새로 고침`(새 문구이므로 UI-SPEC 205에 메모)으로 한다. 단위 사례 하나와 02:359 통합의 정확 일치 단언을 더한다. 상태 → 동사 매핑은 `status` 타입 전체를 다 다루는 switch로 두어 새 상태가 컴파일 오류가 되게 한다.

**C2 [P3] (confidence: 6/10) `04.1-02-PLAN.md:224` — 「차감 일수」의 출처가 종류 경계 밖이다**
- 플랜 인용: 「`approveDocument` → 다음 담당 이름 또는 최종 여부·차감 일수를 돌려준다」.
- 기존 코드 인용(01:304 종류 등록 계약): `registerDocumentKind({kind, label, loadRouteConfig, href, describeDocuments, routeSettings?, canResubmit?})`. 일수 훅이 없다.
- 문제: 범용 엔진이나 `app/(app)/approvals/actions.ts`(Phase 5 지출결의도 쓰는 곳)가 연차 일수를 알려면 연차 분기가 필요하다. 이는 금지 항목 「종류 이름 분기」와 부딪힌다.
- 고칠 방향: 최종 토스트 재료는 종류의 `describeDocuments` 요약(이미 일수를 담는다)에서 가져와 A1의 `leave.value` 투영을 거친다. SUMMARY에 출처 한 줄을 적는다.

**C3 [P3] (confidence: 8/10) `04.1-05-PLAN.md:323` — 오류 경계의 재시도를 `reset`으로 적었다(Next 16.3 표준은 `retry`)**
- 플랜 인용: 「본문 자리 `--danger` 한 줄(…) + 2차 `다시 시도`(`reset`)」.
- 기존 코드 인용:
  - `app/(app)/projects/error.tsx`: `export default function ProjectsError({ error, retry }: …)`
  - `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md:157`: 「In most cases, you should use `retry()` instead … `reset()` … without re-fetching」
- 문제: `reset`은 서버 데이터를 다시 가져오지 않는다. DB 일시 오류 뒤 「다시 시도」를 눌러도 같은 오류가 다시 나온다.
- 고칠 방향: `retry`로 바꾸고 기존 `projects/error.tsx` 모양을 따른다.

**C4 [P3] (confidence: 6/10) `04.1-05-PLAN.md:48,275` — 확인 다이얼로그 1차의 `aria-disabled` 막힘이 `ui/button` API와 맞지 않는다**
- 플랜 인용: 「사유가 비면 1차가 `aria-disabled`이며 `사유 없음 · 한 줄 적어 주세요`가 보인다」. 05:159에는 「`ui/button`은 고치지 않는다」가 있다.
- 기존 코드 인용(`ui/button/Button.tsx`): `const isDisabled = pending || disabled;`, `disabled={isDisabled}`, `{isDisabled && !pending && disabledReason ? <span className={styles.reason}>…`
- 문제: Button에는 「aria-disabled + 이유 표시」 모드가 없다. `disabled`를 쓰면 네이티브 disabled가 되어 초점 이동과 E2E 단언(`aria-disabled`)이 어긋난다. rest로 `aria-disabled`만 넘기면 이유 글자가 그려지지 않고 클릭과 `Ctrl+Enter`도 막히지 않는다.
- 고칠 방향: ConfirmDialog가 막힘 이유 슬롯(1차 왼쪽)을 직접 그리고, 클릭과 `Ctrl+Enter` 처리기에서 막힘 상태면 실행하지 않는다. E2E에 「사유 빈 상태에서 `Ctrl+Enter` → 요청 0건」을 더한다.

**C5 [P3] (confidence: 7/10) `04.1-05-PLAN.md:159,259` · `04.1-02-PLAN.md:200` — 참조 브랜치가 로컬에 없다**
- 플랜 인용: 「`git show origin/claude/gsd-progress-e1nzgu:.planning/phases/04-project-quote-ledger/04-UI-SPEC.md`의 S16 · 150행 계약대로」, 시작 절차는 「`git fetch origin main`」뿐이다.
- 실측: `git branch -r` → `origin/claude/phase-04.1-plan-1iqtwe`와 `origin/main`만 있다. 같은 문서가 로컬 `.planning/phases/04-project-quote-ledger/04-UI-SPEC.md:150`(「**ConfirmDialog**(신규, 이 페이즈 — DR-12) | `ui/confirm-dialog/ConfirmDialog` …」)에 있다.
- 고칠 방향: 로컬 경로를 1순위로 읽는다. 브랜치 구현 파일이 필요하면 `git fetch origin claude/gsd-progress-e1nzgu`를 명시한다.

**C6 [P3] (confidence: 5/10) `04.1-02-PLAN.md:298` — `resubmitLeave`가 판정 전에 쓰고, 막힘 오류가 관련자 판정보다 먼저 나간다**
- 플랜 인용: 「`countLeaveQuarters`로 다시 검증 … → 트랜잭션 전 읽기(`prepareSubmission`) → 한 트랜잭션에서 신청 행 칸 갱신 … + `resubmitDocument`」.
- 기존 01 계약(01:304): 「walkRoute가 「막힘」이면 여기서 제출을 거부한다(트랜잭션을 열기 전)」.
- 문제:
  - (a) 신청 칸 UPDATE가 공용 전이의 (1)~(5)보다 앞선다. 관련자가 아니거나 옛 version이면 롤백으로만 되돌려진다. 결과는 맞지만 truth 「상태 UPDATE 먼저」와 순서가 다르다.
  - (b) 결재선이 막힌 조직이면 무관한 PM의 옛 version 호출이 `NotCurrentHolderError`가 아니라 제출 막힘 오류를 받는다. D1 정확 일치 단언과 갈라지고, 그 기안자 결재선이 막혔다는 정보가 샌다.
- 고칠 방향: `prepareSubmission`의 막힘 거부를 「기안자 본인이고 version이 일치할 때」 뒤로 미룬다(막힘 여부를 결과로 받아 전이 (3) 뒤에 던진다). 신청 칸 갱신은 전이 (5) 뒤 (6)에 둔다.

**C7 [P3] (confidence: 6/10) `04.1-02-PLAN.md:209-211` · `04.1-05-PLAN.md:195` — E2E 픽스처 이름이 모두 같아 이름 단언이 공허하다**
- 플랜 인용: 「토스트가 `승인 · 결재 요청됨 → {본부 책임자 이름}`」, 「결재선 목록의 1단이 `{팀장}(나) 팀장 · 내 결재`」.
- 기존 코드 인용(`test/e2e/fixtures.ts`): `const name = options.roleId === SYSADMIN_ROLE_ID ? "E2E Admin" : "E2E Employee";`
- 문제: 기안자, 팀장, 본부 책임자가 모두 `E2E Employee`다. 엉뚱한 사람에게 결재가 가도 문구가 같아 통과한다.
- 고칠 방향: 이 스펙들에서는 `createAccount(SYSTEM_VIEWER, {email, name: 고유 이름, roleId})`를 직접 쓴다. 기존 `createFixtureUser` 계약은 그대로 둔다.

**C8 [P3] (confidence: 5/10) `04.1-02-PLAN.md:229` — 승인 뒤 결재함을 다시 그리는 방법이 적혀 있지 않다**
- 플랜 인용: 「행동(PC만, `내 결재` 행에만 3차 `승인` — 확인 없이 즉시 …)」. E2E(02:210)는 「그 행이 `처리함`으로 옮겨 간다」를 단언한다.
- 기존 코드 인용(`app/(app)/admin/settings/actions.ts:31`): `revalidatePath("/admin/settings");`
- 고칠 방향: 결재 액션들은 성공 뒤 `revalidatePath("/approvals")`와 `revalidatePath("/leave/[id]")`를 부르는 것으로 정한다(05의 `router.refresh()`와 중복되지 않게 한 곳으로).

---

## 3. 테스트

### 3.1 커버리지 도표

```
코드 경로 (04.1-02)                                      계획된 테스트                              ★
submitLeaveAction → assertLeaveWrite → submitLeave       leave-permission(거부·행0) · E2E 트레이서   ★★★
  └ /leave/new 페이지 게이트(쓰기 없으면 404)            수락 grep만                                 ★   GAP T5 [→E2E]
approveAction → 공용 전이 (1)version (2)종결 (3)후보      lifecycle · concurrency · route-fixed      ★★★
  ├ (1) 불일치 · 관련자 → 상세 문구                        concurrency 관련자 네 부류                   ★★★
  │   └ 지금 상태 submitted(다시 신청 뒤)                  없음                                         ✗  GAP C1
  ├ (1) 불일치 · 무관자 → not_holder                       concurrency CX-W4(네 전이)                   ★★★
  ├ (2) 종결 사건별(CX-B1)                                 lifecycle + concurrency                      ★★★
  ├ (5) UPDATE 0행 경주                                    Promise.all 20회 · 폴백 경합 · 다시 신청 중복 ★★★
  └ 반환값(다음 담당 이름·차감 일수) 투영                  없음                                         ✗  GAP A1
rejectAction → 사유 1~500 → 반려 후보(기안자 제외)        lifecycle(빈·공백·501, 비후보 셋)            ★★★
withdrawLeaveAction → 기안자만 · 막힘/고아에서도          route-fixed X-2 · lifecycle                  ★★★
resubmitLeaveAction → assertLeaveWrite → 새 차수          lifecycle · leave-permission · concurrency   ★★★
  └ 막힘 결재선 + 무관자 옛 version                        없음                                         ✗  GAP C6
possibleActions(getApprovalView = listMyInbox 상세)       lifecycle X-5 · W5/W8 · inbox-projection     ★★★
action-registry-completeness · document-kinds 가드        단위(검출기 a~d)                             ★★
  └ "use client" + import type 오탐                         없음                                         ✗  GAP A3
leaveWeekdayRange                                         단위 4 기준일                                 ★★★

코드 경로 (04.1-04)
listApprovalRouteOptions(설정 보기만)                     통합(권한만 계급 · Forbidden)                ★★★
routeActiveWhen / isSettingActive / disabled              단위 + 통합 값 보존 + E2E 1단 disabled        ★★★
listApprovalRouteSettingWarnings(켜진 단계만)             단위 + E2E                                   ★★★
validateEffectiveFrom → addHistorizedValue                단위(형식·지난 연도·서울 경계)                ★★★
validateEffectiveFrom → importSettings(무변화 행)          통합 e~h + 기존 a~c                          ★★
  └ 빈 환경 복원 + 실제 지난 연도 행                       없음                                         ✗  GAP A2
cancelHistorizedValue(세 번째 쓰기 경로, UTC 오늘)         없음                                         ✗  GAP T7
설정 저장 경주 + 제출(ADMN-04 동시성)                      통합 10회                                    ★★★
desktop-settings 직렬화 · finally 복원                     --list 검사 + 마지막 테스트                   ★★★

코드 경로 (04.1-05)
listMyInbox withDetails(노출≤2 · 행=2 · 사용/조정=기안자 수) 통합 세는 주입 20건/5건                   ★★★
detailDto 투영 → buildDetailRows(ENG-17)                  단위 검출기 + 실제 leave.value 통합           ★★★
now 주입이 상세 잔고까지(CX-B2)                            단위 + 통합 두 날짜                          ★★★
문서 행동 줄 = 서버 목록(합집합 포함)                      E2E desktop + desktop-settings W5            ★★★
폰 시트 승인 · 두 번 탭 · 처리함 행 → 문서                 E2E mobile-375                               ★★★
동시 처리 거부 표시 — 문서 화면                            E2E                                          ★★
동시 처리 거부 표시 — 결재함 PC 행 · 폰 시트               없음                                         ✗  GAP T4 [→E2E]
반려 확인: 사유 없음 막힘 + Ctrl+Enter 무시                막힘 문구만                                   ★   GAP T6 [→E2E]
error.tsx 다시 시도                                       없음(axe만)                                   ✗  C3

사용자 흐름
직원 신청 → 1~4단 PC 승인 → 최종                          E2E leave-approval                           ★★★
결재자 폰 승인                                            E2E mobile                                    ★★★
반려 → 고쳐서 다시 신청(번호 유지 · 새 차수)               E2E leave-document                           ★★★
회수(결재 중) · 승인 뒤 회수 거부                           통합 + E2E                                    ★★★
옛 탭(stale)에서 승인/반려                                문서 화면 E2E만                               ★★  (T4)
권한 거둬진 기안자                                        통합(빈 목록 · 회수 유지)                      ★★★
관리자가 결재선 바꿈 → 진행 중 불변                        통합 + E2E(자기 승인)                         ★★★
설정 복원(다른 환경으로 가져오기)                          (a) 시드 행만                                  ★   GAP A2
```

### 3.2 빈틈(GAP)과 회귀 위험

- **T4 [P3] (confidence: 6/10) `04.1-05-PLAN.md:270` — 옛 페이지 충돌 표시 E2E가 문서 화면에만 있다**
  - 플랜 인용: 「결재자가 문서를 연 채로 기안자가 회수하면, 결재자의 `승인`이 행동 줄 옆에 `{기안자}이/가 HH:MM에 회수함 · 새로 고침`을 보이고」.
  - 05:56 truth는 「결재함 행 · 문서 행동 줄 · 시트·모달 막힘 자리」 세 곳을 말한다. 결재함 PC 행 3차 `승인`의 충돌 한 줄은 E2E가 없다. [→E2E] 한 사례를 더한다.
- **T5 [P3] (confidence: 6/10) `04.1-02-PLAN.md:62,254` — `/leave/new` 404 게이트를 grep으로만 확인한다**
  - 플랜 인용: 「`app/(app)/leave/new/page.tsx`에 `"leave", "write"` 게이트가 있다」.
  - 도메인 거부는 통합으로 증명되지만 페이지 동작은 증명되지 않는다. [→E2E] 쓰기 권한 없는 계급의 404 한 사례(04.1-06 E2E와 합쳐도 됨)를 더한다.
- **T6 [P3] — C4의 테스트 쪽.** 사유가 빈 상태에서 `Ctrl+Enter`를 누르면 요청이 0건이어야 한다. [→E2E]
- **T7 [P3] (confidence: 6/10) `04.1-04-PLAN.md:42` — `cancelHistorizedValue`가 세 번째 쓰기 경로다**
  - 플랜 인용: 「공통 검증 함수 `validateEffectiveFrom(…)` 하나에 있고 **두 쓰기 경로**가 모두 부른다」.
  - 기존 코드 인용(`domain/settings/registry.ts:172-173`): `const today = dateOnly(new Date()); if (effectiveFrom <= today) {`
  - 문제: UTC 날짜라서 서울 1월 1일 00:00~08:59에는 이미 시작된 올해의 `year_start` 행(`YYYY-01-01`)을 취소할 수 있다. 지난 연도가 아니라 올해라서 ENG-5 위반은 아니다. 다만 「올해 잔고가 이미 부여된 뒤 취소」가 가능하다.
  - 고칠 방향: 취소의 「오늘」을 `seoulToday(deps.now)`로 바꾼다(한 줄, `RegistryDeps.now` 재사용). 서울 경계 단위 사례를 하나 더한다. 범위 밖으로 둘 경우에도 TODOS에 기록한다.
- **R1 [P3] (confidence: 7/10) `04.1-02-PLAN.md:309` — CRITICAL 회귀 경로: `approveDocument`를 공용 전이 함수로 옮기는데 Task 2 검증에 01의 동시성·결재함 투영 테스트가 없다**
  - 플랜 인용: 「`pnpm vitest run --project integration test/integration/approvals-lifecycle.test.ts test/integration/leave-permission.test.ts test/integration/approvals-route-fixed.test.ts test/integration/leave-balance.test.ts test/integration/leak-scan.test.ts`」.
  - 01의 `approvals-concurrency.test.ts`(동시 제출·승인 경주)와 `approvals-inbox-projection.test.ts`는 Task 3의 `pnpm test`에서야 돈다. Task 2 커밋에서 01 승인 경주가 깨져도 한 task 동안 드러나지 않는다.
  - 고칠 방향: Task 2 verify에 두 파일을 더한다.
- 그 밖의 회귀 위험(확인 결과 처리됨):
  - `assertLeaveWrite` 추가: 01·03 테스트 기안자는 시드 계급이고 `seedApprovalsLeave`가 `seedMasterData`에 들어간다(01:310). 허용 조항(02:300)으로 충분하다.
  - `MENUS` 끝에 `leave` 추가: `admin-menu-registry.test.ts`는 `admin.*`만 대조하고, 권한표 E2E는 칸 수를 세지 않는다. 문제없다.
  - 설정 select 렌더 변경: `settings.spec.ts`가 verify에 있다.

---

## 4. 성능

- **P1 [P3] (confidence: 7/10) `04.1-04-PLAN.md:190,259` — 설정 화면이 결재선 17키를 두 번 읽는다**
  - 플랜 인용: 「`page.tsx`가 경고 맵을 한 번 읽어 보기 모델의 선택 필드 `warning`에 싣고」. 경고 함수는 「단계마다 사용 여부 · 조직 범위 값 · 부서 값을 읽고」.
  - 기존 코드 인용(`app/(app)/admin/settings/page.tsx:59`): `currentValue = await getSettingValue(def);`. 키마다 쿼리 한 번이다.
  - 영향: 키별 17쿼리 + 경고 17키 + 본부 목록 + 옵션 2쿼리로 대략 40쿼리다. 관리자 화면이고 30명 규모라 문제는 아니다. 다만 경고 함수에 `buildSections`가 이미 읽은 값을 넘기면(순수 판정부 재사용) 절반이 준다.
- **P2 [P3] (confidence: 8/10) `app/(app)/layout.tsx:25`** — `MENUS.map(async (menu) => ((await can(viewer, menu.key, "view")) ...`. `leave` 메뉴 추가로 매 요청 권한 조회가 1회 는다. 무시할 수준이고 기록만 한다.
- 문제없음(확인):
  - `withDetails`는 노출 ≤2, 연차 행 2, 사용·조정은 기안자 수, 설정은 연도 수이고 계수 범위는 ENG-18이 좁혔다.
  - 공용 전이는 version 조건 UPDATE 한 문장이 행 잠금을 잡는다(교착 없음 — §1 참고).
  - 설정 경주는 PK upsert다.
  - 04 통합 경주(10회 × 8 동시)는 기존 `document-counters-concurrency` 선례와 같은 풀 부하다.

---

## 5. 실패 모드 표

| 경로 | 현실적인 실패 | 테스트? | 오류 처리? | 조용한 실패? |
|---|---|---|---|---|
| 다시 신청 중복 / 옛 탭 승인(다시 신청 뒤) | 충돌 문구 매핑 없음 → undefined 또는 틀린 동사 | 부분(문구 미정) | ✗ | 예 — 틀린 문구 (C1) |
| 승인·제출 액션 반환 | `approval.value` 꺼진 계급에 다음 담당 이름·일수 노출 | ✗ | ✗ | 예 — 누수 (A1) |
| 설정 가져오기(새 환경 복원) | 실제 지난 연도 행 때문에 전체 거부 | ✗ | 오류는 남(ImportValidationError) | 아니오 — 다만 복원 불가 (A2) |
| 클라이언트 컴포넌트의 타입 import | 가드 실패 → document-kinds를 클라이언트로 끌어와 빌드 실패 | ✗ | — | 아니오(빌드에서 드러남) (A3) |
| 반려 확인 사유 없음 + Ctrl+Enter | 막힘 무시하고 요청 → 서버 거부 문구 | ✗ | 서버 거부 | 아니오 (C4/T6) |
| 오류 경계 다시 시도 | `reset`이 다시 가져오지 않아 같은 오류 반복 | ✗ | 부분 | 예 (C3) |
| 막힌 결재선 + 무관자 다시 신청 | not_holder 대신 제출 막힘 문구 | ✗ | 됨 | 아니오 (C6) |
| 결재함 PC 행 충돌 | 행 옆 한 줄 · 새로 고침 미표시 | ✗ | 계획상 있음 | 가능 (T4) |
| 1월 1일 새벽 이력 취소 | UTC 기준으로 올해 행 취소 가능 | ✗ | ✗ | 예 (T7) |
| 동시 승인/회수/반려/폴백/다시 신청 | 둘 다 성공 · 23505 | ✓ | ✓ | 아니오 |
| 로그 INSERT 실패 | 부분 커밋 | ✓(주입 3사례) | ✓ | 아니오 |
| 쓰기 권한 없는 직접 호출 | 행 생성 | ✓ | ✓ | 아니오 |
| 결재함 상세 N+1 | 항목 수만큼 행 읽기 | ✓(계수) | — | 아니오 |

---

## 6. 이미 있는 것 — 재사용 메모

- **토스트·충돌 한 줄의 셀 오류 모양**: `ui/table/types.ts` `CellIssue {kind: "error" | "conflict", message, actions}`. 결재함 PC 행의 충돌 한 줄 + 3차 `새로 고침`은 새 컴포넌트 없이 `cellIssue`로 그릴 수 있다(T4 E2E의 표적도 된다).
- **폰 행 탭**: `ui/table` `onRowTap`(04-04). 그룹 머리글이 빈 그룹을 자동으로 빼므로 「비면 머리글째 없음」을 따로 구현할 필요가 없다.
- **pending 버튼**: `ui/button` `pending`(실제 disabled + `…`). 막힘 이유는 C4처럼 다이얼로그가 따로 그린다.
- **하단 시트 골격**: `ui/shell/MoreSheet.tsx`(스크림·포커스 트랩·Esc). 플랜대로 복제만 하고 고치지 않는다.
- **오류 경계 문구 모양**: `app/(app)/projects/error.tsx`(`ListEmpty tone="error"` + `retry`). 새 `error.tsx` 둘이 그대로 따라가면 된다(C3).
- **재귀 파일 찾기**: `test/unit/leak-scan-coverage.test.ts` `findRegistryFiles`. 등록 완전성 가드가 같은 모양을 쓴다(실측: 조건이 이미 참이고 예외는 account 하나).
- **타입 import 제외 관례**: `test/unit/import-cycles.test.ts`의 `(type\s+)?` 분기. document-kinds 가드도 같은 규칙을 쓴다(A3).
- **설정 즉시 저장과 다시 그리기**: `setSimpleSettingAction`의 `revalidatePath("/admin/settings")`. `disabled`와 경고가 prop이라 새 클라이언트 상태 없이 갱신된다. `SimpleFieldEditor`는 `useState(initialValue)`라서 저장값이 prop으로 다시 들어와도 선택값이 흔들리지 않는다.
- **권한 없는 계급 만들기**: `createRole`(`admin.people` write 필요 — 테스트는 SYSTEM_VIEWER) + `setPermissionCell`(`admin.permissions` write).
- **시드 기본 이력 행**: `SEED_HISTORIZED_EFFECTIVE_FROM = "2000-01-01"`(`domain/seed/index.ts:16`). 무변화 규칙의 근거다.
- **E2E 도메인 직접 호출**: `test/e2e/fixtures.ts`가 이미 `@/domain/*`를 import한다(설정 `finally` 복원이 같은 모양). 다만 이름은 고유하게 준다(C7).
