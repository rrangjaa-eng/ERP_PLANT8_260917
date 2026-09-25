지정한 세 계획 전체를 기준 문서와 저장소 코드에 대조하고, 다른 계획은 계약이 연결되는 부분만 확인하겠습니다. 이전 라운드에서 해결된 지적은 회귀 여부만 확인하며, 금지한 경로는 읽거나 실행하지 않겠습니다.
[codex ran] /bin/bash -lc "pwd
rg --files -g 'AGENTS.md' -g 'CLAUDE.md' -g '*04.3*' -g '*PLAN.md' -g '*CONTEXT.md' -g '*UI-SPEC.md' -g '*review*' -g '"'!agents/**'"' -g '"'!.claude/**'"' -g '"'!**/.agents/**'"' -g '"'!**/.claude/**'"' .planning reviews . 2>/dev/null"
[codex ran] /bin/bash -lc "rg --files --hidden -g '"'!agents/**'"' -g '"'!.claude/**'"' -g '"'!.git/**'"' -g '"'!node_modules/**'"' -g '"'!**/.agents/**'"' -g '"'!**/.claude/**'"' | rg '("'^|/)(AGENTS'"\\.md|reviews/round[23]/)|"'^(package.json|vitest|playwright|drizzle|test/|src/)'"'"
[codex ran] /bin/bash -lc 'wc -l CLAUDE.md .planning/phases/04.3-qr-certificate-intake/04.3-{01,02,13}-PLAN.md .planning/phases/04.3-qr-certificate-intake/04.3-{CONTEXT,UI-SPEC}.md
nl -ba CLAUDE.md
nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-01-PLAN.md'
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-01-PLAN.md | sed -n '1,175p'"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md | sed -n '1,205p'"
[codex ran] /bin/bash -lc 'nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-13-PLAN.md'
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md | sed -n '1,180p'"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md | sed -n '181,335p'"
세 계획의 전체 흐름과 공용 계약 C1~C4를 확인하고 있습니다. 특히 테스트 준비 순서와 마이그레이션 재생성 절차가 현재 코드에서 성립하는지, 공개 액션의 기능 차단·로그 보호가 후속 계획까지 이어지는지 대조하겠습니다.
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md | sed -n '333,553p'"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md | sed -n '384,430p'
nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-13-PLAN.md | sed -n '1,111p'
nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-CONTEXT.md"
[codex ran] /bin/bash -lc 'cat .planning/phases/04.3-qr-certificate-intake/reviews/round3/{HANDOFF.md,revision2-brief.md,codex-r3-A.md,checker-A.md}
cat .planning/phases/04.3-qr-certificate-intake/reviews/round2/{HANDOFF.md,codex-A.md,checker-A.md}'
[codex ran] /bin/bash -lc 'nl -ba playwright.config.ts
nl -ba test/e2e/global-setup.ts
nl -ba test/integration/global-setup.ts
nl -ba test/integration/setup.ts
nl -ba vitest.config.ts
cat package.json'
[codex ran] /bin/bash -lc "nl -ba domain/settings/keys.ts | sed -n '1,90p'
nl -ba domain/settings/registry.ts | sed -n '1,175p'
nl -ba test/unit/settings/registry-coverage.test.ts
nl -ba lib/env.ts"
[codex ran] /bin/bash -lc "nl -ba lib/actions/client.ts
nl -ba lib/actions/handle-server-error.ts
nl -ba lib/actions/payload-size.ts
nl -ba domain/action-log/record.ts | sed -n '1,190p'
nl -ba domain/document-numbering/index.ts | sed -n '1,175p'"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md | sed -n '1,170p'"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md | sed -n '170,345p'"
[codex ran] /bin/bash -lc "nl -ba domain/settings/keys.ts | sed -n '1,65p'
nl -ba domain/settings/registry.ts | sed -n '1,120p'
nl -ba lib/env.ts | sed -n '1,65p;125,182p'
rg -n 'domain/settings/keys|domain/settings/registry|CERT_|recordAction|depends_on:|wave:' .planning/phases/04.3-qr-certificate-intake/04.3-{03,04,06,07,08,09,10,11,12}-PLAN.md | head -170"
[codex ran] /bin/bash -lc "nl -ba repositories/settings.ts | sed -n '1,95p'
nl -ba domain/permissions/can.ts
nl -ba domain/viewer.ts
nl -ba db/schema/settings.ts
nl -ba test/e2e/fixtures.ts | sed -n '1,150p'
rg -n 'setSettingValue\\(SYSTEM_VIEWER|setSettingValue\\(' test/e2e test/integration/settings.test.ts
nl -ba test/unit/settings/registry-coverage.test.ts | sed -n '1,200p'"
[codex ran] /bin/bash -lc "test -d node_modules && echo node_modules-present
rg -n 'testId =|\\.id =|fileId|testIdExpression' node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/lib/common node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/lib/runner 2>/dev/null | head -55
nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-06-PLAN.md | sed -n '155,228p'
nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-03-PLAN.md | sed -n '200,233p'"
이전 지적의 주요 수정은 유지돼 있습니다. 새로는 공용 E2E 도우미의 고유 이름 생성 규칙과 제출 결과 계약을 확인 중입니다. 이 두 부분은 앞 계획의 테스트가 후속 계획까지 계속 통과하는지에 직접 영향을 줍니다.
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md | sed -n '342,445p'"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md | sed -n '540,640p;755,839p'"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-01-PLAN.md | sed -n '161,190p'
nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-06-PLAN.md | sed -n '198,210p'
nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-08-PLAN.md | sed -n '150,175p'
nl -ba eslint.config.mjs | sed -n '1,180p'"
[codex ran] /bin/bash -lc "nl -ba db/client.ts | sed -n '1,125p'
nl -ba lib/db-transaction.ts
nl -ba repositories/document-counters.ts | sed -n '1,130p'
nl -ba test/unit/pool-rule.test.ts | sed -n '1,120p'
rg -n '풀|연결|allocateDocumentNumber|getSettingValue|번호 서식|formatDocumentNumber' .planning/phases/04.3-qr-certificate-intake/04.3-{02,03,06,13}-PLAN.md"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-04-PLAN.md | sed -n '340,405p'
nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-10-PLAN.md | sed -n '410,449p'
nl -ba node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/lib/common/index.js | sed -n '2017,2037p'
nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md | sed -n '592,607p'"
[codex ran] /bin/bash -lc "rg -n '"'^(1'"\\.|2\\.|3\\.|4\\.|5\\.|6\\.|7\\.|8\\.|9\\.|[0-9]+\\.|#+ |[-*] \\*\\*|\\|.*(C[0-9]|A[0-9]))|testId|number|풀|인쇄|SYSTEM|프린트|no-store|캐시' .planning/phases/04.3-qr-certificate-intake/reviews/round3/{codex-r3-B.md,codex-r3-C.md,checker-C.md,codex-ui-r9.md} .planning/phases/04.3-qr-certificate-intake/reviews/round2/codex-AC-matched-sonnet.md"
[codex ran] /bin/bash -lc "nl -ba test/unit/design-system-docs.test.ts
nl -ba test/unit/ui/system-md-compliance.test.ts | sed -n '1,190p'
rg -n '제출되었습니다|원천징수 신고와|결과 불명|응답 없음|외부 수령자|개인정보.*인쇄' docs/design/SYSTEM.md
nl -ba app/layout.tsx
nl -ba next.config.ts
nl -ba drizzle.config.ts
nl -ba scripts/reset-test-db.sh | sed -n '1,150p'"
[codex ran] /bin/bash -lc "nl -ba app/session-refresh.tsx
nl -ba lib/auth-client.ts
nl -ba proxy.ts
nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md | sed -n '645,691p'
rg -n 'SessionRefresh|session-refresh|dynamic|force-dynamic|connection\\(|noStore|no-store|cookies\\(|headers\\(' .planning/phases/04.3-qr-certificate-intake/04.3-{02,03,04,06,13}-PLAN.md"
[codex ran] /bin/bash -lc "rg -n 'loading.tsx|Suspense|404|stream' .planning/phases/04.3-qr-certificate-intake/04.3-{02,03}-PLAN.md app/layout.tsx
rg -n 'streamed|200|404' node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.mdx node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.mdx 2>/dev/null
nl -ba scripts/dev-db.sh | sed -n '1,155p'
nl -ba scripts/migrate-runner.ts | sed -n '1,115p'"
[codex ran] /bin/bash -lc "nl -ba test/unit/leak-scan-coverage.test.ts | sed -n '1,235p'
nl -ba eslint/rules/require-action-client.mjs | sed -n '1,175p'
rg -n 'publicActionClient|actions.registry|registry' .planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md | sed -n '444,466p;606,644p'
nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-04-PLAN.md | sed -n '274,325p'
nl -ba test/unit/env.test.ts | sed -n '1,80p'
rg -n 'contactMissing|createEvent.*kind|kind: \"created\"|kind: \"ok\"' .planning/phases/04.3-qr-certificate-intake/04.3-04-PLAN.md"
문서번호 할당이 트랜잭션 안에서 별도 DB 연결을 요구하는 경로와, 제출 후 지워지는 증표를 재사용하는 테스트 기대값을 확인했습니다. 이전 리뷰에서 다룬 문제와 겹치는지, 각 계획의 완료 시점에 실제로 실패하는지 마지막으로 대조하고 있습니다.

[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md | sed -n '320,380p;445,475p'"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-06-PLAN.md | sed -n '190,212p'; rg -n 'testId|두 번째 제출|번호.*풀|pool|풀.*번호|증표.*제출|submitted' .planning/phases/04.3-qr-certificate-intake/reviews/round2 .planning/phases/04.3-qr-certificate-intake/reviews/round3"
[codex ran] /bin/bash -lc "nl -ba domain/document-numbering/index.ts | sed -n '60,110p'; nl -ba repositories/settings.ts | sed -n '1,26p'; nl -ba domain/settings/registry.ts | sed -n '75,96p'; nl -ba lib/env.ts | sed -n '47,60p'; nl -ba db/client.ts | sed -n '20,44p'"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md | sed -n '448,480p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-04-PLAN.md | sed -n '352,374p'; nl -ba test/e2e/global-setup.ts | sed -n '30,53p'"
[codex ran] /bin/bash -lc "nl -ba node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/lib/common/index.js | sed -n '2021,2041p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-01-PLAN.md | sed -n '153,163p;183,193p;229,238p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md | sed -n '584,595p;832,842p'"
[codex ran] /bin/bash -lc "rg -n 'createCertEvent|고유|eventName' .planning/phases/04.3-qr-certificate-intake/04.3-{02,04,07,09,10,11,12,13}-PLAN.md"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-01-PLAN.md | sed -n '232,235p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-13-PLAN.md | sed -n '126,157p'; rg -n '인쇄.*숨|data-ready|마스킹.*인쇄' .planning/phases/04.3-qr-certificate-intake/04.3-{07,11}-PLAN.md"
해결된 결과명 변경과 로그 기록 문제는 제외했습니다. 남은 주요 문제는 동시 제출 시 DB 풀 대기, 02 단계에서 통과할 수 없는 재제출 테스트, E2E 이름 접미사의 충돌입니다. 01의 UI 규칙 이관과 13의 모바일 감사에도 현재 UI 계약과 다른 지시가 있어 별도 NOTE로 정리하겠습니다.

[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md | sed -n '1,17p;157,167p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-06-PLAN.md | sed -n '1,15p'; nl -ba lib/db-transaction.ts | sed -n '1,28p'"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md | sed -n '374,378p;446,454p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-04-PLAN.md | sed -n '300,303p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-03-PLAN.md | sed -n '306,312p'"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md | sed -n '448,453p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-04-PLAN.md | sed -n '302p'"
1. **MAJOR — 동시 제출 시 DB 연결 풀 교착이 가능합니다.**  
   [02-PLAN:371](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md:371)은 행사 잠금을 잡은 트랜잭션 안에서 `allocateDocumentNumber(..., tx)`를 호출합니다. 그런데 기존 [문서번호 함수:105](/home/user/ERP_PLANT8_260917/domain/document-numbering/index.ts:105)는 서식 조회에 `tx`를 전달하지 않으며, [설정 리포지토리:12](/home/user/ERP_PLANT8_260917/repositories/settings.ts:12)는 전역 `db` 연결을 사용합니다. 기본 [풀 크기는 5](/home/user/ERP_PLANT8_260917/lib/env.ts:54)이므로 제출 트랜잭션 다섯 개가 연결을 점유하면, 잠금 보유자는 설정 조회용 연결을 기다리고 나머지는 잠금을 기다리는 상태가 가능합니다. 서식 조회까지 같은 `tx`를 사용하거나 트랜잭션 전에 읽도록 계약을 수정하고, 풀 크기만큼의 동시 제출을 검증해야 합니다.

2. **MAJOR — 02 자체 완료 게이트의 재제출 기대값을 구현 계약으로 만족시킬 수 없습니다.**  
   [02-PLAN:466](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md:466)은 두 번째 제출도 `submitted`라고 단언합니다. 하지만 [02-PLAN:358](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md:358)은 첫 제출에서 증표 해시를 지우고, [02-PLAN:366](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md:366)은 제출 여부보다 먼저 증표를 검사합니다. 순차적인 두 번째 호출은 이 검사에서 거부됩니다. 증표 검사 전 같은 키 재생은 후행 [06-PLAN:200](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-06-PLAN.md:200)이 추가하는 기능입니다. 06의 결과명 변경 대응과 별개로, **02 시점**의 테스트를 거부 응답에 맞추거나 재생 구현을 02로 앞당겨야 합니다.

3. **MAJOR — 공용 E2E 도우미의 접미사가 테스트별로 고유하지 않습니다.**  
   [02-PLAN:336](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md:336)은 `test.info().testId` 앞 6자를 행사 이름에 붙이도록 합니다. 설치된 [Playwright 구현:2025](/home/user/ERP_PLANT8_260917/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/lib/common/index.js:2025)과 [2032](/home/user/ERP_PLANT8_260917/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/lib/common/index.js:2032)에 따르면 앞 20자는 파일 해시이므로 **같은 파일의 모든 테스트가 같은 접미사**를 받습니다. 이는 [04-PLAN:362](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-04-PLAN.md:362)의 테스트별 고유 이름·자기 행사 행 선택 계약을 깨뜨립니다. 공유 DB에 같은 기본 이름의 행사가 누적되면 locator 중복 또는 다른 픽스처 선택이 발생합니다. 호출마다 UUID 등으로 고유성을 보장해야 합니다.

4. **NOTE — 01이 SYSTEM.md에 이관할 인쇄 규칙이 최신 계약과 다릅니다.**  
   [01-PLAN:234](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-01-PLAN.md:234)은 개인정보 칸을 마스킹해서 인쇄하도록 합니다. 반면 [UI-SPEC:593](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:593)은 I4 내용을 전부 숨기고 안내만 인쇄하며, P1도 `data-ready` 전에는 본문을 숨기도록 요구합니다. 후속 [07-PLAN:252](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-07-PLAN.md:252)은 최신 규칙을 따릅니다. 01의 이관 지시도 두 규칙으로 갱신해야 정본 문서와 구현이 일치합니다.

5. **NOTE — 01 목업은 실패하지 않았어도 실패 문장을 접근성 설명으로 연결합니다.**  
   [01-PLAN:189](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-01-PLAN.md:189)은 숨겨진 실패 줄을 「잠금 확인」의 `aria-describedby`에 연결하도록 합니다. 반면 수정된 [03-PLAN:310](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-03-PLAN.md:310)은 숨긴 요소도 설명으로 읽힌다는 이유로 실제 실패 중에만 연결하도록 명시합니다. 초기 목업에서는 연결을 빼고, 실패 상태에서만 줄과 연결을 함께 추가해야 합니다.

6. **NOTE — 13의 모바일 I2 감사는 숨겨진 표를 측정하게 됩니다.**  
   [13-PLAN:143](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-13-PLAN.md:143)은 375px에서 I2 표의 `scrollWidth <= clientWidth`를 요구하지만, [UI-SPEC:452](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:452)와 [04-PLAN:302](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-04-PLAN.md:302)은 모바일에서 I2 폼을 숨기고 목록을 표시합니다. 따라서 검사가 대상 탐색에서 실패하거나 숨긴 요소의 `0 <= 0`으로 무의미하게 통과할 수 있습니다. 모바일에서는 I2 비노출과 목록 표시를 검증하고, I2 표 측정은 데스크톱에서 수행해야 합니다.

VERDICT: FAIL

tokens used: 3633681
EXIT 0
