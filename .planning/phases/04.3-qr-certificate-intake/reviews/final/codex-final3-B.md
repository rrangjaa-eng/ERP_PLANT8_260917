이전 Round-2 지적의 해결 여부를 먼저 확인한 뒤, 지정한 네 계획 전체와 연결된 계약을 코드·잠금 결정·UI 명세에 대조하겠습니다. 금지한 경로는 읽지 않고, 파일 변경 없이 검토하겠습니다.

[codex ran] /bin/bash -lc "pwd && rg --files -g 'CLAUDE.md' -g 'AGENTS.md' -g '"'!agents/**'"' -g '"'!.claude/**'"' -g '"'!node_modules/**'"' -g '"'!.git/**'"' -g '.planning/phases/04.3-qr-certificate-intake/**' -g 'package.json' -g 'vitest*' -g 'playwright*'"
[codex ran] /bin/bash -lc 'ls .planning/phases/04.3-qr-certificate-intake && cat CLAUDE.md && cat .planning/phases/04.3-qr-certificate-intake/reviews/final/codex-final2-B.md'
[codex ran] /bin/bash -lc "wc -l .planning/phases/04.3-qr-certificate-intake/04.3-{03,04,05,06}-PLAN.md .planning/phases/04.3-qr-certificate-intake/04.3-{CONTEXT,UI-SPEC}.md && nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-03-PLAN.md | sed -n '1,210p'"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-03-PLAN.md | sed -n '210,415p'"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-03-PLAN.md | sed -n '88,118p;280,312p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-04-PLAN.md | sed -n '1,154p'"
이전 Round-2의 제출 로그 시그니처, 액션 검증 오류 처리, PNG 검사 보완 여부를 확인하고 있습니다. 전체 계획에서는 멱등 재전송·속도 제한의 상호작용과 실제 테스트 준비 조건도 함께 대조하고 있습니다.

[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-04-PLAN.md | sed -n '154,280p'"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-04-PLAN.md | sed -n '281,460p'"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-05-PLAN.md | sed -n '1,158p'"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-05-PLAN.md | sed -n '159,275p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-06-PLAN.md | sed -n '1,130p'"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-06-PLAN.md | sed -n '131,250p'"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-06-PLAN.md | sed -n '251,355p'"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-06-PLAN.md | sed -n '356,422p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-CONTEXT.md; rg -n '"'^(#{1,4} |[0-9]+'"\\.|\\|.*(MAJOR|BLOCKER)|VERDICT)' .planning/phases/04.3-qr-certificate-intake/reviews/round{2,3}/*B*.md .planning/phases/04.3-qr-certificate-intake/reviews/final/codex-final-B.md"
[codex ran] /bin/bash -lc "nl -ba lib/actions/client.ts; nl -ba lib/actions/payload-size.ts; nl -ba domain/action-log/record.ts | sed -n '1,170p'; nl -ba repositories/action-log.ts | sed -n '1,78p'; nl -ba eslint/rules/repository-viewer-param.mjs; nl -ba db/client.ts | sed -n '30,58p'; cat package.json"
[codex ran] /bin/bash -lc "rg -n 'snapshot|재생|document_submit|deleteSignature|signature|png|경계|boundary|cert-setup|no-deps|depends_on|wave' .planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md | sed -n '326,425p'"
Round-2의 세 항목은 모두 구체적인 구현 계약과 선행 실패 테스트로 보완됐습니다. 현재는 공개 경로의 개인정보 경계, 제출 재전송 시 동의·재확인 상태, 후속 인쇄·파기 계획과의 연결을 확인하고 있습니다.

[codex ran] /bin/bash -lc "rg -n '경계|boundary|cert-setup|no-deps|서명|submitCertificate|DbOrTx' .planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md | cut -c 1-600; nl -ba lib/client-ip.ts; nl -ba lib/actions/handle-server-error.ts; nl -ba vitest.config.ts; nl -ba playwright.config.ts | sed -n '1,140p'; nl -ba domain/permissions/project.ts; nl -ba domain/permissions/visible.ts"
[codex ran] /bin/bash -lc "nl -ba domain/seed/index.ts | sed -n '160,260p'; nl -ba test/e2e/code-tables-write-gate.spec.ts | sed -n '1,120p'; nl -ba repositories/roles.ts | sed -n '1,120p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md | sed -n '348,385p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md | sed -n '336,356p;441,501p'"
[codex ran] /bin/bash -lc "rg -n 'actionLog|action_log|append-only|cert-action|repositories/' eslint test/unit --glob '*.ts' --glob '*.mjs' | head -90; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md | sed -n '363,385p;447,476p'; rg -n 'consent|동의|snapshot|재생|submit|certificate|서명' .planning/phases/04.3-qr-certificate-intake/04.3-07-PLAN.md | head -40; rg -n 'wrong|verify_idem|lock|hardLocked|cert_event.value|visibility' .planning/phases/04.3-qr-certificate-intake/04.3-10-PLAN.md | tail -26"
[codex ran] /bin/bash -lc "rg -n 'submitted|saved|submitCertificate|createSubmittedCert|helpers/cert' .planning/phases/04.3-qr-certificate-intake/04.3-07-PLAN.md; rg -n '최대|500|payload|한도|truncate|이름.*null|verify_idem' .planning/phases/04.3-qr-certificate-intake/04.3-12-PLAN.md; nl -ba ui/table/Table.tsx | sed -n '40,105p'; nl -ba test/integration/setup.ts | sed -n '1,90p'; nl -ba lib/crypto.ts | sed -n '1,120p'; nl -ba domain/certs/intake.ts 2>/dev/null"
[codex ran] /bin/bash -lc "nl -ba scripts/deploy.sh | sed -n '640,717p'; nl -ba scripts/bootstrap-gcp.sh | sed -n '100,154p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md | sed -n '170,245p;337,347p'; rg -n 'visibility|cert_event.value|cert_winner.value|INFO_ITEMS' .planning/phases/04.3-qr-certificate-intake/04.3-09-PLAN.md"
[codex ran] /bin/bash -lc "nl -ba lib/db-transaction.ts; rg -n 'async transaction|commit|rollback' node_modules/drizzle-orm/node-postgres/session.js node_modules/drizzle-orm/pg-core/session.js 2>/dev/null; rg -n '커밋.*(불명|실패|오류)|commit|보상 삭제|응답.*유실' .planning/phases/04.3-qr-certificate-intake/reviews/final/codex-final*B.md .planning/phases/04.3-qr-certificate-intake/reviews/round{2,3}/*B*.md"
제출 보상 삭제에서 새 위험을 찾았습니다. 계획은 트랜잭션 예외가 나면 서명 객체를 삭제하지만, 현재 DB 래퍼는 커밋 응답을 받지 못한 경우와 실제 롤백을 구분하지 않습니다. 커밋 성공 직후 연결이 끊기는 경우에도 이미 저장된 확인증의 서명을 지울 수 있는지 확인하고 있습니다.

[codex ran] /bin/bash -lc "nl -ba node_modules/drizzle-orm/node-postgres/session.js | sed -n '168,225p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-12-PLAN.md | sed -n '148,181p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-11-PLAN.md | sed -n '166,180p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-04-PLAN.md | sed -n '375,378p'"
[codex ran] /bin/bash -lc "node --input-type=module <<'JS'
import { NodePgSession } from 'drizzle-orm/node-postgres/session';
import { PgDialect } from 'drizzle-orm/pg-core';
const state = { submissionCommitted: false, intentPresent: true, signaturePresent: true };
const commands = [];
const client = {
  async query(query) {
    const command = typeof query === 'string' ? query : query.text;
    commands.push(command);
    if (command === 'commit') {
      state.submissionCommitted = true;
      state.intentPresent = false;
      throw new Error('simulated lost COMMIT acknowledgement');
    }
    return { rows: [] };
  }
};
const session = new NodePgSession(client, new PgDialect(), undefined, {});
try {
  await session.transaction(async () => ({kind: 'saved'}));
} catch {
  // 06-PLAN ③(g): delete the uploaded object for every transaction exception.
  state.signaturePresent = false;
}
process.stdout.write(JSON.stringify({commands, state}) + '\\n');
JS"
[codex ran] /bin/bash -lc "rg -n '"'^wave:|''^depends_on:|encrypt'"\\(|decrypt\\(|verify_idem|CERT_SIGNATURE_BUCKET|ensure_cert_bucket' .planning/phases/04.3-qr-certificate-intake/04.3-08-PLAN.md | head -25; nl -ba domain/permissions/matrix.ts | sed -n '40,88p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md | sed -n '347,352p'; nl -ba domain/seed/index.ts | sed -n '165,179p'"
| Round-2 지적 | 판정 | 현재 계획 근거 |
|---|---|---|
| 제출 로그 함수의 `viewer` 첫 인자 누락 | **RESOLVED** | [06-PLAN:211](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-06-PLAN.md:211)에 `insertActionLogTx(viewer, entry, tx)`와 필수 트랜잭션 인자, [227행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-06-PLAN.md:227)에 lint 검증이 명시됐습니다. |
| 액션 스키마 오류의 E4 연결 누락 | **RESOLVED** | [06-PLAN:266](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-06-PLAN.md:266)의 선행 테스트와 [280행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-06-PLAN.md:280)의 `validationErrors` → 칸 오류·포커스 계약으로 보완됐습니다. |
| PNG CRC·IEND 검사 누락 | **RESOLVED** | [06-PLAN:174](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-06-PLAN.md:174)에 손상 표본의 RED 테스트, [200행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-06-PLAN.md:200)에 CRC·IEND·후행 바이트 검사가 추가됐습니다. |

03~06 전체와 교차 계약을 검토했습니다. 신규 지적은 다음과 같습니다. 파일은 변경하지 않았습니다.

1. **MAJOR — 커밋 결과 불명 시 이미 저장된 확인증의 서명을 삭제합니다.**

   [06-PLAN:209](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-06-PLAN.md:209)는 제출 저장과 업로드 의도 삭제를 커밋하고, [210행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-06-PLAN.md:210)은 트랜잭션이 예외로 끝나면 무조건 `store.delete(key)`를 호출합니다.

   그러나 저장소의 [withTransaction:9](/home/user/ERP_PLANT8_260917/lib/db-transaction.ts:9)는 Drizzle을 그대로 호출하며, 설치된 [Drizzle:187](/home/user/ERP_PLANT8_260917/node_modules/drizzle-orm/node-postgres/session.js:187)은 **COMMIT 응답 오류도 예외로 전달**합니다. DB에서는 커밋됐지만 응답이 유실되면, 계획의 보상 삭제가 정상 제출의 서명을 지웁니다. 의도 행도 이미 삭제돼 있고, 재전송은 [06-PLAN:205](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-06-PLAN.md:205)에서 성공만 재생하므로 복구되지 않습니다.

   메모리 가짜 드라이버로 COMMIT 반영 직후 응답 실패를 주입해 이 예외 경로를 확인했습니다. **확정된 미저장과 커밋 결과 불명을 구분하고, 결과 불명에서는 DB의 객체 참조 여부를 확인하기 전 삭제하지 않아야 합니다.** 커밋 후 오류 → 객체 보존 → 같은 키 재전송 성공을 선행 테스트에 추가해야 합니다.

2. **NOTE — 결과 불명 뒤 재전송에서 주민번호 재확인 승인이 풀립니다.**

   [06-PLAN:265](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-06-PLAN.md:265)는 직전 결과가 `rrnRecheck`가 아니면 `rrnRecheckConfirmed=false`로 정합니다. 따라서 재확인 후 보낸 요청이 결과 불명으로 끝나면, 다음 요청은 같은 키를 쓰면서 승인 값만 `false`로 바뀔 수 있습니다. 서버는 [02-PLAN:369](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md:369)에 따라 다시 되묻게 됩니다. **승인 상태를 주민번호 값에 묶어 유지하고, 결과 불명 재전송에서는 요청 값을 보존하는 테스트**가 필요합니다.

3. **NOTE — HTML 비노출 E2E의 임시 계급에 행사 정보 노출 준비가 빠졌습니다.**

   [04-PLAN:375](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-04-PLAN.md:375)는 임시 계급에 메뉴 권한만 주고, [377행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-04-PLAN.md:377)은 `cert_winner.value`만 전환합니다. `cert_event.value`는 준비하지 않습니다. 실제 [visible.ts:21](/home/user/ERP_PLANT8_260917/domain/permissions/visible.ts:21)은 노출 행이 없으면 거부합니다. 임시 계급의 행사 정보 노출을 켜고, 양쪽 응답에서 **HTTP 200과 행사 제목도 단언**해야 오류 화면을 비노출 성공으로 오인하지 않습니다.

VERDICT: FAIL

tokens used: 2469830
EXIT 0
