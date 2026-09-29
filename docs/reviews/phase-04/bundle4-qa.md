# QA Report: PLANT8 ERP — 묶음 ④ (PR #85)

| Field | Value |
|-------|-------|
| **Date** | 2026-09-28 |
| **URL** | http://127.0.0.1:3100 (로컬 프로덕션 빌드 — `CI=true pnpm build && pnpm start`, DB `erp_test`) |
| **Branch** | claude/gsd-progress-e1nzgu |
| **Commit** | 기준 b6a5720 (+ 오케스트레이터 docs 9f29a6b) · base origin/main 90465dc |
| **PR** | #85 |
| **Tier** | Standard (critical·high·medium 수정, low는 보류) |
| **Mode** | diff-aware (90465dc..HEAD, 특히 a551fe0..HEAD · 6ea2c77) |
| **Driver** | gstack 헤드리스 브라우저 `$B` (Aside 없음). 판정은 DOM·텍스트·콘솔·DB 실측, 스크린샷은 증거용 |
| **Pages visited** | /admin/settings · /projects/[id] · /pnl/reserves · /admin/archive · /login · /account (1280·375) |
| **Framework** | Next.js 16 (App Router) |
| **Users** | E2E 픽스처 방식으로 만든 QA 계정 4개 — 시스템 관리자 · 재무1/재무2(pnl 보기·쓰기 + reserve.amount + admin.archive) · 보관 열람(admin.archive 보기, reserve.amount 끔). 비밀번호 [REDACTED] |

## Health Score

| | Baseline | Final |
|---|---|---|
| **Score** | **92** (provisional) | _(수정 후 갱신)_ |

| Category | Weight | Baseline | Final |
|----------|--------|----------|-------|
| Console | 15% | 100 | |
| Links | 10% | 미측정(제외) | |
| Visual | 10% | 100 | |
| Functional | 20% | 89 (−8 ISSUE-003, −3 ISSUE-004) | |
| UX | 15% | 92 (−8 ISSUE-005) | |
| Performance | 10% | 미측정(제외) | |
| Content | 5% | 100 | |
| Accessibility | 15% | 81 (−8 ISSUE-001, −8 ISSUE-002, −3 ISSUE-006) | |

측정 범위: 링크·성능은 이번 diff 범위 밖이라 재지 않았다(provisional, 가중치 0.80 기준).

## Top 3 Things to Fix

1. **ISSUE-001**: 격자 선택 칸(클라이언트·거래처·소분류·구분…)에서 ↓ 한 번이 값을 확정하고 포커스가 `<body>`로 빠진다 — 키보드 흐름이 끊기고 이어서 누른 Ctrl+S가 브라우저 「페이지 저장」으로 간다.
2. **ISSUE-002**: 붙여넣기로 기준 줄이 다른 그룹(클라이언트·대분류)으로 옮겨 가면 포커스가 `<body>`로 빠진다 — 같은 결과.
3. **ISSUE-003**: 숫자 칸에서 쉼표 바로 앞 캐럿의 Delete가 **캐럿 앞 숫자**를 지운다(`1|,500,000` → `500,000`, 기대 `100,000`).

## Console Health

| Error | Count | First seen |
|-------|-------|------------|
| `Failed to load resource: 404` | 1 | /pnl/reserves — 보관 열람 계급(pnl 쓰기·reserve.amount 없음)의 의도된 404. 결함 아님 |

그 밖의 화면·상호작용 뒤 콘솔 오류 0.

## 통과한 시나리오 (DOM·DB 실측)

- **/admin/settings 순번 시작값**: 번호 1건 발행 뒤 1→5 올리기 저장(DB 5) · 5→3 낮추기 → 칸 `aria-invalid=true` + 「저장 실패 · 순번 시작값은 현재 값(5)보다 낮출 수 없음」, DB 5 그대로 · 5→7 올리기 OK · 375에서도 같은 오류(현재 값(7)), 가로 넘침 0.
- **/projects/[id] 견적 표 금액**: 입력 중 쉼표(400000→`400,000`) · 쉼표 뒤 Backspace(`400,|000`→`40,000`, 캐럿 2) · 가운데 삽입 시 캐럿 제자리 · 전체 선택 후 타이핑 `400000`→`400,000` · 전체 선택 후 붙여넣기 `400000`/`400,000`→`400,000`, 커밋 뒤 400,000 유지(6ea2c77 회귀 없음) · 음수 `-5,000` · Esc 되돌림 · 3줄 TSV 붙여넣기(엑셀 인용 `"250,000"` 포함) → 저장 → 새로고침 뒤 견적 4,550,000 유지.
- **/pnl/reserves**: 줄 추가·저장 · 엑셀식 TSV 붙여넣기에서 동명 클라이언트 → 칸 오류 「같은 이름 여럿 · 목록에서 고르기」(합계 줄 `오류 N칸`) · USD 줄(100.35 @1,300 → 130,455) 금액 칸에 `250,000` 붙여넣기 → 원화 250,000 + 합계 줄 「붙여넣기 1줄 · 외화 1줄 원화로」 · 앱 안 Ctrl+A → Ctrl+C → 새 줄에 Ctrl+V → 3줄 그대로 + 「계산 열 3칸 무시」 → 저장 · 두 탭 버전 충돌: 탭2가 메모 고쳐 저장(version 2) 뒤 탭1에서 같은 줄 삭제 저장 → 「다른 사람이 먼저 이 줄을 바꿈 · 새로 고침」, DB 보관 안 됨 · 잔액이 음수가 되는 삭제 → 「이 줄 뒤 잔액 -150,000 · 금액을 줄이거나 입금 줄 먼저」 전부 거부 · 정상 삭제(보관) 저장 → DB archived · 저장 안 한 편집 뒤 새로고침 → 「저장 안 한 편집 N칸 · 복원 / 버림」, 복원하면 줄 그대로 · 로그아웃 → localStorage의 dirty 키 0 → 재무2로 로그인 → 복원 줄·초안 없음.
- **/admin/archive**: reserve 권한 있는 재무2는 리저브 보관 줄 1건이 보이고, reserve.amount 없는 보관 열람 계급은 「보관함이 비어 있습니다」(리저브 줄 없음), /pnl/reserves는 404.
- **폭**: 1280·375 모두 /pnl/reserves · /projects/[id] · /admin/settings · /admin/archive `scrollWidth == clientWidth`.

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 4 (ISSUE-001·002·003 수정 대상, ISSUE-005 부분 수정) |
| Low | 2 (ISSUE-004·006 보류) |
| **Total** | **6** |

## Issues

### ISSUE-001: 선택 칸 편집기 — ↓ 한 번이 값을 확정하고 포커스가 body로 빠짐

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | accessibility (키보드) |
| **URL** | /pnl/reserves (클라이언트·구분·프로젝트·증빙 종류), /projects/[id] (소분류·거래처) |
| **Fix Status** | verified — c5dc811b (RED 0a8f7c17) |

재현: 격자 클라이언트 칸 포커스 → Enter(`<select>` 열림, `activeElement=SELECT`) → ↓ → `activeElement=BODY`, 칸 값은 다음 옵션으로 확정. 마우스로 옵션을 골라도 같다(편집기 `onChange` 커밋 → 편집기 언마운트, 셀로 포커스 복귀 없음). 이어 누른 Ctrl+S는 격자에 닿지 않아 저장되지 않는다(실제 Chrome이면 「페이지 저장」 창). 견적 표 거래처 칸에서도 같다 — 공용 `ui/table/Table.tsx` renderCell의 `onCommit`이 Esc·Enter와 달리 셀 재포커스를 요청하지 않는다(90465dc에도 있던 결함, 새 리저브 대장이 더 드러낸다).
증거: `screenshots/reserves-paste-focus-lost.png`(같은 증상), DOM 로그(`activeElement` BODY).

### ISSUE-002: 붙여넣기로 기준 줄이 다른 그룹으로 옮겨 가면 포커스가 body로 빠짐

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | accessibility (키보드) |
| **URL** | /pnl/reserves, /projects/[id] |
| **Fix Status** | verified — c5dc811b (RED 0a8f7c17) |

재현(리저브): Ctrl+A → Ctrl+C → Ctrl+Enter(새 줄) → Esc → 새 줄 날짜 칸에서 Ctrl+V → 3줄 붙음, 격자의 탭 정지(`td[tabindex=0]`)는 옮겨 간 줄(가나상사 그룹)에 있지만 `activeElement=BODY`. Ctrl+S 무반응(일괄 저장 3 그대로). 재현(견적): 「음향」 줄 소분류 칸에 `인력` 붙여넣기 → 줄이 「인력」 그룹으로 이동, `activeElement=BODY`. 붙여넣기 뒤 셀 재포커스가 없다.
증거: `screenshots/reserves-paste-focus-lost.png`.

### ISSUE-003: 숫자 칸 — 쉼표 바로 앞에서 Delete가 캐럿 앞 숫자를 지움

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | functional |
| **URL** | /projects/[id] 단가, /pnl/reserves 금액·환율, 설정 숫자 칸 등 `useCommaInput` 전부 |
| **Fix Status** | _(진행 중)_ |

재현: 단가 `1,500,000` 편집 → 캐럿 1(`1|,500,000`) → Delete → `500,000`(캐럿 0). 기대: 쉼표 뒤 숫자를 지워 `100,000`. `lib/format-number.ts` formatTyped의 「쉼표 뒤 Backspace」 보정이 Backspace와 Delete를 구분하지 못한다 — 네이티브 삭제 뒤 raw·caret이 두 키에서 똑같아(`1500,000`, caret 1) 늘 캐럿 앞 숫자를 지운다. 사용자는 틀린 자리가 지워진 값을 알아채지 못하면 그대로 저장할 수 있다.

### ISSUE-004: 편집기 값 `0` 뒤에 타이핑하면 `0,400,000`

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | functional (표시) |
| **URL** | /projects/[id] 단가 |
| **Fix Status** | deferred (Standard tier — low) |

새 줄 단가 `0` 칸 Enter(캐럿 끝) → `400000` 타이핑 → 입력 칸에 `0,400,000`. 커밋 값은 400,000으로 맞다. 앞자리 0을 떼지 않는 표시 문제.

### ISSUE-005: 동명 거래처가 선택 목록에서 구분되지 않음 — 부분 수정(리저브), 견적 보류

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | ux |
| **URL** | /pnl/reserves 클라이언트 칸, /projects/[id] 거래처 칸 |
| **Fix Status** | 리저브 verified (491b2df0 RED → 다음 커밋) · 견적 거래처 칸 deferred |

붙여넣기 오류가 「같은 이름 여럿 · 목록에서 고르기」라고 안내하지만 목록에는 `마바동명`이 두 번, 똑같이 보인다(옵션 라벨 = 이름뿐). 사용자는 어느 쪽이 맞는지 고를 근거가 없다. DECISIONS.md·UI-SPEC에 동명 표기 규칙 없음.
선택지: (a) 옵션 라벨에 구분자 병기 — 사업자번호 끝 4자리 등(`마바동명 · 1234`) (b) 동명일 때만 뒤에 순번·등록일 병기 (c) 거래처 등록 단계에서 동명 금지(정규화 이름 unique). 추천: **(a)를 동명일 때만** — 평소 목록은 그대로, 동명 두 줄만 구분 글자가 붙고 붙여넣기 오류 문구와 맞는다.

### ISSUE-006: 폰 「복원」「버림」 폭 32px

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | accessibility |
| **URL** | /pnl/reserves (375) |
| **Fix Status** | deferred (low · 견적 원장 S18과 같은 규칙 — 높이만 `--touch-min`) |

높이는 44(445ba9f), 폭은 32. 다른 폰 스펙(mobile-code-tables·mobile-corp-cards)은 44×44를 잰다. 두 화면을 같이 바꿀 일이라 여기서 하나만 고치지 않는다.

## 참고(결함 아님)

- 견적 표의 견적가·차익은 저장 뒤에 서버가 계산해 채운다(편집 중에는 이전 값). 기존 설계.
- 엑셀 붙여넣기의 빈 칸이 잔액(계산 열)에 떨어져도 「읽기 전용·잠김 셀에 값 떨어짐」 — 04-47 규칙(읽기 전용 칸은 무조건 오류)대로.
- 로그아웃하면 저장 안 한 초안이 지워진다(46dc3e4 설계대로).

## Fixes

- ISSUE-001 — c5dc811b: `ui/table/Table.tsx` onCommit이 편집기가 포커스를 쥔 확정이면 셀 재포커스(focusRequest cell). 회귀 E2E: quote-table·reserves 「/qa 포커스」(0a8f7c17).
- ISSUE-002 — c5dc811b: 표 붙여넣기 뒤 탭 정지 셀로 재포커스. 회귀 E2E: quote-table 「(QA ISSUE-002)」(0a8f7c17).
- ISSUE-005 — 사용자 결정 (a) 리저브만(2026-09-29): 동명 클라이언트 옵션만 `이름 · 사업자번호 끝4자리`(`vendorOptionLabels`, 라벨은 클라이언트 옵션과 같은 `[reserve.amount, vendor.value]` 게이트), `이름 · 끝4자리` 붙여넣기는 그 클라이언트로. 회귀: 단위 vendor-option-labels · E2E reserves 「(QA ISSUE-005)」(491b2df0). 견적 거래처 칸은 옵션이 projects 보기 권한만 확인해 끝 4자리가 권한 밖으로 샐 수 있어 보류(후속 단위).

## PR Summary

_(최종 갱신)_
