# QA Report: PLANT8 ERP — PR #112 F(2) PR #104 후속 (quick 260930-kc9 + /review F1·F2·F3)

| Field | Value |
|-------|-------|
| **Date** | 2026-09-30 |
| **URL** | http://127.0.0.1:3100 (로컬 프로덕션 빌드 — `CI=true pnpm build`(종료 0) → `pnpm start -p 3100`, DB `erp_test`, env는 playwright.config.ts webServer와 같게: `DATABASE_URL=…/erp_test` · `BETTER_AUTH_URL=http://127.0.0.1:3100` · `APP_ENV=local` · 무작위 `BETTER_AUTH_SECRET`/`APP_DATA_KEY_v1` · `RATE_LIMIT_LOGIN_MAX=1000`) |
| **Branch** | claude/pr104-followup-f2 |
| **Commit** | 9236684 |
| **PR** | #112 |
| **Tier** | Standard (보고 전용 — 수정 없음) |
| **Mode** | diff-aware — f3242c8..9236684 (3d6cd6c · dba328b · 551165f · 9545a21 · 8296041 · 4d23611 · 688695e · 08837eb · a2c0dae 등 화면 변경분) |
| **Driver** | gstack 헤드리스 `$B`(Aside 없음 · `PLAYWRIGHT_BROWSERS_PATH`를 스크래치패드 심으로 돌려 설치된 headless_shell 1194 사용) + DOM 수치는 Playwright 임시 스크립트(Chromium `/opt/pw-browsers/chromium`, 스크래치패드, 저장소 밖). 판정은 getBoundingClientRect·getComputedStyle·scrollWidth·textContent·aria 속성·document.activeElement·DB·서버 로그만 |
| **Pages visited** | /admin/settings(1280·1024·700·375·320) · /projects/[id](1280·1024·701·699·390·375·320) · /projects(1280·375) · /pnl/reserves(1280·375·320) · /account(1280, TextField 회귀 가드) |
| **Framework** | Next.js 16.3.5 (App Router) |
| **Users** | E2E 픽스처 방식(createAccount + assignTeam, 같은 팀)으로 만든 QA 계정 4개 — 시스템 관리자 · 팀장 · PM · 재무(reserves.spec `createRoles` finance와 같은 권한의 임시 계급, 팀 없음). 비밀번호 [REDACTED] |
| **Data** | 프로젝트 1개(PM 담당, 1차 12줄 → `createRevisionFromCurrent`로 2차 = 현재 차수), 리저브 입금 1줄. 이력형 설정은 시드값 그대로 |

## Health Score

| | Baseline |
|---|---|
| **Score** | **100** (provisional) |

| Category | Weight | Baseline |
|----------|--------|----------|
| Console | 15% | 100 (앱 오류 0) |
| Links | 10% | 미측정(제외) |
| Visual | 10% | 100 |
| Functional | 20% | 100 |
| UX | 15% | 100 |
| Performance | 10% | 미측정(제외) |
| Content | 5% | 100 |
| Accessibility | 15% | 100 |

측정 범위: 링크·성능은 diff 범위 밖(provisional, 가중치 0.80 기준). (15+10+20+15+5+15)/0.80 = 100.

## 필수 확인

| # | 확인 | 결과 | 수치 근거 |
|---|---|---|---|
| 1a | ISSUE-001 설정 힌트 연결(시스템 관리자) | **PASS** | SETTING_DEFS 중 hint 있는 키 41개 전부: `[id="setting-{key}-hint"]` 정확히 1개 · textContent = def.hint · `aria-describedby~=` 연결 요소 정확히 1개 · 오류 없을 때 값 = 힌트 id 하나. 연결 요소 종류: input[number] 13 · input[text] 5(쉼표 decimal 1 포함) · select 7 · input[checkbox] 8 · fieldset 1 · div[role=group] 7. 이력 묶음 7개 `aria-labelledby`는 모두 해석되고 라벨 `<p>`가 묶음 안. 페이지 전체 매달린 id 0 · 중복 id 0. 1280·375 같음 |
| 1b | ISSUE-001 오류 경로 | **PASS** | 구분자 칸 `#` 입력 → blur → 서버 액션 응답 200 뒤: `aria-describedby` = `setting-document_number.project.separator-error setting-document_number.project.separator-hint`(오류 → 힌트), `aria-invalid=true`, 오류 「저장 실패 · 형식 오류 · 값 확인」 visible h 19.19, 힌트 「빈칸 또는 - _ . / 중 한 글자」 visible h 19.19. DB 값 `""` 그대로(거부). 빈칸으로 되돌린 뒤 describedby = 힌트 id 하나, aria-invalid 없음 |
| 1c | 「설정 내보내기」 안내(범위 밖 불변) | **PASS** | 내보내기 버튼 `aria-describedby` null, 안내 줄 연결 0 |
| 1d | DR-104-03 이력 쉼표 | **PASS** | 2000-01-01 행 값 칸: 면제 기준 `125,000` · 기타소득 원천징수율 `0.088` · 부가세율 `0.1`(참고: 사업소득 `0.033` · 회사 대납 세율 `0.088` · 연차 `15` · 계산 방식 `flat`). 1280·375 같음 |
| 1e | 설정 복원 줄 폰 44(리뷰 F2) | **PASS** | 「2단 담당 계급」 role-division-head → role-ceo, 보관 1건 → 재로드 → 「저장 안 한 편집 2단」. 375·320: 복원 44×44 · 버림 44×44(min 44px/44px), 겹침 0. 1280: 32.33×21.19(min auto/auto — 폰 규칙 새지 않음, 다른 복원 줄 1280 치수와 같음). 넘침 0. 「버림」으로 정리 뒤 값 원래대로, 보관 0 |
| 2a | DR-104-04 「번호」 칸(PM, 1280) | **PASS** | 현재 격자 · 이전 차수(1차) 읽기 표 각 12행(1~12): span 11px · weight 600 · line-height 15.4px · rgb(95,110,106) · min-width 28px(폭 28). td right · tabular-nums · nowrap · 14px. th 12px · 600 · right, 색 rgb(0,33,28)/rgb(78,93,89)(faint 아님). 글자 Range 오른쪽 끝 24행 모두 95.828(한 자리·두 자리 차이 0) |
| 2b | DR-104-04 1024 접힘 | **PASS** | 두 표 「번호」 th `display:none` · 폭 0(기존 collapseBelow 1280 그대로), 넘침 0 |
| 2c | DR-104-02 비활성 kbd(PM, 편집 없음) | **PASS** | 1280·1024: `aria-disabled=true`, kbd `Ctrl+S` opacity 1(조상 누적 1) · border-top rgb(207,219,215) · color rgb(95,110,106), 버튼 면 rgb(243,247,245). 대비 = (L(#5F6E6A 합성, α=1)+0.05)/… WCAG 상대 휘도식 → **4.951** ≥ 4.5. 리저브 비활성 「일괄 저장」 kbd도 같은 값 |
| 2d | DR-104-02 활성 kbd 불변 | **PASS** | 기간 편집 뒤 「일괄 저장 1」: aria-disabled 없음, kbd opacity 0.8 · border rgba(255,255,255,0.5) · color #fff, 면 rgb(0,84,70) |
| 2e | DR-104-01 상세 복원 줄 | **PASS** | 기간 편집 → `quote-ledger:dirty:{viewer}:{project}:{rev2}` 1건 → 375 재로드 → main 「저장 안 한 편집 1칸 · 복원 / 버림」. 375·320: 44×44 · 44×44(min 44px). 1280: 32.33×21.19(min auto). 넘침 0 |
| 2f | DR-104-01 이전 차수 보관 줄 | **PASS** | 격자 칸 편집 보관본을 1차 키로 옮겨 「1차 저장 안 한 편집 1칸 · 복사 / 버림」 표시. 375·320: 복사 44×44 · 버림 44×44. 1280: 32.33×21.19(min auto). 넘침 0 |
| 2g | DR-104-05 폰 머리 줄 순서(관리자, 기간 편집 + 더보기 펼침) | **PASS** | 375·320·390 모두 보이는 순서(y,x) = DOM 순서 = [상태 바꾸기, 일괄 저장, 더보기, 복사해 새 차수, 프로젝트 복사]. 좌표 상태 79.4×44(14,253) · 저장 126.4×44(14,309) · 더보기 56.5×44(152.4,309) · 새 차수 92.1×44(14,365) · 프로젝트 복사 89.5×44(118.1,365). 겹침 0, 넘침 0 |
| 2h | DR-104-05 Tab 순서 | **PASS** | 375: 상태 바꾸기 focus 뒤 Tab×4 = BUTTON 일괄 저장 1 → BUTTON 더보기 → BUTTON 복사해 새 차수 → A 프로젝트 복사. 1280: 복사해 새 차수 focus 뒤 Tab×3 = A 프로젝트 복사 → BUTTON 상태 바꾸기 → BUTTON 일괄 저장 1. 1280 높이 전부 32, 더보기 숨김 |
| 2i | DR-104-05 700 넘나들기 | **PASS** | 폭 1280 → 701 → 699 → 375 → 1280 → 375: 699·375에서 더보기 보임 · `aria-expanded=true` 유지, 복사 묶음 보임. 1280·701에서 더보기 숨김 · 복사 묶음 보임. 넘침 0, 콘솔 오류 0 |
| 3 | 리저브 복원 줄(재무) | **PASS** | 1280에서 메모 칸 편집 → 보관 1건 → 375 재로드. 375·320: 복원 44×44 · 버림 44×44(min 44px), 겹침 0. 1280: 32.33×21.19(min auto). 넘침 0. 「버림」 뒤 보관 0 |
| 4a | 가로 넘침 | **PASS** | 설정 1280·1024·700·375·320, 상세 1280·1024·701·699·390·375·320, 리저브 1280·375·320, 목록 1280·375 — 전부 scrollWidth = innerWidth |
| 4b | 콘솔 · pageerror | **PASS — 0** | Playwright console error/pageerror 수집 전 스크립트 0. `$B console --errors`(관리자, 설정·상세·목록 × 1280·375): 「no console errors」 |
| 4c | 서버 로그 | **PASS** | 측정 서버 로그 `"severity":"ERROR"` 0줄, WARN 0줄. 참고 E2E 실행 로그도 ERROR 0 |
| 4d | TextField 회귀 가드(hintId 없는 곳 — /account 비밀번호 변경) | **PASS** | 오류 없을 때 `#currentPassword`·`#newPassword` `aria-describedby` null. 새 비밀번호 `a` 제출 뒤 `#newPassword` = `newPassword-error` 하나(글자 「8자 미만 · 8자 이상으로」), aria-invalid=true. 프로젝트 등록 폼은 TextField를 쓰지 않아 /account로 대체 |

### 참고 E2E(판정 보조)

| 명령 | 종료 | 결과 |
|---|---|---|
| `CI=true pnpm build` | 0 | — |
| `CI=true pnpm exec playwright test test/e2e/{settings,mobile-touch-targets,reserves,quote-revisions,settings-approval-route}.spec.ts -g "ISSUE-001\|DR-104"` | 1 | mobile-375가 desktop에 의존해 **desktop 전체**가 돌았다: 533 passed · 1 failed · 73 did not run. 대상 desktop 테스트(settings ISSUE-001 ×3 · DR-104-03, quote-revisions DR-104-02 · DR-104-04, reserves DR-104-01) 전부 통과. 실패 1건은 범위 밖(아래 관찰 1) |
| `… mobile-touch-targets.spec.ts -g "DR-104" --project=mobile-375 --no-deps` | 0 | 2 passed |
| `… settings-approval-route.spec.ts -g "DR-104" --project=desktop-settings --no-deps` | 0 | 1 passed |
| `… reserves.spec.ts:1012 --project=desktop`(이 브랜치, 단독 재실행) | 1 | 1 failed(시간 초과 90s) |
| 같은 테스트를 origin/main 9d695fc 트리(스크래치패드에 `git archive`, 오프라인 설치 · 빌드)에서 | 1 | 1 failed(시간 초과 1.5m) — main에서도 같게 실패 |
| 오케스트레이터 재확인: `CI=true pnpm exec playwright test test/e2e/{settings,quote-revisions,reserves,mobile-touch-targets,settings-approval-route}.spec.ts -g "ISSUE-001\|DR-104" --no-deps` | 0 | 11 passed(46.7s) — 측정 에이전트 보고와 독립으로 대상 테스트 전부 확인. 300줄 테스트(reserves.spec.ts:1012)는 #85(ca7ead0)부터 있던 테스트이고 이 PR의 reserves.spec 변경은 1082행 뒤 추가뿐 |

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 0 |
| **Total** | **0** |

## Issues

없음. must_haves(PLAN 40-50행)와 /review F1(line-height 15.4px)·F2(설정 복원 줄 44) 기대치가 전부 수치로 맞았다.

| Field | Value |
|-------|-------|
| **Fix Status** | 해당 없음(새 이슈 0 — 수정 커밋 없음) |

## 관찰 · 참고(결함 아님)

1. **범위 밖 E2E 시간 초과** — `test/e2e/reserves.spec.ts:1012` 「(Codex #4) 보낼 줄 300 상한」이 이 로컬 환경에서 90s 시간 초과로 떨어진다(전체 실행 중 `expect(dataRows).toHaveCount(300)` 대기, 단독 재실행도 실패). 같은 테스트가 **origin/main(9d695fc)에서도 똑같이 실패**해 PR #112 회귀가 아니다(PR의 리저브 변경은 `reserves.module.css` 폰 미디어 쿼리 min-width 한 줄). 테스트 주석이 밝힌 300줄 편집 표 다시 그리기 비용 × 이 컨테이너 CPU로 추정. ready 전환 뒤 CI 전체 E2E에서 확인 필요 — 거기서도 빨가면 별건으로 다룬다.
2. **D1(알려진 사항, 사용자 결정 대기)** — 확인 창을 연 채 700을 넘나드는 경우는 이번에 재지 않았다(새 이슈로 올리지 않음).
3. 설정 칸을 같은 값(`""`)으로 다시 blur하면 서버가 저장해 `settings_simple.updated_at`·`updated_by`가 바뀐다(값 불변). diff 밖 기존 blur 저장 동작 — 측정 뒤 두 칸을 원래 값으로 되돌렸다.
4. 이전 차수 보관 줄의 첫 버튼은 「복원」이 아니라 「복사」다(원래 설계, DOM 감사와 같음).
5. 수화 전(JS 없음) 폰 머리 줄 순서는 이번에 다시 재지 않았다 — 260930-kc9 DOM 감사(F절)의 측정을 따른다.

## 설정 복원 · 정리

- 측정 전후 `settings_simple`(42행) · `settings_historized`(7행) · `approval_routes`(0행) CSV 비교: 구분자 행의 updated_at/updated_by만 달라져(관찰 3) 원래 값으로 되돌렸고, 다시 비교해 차이 0.
- localStorage 보관본(상세·이전 차수·리저브·설정 결재선)은 각 컨텍스트에서 「버림」 또는 직접 지우고 닫았다. 저장 동작은 하지 않았다.
- 측정 뒤 참고 E2E의 globalSetup이 erp_test를 비우고 다시 만들었다(QA 계정·데이터 포함 전부 사라짐).
- 측정 서버(pnpm 5274 · sh 5287 · next-server 5288)는 PID로 종료, `$B` 데몬은 `browse stop`. E2E webServer는 Playwright가 종료. 마지막에 3100 응답 없음 확인.
- 저장소 쓰기는 이 보고서 한 파일(커밋 안 함). 임시 스크립트·로그·원자료 JSON·심은 스크래치패드 `qa/`, main 비교 트리는 지웠다.

## PR 요약

PR #112 /qa(Standard, 보고 전용): ISSUE-001 · DR-104-01~05 · 리뷰 F1·F2 전부 DOM 수치로 PASS, 새 이슈 0, Health 100(provisional). 범위 밖 reserves 300줄 E2E 시간 초과는 main에서도 같게 재현.
