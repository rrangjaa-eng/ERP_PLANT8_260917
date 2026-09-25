<revision_context>
**Phase:** 04.1 (결재 모듈·연차) — repo /home/user/ERP_PLANT8_260917, branch claude/phase-04.1-plan-1iqtwe
**Mode:** revision (targeted — surgeon, not architect). Contract: .claude/gsd-core/references/planner-revision.md

Source of issues: docs/designs/plant8-erp-phase04.1-eng-review-260924.md — 「반영 지시」 table items 1–9 (BLOCKERS) and list items 10–25 (MEDIUM/LOW). Raw Codex text if you need more detail: docs/designs/plant8-erp-phase04.1-eng-review-260924-codex.md. Each item names plan:line, the problem (evidence), and 「고칠 것」 (the required property). Line numbers are from an older revision and may have drifted slightly — locate by content.

<required_reading>
- The eng-review report above (only the items assigned to you, plus the shared definitions below)
- Your assigned PLAN files (read them fully)
- .planning/phases/04.1-approvals-leave/04.1-UI-SPEC.md only where your items need copy/strings
- Existing code only where an item cites it (e.g. domain/settings/registry.ts, lib/actions/handle-server-error.ts)
</required_reading>

RULES
1. Edit ONLY the files assigned to you below. Other planners are editing the other plan files IN PARALLEL right now. Do not touch 04.1-VALIDATION.md, 04.1-UI-SPEC.md, 04.1-REVIEWS.md, STATE.md, hook scripts, or any source code. Do not create git commits and do not push — the orchestrator does that.
2. Write as you go: after reading your plan(s), apply each fix to the file immediately, one item at a time. Do not spend more than a few minutes reading before your first edit (a planner that reads >10 min without writing is stopped).
3. Keep the existing Korean style and structure of the plans (frontmatter must_haves/truths, <behavior>, <action>, <acceptance_criteria>, <verify>, files_modified, threat model). Tag each change inline with its item, e.g. `(ENG-3)` or `(R1)`. Update frontmatter `files_modified`/artifacts when you add a file.
4. Every behavior change needs a concrete test case (unit, integration or E2E) in the task's behavior list, following the TDD RED→GREEN pattern the plans already use. Tests must not depend on wall-clock dates without injection (use deps.now / seoulToday / leaveWeekdayRange patterns already in the plans).
5. Migration rule (project, revised 2026-09-24 20:52 KST): NO reserved migration number ranges and NO merge-order constraint. On the branch use whatever `pnpm db:generate` gives; right before merge: merge origin/main, delete own migration + snapshot (+ journal entry), re-run `pnpm db:generate` so the number is main last+1.
6. No new dependencies. No `any`. pnpm only.
7. If a fix would contradict a locked user decision, return ## REVISION_CONFLICT for that item (and still apply the rest).

SHARED DEFINITIONS (decided by the orchestrator — apply exactly; all planners use the same wording so plans stay consistent)
- D1 (ENG-6 conflict detail): 「관련자」 = 기안자 · 이 인스턴스에서 단계를 처리한 사람(acted_by, 모든 차수) · 지금 차수 단계들의 지금 해석한 담당(기안자 제외 전 담당 집합). approveDocument(및 반려·회수 등 version을 받는 모든 전이)에서 version 불일치일 때 viewer가 관련자면 상세 충돌 오류(ApprovalConflictError — 처리자 이름·시각·상태 문구, 04.1-02 Task 3가 조립), 관련자가 아니면 NotCurrentHolderError(`지금 담당이 아님 · 새로 고침`)이고 log.info reason은 "not_holder". 무관한 사용자가 옛 version으로 부르면 이름·시각·상태가 담긴 문구를 절대 받지 않는다 — 통합 테스트로 단언.
- D2 (ENG-3 orphan final): walkRoute가 「후보 0명 · 이번 차수 승인 ≥ 1 → 최종」을 내는 것은 approveDocument 안에서 **지금 viewer의 승인을 더한 뒤** 계산할 때만 정상(approve_final). 행동 전 계산(getApprovalView · listMyInbox · approveDocument의 후보 판정)에서 DB 상태가 submitted/in_review인데 walkRoute가 「최종」을 내면 그 문서는 「막힘」과 똑같이 다룬다: 지금 단계 `담당 없음` 표시 · 누구의 결재함에도 없음 · log.warn("approval.route_blocked") · approveDocument는 NotCurrentHolderError · 기안자 회수는 가능 · 관리자가 담당을 복구하면 다시 처리 가능. 읽기 경로에서 상태를 쓰지 않는다(쓰기 부작용 없음). 이 판정은 한 함수에 두어 읽기·쓰기 경로가 같은 결과를 낸다. 통합 테스트: 「대표가 1단 승인 → 2·3단 담당 전원 보관 → getApprovalView 막힘 · 결재함 0건 · log.warn 1회 · 기안자 회수 성공 · 담당 복구 뒤 새 담당이 승인 가능」.
- D3 (ENG-12 「남음」): 연차·월차 각 줄의 남음 = 부여(+조정) − 사용(승인됨) − 결재 중(진행 중 신청). 「진행 중 제외」 같은 모호한 표현을 이 정의로 바꾼다. 한 픽스처로 문자열과 DTO 값을 같이 단언.
- D4 (ENG-11 월차 줄 표시): 잔고 DTO/문자열의 월차 줄은 「조회 기준일이 근속 첫 1년(입사일 ~ 입사일+1년 전날) 안이거나, 조회 연도에 월차 부여(적립)가 하나라도 있으면」 존재하고, 값이 0이어도 `월차 남음 0일`(잔고 행) / `월차 적립 0일 · 사용 0일 · 결재 중 0일 · 남음 0일 · {소멸일} 소멸`(잔고 줄)로 보인다. 입사일이 없으면 기존대로 `월차 계산 불가 · 입사일 없음`. 그 밖(근속 1년 지나고 그 해 월차 부여 없음)이면 월차 줄 없음. 두 남음을 더한 숫자는 여전히 금지.
- D5 (R1 — USER DECISION 2026-09-24 21:45 KST, card option B 「근무 기간 비례」, overrides the old 「전부 15일」 assumption): 입사 연도 H에는 회계연도 연차 0(월차만 — 기존). 입사 다음 해 H+1의 1월 1일 연차 부여 = 0.25일 단위 올림( annual_days(H+1) × 근무일수(H) / H의 날수 ). 근무일수(H) = 입사일 ~ H-12-31(양끝 포함), H의 날수 = 365 또는 366, annual_days(H+1) = 이력형 설정 `leave.annual_days`의 (H+1)-01-01 시점 값. 정수 1/4일 산술: quarters = ceil(annualQuarters × worked / daysInYear). 올림 이유: 법정 일수보다 적어지지 않게(직원에게 불리하지 않은 쪽). 1월 1일 입사면 전액. H+2부터는 기존 규칙(그 해 설정값 전액). 퇴직 규칙(ENG-4)이 우선 — H-12-31 이전 퇴직이면 H+1 부여 없음. 퇴직 때 법정(입사일 기준) 대조 계산·수당 정산은 이 페이즈 밖(D-97 연차 수당 정산과 함께) — Deferred에 한 줄. 계획 가정 1(「Y+1부터 연차 전액」)은 이 규칙으로 바꾸고 출처를 「사용자 결정 2026-09-24 21:45 KST(카드 B)」로 적는다. 예시·테스트에서 입사 다음 해 연차가 15로 적힌 곳(예: 입사 2026-10-01 → 2027 연차)은 비례값으로 고친다: 입사 10-01(평년) → 근무 92일 → ceil(60×92/365)=ceil(15.12)=16 quarters = 4일. E2E처럼 연도가 실행 시점에 따라 바뀌는 곳은 리터럴 대신 04.1-03 순수 함수로 계산한 값을 쓴다. 단위 사례: 1월 1일 입사(전액) · 10월 1일 평년(4일) · 윤년 입사 · 12월 31일 입사(1일 근무 → 0.25일) · 입사 연도 안 퇴직(부여 없음).
- D6 (ENG-8 연도 선택): `/leave?year=`는 정수이고 2000 ≤ year ≤ 올해이면 그 연도를 그대로 보여 준다(신청이 없으면 UI-SPEC의 지난 연도 EMPTY 문구, 예: `… · 올해 보기`). 미래 연도·형식 오류·범위 밖만 올해로 바꾼다. 연도 select 옵션 = min(가장 이른 신청 연도, 요청 연도) ~ 올해. truth · 계획 가정 · E2E를 이 한 규칙으로 맞춘다.

Return format: `## REVISION COMPLETE` (or `## REVISION_CONFLICT`) with the table of changes (plan · change · item), then `### New or changed test cases` listing file · case name (one line each) so the orchestrator can update VALIDATION.md, then `### Cross-plan notes` for anything another plan must also say (the orchestrator will relay). Keep the return under 60 lines.
</revision_context>
