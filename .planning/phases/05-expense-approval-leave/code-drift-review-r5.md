# Phase 5 계획 ↔ main(b41944d) + 04.5 브랜치(8ae0903) 어긋남 조사 — Round 5

- **기준 커밋**: origin/main **b41944d**(#154) + 04.5 브랜치 `origin/claude/phase-04.5-execute-7y4bi0` 헤드 **8ae0903**(main과의 merge-base 2453653 = #155, main보다 한 커밋 뒤). 04.6은 **계획만** 있다(origin/main `.planning/phases/04.6-a/`, 0/32 실행 — 04.6-32 superseded).
- **조사 대상**: 계획 브랜치 HEAD 9d97fcc(PR #89, merge-base f3242c8 = Round 4 기준)의 `.planning/phases/05-expense-approval-leave/` 05-01~05-15-PLAN · 05-UI-SPEC · 05-RESEARCH · 05-VALIDATION · 05-REVIEWS · `.continue-here.md`
- **범위**: `git log f3242c8..origin/main` 53커밋(04.2 · 04.3 #88 · 04.6 계획 #113 · #121 · #126 · #138 · #147 · #150 · #151 KMS 제거 · #153~#155 등) + `git diff origin/main 04.5헤드`(마이그레이션 0023 · 권한 · 시드 · 누수 스캔 · DECISIONS)
- **방법**: 읽기만 했다(`git show <ref>:<path>` · `git diff` · `git grep`). 체크아웃은 바꾸지 않았고 파일은 이 보고서 말고 하나도 쓰지 않았다. 형식은 `code-drift-review.md`(Round 4)를 따른다.
- **표시**: 표시가 없는 줄은 해당 ref에서 직접 확인했다. **[추정]**은 아직 실행되지 않은 04.6 계획 문장을 근거로 한 예측이다. 04.6이 실제로 머지된 모양은 다를 수 있다.

## 요약

| 등급 | 수 | 한 줄 |
|---|---|---|
| **P1 막는 문제** | **5** | 착수 게이트에 04.5 · 04.6 머지 확인 없음 · 04.6 스킨 A가 UI-SPEC과 화면 플랜 전제를 뒤집음(lint가 막음) · 04.6이 Phase 5가 고칠 파일 18개를 먼저 고쳐 ⓪-b E5~E7 기대 문장이 낡음 · `RowSheet` `action` prop이 이미 다른 타입으로 있음 · `docs/OPERATIONS.md` 300/300줄 · `docs/ARCHITECTURE.md` 295/300줄이라 05-12 · 05-13 문서 한도 테스트 실패 |
| P2 권장 | 8 | GCS 어댑터 · 서명 저장소 포트 선례(04.3) · 버킷 이름 규칙 · 배포 바인딩 자리 · verify 워크플로 · 세션/테스트 단계 규칙(2026-10-01) · `risk:` 태그 · 위험 경로 PR 분리 · OPS-08 미매핑 · 지급 방식 코드표 `CODE_TABLES` + MAST-05 · 칸 이름 구분자 「, 」(04.5) · 누수 스캔 구조(04.5) · 폼 선택지 DTO 등록 선례 |
| P3 사소 | 8 | 설정 `asOf` 계약 · 05-06 read_first 오기 · `ConfirmDialog` 새로 고침 꼬리 · `Button.nextStep` · `QuoteLineDto.vendorName` · 줄 번호 · `.continue-here.md` 낡은 제약 · Post-build 순서 |

**중복 구현은 없다.** `expenses` · `files` · `upload_intents` · `settlement_approvals` 표, `domain/expenses|evidence|settlements|next-turn`, `lib/gcp/storage.ts`, `ui/attachments`, `ui/pick-dialog`, `app/(app)/home-approval-actions.tsx`, `app/api/storage-local` 가운데 main · 04.5에 있는 것은 하나도 없다. 다만 **같은 일을 하는 선례**가 04.3으로 생겼다. `lib/gcp/gcs.ts`(GCS REST 어댑터)와 `lib/storage/signature-store.ts`(저장소 포트)가 그것이고, `RowSheet`의 선택 prop `action`도 이미 생겼다. 계획이 이것들을 모른다(F4 · F6).

**가장 큰 변화는 실행 순서 04.5 → 04.6 → 5(#147, 사용자 결정 2026-10-02)다.** Phase 5 UI-SPEC은 `a9a90e4` 시점의 `ui/`와 SYSTEM에 고정돼 있다. 04.6이 머지되면 화면 틀 · 상태 배지 · 숫자 · 토큰 이름 · lint가 모두 바뀐다(F2 · F3).

---

## P1 — 막는 문제

### [P1] F1 — 착수 게이트 P-1~P-5에 04.5 · 04.6 머지 확인이 없다
- **어긋남**: ROADMAP Phase 5 `Depends on`이 `Phase 4, Phase 04.1, Phase 04.5, Phase 04.6 (실행 순서 04.5 → 04.6 → 5, 사용자 결정 2026-10-02)`로 바뀌었다(#147 d45a16b). 그런데 05-01 「선행 의존」 표와 must_haves 첫 truth는 04.1 · Phase 4만 본다. 그래서 04.6이 머지되기 전에 실행해도 게이트가 통과한다. 그러면 F2 · F3의 낡은 화면 코드가 나온다.
- **지금 게이트 결과(실행해서 확인함, 9d97fcc 기준)**:
  - P-1 · P-2(04.1 SUMMARY 7) · P-3(Phase 4 PLAN 44 = SUMMARY 44)는 통과한다.
  - **P-4는 종료 코드 1이다.** 계획 브랜치가 origin/main b41944d를 포함하지 않는다.
  - P-5: `05-VALIDATION.md:6`이 `status: draft`다.
  - 04.5는 origin/main에서 PLAN 9 · SUMMARY 0이고, 04.5 브랜치에서는 SUMMARY 9다. 04.6은 PLAN 33(32는 superseded) · SUMMARY 0이다.
- **계획 위치**: 05-01-PLAN.md:46(must_haves 「실행 착수 게이트」) · :145-156(「선행 의존」 P-1~P-5 표) · :217(`<precondition>`) · `.continue-here.md` BLOCKING CONSTRAINTS 1번(「04.1 · Phase 4 머지됨 … P-1~P-4 통과 확인」)
- **근거**: origin/main `.planning/ROADMAP.md`(Phase 5 절 `**Depends on**`) · `git show d45a16b8`
- **고칠 모양**: 「선행 의존」 표에 두 줄을 더한다.
  - **P-6**: 04.5가 main에 있다. 명령은 `git ls-tree --name-only origin/main .planning/phases/04.5-custom-field-admin/ | grep -c -- '-SUMMARY.md$'` = 9이고, `git cat-file -e origin/main:db/migrations/0023_custom_field_admin.sql`가 통과해야 한다.
  - **P-7**: 04.6이 main에 있다. 04.6 SUMMARY 수 = 32(PLAN 33 − superseded 04.6-32)여야 한다. 또 `ui/list-screen/ListScreen.tsx` · `ui/detail-screen/DetailScreen.tsx` · `ui/status-tag/status-map.ts`가 있어야 한다. 정확한 파일 이름은 04.6 SUMMARY의 「뒤 플랜에 넘기는 API」로 다시 맞춘다.
  - must_haves 첫 truth와 `<precondition>`에도 같은 문장을 넣는다. P-4 설명의 「dc5a8fc로 통과」는 지운다.
- **사용자 결정 필요**: 아니오. ROADMAP 결정을 게이트로 옮기는 일이다.

### [P1] F2 — 04.6 스킨 A가 05-UI-SPEC과 화면 플랜의 컴포넌트 · 토큰 전제를 뒤집는다 [추정: 04.6 계획 문장 기준]
- **어긋남**: 04.6이 머지되면(Phase 5보다 먼저) 아래가 바뀐다. 모두 lint나 단위 래칫이 막는 규칙이다.
  - **화면 틀**: 모든 `app/**/page.tsx`는 `ListScreen`이나 `DetailScreen`을 써야 한다. `app/**`에서 `PageHeader`를 직접 import할 수 없다(04.6-02 truth 5 — `test/unit/ui/screen-frames.test.ts`).
    - 05-08 ④는 「`PageHeader` 제목만」이라고 쓴다.
    - 05-UI-SPEC 컴포넌트 표의 `PageHeader` 행(05-UI-SPEC.md:101 부근)도 같은 전제다.
  - **`app/**` TSX에서 `<table>` · `<dialog>` 직접 사용 금지**(04.6-02 truth 4 — eslint `no-restricted-syntax`). Phase 5 화면의 표 · 시트가 직접 `<table>`/`<dialog>`를 쓰면 막힌다(`ui/pick-dialog`처럼 `ui/` 안이면 괜찮다).
  - **상태 배지**: `StatusTag`는 `status` 낱말을 받고 색은 `ui/status-tag/status-map.ts` 한 표가 정한다. `kind`는 04.6-28에서 지워진다.
    - Phase 5의 새 낱말 넷은 SYSTEM §7-5에만 적히고 status-map에는 들어가지 않는다. 대상: 05-02 B2의 `작성 중` · `본인 승인` · `지출결의 중` · 견적 줄 `반려`, B8의 `무효`.
    - `app/(app)/leave/status-display.ts`는 지금 `kind: StatusTagKind`를 돌려준다. 05-01 ③ E6이 이 모양 위에서 `success`를 더하고, 05-05 `app/(app)/expenses/status-display.ts`도 같은 모양을 전제한다.
  - **숫자**: 금액 · 수량은 `ui/num/Num` 하나로 그린다. `app/**` CSS의 `font-variant-numeric`은 lint가 막는다(04.6-05 · 04.6-02). 05-08 ②의 「금액 `.num` 2행」 같은 CSS 클래스 전제는 낡는다.
  - **토큰**: 날 px · 날 색 · 원시 토큰 · 척도 밖 간격이 막힌다. 글자 크기는 `--text-(body|aux|tag)`만 쓸 수 있고 옛 토큰 이름은 지워진다(04.6-02 · 04.6-31).
    - 05-02의 SYSTEM 개정 문장이 `--fs-md`(B7) · `--muted` · `--accent` · `왼쪽 2px --accent`(B5) 같은 옛 이름과 2px 진한 선을 쓴다.
    - 04.6 SC 13이 「radius 0 · 그림자 없음 · 2px 진한 선」 결정을 뒤집는다.
  - **옆 패널 · 폼 배치**: §6-3 폼 배치가 옆 패널(PC 480) 기준으로 다시 쓰인다(04.6-01 · 04.6-04 — D-39 → 옆 패널). 05-02 B1(§6-3 지출결의 폼)과 UI-SPEC S3이 기대는 절이다.
  - **빈 화면 · 불러오는 중**: `ListEmpty`(첫 행동 버튼 하나)와 `TableSkeleton`(진짜 열 이름 · 300ms 지연)으로 바뀐다. 화면별 `loading.module.css`가 사라진다(04.6-17 · 04.6-19).
  - **행 행동 링크**: `ui/row-actions/RowActions`로 그린다(04.6-05). 05-10 `rowApprovalActions` · 05-05 행 행동 열이 그 표현을 써야 한다.
- **계획 위치**: 05-UI-SPEC.md:95-123(Component Inventory — `a9a90e4` 고정) · Spacing · Color 절 · 05-02-PLAN.md 전체(:29 · :31 · :118 · :132 · :134) · 05-05 · 05-06 · 05-07 · 05-08(:156) · 05-09 · 05-10 · 05-11 · 05-13(DOM 감사 · a11y) · 05-15 화면 task
- **근거**: origin/main `.planning/phases/04.6-a/04.6-02-PLAN.md`(must_haves 1·4·5·7) · `04.6-05-PLAN.md`(truth 35·41·44, files `ui/status-tag/status-map.ts` · `ui/num/Num.tsx` · `ui/row-actions/RowActions.tsx`) · `04.6-28-PLAN.md`(StatusTag kind 삭제) · `04.6-31-PLAN.md`(옛 토큰 이름 삭제) · ROADMAP 04.6 Success Criteria 1~13 · 04.6-UI-SPEC.md:331(「늦게 머지되는 쪽이 적용한다」 — Phase 5가 늦게 머지되는 쪽이다)
- **고칠 모양**: 「사용자 결정 필요」 **U1**을 본다. 어느 쪽이든 UI-SPEC Component Inventory · Spacing · Color · Typography를 04.6 머지 판 `SYSTEM.md` · `tokens.css` · `ui/`로 다시 열거한다. 05-02 B1~B9는 04.6 SYSTEM 절 이름과 역할 토큰 이름으로 다시 쓴다. 화면 플랜 acceptance에 「`scripts/design/mark-legacy.mjs --audit <폴더>` 위반 0」(04.6 공통 §4 마무리 조건)을 더한다.
- **사용자 결정 필요**: 예(U1).

### [P1] F3 — 04.6이 Phase 5가 고칠 파일 18개를 먼저 고쳐, 플랜이 묘사하는 모양과 ⓪-b E5~E7 기대 문장이 낡는다 [추정: 04.6 계획 files_modified 기준]
- **어긋남**: 아래는 Phase 5 files_modified와 04.6 files_modified가 겹치는 파일이다(두 frontmatter를 기계로 대조함).

| 파일 | Phase 5 | 04.6(먼저 실행) |
|---|---|---|
| `app/(app)/approvals/approval-sheet.tsx` · `inbox-table.tsx` · `page.tsx` | 05-01 Task 4 · 05-10 | 04.6-17(시트 = `SidePanel` 제어 형태 · `ListScreen` · `TableSkeleton`) |
| `app/(app)/approvals/decision-dialogs.tsx` | 05-01 Task 4 | 04.6-17 |
| `app/(app)/leave/[id]/page.tsx` | 05-01 Task 4 | 04.6-18(`DetailScreen`) |
| `app/(app)/leave/[id]/document-actions.tsx` | 05-11 | 04.6-18 |
| `app/(app)/page.tsx`(내 차례) | 05-10 ④ | 04.6-19(`ListScreen`) |
| `app/(app)/expenses/page.tsx` | 05-08 ④ | 04.6-19(`ListScreen` + `ListEmpty` + 첫 행동 2차) |
| `app/(app)/projects/[id]/page.tsx` | 05-05 · 05-11 | 04.6-12(`DetailScreen`) |
| `app/(app)/projects/[id]/quote-table.tsx` | 05-05 · 05-08 · 05-15 | 04.6-12 |
| `app/(app)/admin/code-tables/page.tsx` | 05-03 | 04.6-15 |
| `app/(app)/admin/settings/settings-form-client.tsx` | 05-04 | 04.6-20 |
| `test/e2e/project-lifecycle.spec.ts` | 05-11 | 04.6-12 |
| `test/e2e/settings-approval-route.spec.ts` | 05-03 | 04.6-20 · 04.6-27 |
| `playwright.config.ts` | 05-05 | 04.6-13(visual 프로젝트) |
| `docs/design/SYSTEM.md` · `DECISIONS.md` | 05-02 | 04.6-01 · 04 · 23 · 26 · 31 |
| `TODOS.md` | 05-13 | 04.6-31 |

- **⓪-b가 멈출 자리**:
  - **E6**: 「`leaveStatusDisplay`가 `{kind, label}`, `RouteStepSource`에 `selfApproved` 추가」 전제는 04.6-28 뒤 `kind`가 없어지면 모양이 다르다.
  - **E7**: 「시트 = 04.1 제자리 `<dialog>` 시트, 닫힘 규칙 그대로」 전제는 04.6-17 뒤 `SidePanel` 제어 형태 · `--scrim-panel` · 뒤 `inert`로 바뀐다.
  - **E5**: 결재함 `page.tsx`는 `ListScreen`으로 다시 쓰인다. 연차 캐스트 자리가 옮겨질 수 있다.
  - Round 4 Z1~Z3 결정의 **뜻**은 그대로다. 하지만 ⓪-b는 「모양이 다르면 멈춤」 규칙이라 실행 때 멈춘다.
- **확인한 것**: 지금(b41944d · 8ae0903) `domain/approvals/*` · `repositories/approvals.ts` · `domain/leave/*` · 결재함 `page.tsx` · `inbox-table.tsx` · `approval-sheet.tsx` · `approve-toast.ts` · `actions.ts`는 f3242c8과 **한 줄도 다르지 않다**(`git diff --stat` 0). 그래서 Round 4 name_map · premise_check는 04.6 전까지는 유효하다. 바뀐 것은 `decision-dialogs.tsx` · `conflict-line.tsx`의 새로 고침 꼬리 처리뿐이다(#125 — P3 F18).
- **계획 위치**: 05-01-PLAN.md:48(⓪-b truth) · :56(E6) · :58(E7) · :246(⓪-b 기대 문장) · :373-410(Task 4) · 05-08-PLAN.md:156 · 05-10-PLAN.md:157 · 05-11 · 05-05 · 05-15 read_first
- **근거**: origin/main `.planning/phases/04.6-a/04.6-{12,15,17,18,19,20,27,13,01,31}-PLAN.md` files_modified · 04.6-17 must_haves(「`ui/side-panel`의 제어 형태(`onClose`)로」 · 「결재함은 `ListScreen` … 상태 `StatusTag status`」) · origin/main `app/(app)/leave/status-display.ts:1` · :18(`kind: StatusTagKind`)
- **고칠 모양**: U1의 선택에 따라 정한다. 공통으로 두 가지를 한다.
  - 04.6 머지 뒤 Round 4와 같은 방식의 코드 대조(name_map · premise_check E5~E7 다시 적기)를 05-01 Task 1 ⓪-b 앞에 한 번 둔다. 또는 그 대조를 계획 라운드로 미리 끝낸다.
  - 위 파일을 고치는 Phase 5 task의 read_first에 「04.6-NN SUMMARY 「뒤 플랜에 넘기는 API」」를 더한다.
- **사용자 결정 필요**: 예(U1과 같은 결정).

### [P1] F4 — `RowSheet`의 선택 prop `action`이 04.3에서 이미 `ReactNode`로 생겼고, SYSTEM은 「3차 한 개」로 정했다
- **어긋남**: 05-05 Task 2 ①은 `ui/table/RowSheet.tsx`에 `action?: { label; onPress; pending? } | { note }` · `actionError?`를 **새로** 더한다고 쓴다. 이 행동은 1차 전폭 행동 줄이다. 05-UI-SPEC은 「선택 prop `action` 하나(행동 줄 1차 한 개)」, 05-02 B4는 「폰 행 시트의 보기 + 그 줄의 문서 행동 하나」라고 쓴다. 그런데 main에는 이미 다른 것이 있다.
  - `RowSheet`에 `action?: ReactNode`가 있다(04.3-17 — 확인증 「제출 내용」).
  - SYSTEM §7-3 (바)는 「보기 전용 — **3차 한 개**(다른 화면으로 가는 링크, 또는 확인 시트를 여는 줄 행동)는 본문 아래에 둘 수 있다」로 고쳐졌다.
- **결과**: 같은 이름 · 다른 타입이라 타입 충돌이 난다. 기존 확인증 사용처가 깨진다. 05-05 acceptance 「`RowSheet` 지운 줄 5 이하」로는 잡히지 않는다. 버튼 위계(1차 vs 3차)도 SYSTEM과 다르다.
- **계획 위치**: 05-05-PLAN.md:214-244(Task 2 ①, acceptance :244) · :296 · 05-UI-SPEC.md:106 · 05-02 B4(Task 2 — §7-3)
- **근거**: origin/main `ui/table/RowSheet.tsx:23-27`(`action?: ReactNode` — 「본문 아래 3차 한 개」) · :84 · `docs/design/SYSTEM.md:841`(§7-3 (바) 04.3-⑫ · ⑳)
- **고칠 모양**: 새 prop을 만들지 않는다. 기존 `action?: ReactNode` 자리에 Phase 5 행동(버튼 + 오류 한 줄 + note)을 호출부(`quote-table.tsx`)가 넣는다. 위계는 U2로 정한다.
- **사용자 결정 필요**: 예(U2 — 1차 vs 3차).

### [P1] F5 — 운영 · 구조 문서가 줄 한도에 닿아 05-12 · 05-13 검증이 실패한다
- **어긋남**:
  - `test/unit/docs-limits.test.ts`는 `docs/OPERATIONS.md` · `docs/ARCHITECTURE.md`에 각 **300줄 상한**을 건다(정확히 300 허용, 301 거부).
  - `OPERATIONS.md`는 f3242c8 274줄에서 **b41944d 300줄**이 됐다(04.3 서명 버킷 · 파기 · Codex 절). 04.5 브랜치도 300줄이다. 05-12 Task 2 ④가 절 「증빙 버킷(Phase 5)」을 더하는 순간 docs-limits가 실패한다.
  - `ARCHITECTURE.md`는 286줄에서 **295줄**이 됐다(§4-10 확인증 수집 경계). 05-03의 §4-6 한 줄과 05-13의 「지출결의 · 증빙 계약」 절(20줄 이하) + §4-8 예외 두 항목이 들어갈 자리가 5줄뿐이다.
  - 04.3은 같은 문제를 별도 문서로 풀었다. 「OPERATIONS 줄 예산이 없어 확인증 파기 런북은 별도 문서다」(사용자 결정 2026-10-01 — `docs/CERT-PURGE.md` 150줄 상한 + OPERATIONS가 가리킴)가 그 선례다.
- **계획 위치**: 05-12-PLAN.md:148 · :152 · :163 · :167(verify에 docs-limits) · 05-13-PLAN.md:39 · :164 · :170 · :180 · 05-03-PLAN.md:314
- **근거**: origin/main `test/unit/docs-limits.test.ts:5-6` · :137-145(CERT-PURGE 선례), `wc -l`: OPERATIONS 300 · ARCHITECTURE 295(b41944d)
- **고칠 모양**: U3을 본다.
- **사용자 결정 필요**: 예(U3).

---

## P2 — 권장

### [P2] F6 — 04.3이 GCS REST 어댑터와 저장소 포트를 먼저 만들었다(중복은 아니고 선례다)
- **어긋남**: 계획은 05-04 `lib/gcp/storage.ts`(인터페이스 + 로컬 드라이버 + `STORAGE_DRIVER` env)와 05-12 gcs 드라이버(`GoogleAuth` 직접 · `auth.request`로 메타데이터 · 삭제 · `rewriteTo` · `PATCH temporaryHold`)를 새로 만든다. main에는 이미 아래가 있다.
  - `lib/gcp/gcs.ts`: SDK 없이 `google-auth-library`로 REST를 부르는 `createAuthedRequest`(거부된 클라이언트 Promise를 붙들지 않는 재사용 — E3-26), 주입 가능한 `GcsRequest`, `GcsUnavailableError`, 로그에 키 · 버킷 이름을 남기지 않는 규칙.
  - `lib/storage/signature-store.ts`: 저장소 포트(로컬/GCS 드라이버, 키 접두어 검사)다. ARCHITECTURE §4-10 (3)에 「서명 저장소 포트」로 적혀 있다.
  - 드라이버는 `STORAGE_DRIVER` 없이 `APP_ENV === "local"`로 고른다. 버킷 env(`CERT_SIGNATURE_BUCKET`)는 선택이고 비로컬 refine에 넣지 않는다.
  - 서명 URL(V4) · `move` · `retain`은 main에 없다. 그러니 중복은 아니다.
- **계획 위치**: 05-04-PLAN.md:21 · :54-55 · :175 · :258-259 · 05-12-PLAN.md:30-33 · :113(read_first가 `cloud-sql-admin.ts` · `lib/oidc.ts`만 선례로 든다) · :126
- **근거**: origin/main `lib/gcp/gcs.ts:51-82`(`createAuthedRequest`) · :86-141 · `lib/storage/signature-store.ts:75-89` · `lib/env.ts`(`CERT_SIGNATURE_BUCKET` 선택) · `docs/ARCHITECTURE.md` §4-10 (3)
- **고칠 모양**:
  - 05-12 read_first에 `lib/gcp/gcs.ts`를 더한다. gcs 드라이버의 메타데이터 · 삭제 · 복사 · 보존 표식 호출은 `createAuthedRequest` · `GcsRequest` 주입을 다시 쓴다(단위 테스트의 가짜 요청 주입 모양도 같다).
  - 포트 자리(`lib/gcp/storage.ts` vs `lib/storage/evidence-store.ts`)와 `STORAGE_DRIVER`가 꼭 필요한지(`APP_ENV`만으로 충분한지)를 05-04 ①②에 한 줄로 정한다.
  - 계획 재량이라 결정은 필요 없다. 추천은 「`STORAGE_DRIVER` 유지(staging에서 local 금지 refine이 의미 있음), 포트는 `lib/storage/` 선례 쪽」이다.

### [P2] F7 — 버킷 이름 · 부트스트랩 · 배포 · 검증 스크립트 선례(04.3-05)와 어긋난다
- **어긋남**:
  - **이름**: `infra/names.sh`의 `cert_bucket()`은 `{프로젝트}-plant8-{env}-cert-signatures`다. 「버킷 이름은 전역 유일이라 프로젝트 id를 앞에 둔다」는 이유다. 계획은 `plant8-{env}-evidence`라서 이름이 겹칠 수 있다.
  - **역할 자리**:
    - 04.3 모양: 부트스트랩 (d-2)는 버킷 생성과 배포자에게 그 버킷 `storage.admin`만 준다. `deploy.sh` `ensure_cert_bucket`은 버킷을 만들지 않고 확인 · 설정 맞춤 · **런타임 SA의 `objectUser` 바인딩**을 한다. OPERATIONS §4 · §8에도 그렇게 적혀 있다.
    - 계획 모양: 런타임 `objectUser`를 부트스트랩에서 준다.
    - 또 `bootstrap-gcp.sh` · `deploy.sh`는 이미 `storage.googleapis.com`을 켠다.
  - **검증**: `scripts/verify-gcp.sh`는 `INPUT_CHECK=policies|notify-tick` 환경 변수로만 돈다(T-1-32). 입력은 `.github/workflows/verify.yml`의 choice다. 그런데 05-12 Task 3 1단계는 `bash scripts/verify-gcp.sh --project <…>`라고 쓴다(이 플래그는 f3242c8에도 없었다). ④의 「증빙 버킷 `run_check` 묶음」을 돌리려면 새 `INPUT_CHECK` 값이 필요하고, 그러면 `verify.yml` choice도 고쳐야 한다. 이 파일은 위험 경로라 사용자가 머지해야 하는데 files_modified에 없다.
  - **배포 스크립트 현재 모양**: #151 뒤로 `deploy.sh`에 `_ensure_data_key_secret`(데이터 키를 새로 만들지 않는 보호)이 있다. #153으로 `gcloud secrets versions list <name>` 위치 인자로 바뀌었다. deploy 단위 테스트의 KMS 사례도 평문 키 계약으로 바뀌었다. 05-12는 이 위에 덧붙여야 한다.
- **계획 위치**: 05-12-PLAN.md:37-38 · :148 · :150 · :157 · :163 · :196 · :260
- **근거**: origin/main `infra/names.sh:41`(`cert_bucket`) · `scripts/bootstrap-gcp.sh`(d-2) · `scripts/deploy.sh` `ensure_cert_bucket` · `deploy_service` env_vars(`CERT_SIGNATURE_BUCKET=$(cert_bucket …)`) · `scripts/verify-gcp.sh:1-4` · `case "$INPUT_CHECK"` · `.github/workflows/verify.yml` `inputs.check.options` · `docs/OPERATIONS.md:14` · :93 · :197
- **고칠 모양**:
  - `evidence_bucket()`을 `cert_bucket()`과 같은 모양(`$2-plant8-$1-evidence`)으로 만든다.
  - 런타임 바인딩은 `ensure_evidence_bucket`(deploy)에, 생성 · 배포자 버킷 admin · signBlob 자기 바인딩은 부트스트랩에 둔다. 소프트 삭제 · 버전 설정은 증빙 보존 요구에 맞게 따로 정한다(서명 버킷의 `--soft-delete-duration=0`은 복사하지 않는다).
  - 검증은 새 `INPUT_CHECK=evidence-bucket` + `verify.yml` choice 한 줄로 한다. 이것은 위험 경로라 F9의 별도 PR로 보낸다. 다른 길은 Task 3 사람 확인을 콘솔/gcloud 수동 명령으로 바꾸는 것이다.

### [P2] F8 — 세션 · 테스트 단계 규칙(사용자 결정 2026-10-01)과 「웨이브 근거」가 어긋난다
- **어긋남**: CLAUDE.md가 두 가지 바뀌었다(#122 · #124).
  - ① 「세션 하나 = 웨이브 하나」가 없어졌다. 세션은 독립 검토 경계(계획 완료 뒤 · 게이트 리뷰 종료 뒤)에서만 끊고, 문맥은 자동 압축(40만)으로 잇는다. `plant8-session-boundary.sh`가 이것을 강제한다.
  - ② 작업 중 테스트는 lint · typecheck + 바뀐 파일 관련 단위 · 통합 + 건드린 화면 E2E만 돈다. DB 초기화가 드는 전체 통합은 돌리지 않는다. ready 뒤 전체는 CI가 돈다.
- **계획이 아직 쓰는 것**:
  - 「여러 세션으로 실행한다 … 플랜 SUMMARY 커밋 뒤 `/gsd-pause-work` … 권장 나눔 A~H」
  - 「컨텍스트가 50%를 넘으면 task 경계 커밋 뒤 `/gsd-pause-work`」(그런데 `.planning/config.json` `hooks.context_warnings`는 false가 됐다)
  - 각 플랜 `<verification>`의 `pnpm test:unit` 전체 · `pnpm vitest run --project integration` **전체**(05-03:292 · 05-04:319)
- **계획 위치**: 05-01-PLAN.md:157-185(「웨이브 근거」 「여러 세션으로 실행한다」 · 「규모 근거」) · :447 · 각 플랜 execution_notes 「규모」 줄 · 05-03-PLAN.md:291-292 · 05-04-PLAN.md:318-319 · 05-12-PLAN.md:243
- **근거**: origin/main `CLAUDE.md` §4 Build 2번째 줄 · §5 「테스트는 단계에 맞게」 · `.claude/hooks/plant8-session-boundary.sh:1-19` · `.planning/config.json`(`context_warnings: false`)
- **고칠 모양**:
  - 「여러 세션으로 실행한다」 문단을 「한 세션에서 웨이브를 이어 가고, 자동 압축으로 잇는다. 끊는 때는 독립 검토 경계뿐」으로 바꾼다.
  - 50% 정지 문장을 지운다.
  - 플랜 `<verification>`의 전체 단위 · 전체 통합 줄을 「바뀐 파일 관련 단위 · 통합 + 건드린 화면 E2E」로 바꾸고, 전체는 CI(ready)로 넘긴다.

### [P2] F9 — `risk:` 태그와 위험 경로 PR 분리가 계획에 없다
- **어긋남**:
  - CLAUDE.md: 돈 · 권한 · DB 잠금 · 마이그레이션을 건드리는 플랜만 `risk:` 태그로 Opus 실행자 + Opus 독립 검토를 받는다(실행자 기본은 Sonnet — `model_profile: adaptive`). 04.3 플랜은 `risk: [migration, db-schema, money]` 같은 frontmatter를 쓴다.
  - Phase 5 플랜 15개에는 `risk:`가 **하나도 없다**. 해당 후보는 이렇다.
    - 05-01: 마이그레이션 · 결재
    - 05-03: 마이그레이션 · 돈 · 권한 시드
    - 05-04: 마이그레이션 · 잠금
    - 05-06: 세금 · 돈
    - 05-08 · 05-09: 권한
    - 05-11: 마이그레이션 · 상태 전환 잠금
    - 05-14: 동시성 잠금
  - 또 위험 경로(`db/migrations/` · `db/schema/` · `domain/permissions/` · `scripts/deploy.sh` · `bootstrap-gcp.sh` · `infra/` · `.github/workflows/`)가 바뀐 PR은 사용자가 머지해야 하고, 위험 경로 변경은 별도 PR로 떼어야 한다.
  - Post-build 표도 바뀌었다(#122). `domain/approvals` · `repositories/approvals` · `domain/money`는 「돈 · 결재」라서 `/review` + `/cso`를 훅이 강제한다. 화면은 `/review` + `/design-review`(Codex 4폭) → `/qa`다.
  - 계획에는 머지 묶음 · PR 분리 문장이 없다. 05-13 SUMMARY의 Post-build 순서만 있다.
- **확인한 것**: `risk:` 규칙과 위험 경로 별도 PR 규칙은 f3242c8 CLAUDE.md에도 있었다. Round 4가 보지 않은 부분이다. 게이트 표(변경 종류별)와 훅 강제는 새로 생겼다.
- **계획 위치**: 05-*-PLAN.md frontmatter(`risk:` 0건) · 05-13-PLAN.md:166(Post-build 순서)
- **근거**: origin/main `CLAUDE.md` §4 Build 3번째 줄 · Post-build 표 · 머지 절 · `.planning/phases/04.3-qr-certificate-intake/04.3-15-PLAN.md:92`(`risk:` 형식)
- **고칠 모양**:
  - 위 플랜 frontmatter에 `risk: [...]`를 단다.
  - 05-01 「웨이브 근거」 아래에 「머지 묶음」 한 단락을 둔다. 마이그레이션 · 스키마 · 권한 · 배포 스크립트 변경 PR과 나머지 PR을 나누는 경계를 Phase 4 머지 묶음 선례처럼 「마이그레이션은 기대는 코드와 같은 묶음」으로 정한다.
  - 05-13 Post-build 순서를 새 표대로 고친다.
  - 묶음 방식이 바뀌면 사용자에게 알린다(Phase 4 묶음은 사용자 결정이었다).

### [P2] F10 — 새 요구사항 OPS-08이 Phase 5에 배정됐는데 어느 플랜에도 없다
- **어긋남**:
  - quick 261001-hfi(#138)가 OPS-05에서 「문서 제출 · 승인 · 반려 · 회수를 핵심 행동 로그로」를 **OPS-08 · Phase 5**로 떼어 냈다. ROADMAP Phase 5 `Requirements`에도 OPS-08이 있다.
  - 플랜 frontmatter `requirements:` 합집합에는 OPS-08이 없다. 그래서 plan-checker 요구사항 대조 · `/gsd-verify-work`에서 빈칸이 된다.
  - 동작 자체는 04.1 엔진이 이미 한다. `document_submit` · `approve` · `reject` · `withdraw`를 `recordActionInTx`로 남긴다(설정으로 끌 수 있는 종류).
- **계획 위치**: 05-01~05-15 frontmatter `requirements` · 05-VALIDATION
- **근거**: origin/main `.planning/REQUIREMENTS.md:135` · :275 · :299 · `.planning/ROADMAP.md`(Phase 5 `**Requirements**`) · `domain/approvals/index.ts:313` · :622 · :682 · :715 · :739
- **고칠 모양**:
  - 05-03(제출) · 05-09(회수 · 다시 제출) · 05-10 또는 05-11(승인 · 반려) `requirements`에 OPS-08을 더한다.
  - 통합 사례 한 줄(지출결의 종류의 네 사건이 `action_log`에 `entity`=지출결의로 남음)과 VALIDATION 행을 더한다.
  - 「핵심」이 「끌 수 없음」(`ALWAYS_ON_ACTION_TYPES`)을 뜻하는지는 REQUIREMENTS 문장만으로는 알 수 없다. 지금 계획은 04.1 동작(설정으로 고름)을 따른다. 바꿀 필요가 생기면 사용자에게 묻는다.

### [P2] F11 — 지급 방식 코드표: 등록 자리는 `CODE_TABLES`이고, 요구사항은 MAST-05(Phase 6)로 떼어졌다
- **어긋남**:
  - ① quick 261002-3mx(#148) 뒤로 코드표 화면의 표 목록은 `domain/code-tables/index.ts`의 `CODE_TABLES` 하나다. `createCodeItem`도 이 목록에 없는 `tableKey`를 `없는 코드표 · 새로 고침`으로 거부한다.
    - 05-03은 files_modified에 `app/(app)/admin/code-tables/page.tsx`를 두고 `payment_method`를 시드만 한다.
    - 이대로면 화면 목록에 안 나오거나, 관리자가 항목을 더할 때 서버가 거부한다.
  - ② 같은 quick이 「지급 방식 코드표」를 MAST-04에서 **MAST-05(Phase 6, 「값은 Phase 6 계획에서 정한다」)**로 떼어 냈다. 05-03은 「코드표가 main에 없어 이 플랜이 만든다 — 계좌이체 · 법인카드 · 현금」(UA-618)이라고 쓴다. 06-03 · 06-07은 Phase 5 지출결의에 지급 방식 칸(UA-618)이 있다고 전제한다.
- **계획 위치**: 05-03-PLAN.md:26 · :46 · :58 · :207 · :313
- **근거**: origin/main `domain/code-tables/index.ts:34-38` · :115 · `app/(app)/admin/code-tables/page.tsx:22-23`(`TABLE_OPTIONS = CODE_TABLES`) · `.planning/REQUIREMENTS.md:22-23` · :202 · `06-03-PLAN.md:140`
- **고칠 모양**:
  - ①: files_modified를 `page.tsx` → `domain/code-tables/index.ts`(`CODE_TABLES`에 `{ key: "payment_method", label: "지급 방식" }`)로 바꾼다. 04.6-15가 `page.tsx`를 고치므로 겹침도 사라진다.
  - ②는 U4로 정한다.

### [P2] F12 — 이유 자리 칸 이름 구분자 「, 」(04.5 · DECISIONS 2026-09-25)와 지출결의 막힘 문구가 다르다
- **어긋남**: 04.5 브랜치 DECISIONS가 결정을 하나 더했다. 「이유 자리에서 칸 이름 여럿은 「, 」로 잇고, 가운뎃점 「 · 」는 원인과 다음 행동 사이에만 쓴다」(사용자 결정 카드 U2). SYSTEM §7-15 예시도 `클라이언트, 담당 PM 2칸 비어 있음 · 클라이언트 고르기`로 바뀌었다. 04.5-07은 기존 구현 둘(공휴일 폼 · 확인증 신청)도 옮겼다(d58f756d). Phase 5에는 옛 모양이 남아 있다.
  - 05-06:186 `공급가액 · 증빙 종류 2칸 비어 있음 · 공급가액 적기`
  - 05-07:139 `종류 · 내용 2칸 비어 있음 · 종류 고르기`
  - 05-UI-SPEC.md:265 막힘 ⑥ 원문
  - 또 04.5-08이 `lib/actions/form-reason.ts`(폼 전체 서버 오류 한 줄 — 재시도로 풀리지 않는 원인은 원인 · 다음 한 수로)를 만들었다. Phase 5 폼의 서버 오류 표시가 이 규칙을 따르는지 정해지지 않았다.
- **계획 위치**: 05-06-PLAN.md:186 · 05-07-PLAN.md:139 · 05-UI-SPEC.md:265 · 05-05 · 05-06 폼 오류 갈래
- **근거**: 04.5 브랜치 `docs/design/DECISIONS.md`(「2026-09-25 — §7-15 이유 자리: 칸 이름 구분자 「, 」」) · `docs/design/SYSTEM.md` §7-15 · `lib/actions/form-reason.ts:1-30` · 커밋 d58f756d
- **고칠 모양**: 문구 셋을 「, 」로 바꾼다. 05-05 폼 서버 오류 갈래에 「`form-reason` 규칙 사용 여부」를 한 줄로 적는다. 사용자가 이미 정했으므로 결정은 필요 없다.

### [P2] F13 — 누수 스캔 구조(04.5)와 폼 선택지 DTO 등록 선례(#121 계열)
- **어긋남**:
  - ① 04.5에서 `test/integration/leak-scan.test.ts`가 `skipDbReset()` + `beforeAll(seedMasterData)` 한 번으로 바뀌었다(1611 케이스 × 초기화 → CI 4분 문제). 「메뉴 게이트 DTO 축」(`MENU_GATED_DTOS` — 정보 항목 없이 메뉴 view로만 거르는 DTO는 이 목록에 있어야 함)도 생겼다.
    - Phase 5는 05-03 · 04 · 05 · 11이 이 파일 끝에 import와 사례를 더한다.
    - 사례가 행을 쓰거나 권한 · 노출 행을 바꾸면 테스트 사이 초기화가 없다. 그래서 다른 사례를 오염시킨다(04.5 커스텀 칸 축은 `try/finally`로 되돌린다).
  - ② quick 261001-85g · /qa ISSUE-001 뒤로 폼 선택지(거래처 · 팀 · 사람)도 `registerDto`된 투영 DTO로 내보낸다(`ProjectVendorOptionDto` 등, 누수 스캔 단언 포함). `QuoteLineDto.vendorName`은 `["project.value","vendor.value"]` all-of다. 05-07 `searchVendorsForPick`(거래처 이름 + 기본 증빙)은 투영 · 등록 문장이 없다.
- **계획 위치**: 05-03-PLAN.md:207 · 05-04-PLAN.md:185 · 05-05 · 05-11 누수 사례 · 05-07-PLAN.md:145
- **근거**: 04.5 브랜치 `test/integration/leak-scan.test.ts`(`skipDbReset` · `MENU_GATED_DTOS` · 커스텀 칸 축 `finally`) · origin/main `domain/projects/references.ts:28-115` · `test/integration/leak-scan.test.ts`(「프로젝트 등록 폼 선택지 DTO」 사례)
- **고칠 모양**: 누수 스캔에 더하는 사례는 「쓰기 없음, 있으면 같은 사례 안에서 되돌림」을 적는다. 정보 항목 없는 새 DTO가 생기면 `MENU_GATED_DTOS`에 넣는다. 05-07 ③에 `PickVendorOptionDto` 명세(`vendor.value`) `registerDto` + 누수 스캔 단언을 한 줄로 더한다.

---

## P3 — 사소

- **[P3] F14** — 설정 조회 `asOf` 계약이 바뀌었다(#126). 이제 「생략하면 서울 오늘, 넘길 때는 `seoulDateToUtcDate`로 만든 UTC 자정 Date」다(origin/main `domain/settings/registry.ts:129-133`). 05-03이 새로 만드는 `getSettingEntry`(세율 행 id를 같은 기준일로 조회)도 이 계약을 따른다고 05-03 ⑤에 한 줄 적는다.
- **[P3] F15** — 05-06 read_first(05-06-PLAN.md:136)의 「`cancelHistorizedValue` 취소는 **실제 시계**(`dateOnly(new Date())`) · 주입 없음」은 틀렸다. f3242c8에서도 이미 `seoulToday(deps?.now)`였다. 지금은 `withTransaction` 안에서 돌고 `FutureValueNotFoundError`를 던진다(registry.ts:229-268). 테스트 픽스처는 `deps.now`를 주입할 수 있다.
- **[P3] F16** — `ConfirmDialog`가 이제 `disabledReason` 끝의 ` · 새로 고침`을 스스로 3차 `새로 고침`으로 바꾼다(`splitRefreshTail` · `RefreshStep` export — #125). 실패 줄 `failure`(04.3-17)도 생겼다. 폰 확인 시트의 막힘 이유 · 다음 한 수는 버튼 윗줄이다(SYSTEM §7-8 개정). 05-09 무효 처리 확인 · 05-01 Task 4 확인 창은 꼬리를 손으로 자르지 않는다. 04.1 `decision-dialogs.tsx`의 자체 `RefreshStep`은 이미 지워졌다.
- **[P3] F17** — `Button`에 `nextStep?: ReactNode`(이유 옆 다음 한 수 3차, §7-1)가 생겼다(ui/button/Button.tsx). UI-SPEC S6 「1차 비활성 + 왼쪽 이유 + 다음 한 수 3차」는 이 prop으로 그린다. 05-05 · 05-06이 같은 묶음을 손으로 만들지 않게 read_first에 한 줄 더한다.
- **[P3] F18** — `QuoteLineDto`에 `vendorName`(all-of 정보 항목)이 생겼다. `quote-table.tsx`는 +228줄(거래처 이름 · 충돌 이유 · 격자 포커스 `syncFocus`)이 바뀌었다. 05-05 · 05-15의 「거래처 없음」 셀 · 시트 문구는 숨김 거래처 갈래(이름 null)와 겹치지 않는지 확인한다. read_first는 이미 grep 방식이라 손볼 것은 없다.
- **[P3] F19** — 줄 번호 참조: SYSTEM §7-5는 이제 880행이다(Round 4 D15는 860). DECISIONS 끝도 바뀌었다(04.5가 2026-09-25 항목을 덧붙임). 04.6 뒤 다시 바뀐다. 절 이름 grep 원칙은 유지한다.
- **[P3] F20** — `.continue-here.md` BLOCKING CONSTRAINTS에 낡은 것이 있다. 「코디네이터 보고 · 세션 교대(코디네이터가 연다)」(CLAUDE 「코디네이터 없음」과 다름), 「0017~0020은 #73 · #88이 씀」(지금 0021 · 0022 main, 0023 04.5)이 그것이다. 다음 재개 때 `/gsd-pause-work`가 다시 쓰도록 한 줄을 남긴다.
- **[P3] F21** — 시스템 관리자 시드 루프(`seedMasterData`)는 새 메뉴를 시스템 관리자에게 `upsert`로 모두 켠다. 재시드하면 끈 값도 되살아난다. 04.3은 민감 메뉴(`certs.submissions`)를 `insertPermissionIfAbsent`(기본 거짓)로 예외 처리했다. `expenses.evidence_void`(승인 증빙 무효)를 같은 예외로 둘지 05-09에 한 줄로 정한다. 기본은 지금 계획(루프가 켬)이다. 또 04.5가 `SEED_HISTORIZED_EFFECTIVE_FROM`을 `domain/settings/keys.ts`로 옮겼다(05-03 시드가 이력형 키를 쓰면 그 상수를 import).

---

## 사용자 결정 필요

### U1 (F2 · F3) — 04.6 스킨 A에 맞춘 Phase 5 화면 계획을 언제 · 어떻게 고치나
- **(A) 지금은 게이트와 화면 밖 지적만 반영하고, 화면 부분은 「04.6 의존」으로 표시한다. 04.6 머지 뒤 화면 재대조 라운드를 한 번 돈다** — **추천**.
  - 지금 할 일: F1 게이트 + P2 · P3 중 화면 밖 항목. UI-SPEC과 화면 플랜(05-02 · 05-05~05-11 · 05-13 · 05-15, 05-01 Task 4)에는 「04.6 머지 판 기준으로 다시 씀」 표시를 단다.
  - 04.6 머지 뒤: UI-SPEC 수정(`/gsd-ui-phase 5` 개정) → `/plan-design-review` → 코드 대조 Round 6 → `/gsd-plan-phase 5 --reviews`.
  - 근거: CLAUDE.md 「계획 레인은 확정되지 않은 부분을 의존성으로 표시하고 확정된 부분부터 계획한다」와 같다. 04.6에는 아직 사람 답이 남았다(UQ-4 · 5 완화 후보 · 아이콘 · lucide 의존성 — 04.6-26 · 33). 지금 다시 쓰면 또 낡는다.
- **(B) 지금 04.6 계획 문장(04.6-UI-SPEC · COMMON · 05 · 17 · 18 · 19 SUMMARY 예정 API)에 맞춰 UI-SPEC과 화면 플랜을 다시 쓴다.**
  - 장점: 04.6 머지 직후 바로 실행할 수 있다.
  - 단점: 04.6 실제 API(`ListScreen` · `StatusTag status` · `Num` props)가 계획과 다르면 한 번 더 고쳐야 한다. UQ-4 · 5 결과도 모른다.
- **(C) 「병렬로 할 수 있는 것」 갈래: 04.6 실행과 나란히 Phase 5의 화면 밖 플랜(05-01 Task 1~3 · 05-03 · 05-14 · 05-04 · 05-12)을 먼저 실행한다.**
  - 이 갈래는 ROADMAP 실행 순서(04.5 → 04.6 → 5, 사용자 결정 2026-10-02)와 CLAUDE.md 「동시에 여는 만들기 레인은 1」을 **바꿔야** 한다.
  - 겹침: 05-03 `code-tables/page.tsx`(F11로 피할 수 있음) · `settings-approval-route.spec.ts`, 05-04 `settings-form-client.tsx`(04.6-20), 05-01 E6의 `status-display.ts`(04.6-28 `kind` 삭제와 충돌).
  - 05-12는 위험 경로라 어차피 사용자 머지다.
  - 계획(문서)만 병렬로 하려면 이 결정이 필요 없다. (A)가 바로 그 병렬 계획 레인이다.

### U2 (F4) — 폰 행 시트(견적 줄)의 지출결의 행동 위계
- **(A) 1차 유지(Phase 5 UI-SPEC B4 · D-69)** — **추천**.
  - 새 prop은 만들지 않는다. 기존 `action?: ReactNode` 자리에 1차 버튼 + 오류/안내 한 줄을 넣는다.
  - SYSTEM §7-3 (바) 문장을 「3차 한 개, **또는 그 줄의 문서 행동 1차 하나**」로 DECISIONS → SYSTEM 순서로 넓힌다.
  - 근거: 그 시트에서 PM이 하는 주 행동이 지출결의 올리기다(화면 사용성 원칙 「주 버튼 하나」). 04.3 확인증 「제출 내용」은 보조 이동이라 3차가 맞고, 둘은 성격이 다르다.
- **(B) 04.3 규칙대로 3차 한 개.** UI-SPEC S2 · 05-02 B4 · 05-05 Task 2를 3차로 바꾼다. SYSTEM은 고치지 않는다.

### U3 (F5) — 300줄 한도에 닿은 운영 · 구조 문서
- **(A) 별도 문서로 뗀다** — **추천**.
  - 증빙 버킷 런북은 `docs/EVIDENCE-STORAGE.md`(가칭), 지출결의 · 증빙 계약은 `docs/EXPENSES.md`(가칭)로 뗀다.
  - OPERATIONS · ARCHITECTURE에는 가리키는 한 줄만 둔다. `docs-limits.test.ts`에 새 문서 상한 · 가리킴 단언을 더한다.
  - 근거: 04.3 `CERT-PURGE.md` 선례(사용자 결정 2026-10-01)와 같다.
- **(B) 기존 절을 줄여 자리를 만든다.** 다른 페이즈 문서를 손대야 하고, 300줄 근거(OPS-07 · 22A)는 그대로다.
- **(C) 한도를 올린다.** OPS-07 · 22A 요구사항을 바꾸는 일이다.

### U4 (F11 ②) — 지급 방식 코드표를 Phase 5가 만드나(MAST-05는 Phase 6)
- **(A) Phase 5(05-03)가 코드표(`CODE_TABLES` 등록 + 시드 셋)를 만들고, 값 확정은 Phase 6 계획이 한다** — **추천**.
  - REQUIREMENTS 추적표의 MAST-05 비고에 「표와 기본값은 Phase 5, 값 확정 · 관리 화면 점검은 Phase 6」을 gsd 편집으로 남긴다.
  - 근거: 05-03 · 05-05의 지급 방식 칸(UA-618)과 06-03 · 06-07이 Phase 5 칸을 전제한다. 코드표 값은 데이터라 Phase 6이 바꾸기 쉽다.
- **(B) Phase 5는 코드표를 만들지 않는다.** 지급 방식 칸은 숨기거나 고정 기본값으로 둔다. 05-03 · 05-05 · UI-SPEC UA-618과 06 계획 전제를 바꿔야 한다.

---

## 확인했고 그대로인 것(계획 전제와 같음)

- **결재 엔진 · 연차 코드**: `domain/approvals/*`, `repositories/approvals.ts`, `domain/leave/*`, `app/(app)/approvals/{page,inbox-table,approval-sheet,approve-toast,actions,actions.registry}`, `app/(app)/leave/status-display.ts`, `app/(app)/document-kinds.ts`, `test/unit/document-kinds-import.test.ts`는 f3242c8 → b41944d · 8ae0903 사이에 변경이 0이다.
  - 그래서 Round 4 name_map과 premise_check(E1 · E2 · E3 같음, E4 · E5 · E7 Z1~Z3 반영 모양, E6 D10 모양)는 **04.6 전까지** 그대로 맞다.
  - `decision-dialogs.tsx`는 새로 고침 꼬리만 바뀌었다. `withdrawLeaveAction` import와 「연차 반려/회수」 제목은 그대로라 D8(결재함 종류 중립화)은 여전히 필요하다.
- **중복 없음**: 계획이 새로 만드는 표 · 모듈 · 컴포넌트 · 라우트가 main · 04.5에 없다(위 「요약」). `/expenses`는 여전히 자리 표시 화면이다(f3242c8과 같음 — 04.6-19가 바꿀 예정). `linkedDocumentsByLine`도 여전히 빈 결과 stub다(domain/quotes/lines.ts:258).
- **마이그레이션**: main 마지막은 `0022_cert_intake`(0021 holidays_archive)이고, 04.5가 `0023_custom_field_admin`을 더한다. 계획은 번호를 미리 적지 않았다(grep 0). 05-13 「머지 직전 재생성」 규칙과 맞는다.
- **권한 키**: `expenses` · `approvals` · `leave` · `projects.complete` · `projects.status`가 있다. `expenses.team` · `expenses.evidence_void`는 main · 04.5 어디에도 없어서 05-08 · 05-09가 새로 만든다.
  - 새로 생긴 키 `certs.events` · `certs.submissions` · `certs.qr` · `admin.field-definitions`와 겹치지 않는다.
  - 04.5의 권한 변경(노출표 커스텀 열 · `createRole`의 커스텀 칸 부여 · 화면 항목 insert-if-absent 시드)은 `expenses.*`와 무관하다.
  - 정보 항목 공간 `cf.*`(04.5) · `cert_*`(04.3)와 `expense.value` · `expense.amount`도 겹치지 않는다.
- **심볼(04.5 헤드에서 확인)**: `isRouteStepSettingKey` · `saveRouteStepSettings` · `upsertSimpleValue` · `getSimpleSettingValues` · `findSimpleValues` · `findEffectiveValue` · `insertPermissionIfAbsent` · `insertVisibilityIfAbsent` · `findOrgUnitByName` · `allocateNumber` · `lockDocumentCounter` · `allocateDocumentNumber` · `changeProjectStatus` · `loadStatusChangeFacts` · `listQuoteLines` · `RESTORE_CHECK_TABLES` · `seoulToday` · `TAX_COMPANY_BORNE_*`는 있다. `getSettingEntry` · `evaluateExpenseSubmit`는 없다(계획이 만든다).
- **문서 번호 서식 표**: `cert` 항목이 새로 들어왔다(덧붙임). 05-03 「기존 줄 불변 · 덧붙임만」 조건은 유지된다.
- **행동 로그**: `CORE_ACTION_TYPES`에 `document_*` · `status_change`가 그대로 있다. 더해진 것은 `cert_*` 넷과 `UNPRUNABLE_ACTION_TYPES`뿐이고, 05-09의 「새 행동 종류 없음 — detail 값」과 맞는다.
- **KMS 제거(#151)**: 배포 · 부트스트랩에서 KMS가 빠지고 평문 데이터 키 시크릿으로 돌아갔다(`_ensure_data_key_secret`). 앱 코드 `lib/gcp/kms.ts` · `lib/crypto.ts` KMS 경로는 남아 있지만 `*_WRAPPED`가 없으면 꺼져 있다. Phase 5 계획은 KMS · 암호화에 기대지 않는다(grep 0). 05-12가 deploy.sh를 고칠 때 이 보호 함수를 건드리지 않으면 된다.
- **의존성**: `google-auth-library`가 GCP 접근의 유일한 라이브러리다. `@google-cloud/storage`는 여전히 없다(05-12 「새 의존성 0」 전제와 같음).
- **셸**: `ui/shell/role-menu.ts`의 1차 메뉴 · 하단 탭은 그대로다(관리 인덱스 그룹만 확인증 · 화면 항목이 늘었다). UI-SPEC 「셸 고치지 않음」과 맞는다.
- **토큰**: `docs/design/tokens.css` · `stylelint` 설정은 f3242c8 → b41944d · 8ae0903 사이 변경이 0이다(04.6이 바꿀 예정 — F2).
- **Playwright**: `cert-setup` · `certs` 프로젝트(`*cert*.spec.ts`)와 `E2E_SKIP_DESKTOP`이 생겼다. Phase 5 스펙 이름은 `cert`를 포함하지 않고, `settings-approval-route.spec.ts`는 여전히 마지막 별도 프로젝트다. 05-05의 `STORAGE_DRIVER` webServer env 한 줄과 충돌하지 않는다.
- **`RowSheet`**: 기존 props(`open` · `onClose` · `title` · `subtitle` · `items`)는 그대로다. 문제는 `action` 하나뿐이다(F4).
- **착수 게이트 P-1 · P-2 · P-3**: origin/main에서 통과한다(실행해서 확인함).
