---
phase: quick-261001-3uq
plan: 01
status: complete
subsystem: tooling
tags: [codex, design-review, gstack, session-hooks, rule-guard]
key-files:
  created:
    - scripts/install-codex.sh
    - scripts/codex-design-review.sh
    - scripts/codex-design-review/lib.ts
    - scripts/codex-design-review/run.ts
    - scripts/codex-design-review/capture.spec.ts
    - playwright.codex-design.config.ts
    - test/unit/codex-design-review.test.ts
  modified:
    - scripts/install-gstack.sh
    - test/unit/session-hooks.test.ts
    - docs/OPERATIONS.md
commits: [64bc045, 8f50889, 8d52843]
---

# 261001-3uq — Codex 디자인 검토 전용 복원

## 결과

- **설치·로그인(Task 1, 64bc045)**
  - `scripts/install-codex.sh`를 복원했다. 설치는 pnpm 전역(`--config.global-bin-dir=~/.local/bin`)으로 하고, API 키 경로는 뺐고, 토큰 비출력 계약은 그대로다.
  - 이 세션에서 실제로 설치했다. 결과: `codex-cli 0.155.1`, 「Logged in using ChatGPT」, auth.json 600, 로그에 토큰 형태 문자열 없음, 두 번째 실행은 「already installed」.
- **디자인 밖 차단(1차, 적용됨)**
  - `install-gstack.sh`가 설치·재개 두 경로 모두에서 `codex_reviews disabled`를 건다.
  - 확인한 값: `gstack-config get codex_reviews` → `disabled`. gstack `/review`(adversarial)와 `/plan-eng-review`의 사전 점검 블록을 그대로 실행하면 `CODEX_MODE: disabled`가 나온다.
  - design-review·plan-design-review는 `_OUTSIDE_CFG=enabled`(자체 스위치)라 Codex를 계속 쓴다.
- **디자인 검토 도구(Task 2, 8f50889)**: `bash scripts/codex-design-review.sh <경로…> --out <보고서>`
  - CI=true 프로덕션 빌드를 띄워 375·320·768·1280 폭에서 전체 화면 스크린샷과 DOM 실측(가로 넘침·크기·줄 수·자기 넘침·화면 밖·세로 간격)을 만든다.
  - SYSTEM.md 관련 절, diff 또는 `--plan`, 실측표, 스크린샷을 `codex exec`에 넘긴다. 프롬프트는 `-i` 앞에 두고 100KB 상한을 지킨다.
  - 지적 후보를 실측과 자동 대조한 보고서를 쓴다. 「실측 확인」 칸은 검토자가 채운다.
  - 자격이나 CLI가 없으면 보고서에 한 줄만 쓰고 exit 0으로 끝난다.
- **실제 실행(8d52843)**: `/admin/people`에 돌려 `261001-3uq-CODEX-DESIGN-REVIEW.md`를 남겼다.
  - 새 빌드였고, 4폭 모두 가로 넘침이 없었고, Codex는 exit 0으로 끝났다.
  - Codex 지적 후보는 2건이다. 768·1280 폭 「삭제」 버튼이 20×19px로, §7-1 PC 32px와 다르다는 내용이다.
  - 자동 대조는 20×19px를 확인했다. 결함 판정은 하지 않았다(화면 코드 변경 없음).
- **승인 대기(Task 3)**: `261001-3uq-BLOCKED-CHANGES.md`
  - settings 훅 줄: Edit 시도가 R8에 막혔다.
  - session-hooks 단언 2건: 현재 settings에서 RED임을 확인했다.
  - rule-guard R3: 사본 하네스에서 기준선 245/0, RED 16, GREEN 266/0이다.
  - CLAUDE.md 붙여 넣을 문장.

## 계획과 다른 점

1. **실행자 서브에이전트 대신 메인 세션이 실행했다.**
   - gsd-executor 디스패치가 plant8-skill-gate에 막혔다. STATE.md의 `current_phase: 2`로 quick 작업을 페이즈 02로 보고 /plan-ceo-review·/plan-eng-review 기록을 요구했다.
   - 훅은 우회하지 않았다. 같은 PLAN을 같은 규율로 실행했다(TDD → systematic-debugging → verification-before-completion).
2. **줄 수 측정 버그를 고쳤다(실제 실행에서 발견).**
   - 원인: 요소 범위 전체의 `getClientRects()`는 하위 span 상자까지 섞여, 한 줄 버튼을 2줄로 셌다. 정적 HTML로 재현했다(top 17·22).
   - 수정: 텍스트 노드 상자만 모으고, 순수 함수 `countLines`(세로 겹침 묶기, 단위 테스트 3건)로 센다.
3. **CLAUDE.md 패치 파일을 만들지 않았다.**
   - 세션의 CLAUDE.md 읽기를 자동 모드 분류기가 「자기 수정」으로 거부했다. 사본 작업은 멈추고 사본을 지웠다.
   - 붙여 넣을 문장은 지시에 적힌 위치·문구로 BLOCKED-CHANGES.md에 적었다.

## /review 반영(d36ae1b 이후)

- 핵심 리뷰(3건)와 독립 adversarial 리뷰(26건)를 받아 범위 안의 것을 TDD로 고쳤다. Codex 패스는 `codex_reviews disabled`로 건너뜀(의도대로).
  - 비밀: codex에는 허용 목록 env만(자격 원본·DB 주소 제외), 캡처에도 자격 원본을 넘기지 않음, Codex 출력은 비밀 값·토큰 모양을 가린 뒤 gitignored 파일로만 남기고 커밋되는 보고서에는 넣지 않음.
  - 신뢰 경계: Codex 지적은 형태 검증 뒤에만 쓰고, 보고서 칸은 링크·이미지·HTML을 무력화하고 300자로 자름.
  - 경로: `--out`은 `.planning/`·`test-results/`의 .md, `--plan`은 `.planning/`·`docs/`의 .md만. 옵션처럼 보이는 값 거부.
  - install-codex.sh: 재개 때 더 새로 갱신된 auth.json을 env의 낡은 사본으로 덮지 않음(last_refresh 비교, 행동 테스트 6건). mktemp 실패 처리.
  - 측정: 표 행 순번으로 선택자 중복 0, 같은 선택자 여러 개면 「모호」, 폭별 예산·생략 수, 숨은 요소·스크롤 칸 오탐 제거, 리다이렉트·오류 페이지 거부, CSS.escape.
  - 로그인 판정은 「Logged in using ChatGPT」만(API 키 로그인은 건너뜀).
  - R3 패치: 접두 명령·옵션 값·패키지 실행기 우회 보강(사본 282/0). 못 막는 경로는 BLOCKED-CHANGES에 적음.
- 남긴 것: inline 요소 넘침 측정, Codex 실행 실패 시 exit 0(사용자 결정: 실패면 한 줄 남기고 진행), erp_test 데이터가 적어 데이터 의존 배치 문제가 안 보임, Codex 읽기 전용 샌드박스 동작(이 커널) 미확인.

## 승인 뒤 반영(2026-10-01)

- 사용자 승인으로 settings 훅 줄·session-hooks 단언·rule-guard R3를 #116에 반영(별도 PR 대신 — 세션이 쓸 수 있는 브랜치가 하나뿐이고 #116이 이미 사용자 머지 대상). 패치와 동일함을 역적용 검사로 확인.
- 검증: session-hooks·install-codex 29 passed, rule-guard 282/0, skill-gate 147/0, session-boundary 70/0(`PLANT8_ENV_ID`를 뺀 실행 — 이 세션 env에 값이 있어 「미설정 기본값」 단언 1건이 반영 전 HEAD에서도 실패, 이 변경과 무관), lint 0, typecheck 0, 단위 173 files / 2344 passed.
- CLAUDE.md 문장은 여전히 사용자 붙여 넣기 대기.

## 검증(새로 실행한 결과)

- 다 통과했다. lint 0 · typecheck 0 · `pnpm test:unit` 171 files / 2305 passed · `pnpm build` 0.
- 보호 파일(.claude/settings.json·.claude/hooks·CLAUDE.md)은 작업 트리와 브랜치 기록 모두에서 변경이 없다.
- 일반 E2E 목록(`playwright test --list`, 630 tests)에 캡처 스펙은 0건이다.
