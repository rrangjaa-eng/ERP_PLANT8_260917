<!-- 원본: /mnt/project-files/07-review/0718-dom-audit.md (verbatim 복사) -->
# 07-18 독립 DOM 감사 — 프로젝트 상세 정보 면 `/projects/[id]` · 승인 표시 패널 · 견적 줄 문 칸 이유

- 대상: worktree `/home/user/wt/07-18`, 브랜치 `claude/07-18-project-info-panel`, head `720ec0ec`(origin/main 머지 포함). 커밋 · 푸시 없음, 작업 트리 깨끗함.
- 감사자: 실행자가 아닌 독립 에이전트(Opus). 판정은 DOM 실측만 썼다. 스크린샷을 눈으로 보고 판정하지 않았다.
- 실행 방식:
  - `CI=true pnpm build`(exit 0) → `pnpm start` :3100. 빌드와 측정은 모두 `flock /tmp/claude-0/e2e-3100.lock` 아래에서 돌렸다.
  - 포트가 비었는지 /dev/tcp로 먼저 확인했다. 서버는 자기 프로세스 그룹만 내렸다.
  - DB는 `erp_w0718a_test`다. psql로 만들고 `pnpm db:migrate` · `pnpm db:seed`로 채웠다.
- 측정 스크립트(소스 밖 scratchpad `audit0718/`):
  - `audit.spec.ts` 6/6 녹색(`audit-run-2.log`)
  - `audit2.spec.ts` 3/3 녹색(`audit-run-3.log`)
- 원자료: `/home/user/wt/logs/07-18-audit/`
  - 측정값: `measure.json` · `measure2.json`
  - 요약: `summary1.txt` · `summary2.txt`
  - 실행 로그: `build.log` · `audit-run-*.log` · `server.log`
  - `audit-run.log` · `audit-run-1.log`는 버린 회차다. 다른 레인 서버가 :3100을 쥐고 있어 EADDRINUSE가 났다. 그 뒤로는 포트 대기를 넣었다.
- 데이터:
  - 담당 PM 계급: 회사 범위, 프로젝트 보기·쓰기, 지출결의 쓰기, 손익 보기, `quote.amount` 보임.
  - 보기만 계급: 쓰기 · 지출결의 · 손익 없음, `quote.amount` 숨김.
  - P1 진행 프로젝트는 다음 조건을 갖췄다.
    - 이름이 길다.
    - 기간이 2025-09-18~2027-11-27로 길다.
    - PO 금액 123,456,789.
    - PO 번호가 54자로 길다.
    - 발주서 근거 승인 + 긴 메모 + 발주서 파일 없음.
    - 견적 줄 5개: 열린 줄 · 취소 줄 · 실행가 0 줄 · 견적 외 비용 · 조정.
  - P2: 옛 승인(근거 · 메모 NULL).
  - P3: 견적 없음(계산 불가) · 승인 전 · PO 금액 없음.

## 판정: **통과(조건부) — P0·P1 없음, P2 1건**

P2 1건(폰 `계산 불가` 배지 버튼 터치 영역)은 머지 전에 고치기를 권한다. 나머지는 P3 관찰 · 문서 항목이다.

## 결함 표

| # | 등급 | 선택자 | 측정값 | 기대값 | file:line |
|---|---|---|---|---|---|
| 1 | **P2** | `#project-info [role=group][aria-labelledby$=-profit] button[aria-controls=project-info-body-profit-reason]`(`계산 불가`) | 375 · 320에서 **49.5×24px**다. 같은 면의 다른 3차 버튼(`펼치기` · `고치기` · `접기` · `승인 표시`)은 폰에서 모두 높이 44다. 이 버튼은 공용 `Button`이 아닌 맨 `<button>`이고 `padding:0`이다. 폰에는 hover가 없어서 이유(`계산 불가 · 견적 없음`)를 여는 길은 이 탭 하나뿐이다. | SYSTEM §3 「터치 목표」: 폰의 3차 버튼은 최소 44×44(§7-1 3차 · §11 줄 1373). `.infoReasonButton`에 폰 `min-height/min-width: var(--touch-min)`을 주거나, 공용 3차 `Button`으로 감싼다. | `app/(app)/projects/[id]/quote-table.tsx:2996-3005` · `app/(app)/projects/[id]/project-detail.module.css:445` |
| 2 | P3 | `#project-info [class*=infoValue]`(PO 금액 `123,456,789` · 손익 `1,930,000 · 48.3%`) · 접힌 줄 `PO 금액 · 123,456,789` | `font-variant-numeric: normal`이고 `Num`을 쓰지 않는다(4폭). | UI-SPEC SC-19 「금액은 `Num`」 · SYSTEM §7-18. PO 금액 표시는 기존 `preEstimateValue` 글자를 그대로 쓴다(main도 같음). 손익 값은 이 플랜의 새 글자다. | `quote-table.tsx:2883` · `:2953` · `:2992` |
| 3 | P3 | 승인 표시 패널, 근거를 비운 채 1차 | `근거 선택` 오류가 **두 곳에 동시에 보인다**. 칸 아래 `#approval-basis-error`(13px · `--status-danger`)와 행동 줄 위 PanelForm reason `_r_3_`(1차의 `aria-describedby`)다. 둘 다 `role`/`aria-live`가 없다. 포커스는 select로 가고 `aria-invalid=true`라서 화면 리더는 알 수 있다. select에 `required`/`aria-required`가 없다. 빈 선택지 글자도 `근거 선택`이라 오류 낱말과 같다. | 칸 오류 한 곳이면 충분하다(같은 문구를 두 번 보이지 않는다). 필수 칸이면 `aria-required="true"`. | `app/(app)/projects/[id]/revision-dialogs.tsx:287-289` · `:302-309` |
| 4 | P3 (문서) | `고치기` 묶음의 바꾼 칸 | 바꾼 칸은 `box-shadow: var(--inset-dirty)`(rgb(14,122,102) 1px inset)이다. 칸 바탕이나 면에 `--surface-dirty`(rgb(243,247,245))는 쓰이지 않는다. 기존 기간 칸과 같은 꼴이다. | UI-SPEC SC-19 · SYSTEM §7-2 개정 6 문장은 「`--surface-dirty` 면」이다. 구현은 기존 인라인 칸 규칙(inset)이다. 문장을 고치거나 구현을 맞춘다. | `app/(app)/projects/[id]/pre-estimate-field.tsx:291` |
| 5 | P3 | `계산 불가` 버튼 `aria-controls` | 접힌 상태에서는 가리키는 `#project-info-body-profit-reason`이 DOM에 없다(조건부 렌더). | 이유 줄을 늘 렌더하고 `hidden`으로 두거나, 닫힌 상태에서는 `aria-controls`를 뺀다. | `quote-table.tsx:3001` · `:3009` |
| 6 | P3 (절차) | — | 플랜 Task 3 수락 기준은 보고서를 `.planning/phases/07-schedule-notify-audit/audit/07-18-dom-audit.md`에 두라고 한다. 이 보고서는 지시대로 `/mnt/project-files/07-review/`에 있다. | 오케스트레이터가 같은 내용을 플랜 경로로 옮겨야 수락 기준이 선다. | 07-18-PLAN.md Task 3 acceptance |

범위 밖 관찰(이 플랜이 바꾸지 않은 것 — 결함 판정 제외):

- 폰 행 탭 시트의 부제가 견적 외 비용 · 조정 줄에서 원시 코드 `out_of_quote` · `adjustment`를 보인다. `subcategoryLabel(openSheetRow.subcategory)` 때문이고, origin/main의 같은 줄이다.
- 폰 견적 표 접힌 줄:
  - 무작위로 넣은 긴 거래처 이름(UUID 포함 45자)에서는 320 행이 **3줄 · 72px**이다.
  - 실제형 짧은 이름은 2줄 이내다.
  - 데이터에 따라 생기는 일이고, 기존 표 구조다.
- `승인 표시` 패널 안 공용 PanelForm의 1차 · 2차 행동 높이: 폰 44, PC 40. 기존 공용 규칙이다.

## 측정 요약 (4폭)

| 항목 | 375 | 320 | 768 | 1280 | 판정 |
|---|---|---|---|---|---|
| 가로 넘침(doc scrollWidth − clientWidth · 잘리지 않은 바깥 요소) — 접힘 · 펼침 · 고치기 중 · 옛 승인 · 빈 견적 · 승인 패널 · 보기만 계정 · 폰 시트 | 0 | 0 | 0 | 0 | 통과 |
| 가로 스크롤 컨테이너 넘침 | 없음 | 없음 | 없음 | 없음 | 통과 |
| 주 버튼(accent 채움, skip link 제외) — 접힘 · 펼침 | 0 | 0 | 0 | 0 | 통과(1차 `일괄 저장`은 dirty일 때만) |
| 고치기 중(dirty) | 1 `일괄 저장 1` | 1 | 1 | 1 | 통과 |
| 승인 표시 패널 | 1 `승인 표시` | 1 | 1 | 1 | 통과 |
| 토큰 밖 색(color · bg · border · outline) | 0 | 0 | 0 | 0 | 통과 ※ |
| 토큰 밖 서체 · 글자 크기 · radius | 0 · 0 · 0 | 0 · 0 · 0 | 0 · 0 · 0 | 0 · 0 · 0 | 통과 |
| 카드 속 카드(테두리 + radius 상자, 컨트롤 제외) | 0 | 0 | 0 | 0 | 통과 |
| 면 모양 | bg `--surface-foot` rgb(246,248,247) · 1px `--border-surface` · radius 8 = `--radius-surface` | 같음 | 같음 | 같음 | 통과 |
| 섹션 선 · 섹션 제목 | 1px `--border-row` · 13px(`--text-aux`) · `--text-muted` · 600 | 같음 | 같음 | 같음 | 통과 |
| 대비(면 글자 최저) | muted 6.11 · warning 5.56 · 3차 accent 8.35 · 본문 15.74 | 같음 | 같음(문 칸 글자 6.52) | 같음 | 통과(≥4.5) |
| 3차 버튼 터치(폰) / 높이(PC) | `펼치기` 54×44 · `고치기` 54×44 · `접기` 44×44 · `승인 표시` 70×44 · `승인 표시 취소` 99×44 · **`계산 불가` 50×24** | 같음 | 22(PC) | 22(PC) | **#1** |

※ 상속 글자색 `rgb(19, 32, 28)`이 처음에 「토큰 밖」으로 잡혔다. probe로 실측하니 `--text-body`와 `--text-strong`이 같은 값이었다. 이 값을 빼면 0건이다.

### SC-19 정보 면

| 계약 | 실측(4폭) | 판정 |
|---|---|---|
| 첫 렌더는 접힘(K22 · backstop 1) | `펼치기` `aria-expanded="false"` · `aria-controls="project-info-body"` · 본문 `hidden`(display none, 자식 0). 머리 글자는 `PO 금액 · 123,456,789` 한 값뿐이고, 면 제목 낱말은 따로 없다. 머리 높이는 폰 44(한 줄) · PC 22 | 통과 |
| 빈 PO 금액 | `PO 금액 · 없음`. `없음`은 `--text-muted` rgb(82,97,92), 대시 없음 | 통과 |
| `quote.amount` 없는 계급(U14) | 접힌 줄 `기간 · 09-18~11-27`. HTML에 `123,456,789` · `PO 금액` 글자가 없다. 펼친 그룹은 `기본` · `고객 승인`뿐(손익 없음). `고치기` 0 · `승인 표시` 0 · 문 칸 낱말 0 · `지출결의 올리기` 0 · `권한 없음` 0(375 · 1280) | 통과 |
| 펼치기 키보드 | Enter → `접기` `aria-expanded="true"`, 포커스는 버튼에 남고 `:focus-visible` 2px `--focus` 링. Space는 E2E(project-info-panel.spec)가 덮는다 | 통과 |
| 배치 | 375 · 320: 세로 3행(기본 / 고객 승인 / 손익). 768: `[기본, 고객 승인]` + `[손익]` 전폭 702px. 1280: 한 행 3열(각 389px) | 통과 |
| 긴 값 줄바꿈(backstop 2) | PO 번호 54자는 375에서 2줄 · 320에서 3줄로 칸 폭 안에 들어간다. 기간 · 메모 2줄. 넘침 0 | 통과 |
| `고치기` 하나 | 펼친 면 안 `/고치기/` 버튼 수 1. Enter → 첫 칸 `#period-start`(시작일) 포커스. 칸 5개(시작 · 끝 · 금액 · 통화 select · PO 번호)가 한꺼번에 열린다. 폰 높이 40 · PC 32 | 통과 |
| `고치기 취소`(backstop 3) | 누르면 칸 0 · 값 원복 · 포커스 `#project-info-edit`(`고치기`). 폰 `일괄 저장` 없음, 1280 비활성 `일괄 저장` | 통과 |
| 두 단계 Esc(backstop 3) | 입력 → Esc 1: 값 원복 · 칸 열림 · 포커스는 PO 번호 칸. Esc 2: 칸 닫힘 · 포커스 `고치기`(focus-visible 링) | 통과 |
| 저장 중(saveLocked · D-P2-3) | 저장 POST를 3초 늦춘 상태에서 쟀다. `고치기 취소` `aria-disabled="true"` · `aria-describedby` = 저장 버튼. 강제로 눌러도 칸이 남았다. Esc 무동작(값 `PO-지연` 유지). 저장 뒤 칸이 닫히고 값이 저장됐다 | 통과 |
| dirty 표시 | inset `--inset-dirty`. `--surface-dirty` 면은 아니다 | #4 P3 |
| 고객 승인 표시 | `승인됨 · 발주서` 본문색 · 같은 줄 `발주서 파일 없음` rgb(138,90,0) = `--status-warning` · 13px. 승인일 · 승인자와 메모는 `--text-aux` · `--text-muted` | 통과 |
| 옛 승인(근거 NULL) | 상태 값이 정확히 `승인됨` 하나다(근거 꼬리 없음, 4폭) | 통과 |
| 승인 표시 패널 | 폰은 아래 시트(375: 0,599 · 375×301), PC는 옆 패널 480. 열면 첫 포커스는 근거 select(라벨 `근거`). 선택지는 `근거 선택`/`발주서`/`이메일`/`구두`. 메모 TextField(라벨 `메모`). 1차 `승인 표시 Ctrl+Enter` 하나, 2차 `취소 Esc`(폰 44 · 2:1 폭). 빈 제출 → `근거 선택`(`aria-invalid`, 포커스 select). Esc → 닫힘 · 포커스 `승인 표시` | 통과(#3 P3) |
| 손익 | `1,930,000 · 48.3%`. 취소 줄 제외 Σ차익 / 견적 합 4,000,000을 손으로 계산한 값과 같다 | 통과(#2 P3) |
| 계산 불가(PARTIAL · U16) | `—`(muted) + 배지 `계산 불가`(StatusTag muted · rgb(82,97,92) = `--status-muted` · 11px 테두리). `title="계산 불가 · 견적 없음"`. 폰 탭 → `aria-expanded=true` · 이유 줄 `계산 불가 · 견적 없음`. Tab으로 닿고 링이 보인다 | 통과 · 터치 영역 **#1 P2** |
| 손익 권한 없음 | 보기만 계정에 손익 그룹 0 | 통과 |
| 예산 · 원가율 | `grep -rc "budget\|원가율" app/(app)/projects/[id]/` 합 0 | 통과 |

### SC-22 문 칸 이유

| 계약 | 실측 | 판정 |
|---|---|---|
| 낱말 표(U4) | 취소 줄 `취소된 줄` · 실행가 0 `남은 실행가 없음` · 견적 외 `견적 외 비용` · 조정 `조정 줄` · 열린 줄은 3차 `지출결의 올리기`(768 · 1280) | 통과 |
| 글자 모양 | 13px(`--text-aux`) · rgb(82,97,92)(`--text-muted`). 1줄 · 높이 15. 최장 `남은 실행가 없음` 83px가 문 칸(115~126px) 안에 든다 | 통과 |
| 폰(375 · 320) | 문 열은 P3라 행에서 접힌다(행에 문 버튼 0). 행 탭 시트에 같은 낱말 · 같은 색 · 크기 · 1줄(h 21), 열린 줄 시트에는 `지출결의 올리기` 109×44. 시트 넘침 0 | 통과 |
| 표 위 공통 줄 겹침 | 승인된 프로젝트에서 `고객 승인 전` 0, 줄마다 반복 없음 | 통과 |
| 문 열 권한 없음 | 열 없음 · 낱말 0 · `권한 없음` 0 | 통과 |
| 표에 없는 사유 | 이번 데이터에서는 나오지 않았다(빈 칸 기록 없음) | — |
| `구매 요청 중` · 시트 1차 `구매 요청`(D-738) | 이 감사에서는 따로 데이터를 넣지 않았다. `test/e2e/mobile-quote-doors.spec.ts`(375 · 320)가 단언한다 | 측정 범위 밖 |

### Tab 순서(펼친 면)

- `고치기` → `접기` → (승인됨이면 `승인 표시 취소` / 승인 전이면 `승인 표시` → `계산 불가`) → 견적 표.
- 위→아래 · 왼→오른 순서로 간다. 모든 정지점에 `:focus-visible` 2px `--focus` 링이 있다.

## 플랜 수락 기준 (grep)

- 이유 낱말 · 금지어:
  - U4 낱말 4종 `sort -u` = 4.
  - `수주 전|'권한 없음'|"권한 없음"` = 0.
  - `budget|원가율` 합 = 0.
- 도메인 · 금액 이름:
  - `approvalBasis`(revisions.ts) = 8.
  - `"총 매출 예상가` 문자열 0.
- 손대면 안 되는 파일:
  - `git diff --name-only origin/main...HEAD -- db/ domain/auth/ domain/permissions/` 빈 출력.
  - status-change.tsx · edit-scope.ts 변경 없음.
- DOM 감사 보고서 경로 조건만 #6으로 미충족.

## Backstop 세 줄

1. 4폭 첫 렌더 `aria-expanded="false"` · 접힌 줄 PO 금액 한 값 → **통과**
2. 375 · 320 펼친 섹션 세로 · 긴 기간 · PO 번호 줄바꿈 · 가로 스크롤 없음 → **통과**
3. `고치기 취소` 뒤 · 두 번째 Esc 뒤 포커스 `고치기` → **통과**
