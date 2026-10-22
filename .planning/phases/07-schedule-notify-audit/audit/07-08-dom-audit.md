# 07-08 독립 DOM 감사 — 설정·관리자 폼 다섯

- 대상: 워크트리 `/home/user/wt/audit-0708` · 브랜치 `claude/07-08-settings-forms` · HEAD `58c1c534`
- 감사자: 독립 에이전트(Opus, 실행자 아님) · 2026-10-22
- 빌드: `CI=true pnpm build` → `pnpm start`(포트 3100) · DB 전용 `erp_audit0708_test`(E2E globalSetup 시드) · Chromium `/opt/pw-browsers`
- 폭: 375 · 320 · 768 · 1280 · 판정은 DOM 실측만(스크린샷 육안 판정 없음)
- 실행: 본 측정 24/24 + 안정화 재측정 4/4 통과(Playwright exit 0), 서버 내림 확인
- 기준: 07-08-PLAN must_haves(:44–:55) · Task 2 ④(:181) · Task 3 ④(:271) · 「독립 DOM 감사」(:140) · 07-UI-SPEC SC-04/SC-15 · SYSTEM §6-3 · §7-2 · §7-15 · §10 · tokens.css · `.claude/rules/frontend.md`

## 결론

| # | 결함/후보 | 판정 |
|---|---|---|
| D1 | backstop 「오류 뒤 포커스가 그 칸에 남는다」 — 포커스가 다음 칸으로 간다 | **불합격** |
| C1 | 설정 TextField 폭 616/597px — §6-3 · §7-15 세 폭(200·280·480) 밖 · Task 2 ④의 `Form.Field` 감싸기 없음 | 후보(판단 필요) |
| C2 | `수금 기한 일수` · `지급 기한 일수` 오류 문구가 `N 이상만 가능 · 값 확인` — 잠금 · 원가율의 `범위 a~b · 다시 입력` 꼴과 다름 | 후보(판단 필요) |
| C3 | 증빙 종류 칸이 표 셀 스킨(테두리 0 · 밑줄 · 배경)으로 렌더 — 플랜은 「표 안 셀 아님」 | 후보(사용자 판단) |

나머지(SC-15 계수 · 화면 줄 · 가로 넘침 · aria-describedby · 범위 오류 · 원가율 비움/0 · 대비 · 토큰 · 포커스 링)는 합격.

## 1. SC-15 계수 (셀렉터 `select, input:not([type=checkbox]):not([type=radio]):not([type=hidden])`)

소유 판정: 요소 조상의 CSS 모듈 클래스(`<Module>-module__…`)가 `ui/` 모듈(Select · TextField · PermissionGrid 등)인지.

| 폼 | 범위 셀렉터 | 실측 SC-15 수 | ui 밖 | 기대 | 판정 |
|---|---|---|---|---|---|
| 설정 `/admin/settings` | `main` | 97 (Select/TextField 96 + PermissionGrid mobileSelect 1) | 0 | 0 | 합격 |
| 내 계정 `/account` | 비밀번호 폼 | 2 | 0 | 0 | 합격 |
| 공휴일 | 등록 폼 | 3 | 0 | 0 | 합격 |
| 법인카드 등록 | PanelForm | 5 | 0 | 0 | 합격 |
| 법인카드 수정 | PanelForm | 2 | 0 | 0 | 합격 |
| 코드표 증빙 종류(상세 7줄, PC) | 증빙 상세 줄 | 27 (+ 체크박스 7 제외) | 0 | 0 | 합격 |

- 코드표의 `code-tables:labelInput` 21개는 `code-item-form.tsx`(표 안 셀) — 계약상 제외.
- 4폭 모두 같은 수. 폰 폭에서 증빙 칸은 PcOnly로 숨김(사용자 결정) — 계수 대상 없음.

## 2. must_haves 화면 줄

| 줄(플랜) | 셀렉터 | 실측 | 기대 | 판정 |
|---|---|---|---|---|
| :44 폼 열 720 | 내 계정 폼 · 설정 섹션 열 | 폼 x20–740, max-width 720px | 720 | 합격 |
| :44 §7-2 오류 줄 `원인 · 다음 행동` | `[id$="-error"]` | 내 계정 「현재 비밀번호 필요 · 현재 비밀번호 입력」「8자 미만 · 8자 이상으로」, 공휴일 「2099년 음력 표 없음 · 2035년까지 날짜 고르기」, 카드 「숫자 4자리 필요 · 끝 4자리 입력」「소지자 필요 · 소지자 선택」「소지자·팀 중 하나 필요 · 하나만 선택」 | 두 마디 | 합격 |
| :46 `지급` 첫 칸 `지급 기한 일수` · 요일(월~금) · 마감(HH:MM) | `지급` 섹션 라벨 순서 · `[id="setting-payment.weekday"] option` | 지급 기한 일수 → 지급 요일 → 결재 마감 시각, 요일 옵션 월·화·수·목·금 | 같음 | 합격 |
| :46 aux 한 줄은 범위만 | 각 칸 hint `p` | `3~10` · `1~60분` · `0~100` · `1~365` · `HH:MM` | 범위만 | 합격 |
| :47 D-723 범위 · 칸 바로 아래 오류 줄 | `[id="setting-auth.lockout.threshold"]` · `…window_minutes` | 2·11 / 0·61 → 「저장 실패 · 범위 3~10 · 다시 입력」「저장 실패 · 범위 1~60 · 다시 입력」, 칸 아래 4px · dx 0, DB 값 불변, 5·15로 고치면 오류 사라지고 저장 | 범위 밖 거부 · `범위 3~10 · 다시 입력` 꼴 | 합격(「저장 실패 · 」 접두는 메모) |
| :48 D-723 범위 밖 저장값 읽기 대체 | — | 측정 못 함: DOM 줄이 아님(도메인 읽기 경로 — 단위 시험 몫) | — | — |
| :49 D-734 원가율 비움 ≠ 0 | `[id="setting-project.cost_rate_pct"]` + DB | 12.5→12.5/DB 12.5 · ""→""/DB null · 0→0/DB 0 · ""→""/DB null, -1 · 100.1 · 12.55 거부 「저장 실패 · 범위 0~100 · 다시 입력」 | null과 0 구분 | 합격 |
| :49 D-735 `수금 기한 일수` 프로젝트 섹션 · 저장 | `프로젝트` 섹션 | 원가율 · 수금 기한 일수가 섹션 안, 0·366 거부, 정상값 저장 | 같음 | 합격(문구 C2) |
| :50 입력 높이 PC 32 · 폰 40 | 설정 · 내 계정 · 공휴일 · 카드 컨트롤 | PC 32 · 폰(375·320) 40 · 패널 40(`--control-h-panel`) · 증빙 32 | 32/40 | 합격 |
| :50 포커스 링 | `:focus-visible` | outline solid 2px #005446, offset 2px(전 폼 키보드 포커스) | `--focus` · `--focus-w` · `--focus-offset` | 합격 |
| :50 라벨 열(PC) | `[data-ui="field-row"] label` | TextField 라벨 100(96+4 설계), 컨트롤 x = label.x+104 · Select 라벨 96 · 폰은 라벨이 위 | 96 열 | 합격 |
| :50 키보드 동작 이관 전과 같음 | — | 측정 못 함: 이관 전 빌드와 비교 측정하지 않음(이관 후 Tab 순서는 문서 순서대로) | — | — |

## 3. backstop 두 줄

| 줄 | 셀렉터 | 실측 | 기대 | 판정 |
|---|---|---|---|---|
| :52 긴 라벨 · 오류 줄 줄바꿈, 가로 스크롤 없음, 입력이 폼 열 밖으로 안 나감 | `document.documentElement.scrollWidth` · 텍스트 `scrollWidth>clientWidth` · 컨트롤 rect | 5폼 × 4폭 모두 docScrollW = vw, 텍스트 넘침 0, 컨트롤 전부 범위·뷰포트 안(안정화 재측정 기준) | 0 | 합격 |
| :54 앞 절: 범위 오류 줄이 `aria-describedby`로 칸에 묶임 | 오류 칸 `aria-describedby` · `aria-invalid` | 잠금 횟수/시간 · 원가율 · 수금 · 지급 기한 · 마감: aria-invalid=true, describedby = `setting-…-error` + hint id(+ 단위 id), 테두리 #9B1C1C | 오류 id 포함 | 합격(화면 읽기 발화는 측정 못 함 — 속성으로만 판정) |
| :54 뒷 절: **오류 뒤 포커스가 그 칸에 남는다** | 오류 뒤 `document.activeElement` | 아래 표 | 오류 난 칸 | **불합격** |

플랜 문장: 「범위 오류 줄이 `aria-describedby`로 칸에 묶여 화면 읽기에서 읽히고, **오류 뒤 포커스가 그 칸에 남는다**」(07-08-PLAN.md:54)

실제 동작(설정은 blur 저장이라 Tab으로 칸을 떠나야 저장 → 오류가 뜬 뒤에도 포커스는 다음 칸에 머문다, 4폭 같음):

| 오류 낸 칸 | 오류 뒤 포커스(실측) |
|---|---|
| `[id="setting-auth.lockout.threshold"]` | `[id="setting-auth.lockout.window_minutes"]` |
| `[id="setting-auth.lockout.window_minutes"]` | 다음 체크박스(「login」) |
| `[id="setting-project.cost_rate_pct"]` | `[id="setting-project.collection_due_days"]` |
| `[id="setting-project.collection_due_days"]` | 체크박스 「확인증 기능 사용」 |
| `[id="setting-payment.term_days"]`(지급 기한 일수) | `[id="setting-payment.weekday"]` |
| `[id="setting-payment.cutoff_time"]`(결재 마감 시각) | PermissionGrid 체크박스/선택 |
| 제출 폼(내 계정 · 공휴일 · 카드 등록/수정) | 제출 버튼에 남음(오류 칸으로 옮기지 않음) |

(SUMMARY는 이 부분을 구현하지 않았다고 적었다 — 실측도 같다.)

## 4. 범위 밖 값 오류 표시

| 칸 | 넣은 값 | 실측 오류 줄 | 값 유지 · aria-invalid · DB | 판정 |
|---|---|---|---|---|
| 잠금 횟수 | 2 · 11 | 저장 실패 · 범위 3~10 · 다시 입력 | 유지 · true · 불변 | 합격 |
| 잠금 시간 | 0 · 61 | 저장 실패 · 범위 1~60 · 다시 입력 | 유지 · true · 불변 | 합격 |
| 원가율 | -1 · 100.1 · 12.55 | 저장 실패 · 범위 0~100 · 다시 입력 | 유지 · true · 불변 | 합격 |
| 원가율 비움 | "" | 오류 없음 · DB null(0 아님) | — | 합격 |
| 수금 기한 일수 | 0 / 366 | 저장 실패 · 1 이상만 가능 · 값 확인 / 365 이하만 가능 · 값 확인 | 유지 · true · 불변 | 합격(문구 C2) |
| 지급 기한 일수 | 0 | 저장 실패 · 1 이상만 가능 · 값 확인 | 유지 · true · 불변 | 합격(문구 C2) |
| 결재 마감 시각 | 25:00 | 저장 실패 · 형식 오류 · 값 확인 | 유지 · true · 불변 | 합격(메모 M2) |

오류 줄 공통 실측: 칸 아래 4px · 왼쪽 정렬(dx 0) · #9B1C1C · 13px · 줄바꿈 · 넘침 0 · 대비 7.43–8.15.

## 5. 가로 넘침 · 대비 · 토큰

| 항목 | 셀렉터 | 실측 | 기대 | 판정 |
|---|---|---|---|---|
| 가로 넘침 | `documentElement.scrollWidth` | 5폼 × 4폭 = vw | ≤ vw | 합격 |
| 대비 — 컨트롤 값 | input/select | 16.79 (#13201C / #FFFFFF) | ≥ 4.5 | 합격 |
| 대비 — 라벨 · aux | label · hint | 5.94(설정·계정) · 6.52(패널) | ≥ 4.5 | 합격 |
| 대비 — 오류 줄 | `[id$="-error"]` | 7.43–8.15 | ≥ 4.5 | 합격 |
| 대비 — 비활성 select(16개) | `select:disabled` | 4.95 | ≥ 4.5 | 합격 |
| 대비 — 증빙 칸 | 증빙 상세 컨트롤 | 14.78 | ≥ 4.5 | 합격 |
| 토큰 밖 색 · 서체 · radius | 폼 안 전 요소 계산값 대조 | 토큰 밖 0건(설정 6,598 검사), 서체 전부 `--font-sans`, 컨트롤 1px #7C8A86 · radius 6 · 14px(PC)/15px(폰) | tokens.css만 | 합격 |
| 포커스 링 토큰 | `:focus-visible` | 2px solid #005446 offset 2px, 오류 칸도 링 유지 + #9B1C1C 테두리 | `--focus` 계열 | 합격 |

## 6. 후보 · 메모

- **C1 설정 입력 폭.** PC(768·1280)에서 설정 TextField(숫자·텍스트)가 616px, 단위 붙은 칸 597px. SYSTEM §6-3 · §7-15 칸 폭 셋(select 200 · short 280 · long 480) 어디에도 없고, 같은 섹션 안 Select(200)와 폭이 섞인다. 원인: `settings-form-client.tsx`의 숫자·텍스트 렌더러가 `Form.Field`(폭 지정) 없이 `TextField`만 쓴다 — Task 2 ④(:181)는 「`Form.Field` + `TextField` + `Form.Error`」. numberKind 칸은 기준 85600e32에서도 같은 꼴(기존), 일반 숫자·텍스트 칸은 이번 이관으로 새로 이 폭이 됐다.
- **C2 오류 문구 꼴.** 수금 기한 일수 · 지급 기한 일수 오류가 `N 이상만 가능 · 값 확인`. 같은 화면의 잠금 · 원가율은 `범위 a~b · 다시 입력`. 키 스키마에 메시지가 없어 일반 zod 문구로 떨어진 것(`domain/settings/keys.ts`의 collection_due_days는 `z.coerce.number().int().min(1).max(365)`).
- **C3 증빙 종류 칸 스킨.** 증빙 상세 select/input이 테두리 0 · 1px `--accent` 밑줄 · `--accent-weak` 배경 · radius 0. 원인은 기존 `ui/table/Table.module.css:77`의 `.inputCells :is(input…, select)`가 ui/select 스킨을 덮는 것. 값은 전부 토큰이고 이관 전과 겉모습이 같지만(SC-15 「겉모습 변경 없음」과는 맞음), 플랜 :267은 이 칸을 「표 안 셀 아님 — 폼」으로 본다.
- M1 설정 오류 줄은 모두 「저장 실패 · 」 접두가 붙어 세 마디(`errorMessageOf`). 플랜 「`범위 3~10 · 다시 입력` 꼴」 문구는 포함 — 합격으로 두고 메모.
- M2 결재 마감 시각 형식 오류가 키 자체 문구 「시각 형식 오류 · 14:00처럼」 대신 「형식 오류 · 값 확인」으로 나온다. 07-01 키 — 이 플랜 밖.
- M3 첫 측정은 패널 열림 애니메이션 · 버튼 전환 중에 걸려 토큰 밖 색 · 뷰포트 밖 컨트롤이 잡혔다. 1.5초 안정화 뒤 재측정(settle)에서 0 — 표의 값은 재측정 기준.

## 7. 측정 못 함

- 화면 읽기 실제 발화: 측정 못 함: 스크린리더 실행 환경 없음 — `aria-describedby` · `aria-invalid` 속성으로만 판정.
- 증빙 종류 칸 오류 경로: 측정 못 함: 컴포넌트에 오류 prop · 검증 오류가 없어 오류 줄을 띄울 경로 없음.
- 폰 폭 증빙 종류 칸: 측정 못 함: 사용자 결정으로 PcOnly 숨김(넘침 · 계수만 확인).
- 이관 전과 키보드 동작 비교(:50): 측정 못 함: 이관 전 빌드 비교 측정 안 함.
- D-723 읽기 기본값 대체(:48): 측정 못 함: DOM 줄 아님(단위 시험 몫).

## 8. 방법 · 기록

- 측정 스크립트(저장소 밖): `/tmp/claude-0/audit-0708/` — `run.sh`(flock `/tmp/claude-0/e2e-3100.lock` 안에서 build → start → Playwright → 서버 종료), `pw.config.ts`, `specs/lib.ts`(scope · tokenScan · focusRing · active · rect), `specs/audit.spec.ts`(6화면 × 4폭 = 24), `specs/settle.spec.ts`(안정화 재측정 4), `digest.mjs`
- 원자료: `/tmp/claude-0/audit-0708/out/audit.jsonl`(268줄) · `settle.jsonl`(20줄) · `digest.txt` · `build.log` · `pw.log` · `run1.log` · `run2.log` · `server.log`
- 시험 DB `erp_audit0708_test`는 감사 뒤 삭제.
