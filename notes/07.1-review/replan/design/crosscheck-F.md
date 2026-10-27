# Codex 막음 주장 3건 사실 대조 (체크아웃 /home/user/wt-r2 · af52724 · 읽기 전용)

## 1) 07.1-01-PLAN.md:511 시드 pre-settle-evidence-pending → /expenses/evidence 404 : **사실 (단 근거 줄 보정)**
- 계획 줄: 07.1-01-PLAN.md:511 `codex-design-review.sh /expenses/evidence /projects/{projectId}/settlement ... --seed pre-settle-evidence-pending` (:512 main 기준도 동일).
- 시드는 로그인 계정을 `viewer`로 정한다: scripts/codex-design-review/seeds.ts:170 `return { vars: { projectId: project.id }, viewer: org.drafter };` — drafter는 seeds.ts:70 `makePerson("기안", "role-pm", ...)` (PM 계급 기안자). capture.spec.ts:23-25가 `seeded.viewer`의 email/password로 로그인, :50은 응답 ok 단언.
- 이 시드가 따로 만든 임시 계급(seeds.ts:153-157)은 `expenses`·`expenses.evidence_attach`·`expenses.evidence_void`만 주고 `evidence.intake`는 없다. 그 계급의 사람은 viewer가 아니다(drafter가 viewer).
- 페이지 가드: app/(app)/expenses/evidence/page.tsx:33 `if (!(await can(viewer, "evidence.intake", "write"))) notFound();`
- role-pm에 intake 없음: domain/seed/role-defaults.ts:36 주석 「등록(evidence.intake)은 어느 시드 계급에도 켜지 않는다」, :37 증빙 `view`만 DEFAULT_ROLE_ID·TEAM_LEAD_ROLE_ID.
- 보정: 인용 줄은 role-defaults.ts:36(주석)·:37(실제 view 행). 그 외 일치. 지난 실행 기록 RUNS.md:21·25가 같은 현상(기안자 시드로 /expenses/evidence 404, exit 1 → 01a/01b 분리)을 실측으로 확인.
- 로그인 방식(시드가 계정을 정함): capture.spec.ts:22-27 `seeded ? seeded.viewer : 새 SYSADMIN`. lib/sh에는 계정 선택 로직 없음(codex-design-review.sh는 --seed만 넘김, lib.ts:92-95 이름 검증).
- 06 계획이 이 경로 조합을 우회하는 문구는 01 계획 본문에서 못 찾음(grep `404|01a|01b|evidence-intake-filled` 0건). 대안 시드 `evidence-intake-filled`(seeds.ts:541, 등록 계급 viewer)는 있으나 01 계획은 쓰지 않음.
- b9acdd8 대비: 511 줄의 시드·경로는 b9acdd8(해당 줄 :482)에도 동일(`git show b9acdd8:...01-PLAN.md`에 `pre-settle-evidence-pending` 3회, diff에 시드 줄 변경 없음). 즉 **지난 디자인 검토가 이미 볼 수 있던 줄**. (diff 전체는 +97/-27이나 이 줄과 무관.) 지난 검토가 놓친 것이며 RUNS.md의 실행 기록은 실행 단계에서 발견.

## 2) 07.1-05-PLAN.md:307 · 07.1-11-PLAN.md:269 시드 없는 기본 목록 촬영 : **사실 (계획이 다른 방법을 두지 않음)**
- 05:307 `codex-design-review.sh /expenses/evidence /admin/action-log ...`(--seed 없음), 11:269 `... /cards ...`(--seed 없음). capture.spec.ts:22-27: 시드 없으면 새 SYSADMIN 계정.
- DB 초기화: playwright.codex-design.config.ts:3-5 주석이 「기본 설정의 webServer·globalSetup(erp_test 초기화)을 그대로 쓴다」, `...base` 스프레드(:21)로 globalSetup 상속, test/e2e/global-setup.ts:12 `await resetTestSchema(pool)` → 촬영마다 DB 초기화 후 시드 기본 데이터만. 따라서 05의 5,001건 비활성 이유·11의 보관 카드·열린 카드 폼 같은 상태는 이 촬영으로 안 찍힘.
- UI-SPEC:632 (실제 4번 항목, 줄 632 인근): 「바뀐 표면을 찍는다… URL로 닿는 상태는 경로·시드를 플랜에 지정하고, 열린 시트·대화상자는 E2E에서 main과 같은 시드로 같은 4폭 캡처+DOM 표를 남기고 SUMMARY 증거 표에 기록. 바뀐 표면이 캡처에 없으면 완료가 아니다.」
- 05·11 계획 본문 전체 검색 결과: `design-capture` 0건, `바뀐 표면` 0건, 대체 캡처 스펙·파일 목록(`<files>`)에도 없음. 5,001건 E2E(05:155-156)·보관 카드 E2E(11:172)는 단언용이지 DESIGN_CAPTURE_DIR 캡처가 아님. verification 줄은 ①②③④만(05:306-310, 11:268-272). 대조: 14·16·09·02는 각 4회, 18은 8회 `design-capture-07.1-NN.spec.ts`를 넣음(`grep -c`) — **05·11·01·17·19는 0**.
- b9acdd8 대비: 05(:278)·11(:237)의 ① 줄은 동일 형태(시드 없음, 경로 동일). `git diff`에서 이 두 줄의 경로 변경 없음, design-capture는 b9acdd8에도 없음. 즉 **지난 검토도 이미 볼 수 있던 줄**이며 F4 해결(전용 캡처 스펙)이 05·11에는 적용되지 않았다.
- 판정 근거 요약: 전용 캡처 스펙 없음 → 주장 사실.

## 3) 07.1-18-PLAN.md:392 /certs/events 촬영 404 : **사실 (일부 보정)**
- 계획 줄 392 ① 경로 목록에 `/certs/events`(둘째 마지막), :393 ②도 동일. 이 경로는 b9acdd8 계획에는 **없었음**(`git show b9acdd8:07.1-18-PLAN.md | grep -c certs/events` = 0) — 재계획 D-E7로 새로 들어온 줄이라 지난 디자인 검토가 본 적 없음(diff에 ①②의 경로가 +로 나옴).
- app/(app)/certs/events/page.tsx:29 `await assertCertFeatureEnabled();` → lib/certs/feature-guard.ts `if (!enabled) notFound()` → domain/certs/feature.ts `isCertFeatureEnabled`: `env.CERT_FEATURE_ALLOWED === "true"`이면서 `getSettingValue(CERT_ENABLED)`.
- domain/settings/keys.ts:349 `default: false`(cert.enabled).
- 보정 1: **환경 게이트는 촬영에서도 열린다.** playwright.config.ts:26 `process.env.CERT_FEATURE_ALLOWED ??= "true"`를 codex 설정이 `import base`로 실행하므로 webServer가 이 값을 상속. 막는 것은 DB 설정 `cert.enabled=false` 하나뿐.
- 보정 2: 설정을 켜는 곳은 test/e2e/cert.setup.ts(프로젝트 `cert-setup`, playwright.config.ts:181). 촬영 설정 `projects: [{ name: "capture" }]`(playwright.codex-design.config.ts:24)에는 이 프로젝트·의존이 없고, scripts/codex-design-review/ 안에 cert 관련 코드 0건(grep). 시드(seeds.ts)·lib에 cert.enabled를 켜는 길 없음. → globalSetup이 DB를 초기화(default false)해 `/certs/events` 404 → capture.spec.ts:50 `expect(response?.ok(), ...)` 실패(응답 404) → 촬영 전체 exit 1 가능(18 ①이 12경로 한 번에 돌려서 다른 11경로 산출물도 같이 막힘).
- 계획 쪽 준비 단계: 18 계획에서 `cert.enabled`·`cert-setup` 문구를 `grep`했으나 ①②③ 어디에도 준비 단계 없음. ⑤(:396)·⑥(:290)의 design-capture-07.1-18.spec.ts는 `--project=desktop`으로 돌려 `/certs/events`를 State 캡처에 포함하지만, 이 스펙도 cert.enabled를 켠다는 서술은 없고(desktop은 cert-setup에 의존하지 않음, playwright.config.ts:130·166-189 의존 사슬), ①②의 Codex 촬영은 별개라 404 문제는 그대로.
- 판정: 사실. 보정은 「환경 게이트는 열려 있고 설정 기본값 false가 원인」이라는 점.

## 종합
| 건 | 판정 | 지난 검토가 본 줄? |
|---|---|---|
| 1 (01:511 시드 404) | 사실 | 예 — b9acdd8 :482 동일 줄 |
| 2 (05:307·11:269 캡처 미충족) | 사실 | 예 — b9acdd8 05:278·11:237 동일 |
| 3 (18:392 /certs/events) | 사실(원인 보정) | 아니오 — 재계획에서 새로 들어온 경로 |
- 확인 한계: 실제 실행은 안 함(읽기·diff만). 3의 404는 코드 경로로 따진 것(짐작 아님: 가드·기본값·설정 구성 줄 인용)이나 실제 두드림은 아님.
