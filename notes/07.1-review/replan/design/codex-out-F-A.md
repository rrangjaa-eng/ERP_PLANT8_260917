af52724의 지정 문서 최종본 전체와 이전 해결 기록을 대조했습니다. 읽기 전용이며 DOM·E2E 실행은 하지 않았습니다.

- **BLOCKING — 01 촬영 명령이 404로 실패합니다.** [01-PLAN:511](/home/user/wt-r2/.planning/phases/07.1-carryover-followup/07.1-01-PLAN.md:511)은 두 경로에 `pre-settle-evidence-pending` 시드를 적용합니다. 이 시드는 [seeds.ts:170](/home/user/wt-r2/scripts/codex-design-review/seeds.ts:170)에서 PM을 반환하며, PM에게 증빙 등록 권한은 없습니다([role-defaults.ts:36](/home/user/wt-r2/domain/seed/role-defaults.ts:36)). `/expenses/evidence`는 해당 권한이 없으면 [page.tsx:33](/home/user/wt-r2/app/(app)/expenses/evidence/page.tsx:33)에서 404를 반환합니다. 경로별 시드·계정을 분리해야 필수 검증을 완료할 수 있습니다.

- **BLOCKING — 05·11의 촬영 절차가 변경 표면을 담지 못합니다.** [05-PLAN:307](/home/user/wt-r2/.planning/phases/07.1-carryover-followup/07.1-05-PLAN.md:307)·[11-PLAN:269](/home/user/wt-r2/.planning/phases/07.1-carryover-followup/07.1-11-PLAN.md:269)은 시드 없이 기본 목록만 촬영합니다. 촬영 실행은 [global-setup.ts:12](/home/user/wt-r2/test/e2e/global-setup.ts:12)에서 DB를 초기화하므로 앞선 E2E 픽스처도 사라집니다. 따라서 5,001건 비활성 이유·보관 카드·열린 카드 폼의 캡처가 빠져 [UI-SPEC:632](/home/user/wt-r2/.planning/phases/07.1-carryover-followup/07.1-UI-SPEC.md:632)의 완료 조건을 충족하지 못합니다. 양쪽 브랜치에서 해당 상태를 만드는 캡처 절차가 필요합니다.

그 외 확인한 참조·토큰·변경 금지 경계·레거시 근거에서 추가 막힘은 찾지 못했습니다. 이전 해결 항목의 회귀도 확인되지 않았습니다.

Recommendation: 위 2건 수정 후 승인.

막는 문제: 2건
