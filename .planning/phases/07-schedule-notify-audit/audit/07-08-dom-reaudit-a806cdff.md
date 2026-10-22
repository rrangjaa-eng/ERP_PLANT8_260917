# 07-08 독립 DOM 재감사 — a806cdff (감사 지적 D1 · C1 · C2 · C3 처리 뒤)

- 대상: 워크트리 `/home/user/wt/audit-0708` · detached `a806cdff`(브랜치 `claude/07-08-settings-forms`, origin/main `7c67107d` 머지 포함) · 1차 감사 HEAD `58c1c534`
- 감사자: 독립 에이전트(Opus, 실행자 아님) · 2026-10-22 · 코드 수정 없음
- 빌드: `CI=true pnpm build` → `pnpm start`(포트 3100), 빌드 · 서버 · 측정 전부 `flock /tmp/claude-0/e2e-3100.lock` 안 · DB 전용 `erp_reaudit0708_test`(E2E globalSetup 시드, 1차와 같은 방식) · Chromium `/opt/pw-browsers/chromium`
- 폭: 375 · 320 · 768 · 1280 · 판정은 DOM 실측만(`getComputedStyle` · `getBoundingClientRect` · `document.activeElement`). 스크린샷 판정 없음
- 실행: 1차 본 측정 24 + 재감사 추가 10(D1 4 · C1 4 · C3 2) 통과 · 안정화 재측정 4/4 · 라벨 보강 4/4 통과. 1차 settle 스펙은 첫 회에서 카드 번호 중복(시드 충돌, 측정 스크립트 문제)으로 실패해 번호만 바꿔 다시 돌렸고 4/4 통과
- 기준: 07-08-PLAN :44–:55 · :181 · :267 · 07-08-SUMMARY 감사 처리 표 · Deviations · SYSTEM §6-3 · §7-15 · `.claude/rules/frontend.md` · 사용자 결정 D1 · C2 · C3(2026-10-22)

## 결론

| # | 항목 | 판정 |
|---|---|---|
| D1 | 제출 폼 넷: 서버 칸 오류 뒤 포커스가 오류 난 첫 칸으로 감(4폭 × 8경우 32/32). 설정은 결정대로 aria만 쓰고 포커스는 다음 칸 | **합격** |
| C1 | 설정 숫자 · 텍스트 칸 53개: PC 280(`--field-w-short`), 폰 전폭, 넘침 0, 라벨 중복 0, Tab 순서가 DOM · 화면 순서와 같음 | **합격** |
| C2 | 수금 · 지급 기한 일수 0 · 366 → `저장 실패 · 범위 1~365 · 다시 입력`(4폭) | **합격** |
| C3 | 증빙 종류 상세 칸 27개가 폼 스킨(1px #7C8A86 · radius 6 · #FFFFFF)이고 기준 ui 스킨과 같음. 같은 표 셀 14개와 역할 표 셀 13개는 표 셀 스킨을 유지함 | **합격** |
| 회귀 | SC-15 계수 · 가로 넘침 0 · 대비 ≥ 4.5 · 토큰 밖 0 · aria-describedby/aria-invalid · 원가율 비움 → null · 포커스 링 · 입력 높이 | **합격** |

새 결함: 없음. 새 후보: 없음. 1차 메모 M1(접두 「저장 실패 · 」)과 M2(결재 마감 시각 문구 「형식 오류 · 값 확인」, 07-01 키라 이 플랜 밖)는 그대로 남아 있음.

## 1. D1 — 제출 폼 오류 뒤 포커스 (`reaudit.spec.ts` · kind `d1`)

측정: 제출 → 오류 줄이 보일 때까지 기다림 → +300ms(재제출은 +1200ms) 뒤 폼 안 `[aria-invalid="true"]`(문서 순서)와 `document.activeElement`를 비교함. 4폭 결과가 모두 같아서 한 줄로 적음.

| 폼 · 경우 | 셀렉터(폼) | 오류 칸(문서 순서) | 실측 activeElement | 기대 | 판정 |
|---|---|---|---|---|---|
| 내 계정 A: 현재 비움 + 새 `123` | `#change-password-form` | currentPassword, newPassword | `input#currentPassword` (`:focus-visible` true) | 첫 오류 칸 | 합격 |
| 내 계정 B: 현재 채움 + 새 `123` | 〃 | newPassword | `input#newPassword` | 첫 오류 칸(첫 칸이 아님) | 합격 |
| 내 계정 C: B 상태에서 버튼에 포커스를 두고 다시 제출 | 〃 | newPassword | `input#newPassword` | 다시 오류 칸 | 합격 |
| 공휴일 A: 2099-12-31 | `#holiday-form` | holiday-date | `input#holiday-date` | 첫 오류 칸 | 합격 |
| 공휴일 B: 같은 오류로 다시 제출 | 〃 | holiday-date | `input#holiday-date` | 다시 오류 칸 | 합격 |
| 카드 등록 A: 뒤 4자리 `12` + 소지자 없음 | `#corp-card-form` | numberLast4, holderUserId | `input#numberLast4` | 첫 오류 칸 | 합격 |
| 카드 등록 B: `1234` + 소지자 없음 | 〃 | holderUserId | `select#holderUserId` | 첫 오류 칸(첫 칸이 아님) | 합격 |
| 카드 수정: 소지자 비움 | `#corp-card-owner-form` | owner-holderUserId | `select#owner-holderUserId` | 첫 오류 칸 | 합격 |

오류 줄 실측: 「현재 비밀번호 필요 · 현재 비밀번호 입력」 「8자 미만 · 8자 이상으로」 「2099년 음력 표 없음 · 2035년까지 날짜 고르기」 「숫자 4자리 필요 · 끝 4자리 입력」 「소지자 필요 · 소지자 선택」 「소지자·팀 중 하나 필요 · 하나만 선택」. 모두 `원인 · 다음 행동` 꼴임.

설정 화면(blur 저장, 결정 D1): 범위 오류 뒤 포커스는 Tab으로 간 다음 칸에 있음. 잠금 횟수에서 오류가 나면 `setting-auth.lockout.window_minutes`로, 원가율이면 `setting-project.collection_due_days`로, 지급 기한 일수면 `setting-payment.weekday`로 가고, 나머지는 id 없는 다음 체크박스로 감. aria-invalid=true이고 describedby에 오류 id가 묶여 있음(§5) → **결정대로 합격**.

## 2. C1 — 설정 숫자 · 텍스트 칸 폭 (`reaudit.spec.ts` kind `c1` · `c1b.spec.ts` kind `c1b`)

대상: `main input[id^="setting-"]`(TextField) 53개(단위 붙은 칸 6개 포함)와 비교용 `main select[id^="setting-"]` 43개.

| 항목 | 셀렉터 | 실측 | 기대 | 판정 |
|---|---|---|---|---|
| PC 칸 폭(1280 · 768) | TextField `input` · `[data-ui="field-row"] > :nth-child(2)` | 53/53 = 280px, flex-basis `280px` | SYSTEM 세 폭 중 하나(실행자 280) | 합격 |
| PC 단위 칸 | `setting-project.cost_rate_pct` 외 5 | 입력 x124–404(280) · 단위 x412(간격 8) · 단위 오른쪽 ≤ 430.7 | 입력 280 + 단위는 칸 밖 | 합격 |
| PC 컨트롤 열 정렬 | input · select x | input x=124 · select x=124 · 라벨 x=20(TextField 라벨 100 · Select 라벨 96) | 같은 열 | 합격 |
| PC select 폭 | `select[id^="setting-"]` | 43/43 = 200 | `--field-w-select` 200 | 합격 |
| 폰 칸 폭 375 | TextField | 단위 없음 343(= 375 − 16×2), 단위 칸 324 · 316.3 · 319.3 + 단위 → 오른쪽 359 | 전폭 | 합격 |
| 폰 칸 폭 320 | TextField | 단위 없음 288, 단위 칸 269 · 261.3 · 264.3 + 단위 → 오른쪽 304 | 전폭 | 합격 |
| 폰 flex-basis | `[data-ui="field-row"] > :nth-child(2)` | `auto`(700px 미만에서 규칙 적용 안 됨) | 전폭 기본값 | 합격 |
| 넘침 | `documentElement.scrollWidth` · 입력 rect | 4폭 모두 docScrollW = vw, 뷰포트 밖 입력 0 | 0 | 합격 |
| 라벨 중복 | 칸 묶음(field-row의 바깥 묶음, 컨트롤 1개) 안 보이는 `label`/`legend` · 라벨과 같은 글자 요소 | 96칸 × 4폭: `labels.length` 1 · 라벨 요소 1 · 같은 글자 요소 1(중복이나 누락 0) | 1 | 합격 |
| 폰 라벨 위치 | label · input rect | 라벨 x16 = 입력 x16, 라벨 아래 4px에 입력 | 라벨이 위 | 합격 |
| Tab 순서 | main 첫 tabbable부터 Tab | 1280 · 768: 152/152, 375 · 320: 132/132가 DOM 순서와 하나도 어긋나지 않음(firstMismatch −1). 위로 가는 이동 0 · 같은 줄 역행 0. 설정 칸 80개가 순서대로 지남 | 칸 순서 = Tab 순서 | 합격 |

Deviation(Form.Field 대신 입력 칸 묶음에 폭만 검): 실측상 라벨은 한 번만 나오고, 폭과 aria(§5)도 기대대로임 → 받아들일 수 있음.

## 3. C2 — 기한 일수 범위 문구 (`audit.spec.ts` kind `rangeError`, 1차에 지급 366 경우를 더함)

| 칸 | 넣은 값 | 실측 오류 줄(`[id="…-error"]`) | 값 · aria-invalid · DB | 기대 | 판정 |
|---|---|---|---|---|---|
| `setting-project.collection_due_days` | 0 · 366 | 저장 실패 · 범위 1~365 · 다시 입력 (4폭) | 유지 · true · 60 그대로 | `범위 1~365 · 다시 입력`(접두 허용) | 합격 |
| `setting-payment.term_days` | 0 · 366 | 저장 실패 · 범위 1~365 · 다시 입력 (4폭) | 유지 · true · 60 그대로 | 〃 | 합격 |
| (비교) 잠금 횟수 · 잠금 시간 · 원가율 | 2/11 · 0/61 · −1/100.1/12.55 | 범위 3~10 · 범위 1~60 · 범위 0~100 · 다시 입력 | 유지 · true · 불변 | 같은 꼴 | 합격 |

정상값으로 고치면 오류 줄이 사라짐: 48/48(errorStill 0).

## 4. C3 — 증빙 종류 상세 칸 스킨 · 표 셀 회귀 (`reaudit.spec.ts` kind `c3` · `c3inv`, 1280 · 768)

| 대상 | 셀렉터 | 실측(1280 = 768) | 기대 | 판정 |
|---|---|---|---|---|
| 기준 ui/select | `[id="setting-payment.weekday"]` | 사방 1px solid #7C8A86 · radius 6px · #FFFFFF · h32 | — | 기준 |
| 기준 ui/input | `[id="setting-auth.lockout.threshold"]` | 사방 1px solid #7C8A86 · radius 6px · #FFFFFF · h32 | — | 기준 |
| 기준 패널 TextField | `dialog[data-ui="side-panel"] #value` | 사방 1px solid #7C8A86 · 6px · #FFFFFF · h40 | — | 기준 |
| 증빙 상세 select 22개 | `[data-ui="static-table-detail"] select` | 사방 1px solid #7C8A86 · radius 6px · #FFFFFF · h32 | 폼 스킨(1px · `--radius-control` · ui 기본) | 합격 |
| 증빙 상세 input 5개 | `[data-ui="static-table-detail"] input:not([type=checkbox])`(min-withholding) | 사방 1px solid #7C8A86 · 6px · #FFFFFF · h32 | 〃 | 합격 |
| 같은 표 셀 14개(이름 · 설명) | `table input:not([data-ui="static-table-detail"] *)` | 위 · 좌 · 우 0 none · 아래 1px solid #005446(`--accent`) · radius 0 · bg transparent · h32 | 표 셀 스킨(07 개정 11 투명 면) | 합격(회귀 없음) |
| 역할(계급) 표 셀 13개 | `/admin/people/roles` `main table` (클래스 `Table:table Table:editable Table:inputCells`) input 5 · select 8 | 아래만 1px #005446 · radius 0 · transparent · h32 | 표 셀 스킨 | 합격(회귀 없음) |
| 오류 상태 — 표 셀 | 이름 칸에 `aria-invalid="true"`를 붙이고 계산값을 읽음 | 아래 1px solid rgb(155,28,28)(`--status-danger`) · 위 0 · radius 0 · transparent | 밑줄만 위험 색 | 합격 |
| 오류 상태 — 상세 칸 | 상세 select에 `aria-invalid="true"`를 붙이고 계산값을 읽음 | 사방 1px #7C8A86 · 6px · #FFFFFF(표 셀 오류 규칙이 닿지 않음) | 표 규칙 제외 | 합격 |

`.inputCells`를 쓰는 곳은 `StaticTable editable` 두 화면(코드표 · 역할)뿐임(소스 grep). 두 화면을 모두 실측했음. main의 개정 11(표 안 입력 면 transparent)도 반영된 값으로 나옴.

## 5. 1차 합격 항목 회귀 (`audit.spec.ts` 24 + `settle.spec.ts` 4)

| 항목 | 셀렉터 | 실측 | 기대 | 판정 |
|---|---|---|---|---|
| SC-15 계수 | `select, input:not([type=checkbox]):not([type=radio]):not([type=hidden])` | 설정 97(ui 밖 0, PermissionGrid mobileSelect 1은 1차와 같음) · 내 계정 2 · 공휴일 3 · 카드 등록 5 · 카드 수정 2 · 증빙 상세 27(7줄, ui 밖 0, 체크박스 7 제외) — 4폭 같음 | 1차와 같음 · ui 밖 0 | 합격 |
| 가로 넘침 | `documentElement.scrollWidth` | 5폼 × 4폭 = vw. 컨트롤 뷰포트 밖 0 · 텍스트 넘침 0(settle 기준) | 0 | 합격 |
| 대비 — 컨트롤 값 | input/select | 16.79 | ≥ 4.5 | 합격 |
| 대비 — 라벨 · aux | label · hint | 최소 5.94(설정 · 계정) · 6.52(패널) | ≥ 4.5 | 합격 |
| 대비 — 비활성 select | `select:disabled` | 4.95 | ≥ 4.5 | 합격 |
| 대비 — 오류 줄 | `[id$="-error"]` | 7.43(48건) · #9B1C1C · 13px · 줄바꿈 · 넘침 0 | ≥ 4.5 | 합격 |
| 토큰 밖 색 · 서체 · radius | 폼 안 전 요소 | 설정 6,598 · 6,170 검사에 0. 패널 · 계정 · 증빙도 settle 기준 0 | 0 | 합격(아래 메모) |
| aria | 범위 오류 칸 | aria-invalid=true, describedby = `…-error` + `…-hint`(+ `…-unit`)이며 id가 모두 있음. 테두리 #9B1C1C, 오류 줄은 칸 아래 4px · dx 0 | 오류 id 포함 | 합격 |
| 원가율 비움 ≠ 0 | `[id="setting-project.cost_rate_pct"]` + DB | 12.5→12.5 · ""→null · 0→0 · ""→null(다시 열면 빈 칸) | null과 0 구분 | 합격 |
| 포커스 링 | `:focus-visible` | 134건 모두 2px solid #005446 · offset 2px(오류 칸 48건 포함) | `--focus` 계열 | 합격 |
| 입력 높이 | 컨트롤 | 설정 PC 32 · 폰 40 · 패널 40 · 증빙 32 | 32/40 | 합격 |
| 지급 섹션 | 라벨 순서 · `setting-payment.weekday` 옵션 | 지급 기한 일수 → 지급 요일 → 결재 마감 시각 · 월~금 | 같음 | 합격 |

메모(1차 M3과 같음): 바로 측정한 공휴일 제출 오류 3건에서 패널 버튼 전환 중 색 7건, 패널 열림 애니메이션 중 뷰포트 밖 컨트롤과 제목이 잡혔음. 1.5초 안정화 뒤 재측정(settle)에서는 모두 0임. 이번에 새로 생긴 것이 아님.

## 6. 측정 못 한 것

- 화면 읽기 실제 발화: 측정 못 함. 스크린리더 실행 환경이 없어 `aria-describedby` · `aria-invalid` 속성으로만 판정함.
- 증빙 종류 칸 실제 오류 경로: 측정 못 함. 컴포넌트에 오류 prop과 검증 오류가 없어서, 표 오류 규칙이 닿는지는 `aria-invalid`를 붙여 계산값으로만 봄(§4).
- 폰 폭 증빙 종류 칸 · 코드표 · 역할 표 셀 스킨: 측정 못 함. 사용자 결정으로 PcOnly 숨김이라 폰에서는 계수와 넘침만 봄.
- 이관 전 빌드와 키보드 동작 비교(:50): 측정 못 함. 이관 전 빌드는 다시 측정하지 않았고, 이관 후 Tab 순서만 DOM · 화면 순서와 대조함(§2).
- D-723 읽기 기본값 대체(:48): 측정 못 함. DOM 줄이 아니라 단위 시험 몫임.

## 7. 방법 · 기록

- 스크립트(저장소 밖): `/tmp/claude-0/audit-0708/re/` — `run.sh`(flock 안에서 build → start → Playwright → 서버 종료) · `pw.config.ts` · `specs/lib.ts`(1차와 같음) · `specs/audit.spec.ts`(1차 + 지급 366) · `specs/settle.spec.ts`(1차, 카드 번호만 바꿈) · `specs/reaudit.spec.ts`(D1 · C1 · C3) · `specs/c1b.spec.ts`(라벨 중복 · 열 정렬)
- 원자료: `/tmp/claude-0/audit-0708/re/out/` — `audit.jsonl`(330줄) · `settle.jsonl` · `c1b.jsonl` · `digest.txt` · `digest-settle.txt` · `build.log` · `pw.log` · `run1.log`–`run3.log` · `server.log`
- 시험 DB `erp_reaudit0708_test`는 감사 뒤 지웠고, 3100 서버도 내린 것을 확인함.
