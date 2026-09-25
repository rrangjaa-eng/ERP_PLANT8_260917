# 04.1 Round 2 Plan Check — only the parts changed in this round (CX-* / R-ids)

**Result:** ISSUES FOUND. 0 blockers, 2 warnings, 1 info.

## Locked interfaces — cross-plan consistency
| Interface | Plans | Status |
|---|---|---|
| previewRoute -> RoutePreviewDTO (01 owns it, 06 consumes it) | 01:84,122,526,608 / 06:113,254,273,275,277 | Consistent. 06 dropped its own definition and removed domain/approvals/index.ts from its files. Names are shown only when approval.value passes. Leak-scan registration is routePreview/routePreviewStep. |
| listLeaveAdjustmentsForUser -> LeaveAdjustmentDTO (03 to 06) | 03:52,320,351 / 06:57,117,312,334,354 | Consistent. Uses the admin.people **view** check, per the orchestrator's override. 06 has a grep acceptance check for 0 repositories/ imports. |
| deps.now (03 to 05) | 03:53,217,309,350 / 05:203,204 | Consistent. There is one seoulToday(deps?.now) entry point, plus a check for 0 `new Date(` calls. 05 passes `now` through listMyInbox(viewer, {withDetails, now}); 01:522 has signature listMyInbox(viewer, deps?). |
| canResubmit (01, 02, 05, 07) | 01:143,303 / 02:298,302,323 / 07:104,185 | Consistent. It is an optional field; leave registers `canResubmit: canWriteLeave`, the same function assertLeaveWrite uses. |
| Event-aware terminal rule (01 and 02) | 01:303 / 02:58,294,365 | The same rule appears in both plans. 02:284,322,357 has the tests: drafter resubmit from rejected succeeds; approve/reject/withdraw on rejected, and resubmit on approved/withdrawn, are rejected with no row changes. |
| CX-R01 (01's own D1 test) | 01:425 | Text is asserted only for the unrelated PM. The drafter check asserts only the error type. |

## Per-finding
- CX-B2 test (03:309, 05:203): two injected dates give different values, so the test fails on the old code. No wall-clock dependence.
- CX-R2 test (03:300): uses fixed deps.now values and checks ordering and year windows. OK.
- CX-R3: 01 has a projection on/off integration test. 06 E2E uses a hidden rank with a positive control (06:268).
- CX-R1 / R10 (07:91,138-153,165,208): the UP_TO_DATE branch is chosen with `merge-base --is-ancestor`. Verify #1 checks both branches and that the chosen branch matches the recorded one. The db:generate RC is captured separately from the grep result. The Task 2 base is MAIN_SHA. Commands look correct.
- CX-R5 (06:51,203): users without write see no apply button. The E2E has a positive control.
- CX-R8 (06:204): onStableSeoulDay is unit-tested with an injected today. Each case can fail. No wall-clock dependence.
- CX-R4 (06:170,254): order relies on Next 16 sequential action dispatch (cited in the docs). No guard code is added.
- CX-R6 / R9: these only change copy or loading states. They are consistent with the UI principle (no new guidance text).

## Warnings
1. [key_links / UI usability] **Required property:** When approval.value is hidden, the route preview still shows at least the step labels.
   Evidence: 01:608 and 06:254 gate the step `label` behind **role.value**. For a rank that lacks both approval.value and role.value, the DTO drops both names and labels, so the S2 line is empty or broken. The brief says: "otherwise steps carry role/seat labels only". Neither 06 nor 01 has a test or a fallback for the both-hidden case.
   Example fix (non-binding): leave labels unprojected, or define and test what S2 renders when both are hidden.
2. [consistency] **Required property:** Statements about test_memo in 01 do not contradict each other.
   Evidence: 01:303 says "테스트 전용 종류 `test_memo`는 없다" ("there is no test-only kind test_memo"), yet 01:403/468/488 and 02:302 rely on test_memo existing, test-only. The intended meaning is probably "test_memo has no canResubmit", but an executor could read 01:303 as "delete test_memo".
   Example fix (non-binding): reword 01:303 to "test_memo는 canResubmit을 등록하지 않는다" ("test_memo does not register canResubmit").

## Info
1. CX-R4 depends on framework behavior instead of a guard. That is acceptable only if the 06 E2E actually issues two quick changes and checks that the final render matches the last input. Confirm the E2E does this at execution time.
