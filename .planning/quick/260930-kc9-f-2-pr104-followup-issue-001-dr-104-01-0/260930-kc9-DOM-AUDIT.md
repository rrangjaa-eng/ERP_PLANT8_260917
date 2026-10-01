# 260930-kc9 독립 DOM 감사 (보고 전용)

- 감사 대상: 브랜치 `claude/pr104-followup-f2` HEAD `4d23611`. 이 코드를 쓰지 않은 감사자가 판정했다.
- 판정 근거: DOM 실측 숫자만 썼다(getComputedStyle · getBoundingClientRect · scrollWidth · Tab 순회 중 document.activeElement · 속성값 · textContent). 스크린샷은 쓰지 않았다.
- 소스 · 테스트 · 설정 파일은 고치지 않았고 커밋도 하지 않았다. 이 보고서만 새로 썼다.

## 방법
1. `CI=true pnpm build` → exit 0.
2. `pnpm start -p 3100`을 띄웠다(PID 11090, next-server 11109). 환경은 `playwright.config.ts`의 webServer와 같다: `DATABASE_URL=…/erp_test` · `BETTER_AUTH_URL=http://127.0.0.1:3100` · `APP_ENV=local` · 테스트용 무작위 `BETTER_AUTH_SECRET`/`APP_DATA_KEY_v1` · `RATE_LIMIT_LOGIN_MAX=1000`. 감사가 끝난 뒤 PID로 종료했고 3100 포트가 닫힌 것을 확인했다.
3. 데이터는 E2E 픽스처와 같은 방식으로 만들었다(`tsx`로 도메인 함수 호출, 스크래치패드 `seed.mts`).
   - 한 팀 소속 계정 셋: `createAccount` + `assignTeam`. 시스템 관리자 · 팀장 · PM.
   - 프로젝트 `DOM감사-…`: PM이 담당, 1차 견적 12줄 → `createRevisionFromCurrent`로 2차를 만들어 현재 차수로 두었다. 이전 차수(1차)가 있다.
   - 리저브 입금 1줄.
   - 이력형 설정은 시드 값을 그대로 썼다: 125000 · 0.088 · 0.033 · 0.1 · 15 · flat.
4. 브라우저: Playwright Chromium(`/opt/pw-browsers/chromium`), 화면 높이 800. 스크립트와 원자료 JSON은 스크래치패드 `dom-audit/`에 있다.
5. 설정을 건드리기 전에 `settings_simple`(42행) · `settings_historized`(7행) · `approval_routes`(0행)를 CSV로 스냅샷했다. 감사 뒤 다시 떠서 비교했다(아래 복원 기록).

## 결과 요약
| 검사 | 판정 | 핵심 숫자 |
|---|---|---|
| A. ISSUE-001 설정 힌트 연결 | **PASS** | 힌트 `<p>` 42개. 그중 필드 힌트 41개는 모두 id가 있고 연결 요소가 정확히 1개씩이다. 매달린 id 0 · 중복 id 0. 오류 경로에서는 `…separator-error …separator-hint` 순서이고 두 요소 모두 존재한다. 내보내기 안내는 연결되지 않았다(id 없음, 연결 0) |
| B. DR-104-03 이력 숫자 | **PASS** | `125,000`(1280 · 375 모두). 비율은 `0.088` · `0.033` · `0.1` · `0.088` 그대로이고 `15`도 그대로다 |
| C. DR-104-01 복원 줄 44 | **PASS** | 375 · 320에서 세 복원 줄의 버튼 8개가 모두 44×44. 1280은 32.33×21.19이고 `min-width:auto`로 바꿔 잰 값과 같다(새지 않음) |
| D. DR-104-02 비활성 kbd | **PASS** | 비활성 kbd의 합성 대비는 4.951이다(글자 #5F6E6A, opacity 누적 1, 면 #F3F7F5). 테두리 rgb(207,219,215)는 --line과 같다. 활성은 opacity 0.8, 테두리 rgba(255,255,255,0.5)로 --on-accent-weak과 같다. 리저브 비활성 1차도 4.951 |
| E. DR-104-04 번호 칸 | **PASS** | 두 표 모두 span이 11px(--fs-xs)에 rgb(95,110,106)(--faint)이고 폭은 28이다. td는 right · tabular-nums · nowrap이다. th는 12px이고 --faint가 아니다. 오른쪽 끝 12개 차이는 0. 1024에서는 th가 display:none으로 접힌다 |
| F. DR-104-05 머리 줄 순서 | **PASS** | 폰 375 · 320: 관리자 · 팀장 · PM 모두 보이는 순서 = DOM 순서 = Tab 순서, 높이 44. PC 1280 · 700: 세 순서가 같고 높이 32, 더보기 없음, 복사 묶음이 앞 |
| G. 회귀 | **PASS** | 넘침은 55개 측정 중 0이다(scrollWidth = innerWidth). console error 0 · pageerror 0. 새로 건드린 요소의 토큰 밖 색은 0이다. 머리 줄 포커스 링은 모든 Tab 정지에서 `:focus-visible` true, 2px solid rgb(0,84,70)이다 |

---

## A. ISSUE-001: /admin/settings (시스템 관리자, 1280)
DOM 전체에서 class에 `hint`가 들어간 `<p>`를 모두 모았다. 레지스트리 목록에 기대지 않았다.

| 항목 | 값 |
|---|---|
| 힌트 `<p>` 총수 | 42 |
| 그중 필드 힌트 | 41. 모두 `id="setting-{key}-hint"`가 있고, 그 id를 `aria-describedby`에 가진 요소가 정확히 1개씩이다 |
| 내보내기 안내(「설정 내보내기」 옆) | id 없음. 이 안내를 가리키는 연결은 0이고, 내보내기 버튼의 `aria-describedby`는 null이다. 범위 밖 결정대로 변경이 없다 |
| 페이지의 `[aria-describedby]` 요소 수 | 45 |
| 매달린 id 토큰 | **0** |
| 중복 id | **0** |
| 이력형 묶음 `aria-labelledby` | 7개 모두 해석된다. 각 라벨 `<p>`는 묶음 안에 있다 |

연결 요소 종류별 개수(사이트 41):
| 연결 요소 | 개수 | 예 |
|---|---|---|
| `input[type=number]` (숫자) | 13 | auth.lockout.threshold · window_minutes · tax.rounding.* · document_number.*.year_digits/seq_digits/seq_start · quote_line.max_per_revision · notify.tick.batch_max |
| `input[type=text][inputmode=decimal]` (numberKind 쉼표 칸) | 1 | fx.recent_rate.USD |
| `input[type=text]` (텍스트) | 4 | document_number.project/leave.prefix · separator |
| `select` | 7 | tax.basis_date.withholding · vat · approval_route.leave.self_approval · step1~4.role_id |
| `input[type=checkbox]` | 8 | project.force_complete.* (3) · project.customer_approval_gate · approval_route.leave.step1~4.enabled |
| `fieldset` (multi-enum) | 1 | action_log.optional_types |
| `div[role=group]` (이력형 묶음) | 7 | tax.vat.rate · other_income.rate · business_income.rate · exempt_threshold · company_borne.rate · company_borne.method · leave.annual_days |

오류 없는 상태에서 각 연결 요소의 `aria-describedby`는 힌트 id 하나였다(구분자 칸도 처음에는 `setting-document_number.project.separator-hint`).

**오류 경로.** 구분자 칸에 `#`을 입력하고 blur한 뒤 서버 액션 응답을 기다렸다.
| 항목 | 값 |
|---|---|
| `aria-describedby` | `setting-document_number.project.separator-error setting-document_number.project.separator-hint` (오류 → 힌트) |
| `aria-invalid` | `true` |
| 오류 요소 | 존재한다. 「저장 실패 · 형식 오류 · 값 확인」, 616×19.19, display block · visibility visible, rgb(155,28,28) |
| 힌트 요소 | 존재한다. 「빈칸 또는 - _ . / 중 한 글자」, 720×19.19, visible, rgb(78,93,89) |
| 오류 뒤 페이지 전체 매달린 id | 0 |
| DB | `settings_simple`에 변화 없음(저장 거부) |

## B. DR-104-03: 이력 표 값 칸 textContent
1280과 375의 결과가 같다.
| 표 caption | 값 칸 |
|---|---|
| 기타소득 원천징수 면제 기준(지급액) 이력 | **`125,000`** |
| 기타소득 원천징수율 이력 | `0.088` |
| 사업소득 원천징수율 이력 | `0.033` |
| 회사 대납 세율 이력 | `0.088` |
| 부가세율 이력 | `0.1` |
| 연차 일수 이력 | `15` |
| 회사 대납 계산 방식 이력 | `flat` |

모든 값이 DB 저장값(`settings_historized.value`)과 자릿수까지 같다. 정밀도를 잃은 숫자는 0이다.

## C. DR-104-01: 복원 줄 「복원」·「버림」 (「복사」 포함)
만든 복원 줄은 셋이다.
- (i) 상세 현재 차수: PM이 기간 종료일을 편집하고 보관한 뒤 다시 불러왔다.
- (ii) 이전 차수(1차): 같은 키 모양 `quote-ledger:dirty:{viewer}:{project}:{rev1}`의 보관본을 심어 「1차 저장 안 한 편집 1칸 · 복사 / 버림」이 떴다.
- (iii) /pnl/reserves: 메모 칸을 편집하고 보관한 뒤 다시 불러왔다.

| 줄 | 버튼 | 375 w×h | 320 w×h | 1280 w×h | 1280에서 min-width:auto 강제 |
|---|---|---|---|---|---|
| (i) 상세 현재 | 복원 | 44×44 | 44×44 | 32.33×21.19 (min-width auto) | 32.33×21.19 (같음) |
| (i) 상세 현재 | 버림 | 44×44 | 44×44 | 32.33×21.19 | 32.33×21.19 |
| (ii) 이전 차수 | 복사 | 44×44 | 44×44 | 32.33×21.19 | 32.33×21.19 |
| (ii) 이전 차수 | 버림 | 44×44 | 44×44 | 32.33×21.19 | 32.33×21.19 |
| (iii) 리저브 | 복원 | 44×44 | 44×44 | 32.33×21.19 | 32.33×21.19 |
| (iii) 리저브 | 버림 | 44×44 | 44×44 | 32.33×21.19 | 32.33×21.19 |

- 폰의 계산값: `min-width: 44px`, `min-height: 44px`.
- 1280의 계산값: `auto` / `auto`. 폰 규칙이 PC로 새지 않는다.
- 참고: 이전 차수 줄의 첫 버튼 이름은 「복원」이 아니라 「복사」다(원래 설계).

## D. DR-104-02: 「일괄 저장」 kbd `Ctrl+S` (PM, 상세, 1280)
| 상태 | 버튼 면 | kbd 글자 | kbd opacity(누적) | kbd 테두리 | 합성 대비 |
|---|---|---|---|---|---|
| 편집 없음(`aria-disabled="true"`) | rgb(243,247,245) = --surface | rgb(95,110,106) = --faint | 1 (조상 opacity 전부 1) | rgb(207,219,215) = --line 계산값 | **4.951** |
| 편집 1개(「일괄 저장 1」, 활성) | rgb(0,84,70) = --accent | rgb(255,255,255) | 0.8 (kbd만 0.8) | rgba(255,255,255,0.5) = --on-accent-weak 계산값 | 6.323 |

- 대비 계산: 글자색 × 누적 opacity를 버튼부터 위로 찾은 첫 불투명 배경과 합성해 WCAG 공식을 적용했다.
- 다른 비활성 1차 버튼(/pnl/reserves 「일괄 저장」, 편집 없음): 면 rgb(243,247,245), kbd rgb(95,110,106), opacity 1, 테두리 rgb(207,219,215), 대비 **4.951**. 회귀 없음.
- 리저브에서 편집 직후(≈0.9초) 잰 값은 과도 상태였다: 면 rgb(142,179,172), kbd 대비 1.82. `transition: background-color .12s, color .12s` 중간값이다. 1.5초 뒤 다시 재니 면 rgb(0,84,70), kbd rgb(255,255,255), opacity 0.8, 테두리 rgba(255,255,255,0.5)로 정상이었다. 결함 아님.

## E. DR-104-04: 「번호」 칸 (PM, 1280)
토큰 계산값: --fs-xs = 11px, --faint = rgb(95,110,106).
| 표 | 행 | span font-size | span color | span 폭 (min-width) | td text-align · fvn · white-space | th |
|---|---|---|---|---|---|---|
| 현재 격자(견적 줄, 2차) | 12 (1~12) | 11px (12행 모두) | rgb(95,110,106) (12행 모두) | 28 (28px) | right · tabular-nums · nowrap (td font-size 14px 유지) | 12px · rgb(0,33,28) · 600 · right |
| 이전 차수 읽기 표(상세 견적 1차 견적 줄) | 12 (1~12) | 11px | rgb(95,110,106) | 28 (28px) | right · tabular-nums · nowrap | 12px · rgb(78,93,89) · 600 · right |

- 오른쪽 끝: span의 right와 글자 Range의 right가 두 표 모두 12행이 93.640625로 같다(차이 0, 기준 ±0.5).
- th는 11px도 --faint도 아니다. 달라지지 않았다.
- 1024: 두 표 모두 「번호」 th가 `display:none`, 폭 0이다(`collapseBelow: 1280` 접힘 유지). 같은 표의 「소분류」(`collapseBelow: 1024`)는 보인다.

## F. DR-104-05: 머리 줄 버튼 순서
- 보이는 순서: (round(y), x)로 정렬했다.
- Tab 순서: 머리 줄 바로 앞의 포커스 가능 요소(`BUTTON#pre-estimate-open`)에 포커스한 뒤 실제 Tab 키로 순회하며 activeElement를 기록했다.
- 모든 경우 편집 1개를 해서 「일괄 저장 1」이 보이게 했다. 폰에서는 「더보기」를 펼쳤다. 측정은 수화 뒤에 했다.

| 계정 | 폭 | 보이는 순서 | DOM 순서 | Tab 순서 | 높이 |
|---|---|---|---|---|---|
| 관리자 | 375 | 상태 바꾸기 → 일괄 저장 1 → 더보기 → 복사해 새 차수 → 프로젝트 복사 | 같음 | 같음 | 44 ×5 |
| 관리자 | 320 | 상태 바꾸기 → 일괄 저장 1 → 더보기 → 복사해 새 차수 → 프로젝트 복사 | 같음 | 같음 | 44 ×5 |
| 관리자 | 1280 | 복사해 새 차수 → 프로젝트 복사 → 상태 바꾸기 → 일괄 저장 1 | 같음 | 같음 | 32 ×4, 더보기 없음 |
| 관리자 | 700 | 복사해 새 차수 → 프로젝트 복사 → 상태 바꾸기 → 일괄 저장 1 | 같음 | 같음 | 32 ×4, 더보기 없음 |
| 팀장 | 375 · 320 | 상태 바꾸기 → 일괄 저장 1 (더보기 · 복사 묶음 없음) | 같음 | 같음 | 44 ×2 |
| 팀장 | 1280 · 700 | 상태 바꾸기 → 일괄 저장 1 | 같음 | 같음 | 32 ×2 |
| PM | 375 · 320 | 일괄 저장 1 → 더보기 → 복사해 새 차수 → 프로젝트 복사 (상태 바꾸기 없음) | 같음 | 같음 | 44 ×4 |
| PM | 1280 · 700 | 복사해 새 차수 → 프로젝트 복사 → 일괄 저장 1 | 같음 | 같음 | 32 ×3 |

- 관리자 375의 좌표: 상태(14,253) · 저장(14,309) · 더보기(152.4,309) · 복사해 새 차수(14,365) · 프로젝트 복사(118.1,365).
- 변경 전 기록(`docs/reviews/phase-04/pr104-design-review.md` DR-104-05)의 보이는 순서는 「상태 바꾸기 → 일괄 저장 → 더보기 → 복사해 새 차수 → 프로젝트 복사」다. 이번 측정과 **같다**. y 절대값은 데이터가 달라 다르다(278/334/390 → 253/309/365). 줄 간격 56은 같다.
- PC 순서(복사 묶음이 앞)는 변경 전 DOM 순서와 같다.

**수화 전(JS 끔, 375 · 320).**
- 상세 본문은 스트리밍 Suspense 완료 조각이라 JS 없이는 `<div hidden>` 안에 남는다(모든 상자 0×0). 그 조각의 `hidden`만 풀어 레이아웃을 쟀다.
- 이때 DOM 순서는 PC 순서 [더보기, 상태 바꾸기, 일괄 저장]이다.
- 계산된 `order`는 moreToggle 1 · copyActions 2(display:none, 접힘) · 상태 0 · 저장 0이다.
- 따라서 보이는 순서는 **상태 바꾸기 → 일괄 저장 → 더보기**로 기대대로 맞다. 높이는 44다.
- 수화 전에는 DOM 순서와 보이는 순서가 다르다. 코드 주석이 밝힌 설계대로다(수화 뒤 재배치).

## G. 회귀
**가로 넘침: scrollWidth ≤ innerWidth.** 55개 측정 전부 같은 값(넘침 0)이다.
| 화면 | 1280 | 1024 | 700 | 375 | 320 |
|---|---|---|---|---|---|
| /admin/settings | 1280 | 1024 | 700 | 375 | 320 |
| 상세, PM, 복원 줄 2개 표시 | 1280 | 1024 | 700 | 375 | 320 |
| 상세, PM, 이전 차수 읽기 표 열림 | 1280 | 1024 | 700 | 375 | 320 |
| 상세, 관리자 · 팀장 · PM, 편집 1개 | 1280 | 1024 | 700 | 375 | 320 |
| /pnl/reserves, 복원 줄 표시 | 1280 | 1024 | 700 | 375 | 320 |
| /projects 목록 | 1280 | 1024 | 700 | 375 | 320 |

**console error · pageerror:** 모든 스크립트, 모든 페이지에서 0 / 0.

**토큰 밖 색.** 비교 기준은 :root 사용자 정의 속성 전부를 계산값으로 푼 집합이다.
| 대상 | 측정 수 | 토큰 밖 |
|---|---|---|
| 설정 힌트 · 오류 `<p>` (color · background · border-top) | 42 | 0 |
| 「번호」 span color | 24 | 0 |
| 복원 줄 버튼 color | 6 | 0 |

kbd 값은 모두 토큰 계산값과 같다(D 표 참고).

**포커스 링.** 머리 줄 Tab 정지 전부에서 `:focus-visible`이 true이고 outline은 `solid 2px rgb(0,84,70)`이다. 3계정 × 4폭 모두 같다.

## 사용 데이터
| 항목 | 값 |
|---|---|
| 프로젝트 | `5837b485-fbfd-49f7-9dba-c29a111660df` (`DOM감사-…`), 1차 `925e9fcc-…`, 2차(현재) `9a896713-…`, 12줄 |
| 계정 | 시스템 관리자 `eQLqedGc…`, 팀장 `35z3LgVx…`, PM `Hm0kL0pf…` (email `dom-audit-*@example.test`), 같은 팀 |
| 리저브 | `DOM감사리저브-…` 거래처에 입금 1줄 (감사 뒤 삭제) |

## 정리 · 복원 기록 (감사 시작 2026-09-30T16:58:53.914Z)
- **설정 스냅샷 비교.** `settings_simple` 42행, `settings_historized` 7행, `approval_routes` 0행의 감사 전후 CSV를 diff한 결과 차이가 **0**이다(value · updated_by · updated_at 포함). 설정 화면에서 Tab 순회를 하지 않았고, 구분자 `#`은 서버가 거부해 저장되지 않았다. 복원할 값은 없었다.
- **삭제 (시작 시각 이후, 모두 감사 계정 것).**
  - `action_log` 21행: login 13 · document_create 7 · document_update 1. 다른 행위자 것은 0이다.
  - `sessions` 13행.
  - `login_attempts` 13행.
  - 감사가 넣은 `reserve_entries` 1행.
  - 삭제 뒤 세 표 모두 시작 시각 이후 행 0이다.
- **남긴 것.** 감사 계정 3 · 조직/팀 · 거래처 2 · 프로젝트 1(차수 2, 줄 24)은 erp_test 픽스처로 남겼다. 다른 E2E와 겹치지 않는 고유 이름이다.
- **localStorage 보관본.** 각 브라우저 컨텍스트에서 지우고 닫았다. 저장 동작은 하지 않았다.
- **복원 불가.** `rate_limits`(better-auth 창 카운터, 2행: `/sign-in/email` · `/get-session`)는 감사 중 로그인으로 카운트와 last_request가 갱신됐다. 원래 값을 스냅샷하지 않아 되돌리지 못했다. 창이 지나면 사라지는 일시 값이라 기능 영향은 없다.
- **서버.** PID 11090(pnpm) · 11108(sh) · 11109(next-server)를 PID로 종료했다. 3100 포트가 응답하지 않는 것을 확인했다.
