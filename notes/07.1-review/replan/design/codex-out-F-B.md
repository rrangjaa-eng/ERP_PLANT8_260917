af52724 기준 14~19 전문·이전 검토·원본·레거시 대조 완료. 읽기 전용 정적 검토이며 DOM/E2E는 실행하지 않았습니다.

- **BLOCKING — 18번 필수 캡처 명령이 404로 실패합니다.** [18-PLAN:392](/home/user/wt-r2/.planning/phases/07.1-carryover-followup/07.1-18-PLAN.md:392)의 `/certs/events` 촬영에는 기능 활성화 준비가 없습니다. 캡처는 [global-setup:12](/home/user/wt-r2/test/e2e/global-setup.ts:12)에서 DB를 초기화하며, [cert.enabled 기본값:349](/home/user/wt-r2/domain/settings/keys.ts:349)은 `false`입니다. [캡처 설정:24](/home/user/wt-r2/playwright.codex-design.config.ts:24)은 기능을 켜는 `cert-setup`을 실행하지 않아, [페이지:29](/home/user/wt-r2/app/(app)/certs/events/page.tsx:29)의 가드와 [응답 단언:50](/home/user/wt-r2/scripts/codex-design-review/capture.spec.ts:50)에서 실패합니다. 브랜치·main·대체 캡처 모두 **DB 초기화 후 기능을 활성화하는 준비 단계**를 계획에 명시해야 합니다.

그 밖의 확정된 실행 불가·규칙 위반은 찾지 못했습니다. 기존 해결 항목의 회귀, 결정 없는 레거시 동작 충돌도 발견하지 못했습니다. 화면 계획별 Codex 검토·375/320/768/1280 캡처·DOM 표·생략 시 미통과 조건은 유지됩니다.

Recommendation: 위 캡처 준비 단계 수정 후 승인.
막는 문제: 1건
