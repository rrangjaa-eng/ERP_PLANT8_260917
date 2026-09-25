지정한 네 개 계획 전체를 읽고, 고정 결정·UI 계약·실제 코드와 교차 검증하겠습니다. 이전 리뷰의 해결 항목은 회귀 여부만 확인하며, 금지하신 경로는 읽지 않겠습니다.

[codex ran] /bin/bash -lc "pwd; rg --files -g 'CLAUDE.md' -g '*04.3*' -g '*PLAN.md' -g '*review*' -g '"'!agents/**'"' -g '"'!.claude/**'"' -g '"'!**/.agents/**'"' -g '"'!**/.claude/**'"' .planning reviews 2>/dev/null"
[codex ran] /bin/bash -lc "rg --files --hidden -g '"'!agents/**'"' -g '"'!.claude/**'"' -g '"'!.git/**'"' -g '"'!node_modules/**'"' -g '"'!**/.agents/**'"' -g '"'!**/.claude/**'"' | rg '("'^CLAUDE.md$|reviews/round[23]|04.3-(03|04|05|06)-PLAN)'"'"
[codex ran] /bin/bash -lc 'wc -l CLAUDE.md .planning/phases/04.3-qr-certificate-intake/04.3-{03,04,05,06}-PLAN.md .planning/phases/04.3-qr-certificate-intake/04.3-{CONTEXT,UI-SPEC}.md'
[codex ran] /bin/bash -lc 'nl -ba CLAUDE.md; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-CONTEXT.md'
[codex ran] /bin/bash -lc 'nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-03-PLAN.md'
[codex ran] /bin/bash -lc 'nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-04-PLAN.md'
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-03-PLAN.md | sed -n '1,210p'"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-03-PLAN.md | sed -n '210,320p'"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-03-PLAN.md | sed -n '321,412p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-CONTEXT.md | sed -n '33,144p'"
확인 단계의 잠금·멱등 재전송·기능 차단 계약을 읽었습니다. 이제 행사 생성과 실제 제출 경로를 대조하면서, 테스트가 그 계약을 실행 가능한 방식으로 검증하는지도 확인하고 있습니다.

[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-04-PLAN.md | sed -n '1,180p'"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-04-PLAN.md | sed -n '181,338p'"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-05-PLAN.md | sed -n '1,160p'"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-05-PLAN.md | sed -n '161,273p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-06-PLAN.md | sed -n '1,140p'"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-06-PLAN.md | sed -n '141,260p'"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-06-PLAN.md | sed -n '261,403p'"
[codex ran] /bin/bash -lc 'cat .planning/phases/04.3-qr-certificate-intake/reviews/round3/{codex-r3-B.md,checker-B.md,revision2-brief.md}; cat .planning/phases/04.3-qr-certificate-intake/reviews/round2/{codex-B.md,codex-B-matched-sonnet.md,checker-B.md}'
[codex ran] /bin/bash -lc "rg -n '서명|PNG|signature|verifyLast4|recordAction|createEvent|createCertEvent|publicActionClient|DbOrTx|bodySize|consent' .planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md"
[codex ran] /bin/bash -lc "rg --files domain repositories lib ui test db scripts infra | rg '(client-ip|log.ts|safe-action|payload-size|db-transaction|signature|cert|Table|types.ts|deploy-sh.test|bootstrap-sh.test|fakebin/gcloud|env.test|crypto|setup.ts|record.ts|can.ts|menus.ts|info-items.ts)"'$'"'; nl -ba lib/client-ip.ts; nl -ba lib/actions/payload-size.ts; nl -ba lib/safe-action.ts; nl -ba playwright.config.ts | sed -n '1,200p'"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md | sed -n '1,160p'"
이전 리뷰에서 지적한 반환값 이름, 트랜잭션 `delete`, PM 권한 준비, 키 회전 후 재생 문제는 현재 계획에 보완되어 있습니다. 추가로 멱등 기록의 크기 제한이 속도 제한 집계에 미치는 영향과, 새 제출 규칙이 선행 테스트·인쇄 계약과 충돌하는지 확인 중입니다.

[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md | sed -n '162,245p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md | sed -n '326,419p'"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md | sed -n '326,374p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md | sed -n '421,470p'; nl -ba ui/table/types.ts | sed -n '1,220p'; nl -ba ui/form/Form.tsx | sed -n '1,160p'"
[codex ran] /bin/bash -lc "rg -n 'header|<th|aria-describedby' ui/table/Table.tsx; nl -ba ui/table/Table.tsx | sed -n '1,100p'; nl -ba ui/table/Table.tsx | sed -n '250,340p'; nl -ba domain/action-log/record.ts | sed -n '60,175p'; nl -ba lib/actions/client.ts | sed -n '1,125p'; nl -ba lib/actions/handle-server-error.ts | sed -n '1,130p'"
[codex ran] /bin/bash -lc "rg -n 'verify_idem|countRecentMisses|SIGNATURE|saved|기존|행동 로그|recordAction|table|header' .planning/phases/04.3-qr-certificate-intake/reviews/round{2,3}/*.md | tail -65"
[codex ran] /bin/bash -lc "nl -ba test/unit/deploy/deploy-sh.test.ts | sed -n '1,165p'; nl -ba test/unit/deploy/bootstrap-sh.test.ts | sed -n '1,180p'; nl -ba test/unit/deploy/fakebin/gcloud | sed -n '1,135p'"
[codex ran] /bin/bash -lc "nl -ba ui/button/Button.tsx; nl -ba test/unit/ui/button.test.ts | sed -n '1,160p'; nl -ba lib/gcp/cloud-sql-admin.ts | sed -n '1,160p'; nl -ba scripts/bootstrap-gcp.sh | sed -n '90,170p'; nl -ba scripts/deploy.sh | sed -n '650,710p'"
[codex ran] /bin/bash -lc "rg -n 'CERT_SIGNATURE_BUCKET|cert_bucket|signature|verify_idem|unlock|version|recordAction|tx|consent|depends_on|wave:' .planning/phases/04.3-qr-certificate-intake/04.3-{07,08,10,11,12}-PLAN.md | head -150"
[codex ran] /bin/bash -lc "rg -n 'submitCertificate|createCertSubmission|saved|submitted|signature-png|PNG|SIGNATURE' .planning/phases/04.3-qr-certificate-intake/04.3-07-PLAN.md; rg -n 'CERT_SIGNATURE_BUCKET|cert_bucket|verify_idem' .planning/phases/04.3-qr-certificate-intake/04.3-12-PLAN.md; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-10-PLAN.md | sed -n '229,240p'; nl -ba ui/table/Table.tsx | sed -n '220,240p'; rg -n '3,|error|r3|NOTE|header|속도|CRC|로그' .planning/phases/04.3-qr-certificate-intake/reviews/round3/revision2-brief.md"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-10-PLAN.md | sed -n '214,228p'; nl -ba domain/permissions/project.ts | sed -n '1,100p'; nl -ba domain/permissions/info-items.ts | sed -n '1,100p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md | sed -n '240,248p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-08-PLAN.md | sed -n '225,250p'"
[codex ran] /bin/bash -lc "nl -ba domain/permissions/visible.ts; nl -ba repositories/roles.ts | sed -n '1,130p'; nl -ba test/e2e/code-tables-write-gate.spec.ts | sed -n '1,145p'; nl -ba domain/seed/index.ts | sed -n '173,215p'; nl -ba test/integration/setup.ts | sed -n '1,100p'"
[codex ran] /bin/bash -lc "nl -ba 'app/(app)/admin/vendors/actions.ts' | sed -n '1,115p'; rg -n 'validationErrors|serverError' 'app/(app)/projects/project-form.tsx' 'app/(app)/admin/vendors/vendor-form.tsx'; rg -n 'validationErrors|invalid|schema' .planning/phases/04.3-qr-certificate-intake/04.3-06-PLAN.md; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md | sed -n '358,375p'; nl -ba domain/action-log/record.ts | sed -n '1,62p'"
[codex ran] /bin/bash -lc "nl -ba domain/viewer.ts; nl -ba db/schema/roles.ts; rg -n 'getCreateGate|canWrite|searchParams|new' 'app/(app)/admin/vendors/page.tsx'; nl -ba 'app/(app)/admin/vendors/page.tsx' | sed -n '15,65p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-10-PLAN.md | sed -n '308,320p'; rg -n 'header.*describ|headerProps|header.*ReactNode|aria-describedby' .planning/phases/04.3-qr-certificate-intake/04.3-{01,10}-PLAN.md"
현재 저장소의 표 API로는 계획이 요구한 머리글 설명 연결을 구현할 수 없고, 버킷이 없으면 배포를 중단하도록 바꾼 뒤에도 기존 배포 테스트는 버킷 없는 상태에서 성공을 기대합니다. 이 두 실행 문제와 제출·검증 경로의 결함 후보를 근거 수준에 따라 정리하고 있습니다.

[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-03-PLAN.md | sed -n '97,118p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-04-PLAN.md | sed -n '335,351p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-10-PLAN.md | sed -n '308,318p'; rg -n 'typecheck|test|lint' package.json | head -25; nl -ba scripts/dev-db.sh | sed -n '1,80p'"
[codex ran] /bin/bash -lc "rg -n 'headerProps|머리글.*(불가|API|타입|속성)|버킷.*(픽스처|기존 테스트)|CRC|IEND|20개.*(속도|틀림)|멱등.*(집계|예산)|커밋 뒤.*(제출|document_submit)|TDD.*06' .planning/phases/04.3-qr-certificate-intake/reviews/round2 .planning/phases/04.3-qr-certificate-intake/reviews/round3"
[codex ran] /bin/bash -lc "nl -ba 'app/(app)/admin/vendors/vendor-form.tsx' | sed -n '120,141p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-10-PLAN.md | sed -n '244,249p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-03-PLAN.md | sed -n '203,208p'"
[codex ran] /bin/bash -lc "rg -n '"'^1'"\\.|"'^2'"\\.|"'^3'"\\.|"'^4'"\\.|"'^5'"\\.|"'^6'"\\.|"'^7'"\\.|"'^8'"\\.|"'^W-|''^B[0-9]|'"\\*\\*(MAJOR|BLOCKER|NOTE|MINOR)' .planning/phases/04.3-qr-certificate-intake/reviews/round3/{codex-r3-A.md,codex-r3-C.md,checker-A.md,checker-C.md} .planning/phases/04.3-qr-certificate-intake/reviews/round2/{codex-A.md,codex-C.md}"
[codex ran] /bin/bash -lc "nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-11-PLAN.md | sed -n '157,177p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-05-PLAN.md | sed -n '175,186p'; nl -ba .planning/phases/04.3-qr-certificate-intake/04.3-05-PLAN.md | sed -n '193,200p'"
[codex ran] /bin/bash -lc "nl -ba 'app/(app)/error.tsx'; rg -n 'retry|reset' node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.mdx 2>/dev/null; rg --files node_modules/next/dist/docs 2>/dev/null | rg '/error\\.'"
대조를 마쳤습니다. 확실한 실행 문제 두 건 외에, 멱등 기록을 지우는 동작이 속도 제한의 집계까지 줄이는 교차 계약 문제를 확인했습니다. 구현 전 실패 검증이 빠진 순서와 제출 로그 누락 가능성도 별도로 표시하겠습니다. 파일 수정이나 테스트 실행은 하지 않았습니다.

전체 계획과 교차 계약을 읽기 전용으로 검토했습니다. 파일 수정·테스트 실행은 하지 않았습니다.

1. **MAJOR — 멱등 기록 정리가 속도 제한 집계까지 지웁니다.**  
   [03-PLAN:207](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-03-PLAN.md:207)은 `verify_idem_outcome`으로 최근 틀림을 집계하지만, [03-PLAN:221](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-03-PLAN.md:221)은 성공 항목까지 합쳐 오래된 항목을 20개 밖으로 밀어냅니다. `틀림 1회 → 새 키로 맞음 20회`면 60분이 지나기 전에 그 틀림이 집계에서 사라집니다. 또한 [10-PLAN:225](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-10-PLAN.md:225)의 이름·전화 수정도 맵 전체를 비웁니다. 따라서 행사 30회·IP 10회 제한을 보장하지 못합니다. **속도 제한 기록을 재생 캐시와 분리**하고, 캐시 축출·담당자 수정 뒤에도 시간 창 안의 틀림이 유지되는 테스트가 필요합니다. 고정 누적 잠금 20회 결정은 그대로 유지할 수 있습니다.

2. **MAJOR — 요구한 표 머리글 접근성 속성을 현재 API로 전달할 수 없습니다.**  
   [04-PLAN:296](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-04-PLAN.md:296)은 머리글에 `aria-describedby`를 요구하면서 [04-PLAN:325](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-04-PLAN.md:325)은 `ui/table` 변경을 금지합니다. 실제 [types.ts:17](/home/user/ERP_PLANT8_260917/ui/table/types.ts:17)의 `header`는 문자열이며, [Table.tsx:228](/home/user/ERP_PLANT8_260917/ui/table/Table.tsx:228)의 `<th>`에는 설명 속성을 전달하는 통로가 없습니다. 편집 입력의 속성만으로는 머리글 E2E 단언을 충족하지 못합니다. 최소 머리글 속성 API 확장을 이 계획의 수정 범위에 포함해야 합니다.

3. **MAJOR — 버킷 필수화 뒤 기존 배포 테스트의 준비 상태가 갱신되지 않습니다.**  
   [05-PLAN:186](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-05-PLAN.md:186)·[195행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-05-PLAN.md:195)은 `bucket-exists`가 없으면 배포를 중단하지만, [200행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-05-PLAN.md:200)은 기존 테스트도 그대로 통과하도록 요구합니다. 현재 도우미는 지정된 상태만 만들고([deploy-sh.test.ts:50](/home/user/ERP_PLANT8_260917/test/unit/deploy/deploy-sh.test.ts:50)), 기본 성공 테스트는 상태 없이 호출하여 `exit 0`을 기대합니다([104행](/home/user/ERP_PLANT8_260917/test/unit/deploy/deploy-sh.test.ts:104)). 계획대로면 이 테스트부터 실패합니다. 기존 정상·후속 단계 실패 테스트에는 버킷 존재를 기본 준비하고, 버킷 없음 사례만 명시적으로 제외해야 합니다.

4. **MAJOR — 06의 서명 UI 구현과 E2E 작성 순서가 TDD 계약을 어깁니다.**  
   [06-PLAN:318](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-06-PLAN.md:318)의 선행 테스트는 좌표 계산만 검증합니다. 이어 [320행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-06-PLAN.md:320)에서 키보드 조작·알림·잉크 판정 UI를 구현하고, 해당 동작의 E2E는 [322행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-06-PLAN.md:322)에서 작성합니다. 이는 [CLAUDE.md:106](/home/user/ERP_PLANT8_260917/CLAUDE.md:106)의 실패 테스트 선행 규칙과 충돌합니다. 해당 E2E 작성·실패 확인을 UI 구현 앞으로 옮겨야 합니다.

5. **NOTE — 제출 커밋 뒤 로그 실패는 재전송으로 복구되지 않습니다.**  
   [06-PLAN:206](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-06-PLAN.md:206)은 커밋 뒤 로그를 기록하지만, 같은 키 재전송은 [200행](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-06-PLAN.md:200)에서 즉시 성공을 재생합니다. 실제 [record.ts:133](/home/user/ERP_PLANT8_260917/domain/action-log/record.ts:133)의 로그 INSERT가 실패하면 확인증만 저장되고 로그는 영구 누락될 수 있습니다. 제출 로그의 원자성 또는 복구 계약을 명시하고 실패 주입으로 확인할 필요가 있습니다.

VERDICT: FAIL

tokens used: 4169723
EXIT 0
