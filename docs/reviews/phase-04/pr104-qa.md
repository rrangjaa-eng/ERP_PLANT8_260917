# QA Report: PLANT8 ERP — PR #104 자체 커밋 (quick 260930-4xr 뒤)

| Field | Value |
|-------|-------|
| **Date** | 2026-09-30 |
| **URL** | http://127.0.0.1:3100 (로컬 프로덕션 빌드 — `CI=true pnpm build`(종료 0) → `pnpm start -p 3100`, DB `erp_test`, env는 playwright.config.ts webServer와 같게) |
| **Branch** | claude/gsd-verify-work-4 |
| **Commit** | 기준 c5d0c9d · 지난 /qa fd64b7d2 |
| **PR** | #104 |
| **Tier** | Standard (보고 전용 — 수정 없음) |
| **Mode** | diff-aware — c1180ca · 43dd5de · 0aaa91a · a456205 · e9b7796 · 0149cc6 |
| **Driver** | gstack 헤드리스 `$B`(Aside 없음 · `PLAYWRIGHT_BROWSERS_PATH`를 스크래치패드 심(shim)으로 돌려 설치된 headless_shell 1194 사용) + DOM 수치는 Playwright 임시 스크립트(스크래치패드, 저장소 밖). 판정은 getBoundingClientRect·getComputedStyle·scrollWidth·textContent·DB·서버 로그만 |
| **Pages visited** | /projects · /projects?new=1 · /projects/[id](줄 0 · 줄 12 + 2차) · /admin/settings — 각 1280·375, 상세·목록은 320·700 추가 |
| **Framework** | Next.js 16.3.5 (App Router) |
| **Users** | E2E 픽스처 방식(createAccount + assignTeam)으로 만든 QA 계정 3개 — 시스템 관리자 · 팀장(QA팀) · PM(QA팀). 비밀번호 [REDACTED] |

## Health Score

| | Baseline |
|---|---|
| **Score** | **99** (provisional) |

| Category | Weight | Baseline |
|----------|--------|----------|
| Console | 15% | 100 (앱 오류 0) |
| Links | 10% | 미측정(제외) |
| Visual | 10% | 100 |
| Functional | 20% | 100 |
| UX | 15% | 97 (−3 ISSUE-002) |
| Performance | 10% | 미측정(제외) |
| Content | 5% | 100 |
| Accessibility | 15% | 97 (−3 ISSUE-001) |

측정 범위: 링크·성능은 diff 범위 밖(provisional, 가중치 0.80 기준). (15+10+20+14.55+5+14.55)/0.80 = 98.9 → 99.

## 필수 확인

| # | 확인 | 결과 | 수치 근거 |
|---|---|---|---|
| 1a | 상세 머리 줄 폰 44 — PM(「더보기」 펼침 + 기간 끝 날짜 바꿔 「일괄 저장 1」 띄움) | **PASS** | 375·320 모두: 일괄 저장 126.4×44 · 더보기 56.5×44 · 복사해 새 차수 92.1×44 · 프로젝트 복사(a) 89.5×44. 겹침 0쌍, scrollWidth 375/320 = innerWidth |
| 1b | 상세 머리 줄 폰 44 — 팀장(「상태 바꾸기」, 기간 바꿔 「일괄 저장 1」 동시) | **PASS** | 375·320: 상태 바꾸기 79.4×44(y 253) · 일괄 저장 126.4×44(y 309), 겹침 0, 넘침 0 |
| 1c | PC 1280·700 치수 불변 | **PASS** | 1280: 복사해 새 차수 92.3×32 · 프로젝트 복사 89.6×32 · 일괄 저장 126.6×32 · 상태 바꾸기 79.5×32, 「더보기」 렌더 안 됨. 700: 같은 버튼 전부 h 32, 겹침 0, 넘침 0 |
| 1d | 목록 `/projects` 폰 정렬 머리글 ≥44×44 | **PASS** | 375: 프로젝트명 189.6×44 · 견적 65.7×44(justify flex-end), 셀 높이 45. 320: 157×44 · 52.7×44. 1280: 링크 높이 19.2(기존 19.19 그대로), 셀 32.2. 넘침 0 |
| 2a | 설정 힌트 문구 | **PASS** | `p.hint` textContent = `빈칸 또는 - _ . / 중 한 글자`(정확 일치), 1280·375 모두 |
| 2b | 힌트 ↔ 칸 aria-describedby | **FAIL (ISSUE-001, low)** | 힌트 `<p>`에 id 없음, 칸 `aria-describedby`는 오류 없을 때 null, 오류 때 `…separator-error` 하나뿐 |
| 2c | 허용 값 저장 · 허용 밖 거부 표시 | **PASS** | `-` → DB `"-"`, 오류 없음. `#`·`ab`·` `(공백) → 칸 `aria-invalid=true`, `aria-describedby`가 가리키는 글자 「저장 실패 · 형식 오류 · 값 확인」, 칸 아래 4px, DB `"-"` 그대로. `""` → DB `""`, 오류 해제. 포커스는 blur 저장 모델대로 다음 칸(seq_start)으로 가 있다(다른 설정 칸과 같음) |
| 3a | 허용 밖 저장값(`#`)에서 PM 등록 | **PASS** | DB에 `"#"` 직접 넣은 뒤 PM 등록 2회 → 번호 `26002`·`26003`(빈 구분자), 막힘 없음 |
| 3b | 서버 로그 | **PASS** | `{"severity":"ERROR","event":"settings.invalid_stored_value","key":"document_number.project.separator","issues":["invalid_format"]}` — 읽기마다 1줄(등록·설정 화면·내보내기). 로그 전체에 `#` 문자 0회 |
| 3c | 설정 화면 표시 | 관찰 → ISSUE-002(low) | 칸 value `""`, aria-invalid 없음, 추가 안내 없음 — DB는 `"#"`인데 화면은 빈칸 |
| 3d | 설정 내보내기 | 관찰 | 내보낸 JSON의 `document_number.project.separator` = `""`(저장값 `#`가 아니라 대체값) |
| 3e | 복원 | **PASS** | `update … value='""'` 뒤 `select` = `""`. 복원 뒤 등록 → `26004`, `settings.invalid_stored_value` 로그 0줄 |
| 4a | 등록 거부 시 첫 오류 칸 포커스 | **PASS** | 프로젝트명 비우고 제출 → `document.activeElement` = `INPUT#name`(label 「프로젝트명」, aria-invalid=true), 오류 「프로젝트명 필요 · 프로젝트명 입력」 |
| 4b | 견적 표 「번호」 열 숫자 규칙 | **PASS** | 현재 차수(견적 줄) · 이전 차수(상세 견적 1차 견적 줄) 1280: th·td `text-align: right` · `font-variant-numeric: tabular-nums` · `white-space: nowrap`(`.alignRight`), 12줄의 숫자 오른쪽 끝 전부 81.5(한 자리·두 자리 정렬 일치). 1024에서는 기존대로 접힘(rect 0), 넘침 0 |
| 5 | 영향 화면 콘솔 오류 | **PASS — 0** | `$B console --errors`: PM 흐름(목록·등록·상세 2개 × 1280·375 + 폰 머리 줄 조작) 「no console errors」, 관리자 설정 1280·375 앱 오류 0(415 1건은 감사자가 js로 부른 로그아웃 fetch — 제외). Playwright console/pageerror 수집도 전 스크립트 0 |

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 2 |
| **Total** | **2** |

## Issues

### ISSUE-001: 설정 칸 힌트가 칸과 aria-describedby로 이어지지 않음

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | accessibility |
| **URL** | /admin/settings 「프로젝트 번호 구분자」 (같은 구조의 설정 칸 전부) |
| **Fix Status** | 미수정(보고 전용) · NEEDS-USER-DECISION |

재현: 시스템 관리자로 /admin/settings → `#setting-document_number.project.separator`의 `aria-describedby` = null. 힌트 `<p class="settings-module__…__hint">빈칸 또는 - _ . / 중 한 글자</p>`는 id 없음(`[aria-describedby~=…]` 참조 0). 허용 밖 값 저장 뒤에는 `aria-describedby`가 오류 `<p>` 하나만 가리켜, 스크린 리더는 「형식 오류 · 값 확인」만 듣고 허용 글자(e9b7796이 힌트에 넣은 것)는 칸 포커스로 듣지 못한다. 시각 사용자는 힌트가 칸 바로 아래(26px)에 있어 영향 없음.
원인 추정: `app/(app)/admin/settings/settings-form-client.tsx:189-200` — 힌트를 TextField 밖 형제 `<p>`로 그리고, `ui/input/TextField.tsx:45-46`은 `aria-describedby`를 오류 id로만 채운다. diff 밖의 기존 패턴(설정 칸 전부 같음).
추천: 힌트에 `id={`setting-${fieldKey}-hint`}`를 주고 TextField가 오류 id와 힌트 id를 함께 `aria-describedby`에 넣게(공유 컴포넌트 변경이라 설정 칸 전부에 적용될지 결정 필요).

### ISSUE-002: 허용 밖 저장값이 설정 화면에서 조용히 빈칸으로 보임

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Category** | ux |
| **URL** | /admin/settings, 설정 내보내기 |
| **Fix Status** | 미수정(보고 전용) · NEEDS-USER-DECISION |

재현: DB `settings_simple`의 `document_number.project.separator`를 `"#"`로 → /admin/settings 칸 value `""`, aria-invalid 없음, 안내 없음. 내보내기 JSON도 `""`. 서버 로그에는 ERROR 1줄씩 남는다(3b). 관리자는 화면만으로는 저장값이 잘못됐다는 것을 모르고, 채번은 빈 구분자로 계속된다(a456205가 의도한 동작). 칸을 한 번 포커스했다 떠나면 `""`가 저장돼 DB가 고쳐진다.
원인: `domain/settings/registry.ts` `parseStoredSimpleValue`(a456205)가 읽기 경로 전체(설정 화면 `app/(app)/admin/settings/page.tsx:93` getSettingValue, `domain/settings/export.ts:61`)에 똑같이 적용된다 — 설계대로.
선택지: (a) 그대로(로그 경보로 충분) (b) 설정 화면에서만 원값 무효를 표시(예: 칸 오류 「저장값 무효 · 빈칸으로 사용 중」) (c) 내보내기만 원값 유지. 추천 (a) 또는 (b) — 사용자 결정 사항(2026-09-30 [지시] 5903477924 범위 밖).

## 참고(결함 아님)

- 첫 등록 스크립트 직후 서버에 `⨯ Error: The destination stream closed early.` 1줄 — 감사 스크립트가 상세로 이동한 직후 브라우저 컨텍스트를 닫아 RSC 스트림이 끊긴 것. 같은 등록을 네트워크 유휴까지 기다려 다시 하니(26003·26004) 재현 0 → 감사 도구 부산물.
- 설정 거부 문구가 허용 글자를 말하지 않는 것(「형식 오류 · 값 확인」)은 c1180ca의 사용자 결정대로.
- 폰에서 팀장 머리 줄은 「상태 바꾸기」와 「일괄 저장」이 세로로 쌓인다(y 253 → 309, 간격 12) — 겹침 없음.

## 설정 복원 · 정리

- `document_number.project.separator` = `""` 복원, DB 재조회 확인.
- 서버(pnpm 5936 · sh 5971 · next-server 5972 · 셸 5931)와 `$B` 데몬은 PID로 종료.
- 저장소 쓰기는 이 보고서 한 파일(커밋 안 함). 임시 스크립트·로그·심은 스크래치패드 `qa/`.

## 오케스트레이터 판정 (세션 57f75736)

- 감사는 독립 에이전트(Opus)가 보고 전용으로 했다. 수정 루프(Phase 8)는 돌리지 않았다 — Standard 기준에서 low 2건은 보류 대상이고, 둘 다 새 결정이 필요하다. **코드 변경 없음.**
- 직접 대조: ISSUE-001의 원인 `ui/input/TextField.tsx`(`aria-describedby`는 오류 id만)와 `settings-form-client.tsx`(힌트 `<p>`에 id 없음)를 소스로 확인했다. ISSUE-002는 /review 3차 E5, 그리고 세션 21099081의 판단(관리자 화면에 대체 안내 문구를 넣지 않음)과 같은 내용이라 결정 E와 함께 올린다.
- 4a의 포커스 대상이 `/design-review`(`#clientId`)와 다르게 나온 것은 비운 칸이 달랐기 때문이다. 폼 순서는 클라이언트(`project-form.tsx:262`) → 프로젝트명(:272)이므로 둘 다 「첫 오류 칸」 동작과 맞다.
- 게이트 기록: 훅이 `.claude/gates/phase-02.log`(미추적, 커밋 안 함)에 잘못 적었다. `phase-04.log`에 들어갈 줄은 `qa 2026-09-30T07:22Z session=57f75736-d48b-5e58-8e64-ee5f1ff3f28d`이다(사용자가 적는다).
