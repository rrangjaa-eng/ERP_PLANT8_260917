라운드 2 지적과 지정된 diff를 대조한 뒤, 변경 부분이 맞닿는 코드·계약만 읽기 전용으로 검증하겠습니다. 금지된 경로는 열지 않겠습니다.

[codex ran] /bin/bash -lc 'git status --short; git diff 41c47e4 4782585 -- .planning/phases/04.3-qr-certificate-intake/04.3-07-PLAN.md .planning/phases/04.3-qr-certificate-intake/04.3-08-PLAN.md .planning/phases/04.3-qr-certificate-intake/04.3-09-PLAN.md .planning/phases/04.3-qr-certificate-intake/04.3-10-PLAN.md .planning/phases/04.3-qr-certificate-intake/04.3-11-PLAN.md .planning/phases/04.3-qr-certificate-intake/04.3-12-PLAN.md'
[codex ran] /bin/bash -lc 'cat .planning/phases/04.3-qr-certificate-intake/reviews/round2/codex-C.md .planning/phases/04.3-qr-certificate-intake/reviews/round2/checker-C.md; cat CLAUDE.md'
[codex ran] /bin/bash -lc 'cat .planning/phases/04.3-qr-certificate-intake/reviews/round2/codex-C.md'
[codex ran] /bin/bash -lc 'git rev-parse --short HEAD; git diff --stat 41c47e4 4782585 -- .planning/phases/04.3-qr-certificate-intake/04.3-0{7,8,9}-PLAN.md .planning/phases/04.3-qr-certificate-intake/04.3-1{0,1,2}-PLAN.md'
[codex ran] /bin/bash -lc 'git diff --unified=2 41c47e4 4782585 -- .planning/phases/04.3-qr-certificate-intake/04.3-08-PLAN.md'
[codex ran] /bin/bash -lc 'git diff --unified=2 41c47e4 4782585 -- .planning/phases/04.3-qr-certificate-intake/04.3-07-PLAN.md'
[codex ran] /bin/bash -lc 'git diff --unified=2 41c47e4 4782585 -- .planning/phases/04.3-qr-certificate-intake/04.3-09-PLAN.md'
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-07-PLAN.md | sed -n '184,290p'"
기존 지적에 대해 DTO 투영, 메뉴 권한 검사, 같은 트랜잭션의 감사 로그를 명시한 보완이 확인됐습니다. 이제 키 회전 배포 순서와 새 누적 잠금·해제 계약을 중심으로 교차 검증하고 있습니다.

[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-08-PLAN.md | sed -n '130,275p'"
[codex ran] /bin/bash -lc 'git diff --unified=0 41c47e4 4782585 -- .planning/phases/04.3-qr-certificate-intake/04.3-10-PLAN.md'
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-10-PLAN.md | sed -n '203,345p'"
[codex ran] /bin/bash -lc 'git diff --unified=0 41c47e4 4782585 -- .planning/phases/04.3-qr-certificate-intake/04.3-11-PLAN.md .planning/phases/04.3-qr-certificate-intake/04.3-12-PLAN.md'
[codex ran] /bin/bash -lc "nl -ba domain/permissions/project.ts; nl -ba domain/action-log/record.ts | sed -n '1,155p'; nl -ba db/schema/action-log.ts; nl -ba lib/db-transaction.ts"
[codex ran] /bin/bash -lc "nl -ba playwright.config.ts | sed -n '1,220p'; nl -ba test/e2e/global-setup.ts | sed -n '1,150p'; nl -ba test/e2e/admin-nav.spec.ts | sed -n '105,135p'"
[codex ran] /bin/bash -lc "nl -ba scripts/rotate-key.ts | sed -n '1,135p'; nl -ba scripts/deploy.sh | sed -n '415,505p'; nl -ba lib/crypto.ts | sed -n '20,110p'; nl -ba 'app/(app)/error.tsx'"
[codex ran] /bin/bash -lc "rg -n '누적|20|잠금 풀기|recheck|hard_locked|cert_submission.value|열람' .planning/phases/04.3-qr-certificate-intake/04.3-CONTEXT.md .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md"
[codex ran] /bin/bash -lc "rg -n 'C4|dependencies|no-deps|cert-setup|certs|verify_idem|hard_locked' .planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md; rg -n 'recheck|hard_locked|VERIFY_HARD|20|verify_idem_outcome|lockEvent' .planning/phases/04.3-qr-certificate-intake/04.3-03-PLAN.md"
[codex ran] /bin/bash -lc "rg -n -A16 -B5 'from: \"repositories\"|from: \"domain\"' eslint.config.*; nl -ba domain/permissions/visible.ts | sed -n '1,100p'; nl -ba test/e2e/global-setup.ts | sed -n '9,50p'; rg -n 'retry|reset' node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.mdx node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md"
[codex ran] /bin/bash -lc "nl -ba 'app/(app)/layout.tsx' | sed -n '1,150p'; nl -ba lib/viewer.ts | sed -n '1,150p'; rg -n 'redirect|login|matcher' proxy.ts middleware.ts app/layout.tsx lib/auth.ts"
[codex ran] /bin/bash -lc "git diff --unified=0 41c47e4 4782585 -- .planning/phases/04.3-qr-certificate-intake/04.3-07-PLAN.md | tail -90; sed -n '1,65p' .planning/phases/04.3-qr-certificate-intake/04.3-10-PLAN.md; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-12-PLAN.md | sed -n '145,167p'"
새로 추가된 “기능 OFF·비로그인 I4 요청도 404” 조건은 상위 레이아웃의 로그인 이동과 충돌할 가능성이 있습니다. 페이지 내부 순서 변경만으로 충족되는지 확인 중이며, 누적 잠금 해제의 멱등성·버전 불변·로그 원자성은 계획에 명시돼 있습니다.

[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-09-PLAN.md | sed -n '99,122p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md | sed -n '257,263p'; rg -n 'parallel|layout.*page|page.*layout' node_modules/next/dist/docs/01-app/02-guides/authentication.md node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/layout.md; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md | sed -n '464,492p'"
[codex ran] /bin/bash -lc "git diff --unified=0 41c47e4 4782585 -- .planning/phases/04.3-qr-certificate-intake/04.3-08-PLAN.md | sed -n '1,65p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md | sed -n '491,502p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-07-PLAN.md | sed -n '289,304p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-10-PLAN.md | sed -n '1,9p'"
[codex ran] /bin/bash -lc "nl -ba ui/table/Table.tsx | sed -n '1,88p'; nl -ba ui/table/Table.tsx | sed -n '130,175p'; nl -ba ui/table/Table.tsx | sed -n '258,326p'; rg -n 'Enter|Space|case \" \"|beginEdit|onKeyDown' ui/table/Table.tsx ui/table/*.ts"
[codex ran] /bin/bash -lc "nl -ba ui/table/use-grid-keyboard.ts | sed -n '138,155p'; nl -ba ui/table/types.ts | sed -n '1,90p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-01-PLAN.md | sed -n '1,35p'; rg -n '행동.*셀|로빙|잠금 풀기|ui/table/Table|use-grid-keyboard' .planning/phases/04.3-qr-certificate-intake/04.3-01-PLAN.md"
지정 diff와 관련 코드·계약을 읽기 전용으로 검토했습니다. 아래는 **계획 수정 판정**이며, 테스트는 실행하지 않았습니다. `07`~`12`는 해당 `04.3-XX-PLAN.md`입니다.

| R2 Codex 지적 | 판정 | 계획 근거 |
|---|---|---|
| #1 회전 후 서비스의 v2 키 누락 | RESOLVED | v2 선배포·이후 배포에서도 유지·회전 순서를 명시. [08:240](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-08-PLAN.md:240), [08:247](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-08-PLAN.md:247) |
| #2 PM 관리자 메뉴 E2E 충돌 | RESOLVED | 기존 프로젝트 종료 후 `cert-setup` 실행을 선행조건으로 고정하고 기존 PM 단언 유지. [09:143](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-09-PLAN.md:143), [09:177](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-09-PLAN.md:177) |
| #3 정보 항목 OFF에도 개인정보 DTO 반환 | RESOLVED | I4·인쇄 모두 `project()` 적용, 빈 결과는 `notFound`. [07:191](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-07-PLAN.md:191), [11:135](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-11-PLAN.md:135) |
| #4 전체 보기·재열람의 메뉴 권한 우회 | RESOLVED | 두 함수에 메뉴 보기와 정보 노출 권한을 함께 요구. [07:192](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-07-PLAN.md:192), [07:193](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-07-PLAN.md:193) |
| #5 전체 보기의 연결 풀 소진 | RESOLVED | 잠금·로그를 같은 tx로 처리하고 풀 크기 동시 요청 테스트 추가. [07:192](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-07-PLAN.md:192), [07:162](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-07-PLAN.md:162) |
| #6 링크 닫기 로그 영구 누락 | RESOLVED | 닫힘 UPDATE와 `status_change` 원자화, 로그 실패 롤백 검증. [10:225](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-10-PLAN.md:225), [10:190](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-10-PLAN.md:190) |
| #7 KMS 배포·권한 시드 TDD 순서 | RESOLVED | 테스트·가짜 어댑터 작성과 RED 실행을 구현 앞으로 이동. [08:223](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-08-PLAN.md:223), [09:164](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-09-PLAN.md:164) |
| #8 인쇄 서버 렌더 ERROR 누락 | RESOLVED | 전용 `error.tsx`, 재시도·인쇄 차단·선행 테스트 추가. [11:170](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-11-PLAN.md:170), [11:186](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-11-PLAN.md:186) |

변경 부분에서 확인된 신규 문제입니다.

1. **MAJOR — I3 행동 셀의 키보드 계약을 구현하지 않고 이월한다.**  
   [10:311](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-10-PLAN.md:311)은 일반 Tab 버튼을 선례로 삼고, `ui/table` 변경이 필요하면 구현 없이 SUMMARY로 넘기도록 합니다. 그러나 현재 [UI-SPEC:493](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:493)은 **로빙 행동 셀에서 Enter/Space 실행·내부 버튼 `tabindex=-1`·취소 후 셀 복귀**를 요구합니다. 실제 [use-grid-keyboard.ts:145](/home/user/ERP_PLANT8_260917/ui/table/use-grid-keyboard.ts:145)는 편집 가능한 셀에서만 Enter/Space를 처리하며, [types.ts:15](/home/user/ERP_PLANT8_260917/ui/table/types.ts:15)에도 행동 셀 활성화 계약이 없습니다. 일반 버튼을 유지하면 탭 정지 계약이 깨지고, 버튼만 `-1`로 바꾸면 셀에서 실행할 수 없습니다. 필요한 활성화 경로와 키보드 E2E를 이번 계획에 포함해야 합니다.

2. **MAJOR — 페이지의 검사 순서만 바꿔서는 비로그인 I4의 404를 보장할 수 없다.**  
   [07:244](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-07-PLAN.md:244)와 [07:287](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-07-PLAN.md:287)은 페이지 게이트를 앞으로 옮기면 비로그인·기능 OFF 요청이 로그인으로 이동하지 않는다고 명시합니다. 하지만 상위 [layout.tsx:22](/home/user/ERP_PLANT8_260917/app/(app)/layout.tsx:22)가 별도로 `requireSession()`을 호출하고, [viewer.ts:62](/home/user/ERP_PLANT8_260917/lib/viewer.ts:62)는 미인증 요청을 `/login`으로 보냅니다. 09의 레이아웃 변경도 메뉴 필터만 추가합니다. 페이지 내부 순서는 상위 인증 경로를 제어하지 못하므로, 상위 경로까지 포함한 게이트 설계가 필요합니다.

3. **NOTE — 닫힌 행사의 누적 잠김 표시가 최신 UI 계약과 다르다.**  
   [10:234](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-10-PLAN.md:234)는 닫힌 행사에서도 미제출 줄에 `hardLockedAt`을 싣고, [10:313](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-10-PLAN.md:313)은 읽기 표에 `잠금 풀기 필요`를 표시합니다. 반면 [UI-SPEC:491](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:491)은 닫히면 해당 줄을 `미제출`로 표시하도록 정했습니다. DTO 또는 표시 규칙을 맞춰야 합니다. 해당 기능의 구현 코드가 아직 없어 계약 불일치 NOTE로 분류합니다.

VERDICT: FAIL

tokens used: 1509118
EXIT 0
