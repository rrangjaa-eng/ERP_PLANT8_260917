이전 최종 지적의 해결 여부를 먼저 확인한 뒤, 01·02·13 계획 전체와 연결된 계약을 저장소 코드에 대조하겠습니다. 읽기 전용으로 진행하며 지정하신 제외 경로는 열지 않겠습니다.

[codex ran] /bin/bash -lc "pwd; rg --files -g 'CLAUDE.md' -g 'AGENTS.md' -g '"'!agents/**'"' -g '"'!.claude/**'"' -g '"'!.agents/**'"' -g '"'!node_modules/**'"' -g '"'!.git/**'"'; rg --files .planning/phases/04.3-qr-certificate-intake"
[codex ran] /bin/bash -lc 'nl -ba .planning/phases/04.3-qr-certificate-intake/reviews/final/codex-final-A.md; nl -ba CLAUDE.md'
[codex ran] /bin/bash -lc 'nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-01-PLAN.md'
[codex ran] /bin/bash -lc 'nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-13-PLAN.md'
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-01-PLAN.md | sed -n '1,160p'; nl -ba CLAUDE.md"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-01-PLAN.md | sed -n '161,310p'"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md | sed -n '1,180p'"
이전 최종 지적 6건의 수정 문구는 모두 확인했습니다. 현재는 문서번호 풀 대기 수정과 E2E 격리 규칙이 후속 계획·기존 코드와 맞물리는지, 새 충돌이 생기지 않았는지 검토하고 있습니다.

[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md | sed -n '181,338p'"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md | sed -n '246,253p;339,430p'"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md | sed -n '431,580p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-13-PLAN.md | sed -n '1,130p'"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-CONTEXT.md; rg -n '"'^#{1,4} |''^'"\\| (①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩|⑪|⑫|⑬)|backstop' .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md; rg -n '"'^(1'"\\.|2\\.|3\\.|4\\.|5\\.|6\\.|7\\.|8\\.|9\\.|##|\\*\\*.*(MAJOR|BLOCKER)|- \\*\\*)' .planning/phases/04.3-qr-certificate-intake/reviews/round2/codex-A.md .planning/phases/04.3-qr-certificate-intake/reviews/round3/codex-r3-A.md"
[codex ran] /bin/bash -lc "nl -ba playwright.config.ts; nl -ba test/e2e/global-setup.ts; nl -ba domain/settings/registry.ts | sed -n '1,190p'; nl -ba test/unit/settings/registry-coverage.test.ts | sed -n '1,185p'"
[codex ran] /bin/bash -lc "nl -ba domain/document-numbering/index.ts; nl -ba repositories/settings.ts | sed -n '1,85p'; nl -ba test/integration/global-setup.ts; nl -ba test/integration/setup.ts; nl -ba db/client.ts; nl -ba lib/db-transaction.ts"
[codex ran] /bin/bash -lc "rg -n '"'^(wave:|depends_on:)|allocateDocumentNumber|loadDocumentNumberFormat|format'"\\}|submitted|saved|markWinnerSubmitted|withTransaction|증표|cert-crypto|document_submit' .planning/phases/04.3-qr-certificate-intake/04.3-06-PLAN.md; rg -n 'CERT_|SETTING_DEFS|privacy_session_activity|verify_idem|signature_key|cert_signature|depends_on:|wave:' .planning/phases/04.3-qr-certificate-intake/04.3-{03,05,07,08,09,10,11,12}-PLAN.md"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-03-PLAN.md | sed -n '205,238p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-06-PLAN.md | sed -n '198,214p'; cat .planning/phases/04.3-qr-certificate-intake/reviews/round3/codex-r3-A.md; cat .planning/phases/04.3-qr-certificate-intake/reviews/round2/codex-A.md"
[codex ran] /bin/bash -lc "rg -n 'domain/settings/keys|domain/settings/registry' app ui domain --glob '*.tsx' --glob '*.ts' | head -75; nl -ba lib/env.ts | sed -n '1,95p;145,200p'; nl -ba 'app/(app)/admin/settings/settings-client.tsx' | sed -n '1,75p'; nl -ba lib/actions/handle-server-error.ts; nl -ba lib/actions/client.ts; nl -ba lib/actions/payload-size.ts; nl -ba domain/action-log/record.ts | sed -n '65,155p'"
제출 결과명 변경과 재제출 기대값 갱신은 06 계획까지 연결돼 있습니다. 추가로 마이그레이션 검증의 “삭제 줄 없음” 조건과, 공개 페이지의 캐시·오류 경계가 의도한 동작을 보장하는지 확인하고 있습니다.

[codex ran] /bin/bash -lc "nl -ba next.config.ts; nl -ba app/layout.tsx; nl -ba app/session-refresh.tsx; nl -ba db/migrations/meta/_journal.json | tail -25; nl -ba scripts/reset-test-db.sh; nl -ba scripts/migrate-runner.ts | sed -n '1,105p'; nl -ba package.json | sed -n '1,140p'; nl -ba vitest.config.ts"
[codex ran] /bin/bash -lc "rg -n 'v1:|v2:|cert-crypto|cert-intake|기존.*테스트|테스트.*기존|회전' .planning/phases/04.3-qr-certificate-intake/04.3-08-PLAN.md; nl -ba domain/seed/index.ts | sed -n '140,185p'; nl -ba domain/settings/export.ts | sed -n '1,155p'; nl -ba test/unit/env.test.ts | sed -n '1,135p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-04-PLAN.md | sed -n '343,382p'"
[codex ran] /bin/bash -lc "nl -ba lib/env.ts | sed -n '84,133p'; nl -ba test/unit/settings/keys.test.ts | sed -n '1,95p'; rg -n 'settings/keys|process.env|vi.mock.*env|stubEnv' test/unit/settings test/unit/domain/document-number-format.test.ts test/unit/auth/lockout.test.ts; nl -ba domain/settings/keys.ts | sed -n '1,20p'; nl -ba domain/settings/export.ts | sed -n '25,75p'"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md | sed -n '293,412p'"
[codex ran] /bin/bash -lc "nl -ba test/unit/leak-scan-coverage.test.ts | sed -n '1,235p'; nl -ba eslint.config.mjs | sed -n '1,130p'; nl -ba test/e2e/fixtures.ts | sed -n '1,135p'"
[codex ran] /bin/bash -lc "nl -ba eslint/rules/repository-viewer-param.mjs; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-06-PLAN.md | sed -n '154,161p;208,215p'; rg -n 'insertActionLogTx|팩토리|factory|viewer.*첫|first|매개변수' .planning/phases/04.3-qr-certificate-intake/reviews/final/*.md .planning/phases/04.3-qr-certificate-intake/reviews/round3/checker-A.md .planning/phases/04.3-qr-certificate-intake/reviews/round3/checker-B.md"
[codex ran] /bin/bash -lc "nl -ba repositories/action-log.ts | sed -n '1,78p'; nl -ba eslint/index.mjs | sed -n '1,65p'; nl -ba test/unit/eslint-rules/repository-viewer-param.test.ts | sed -n '1,155p'; rg -n 'append.*returning|Promise<void>|insertActionLogTx' .planning/phases/04.3-qr-certificate-intake/reviews/final/codex-final-B.md"
[codex ran] /bin/bash -lc "node --input-type=module <<'JS'
import { Linter } from 'eslint';
import rule from './eslint/rules/repository-viewer-param.mjs';
const linter = new Linter();
const source = 'export function insertActionLogTx(tx) { return async (viewer, entry) => tx.insert(entry); }';
const result = linter.verify(source, [{ plugins: { plant8: { rules: { 'repository-viewer-param': rule } } }, rules: { 'plant8/repository-viewer-param': 'error' } }], { filename: 'repositories/cert-submissions.js' });
console.log(JSON.stringify(result.map(({ruleId, severity, message, line}) => ({ruleId, severity, message, line}))));
JS"
새 실행 차단 문제를 하나 확인했습니다. 06이 02의 제출 저장소에 추가하는 `insertActionLogTx(tx)`는 첫 인자가 `viewer`여야 한다는 저장소 린트 규칙에 걸립니다. 파일 변경 없이 메모리상의 최소 코드로 오류를 재현했으며, 13의 최종 린트 게이트에도 영향을 줍니다.

[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md | sed -n '798,808p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-13-PLAN.md | sed -n '139,146p;173,185p'; git status --short"
| 이전 최종 지적 | 판정 | 현재 계획 근거 |
|---|---|---|
| #1 제출 중 DB 풀 교착 | RESOLVED | [02:372](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md:372)에서 번호 서식을 트랜잭션 전에 조회하고 전달한다. [02:331](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md:331)에 동시 제출 검증도 추가됐다. |
| #2 02의 재제출 기대값 불일치 | RESOLVED | [02:469](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md:469)이 증표 불일치 거부를 기대하고, 후행 [06:211](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-06-PLAN.md:211)이 재생 도입과 기대값 변경을 맡는다. |
| #3 E2E 이름 접미사 충돌 | RESOLVED | [02:337](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md:337)이 호출마다 UUID 접미사를 만들도록 변경했다. |
| #4 인쇄 규칙 이관 불일치 | RESOLVED | [01:234](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-01-PLAN.md:234)가 I4 내용 전체 숨김과 P1 `data-ready` 조건을 명시한다. |
| #5 실패 전부터 연결되는 접근성 설명 | RESOLVED | [01:189](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-01-PLAN.md:189)이 기본 상태의 실패 줄·연결을 제거하고 실패 보기에서만 연결한다. |
| #6 모바일에서 숨은 I2 표 측정 | RESOLVED | [13:143](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-13-PLAN.md:143)이 모바일 비노출을 검증하고, 다음 줄에서 표 너비 측정을 데스크톱으로 옮겼다. |

01·02·13 전체와 연결 계약을 읽기 전용으로 검토했습니다. 위 판정은 **계획상 해결 여부**입니다.

1. **MAJOR · NEW — 제출 로그 어댑터의 API가 저장소 린트를 위반합니다.**  
   [02:359](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md:359)은 저장소 함수의 첫 인자를 `viewer`로 고정합니다. 그러나 이를 확장하는 [06:210](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-06-PLAN.md:210)은 `repositories/cert-submissions.ts`에 **`insertActionLogTx(tx)`**를 추가하도록 명시합니다. 실제 [린트 규칙:29](/home/user/ERP_PLANT8_260917/eslint/rules/repository-viewer-param.mjs:29)은 반환되는 콜백과 무관하게 외부 export 함수의 첫 인자 이름을 검사하며, [eslint 설정:77](/home/user/ERP_PLANT8_260917/eslint.config.mjs:77)에서 오류로 활성화돼 있습니다. 따라서 [13:140](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-13-PLAN.md:140)의 최종 게이트를 통과하지 못합니다.  
   파일 생성 없이 동일 시그니처를 실제 규칙에 넣어 `repository exports must take viewer as their first parameter`를 재현했습니다. 저장소 API와 호출부를 `viewer` 우선 규약에 맞춰야 합니다.

2. **NOTE · NEW — 정상적인 journal 추가도 “삭제 줄 없음” 조건을 위반합니다.**  
   [13:104](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-13-PLAN.md:104)은 journal diff에 `-` 줄이 없어야 한다고 요구합니다. 현재 [journal:81](/home/user/ERP_PLANT8_260917/db/migrations/meta/_journal.json:81)의 마지막 항목은 `}`로 끝나므로, 항목을 추가하면 기존 줄이 `},`로 바뀌어 삭제 줄이 생깁니다. 이미 [13:118](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-13-PLAN.md:118)에 있는 **기존 항목의 순서·내용 보존 비교**만 판정 기준으로 사용해야 합니다.

3. **NOTE · 이전 round3 미해결 — 누적 잠금의 잘못된 경계 설명이 남아 있습니다.**  
   [01:182](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-01-PLAN.md:182)는 여전히 “20 = 5 × 4라 넷째 짧은 잠김 자리에서 걸린다”를 정본으로 옮깁니다. [UI-SPEC:806](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:806)은 이 주장을 명시적으로 폐기했습니다. **짧은 셈과 무관하게 누적 20회에서 잠긴다**로 교체해야 합니다. 고정 한도나 직원 해제 결정의 변경은 필요 없습니다.

VERDICT: FAIL

tokens used: 2609863
EXIT 0
