`228dcda`에서 수정 패치와 소스를 읽기 전용 대조했습니다. DOM·E2E는 실행하지 않았습니다.

- **F-1 — RESOLVED.** [01-PLAN:511](/home/user/wt-r2/.planning/phases/07.1-carryover-followup/07.1-01-PLAN.md:511)의 경로별 시드 분리가 타당합니다. `evidence-intake-filled`는 등록 계급에 권한을 부여하고 해당 사용자로 로그인합니다([seeds.ts:558](/home/user/wt-r2/scripts/codex-design-review/seeds.ts:558), [viewer 반환:718](/home/user/wt-r2/scripts/codex-design-review/seeds.ts:718)). main·fallback도 분리됐습니다.

- **F-2 — NOT RESOLVED / BLOCKING 1건.** [05-PLAN:174](/home/user/wt-r2/.planning/phases/07.1-carryover-followup/07.1-05-PLAN.md:174)가 증빙 로그인에 참조한 [audit:902](/home/user/wt-r2/test/e2e/evidence-list-audit.spec.ts:902)는 **권한 없는 PM·팀장의 404 검증**입니다. 명시된 계급을 그대로 쓰면 [페이지 가드:33](/home/user/wt-r2/app/(app)/expenses/evidence/page.tsx:33)에서 막혀 5,001건 상태를 촬영하지 못합니다. 기존 [loginIntake:40](/home/user/wt-r2/test/e2e/helpers/evidence.ts:40) 또는 동등한 등록 권한 계급으로 바꿔야 합니다. 두 신규 스펙은 지정한 기본 설정의 `desktop`에 포함되며, 초기화 후 픽스처 생성 방식도 가능합니다. **11의 세 상태 캡처 계획은 해소됐습니다**([11-PLAN:224](/home/user/wt-r2/.planning/phases/07.1-carryover-followup/07.1-11-PLAN.md:224)).

- **F-3 — RESOLVED.** [18-PLAN:295](/home/user/wt-r2/.planning/phases/07.1-carryover-followup/07.1-18-PLAN.md:295)의 프로젝트별 `testDir`·`testMatch`와 `capture → cert-setup` 의존성이 성립합니다. 초기화 뒤 [cert.setup:18](/home/user/wt-r2/test/e2e/cert.setup.ts:18)이 같은 `DATABASE_URL`의 `cert.enabled`를 켭니다. `origin/main=b9acdd8`에도 같은 setup·프로젝트명이 있어 설정 복사·복원이 가능합니다.

**NOTE:** 촬영 설정은 [CLAUDE.md:105](/home/user/wt-r2/CLAUDE.md:105)와 [훅:312](/home/user/wt-r2/.claude/hooks/plant8-skill-gate.sh:312)의 위험 경로에 없습니다. 기록된 사용자 지시를 포함해 변경분의 추가 규칙 위반은 찾지 못했습니다.

Recommendation: 05 캡처 로그인 계급 수정 후 승인.

막는 문제: 1건
