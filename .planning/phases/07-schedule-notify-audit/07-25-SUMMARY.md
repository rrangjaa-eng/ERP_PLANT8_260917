---
phase: 07-schedule-notify-audit
plan: 25
subsystem: audit
tags: [action-log, detail-lines, row-sheet, role-smoke, leak-scan, admin-forms-ui-only]
requires: [07-03, 07-04, 07-05, 07-12, 07-13, 07-16, 07-17, 07-19, 07-20, 07-21, 07-22, 07-23, 07-24]
provides:
  - "domain/action-log/detail-lines.ts detailLines — 바뀐 칸 전부를 읽는 줄로"
  - "행동 로그 표 상세 칸 3줄 + 외 N칸 · 폰 행 탭 시트 · detail 꺼진 계급 404"
  - "계급 스모크 07 새 화면 행 + ROLE_SMOKE_ELEMENTS"
  - "누수 스캔 07 액션·DTO·비밀 액션 검토 · N10 대기 목록 0"
key-files:
  created:
    - domain/action-log/detail-lines.ts
    - app/(app)/admin/action-log/action-log-table.tsx
    - app/(app)/admin/action-log/detail-cell.tsx
    - test/unit/action-log/detail-lines.test.ts
    - test/e2e/mobile-action-log.spec.ts
    - docs/design/checks/2026-10-23-07-25-action-log-detail.md
  modified:
    - app/(app)/admin/action-log/page.tsx
    - app/(app)/admin/action-log/action-log.module.css
    - test/e2e/action-log.spec.ts
    - test/e2e/role-smoke.spec.ts
    - test/integration/leak-scan.test.ts
    - test/unit/admin-forms-ui-only.test.ts
status: complete
plan_head_before: 30b071cb
commits: 4
actuals:
  tasks: 3
  commits: 4
---

# Phase 07 Plan 25: 행동 로그 상세 · 07 검수 마무리 Summary

행동 로그 상세를 `{칸 이름} · {이전} → {이후}` 줄로 읽게 하고(표 칸 3줄 + `외 N칸`, 폰은 행 탭 시트에 바뀐 칸 전부), 07 새 화면·액션·DTO·내보내기·관리자 폼을 계급 스모크·누수 스캔·`ui/` 0 단언에 넣었다.

## 맨 위 — 발견 (시험을 바꾸지 않고 적는다)

1. **`/projects/budget` 거부 응답이 HTTP 200이다(권한 누수 아님).** 원인 플랜 07-24: 라우트에 `loading.tsx`가 있어 응답이 스트리밍 200으로 먼저 나가고, 그 뒤 `notFound()`가 「페이지 찾을 수 없음」 화면만 그린다. 거부 계급(기획 PM · 팀장 · 본부 책임자 · 대표)에서 표·금액은 DOM에 없다(`main table` 0). 07-24 `projects-budget.spec.ts`도 같은 판정(제목 + 표 없음)을 쓴다. 스모크는 이 경로 행만 `screen404`(화면 판정)로 단언한다. HTTP 404가 필요하면 07-24가 loading.tsx를 빼거나 권한 판정을 loading 경계 밖으로 옮겨야 한다 — 이 플랜은 남의 화면을 고치지 않는다.
2. **지급 목록(07-16)은 별도 경로가 아니라 `/expenses` 안 보기(`?status=지급 대상`)다.** 목록은 시드 계급 5종 모두 200으로 열리고, `지급 대상` 선택지(`#expense-status option`)만 `expenses.payments` 보유 계급(시스템 관리자)에게 보인다. 스모크는 경로 행을 `open`으로, 요소 행(`ROLE_SMOKE_ELEMENTS`)을 shown/hidden으로 둔다. 처음 쓴 「404」 기대는 내 오판이라 고쳤다(제품 결함 아님).
3. 대표 `/admin/action-log`는 07-05 카드 ⑧ 끔이라 기존 404 행 그대로다(켬이면 200 + 행 1개 이상으로 뒤집는다).

## 완료한 일

| 태스크 | 커밋 | 내용 |
|---|---|---|
| 1 | `b65e9466` | feat: `detailLines` 줄 함수 + 단위 시험 13건 |
| 1 | `2b1cdd24` | feat: 표 상세 칸 · 폰 시트 · R10 404 · E2E 5건 · 점검표 |
| 2 | `aacd8323` | test: 계급 스모크 07 행 + 요소 표 |
| 3 | `f65f7662` | test: 누수 스캔 07 검수 · `UI_ONLY_PENDING` 0 |

- **줄 함수**: 설정 키는 `SETTING_DEFS` 라벨, 권한 칸은 메뉴 라벨 + 동작 낱말, 정보 항목 칸은 `INFO_ITEMS` 라벨, 이력형 「키@날짜」는 `라벨 · 날짜부터`, 그 밖은 `CHANGE_FIELD_LABELS` 한 곳(없는 키는 키 글자 그대로 — AQ-40). 민감 칸(계좌번호 ····1234 · 주민번호/비밀번호 바뀜)은 렌더 쪽에서 한 번 더 가림. UUID는 `바뀜`/`N개`, 객체는 `바뀜`.
- **화면**: `page.tsx`가 줄 글자만 만들어 클라이언트 `ActionLogTable`(`Table` + `onRowTap` → `RowSheet`)에 넘긴다(R1). `상세` 열은 P2 맨 앞이라 폰 접힌 줄 첫 요소가 상세 첫 줄(U9). 표 칸은 `DetailCell`(앞 3줄 + `Button tertiary` `외 N칸`, 펼치면 `접기`로 같은 단추가 남아 포커스 유지). 새 부품·색·서체·radius 없음.
- **R10**: `queryActionLog`의 `ForbiddenError`만 `notFound()`로(다른 오류는 그대로 던짐).
- **Task 3**: 07 액션 17개 등록 튜플, 시스템 관리자 전용 메뉴 시드 표 대조, 거래처 내려받기(`vendors.export`, D-736), 07 DTO 5종(`budgetRow` · `budgetHistory` · `AccountChangeDto` · `VendorContactDto` · `VendorDocumentFileDto`) 정보 항목 하나씩 끈 계급 투영, `resetPersonPasswordAction`(권한 없음 · 상한 밖 · 자기 자신 거부, 결과 키 `tempPassword` 하나, `DTO_REGISTRY`에 결과 이름 없음). `admin-forms-ui-only`는 `UI_ONLY_PENDING = {}` + 길이 0 단언 + `roles-client`(허용 3) · `org-client`(허용 1)를 `UI_ONLY_EXCLUDED`와 새 `UI_ONLY_EXCLUDED_MAX`로 이동. 대기 파일 중 07-21 미완은 없었다(두 파일 모두 표 안 입력만 남음).

## TDD 증거 (RED → GREEN)

- 단위 `detail-lines`: 모듈 없음으로 RED(`Failed to resolve import "@/domain/action-log/detail-lines"`, `red1.log`) → 구현 뒤 13 passed.
- E2E: 구현 전 desktop 3건 모두 실패(`[data-ui="action-log-detail"]` 없음 2건 · R10 상태 `Expected 404, Received 500`; `e2e-red.log`) → 구현 뒤 `action-log.spec.ts` 10 passed, `mobile-action-log.spec.ts` 2 passed.
- `admin-forms-ui-only`: 변이(roles-client 제외 줄 삭제 + org-client 허용 0)로 3건 RED 확인 후 복원 → 11 passed.
- 누수 스캔 07 describe: 변이(`resetPersonPasswordAction` 이름 바꿈 · `markVendorConfirmedAction` 메뉴 바꿈)로 3건 RED → 복원 → 녹색.
- 스모크: 첫 실행 4 failed(발견 1 · 2) → 판정 방법 보정 뒤 6 passed.

## 검사 결과

| 명령 | 결과 |
|---|---|
| `pnpm lint`(eslint + stylelint, NODE_OPTIONS 6144) | exit 0 |
| `pnpm typecheck` | exit 0 |
| 단위 `leak-scan-coverage` · `export-registry-coverage` · `admin-forms-ui-only` · `test/unit/action-log` | 9 files · 106 passed |
| 통합 `leak-scan` + `vendor-export` (`erp_w0725_int_test`) | 2 files · 5475 passed |
| E2E desktop `action-log.spec.ts` (CI=true, flock) | 10 passed |
| E2E mobile-375 `mobile-action-log` + `mobile-admin-nav` (`--no-deps`) | 3 passed |
| E2E desktop `role-smoke.spec.ts` | 6 passed |

## DOM 실측 (CI=true 프로덕션 빌드, 실행자가 잼 — `logs/07-25/dom-audit.json`)

| 폭 | 가로 넘침 | 상세 칸 | 비고 |
|---|---|---|---|
| 1280 | 0 | 3줄 + `외 2칸`(5칸 행), 펼치면 5줄 · `접기` · 포커스 유지, 줄 높이 21 모두 | 머리글 높이 46(한 줄), 상세 폭 258 |
| 768 | 0 | 같음, 긴 줄은 줄바꿈(높이 42), 말줄임 없음 | 상세 폭 128 · 머리글 한 줄 46 |
| 375 | 0 | 접힌 줄 첫 요소 = `비밀번호 · 바뀜 → 바뀜`, 접힌 줄 높이 51(≥44) | 시트 dt 9개(행위자·계급·대상·문서 + 상세 5) · dd `0.1 → 0.12`, `····1234 → ····5678`, 시트 넘침 0 · Escape 뒤 포커스 행으로 |
| 320 | 0 | 같음, 접힌 줄 잘림 없음 | 시트 넘침 0 |

고치는 중 발견: 처음엔 768에서 머리글이 두세 줄(67px)로 눌렸다 → 옛 `StaticTable nowrapHeader`와 같은 규칙을 이 모듈 CSS `.nowrapHeader`로 두어 46으로.

## 260907 대조

옛 로그는 전후 값을 남겼다 — `/home/user/erp_plant8_260907/db/schema/020_functions.sql:5000-5120` `write_audit()`은 DB 트리거로 바뀐 칸만 기록하고(`:5012-5017` `v_masked`: 비밀번호·토큰·`resident_number_enc` 등은 값을 안 남김; `:5120` COMMENT) 화면은 `app/src/panels/SettingsAudit.tsx`가 칸 이름을 사람이 읽는 말로 바꾸고(`:176` 사전, 없으면 원래 글자 그대로 — 07 AQ-40과 같은 결) 바뀐 칸만 두 기둥 이전/이후로 보였다(`:231-241`, 렌더 `:326-328`). 07은 같은 원칙(바뀐 칸만 · 민감 칸 가림 · 사전 없으면 키 그대로)을 한 줄 `{칸} · {이전} → {이후}`로 옮겼고 폰 시트를 더했다.

## Deviations from Plan

1. **[Rule 3] 스모크 지급 목록 행** — 계획은 「지급 목록 열림/404」인데 실제는 `/expenses` 안 보기라 경로 열림 + 선택지 요소 행으로 나눴다(발견 2).
2. **[Rule 3] 스모크 `/projects/budget`** — 스트리밍 200이라 `screen404` 판정(발견 1).
3. **[Rule 1] 누수 스캔 시드 대조** — 처음엔 `can()`으로 비시스템 계급 거부를 확인했으나 같은 파일의 앞 describe가 DB 권한을 켜 둬 순서에 기대었다(대표 `admin.vendors` 보기 켜짐). `ROLE_DEFAULT_PERMISSIONS` 시드 표 대조로 바꿨다.
4. **독립 DOM 감사 미수행** — 아래 「확인하지 않은 것」.

## 호출한 스킬

`superpowers:test-driven-development`(코드 전) · `plant8:design-gate`(화면 파일 전, 점검표 같은 커밋) · `superpowers:systematic-debugging`(스모크 실패 추적 전) · `superpowers:verification-before-completion`(커밋 전).

## 확인하지 않은 것

- **독립 DOM 감사**(실행자가 아닌 별도 에이전트의 `audit/07-25-dom-audit.md`)는 만들지 않았다 — 이 세션에서 별도 에이전트를 띄울 수단이 없었다. 위 DOM 실측은 실행자 측정이라 감사를 대신하지 않는다. 감사 보고서 파일 없음.
- PR 게이트 `/review` → `/design-review`(Codex 포함) → `/qa`는 하지 않았다(오케스트레이터 몫). 전체 단위·통합·E2E는 CI.
- 대표 `/admin/action-log` ⑧ 켬 분기(200 + 행 1개 이상)는 시험하지 않았다(⑧ 끔).
- 사용자 본 화면 눈 확인(스크린샷은 기록용으로만 저장).

## 열린 질문 · 참고

- UI-SPEC SC-08의 「줄 함수(07-04)」 문구는 07-04-PLAN(줄 함수는 07-25 소유)과 어긋난다 — 계획대로 UI-SPEC은 고치지 않았다.
- `roleId` / `extraRoleIds` 값은 UUID라 이름으로 풀지 못하고 `바뀜` / `N개`로 보인다(이름 해석은 DB 조회가 필요해 줄 함수가 순수가 아니게 된다). 필요하면 후속 판단.
- `RowSheet`의 `KvList`가 `label`을 React key로 쓴다 — 한 행에 같은 칸 이름이 두 줄이면(예: 계좌번호 두 키) 경고가 난다. 현재 쓰는 쪽에서는 일어나지 않는다.

## Self-Check: PASSED

- 파일 존재: detail-lines.ts · action-log-table.tsx · detail-cell.tsx · detail-lines.test.ts · mobile-action-log.spec.ts · 점검표 — 확인함.
- 커밋: b65e9466 · 2b1cdd24 · aacd8323 · f65f7662 — `git log`에 있음.
