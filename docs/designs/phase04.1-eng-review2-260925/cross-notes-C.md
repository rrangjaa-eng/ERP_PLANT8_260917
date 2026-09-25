# 교차 메모 C — 04.1-06 · 07 수정 회차(eng review 2회차)가 다른 플랜에 요청하는 것

작성: 06 · 07 · VALIDATION 담당 planner(2026-09-25). 06 · 07은 아래를 **전제로** 고쳤다. 해당 플랜 소유자가 반영하거나, 반영하지 않으면 06 Task 3 ③을 다시 봐야 한다.

> **상태(같은 회차 대조)**: 03 소유자가 병렬 수정에서 이미 반영했다 — 04.1-03 ⑤에 「04.1-06은 `getLeaveBalanceForUser(…, { fiscalYear: 올해 })` 첫 읽기로 두 날짜를 얻어 … 지난해 퇴직자를 올해로 읽어도 `resignationDate`를 받는다(C-N01 = C-03)」, 퇴직자 연도별 통합 사례에 `resignationDate` = `2026-10-31` 단언, 수락 기준 「(C-N01) … 2025 · 2026 · 2027 세 결과 모두의 `resignationDate` 값을 단언」. 06 쪽 읽기 순서와 일치한다 — 아래 요청은 대조 기록으로만 남긴다(추가 요청 없음). 03 최종본에서 이 문장이 빠지면 06 Task 3 ③의 전제가 깨진다.

## C-N01(T4) → 04.1-03 소유자(planner A)

- 06 Task 3 ③은 읽기 순서를 이렇게 고정했다(리뷰 지시 기본안): 첫 읽기 `getLeaveBalanceForUser(viewer, userId, {fiscalYear: 올해})` → 그 DTO의 `hireDate` · `resignationDate`로 대체 연도(퇴직일이 있으면 min(퇴직 연도, 올해)) → `resolveLeaveYear`로 섹션 연도 → 섹션 연도 ≠ 올해일 때만 둘째 읽기. 입사일 · 퇴직일 입력 칸 초기값과 `checkLeaveAdjustment`의 `hireDate`도 첫 읽기 값이다.
- 이 순서는 **퇴직 연도가 아닌 해로 읽어도 DTO에 `hireDate` · `resignationDate`가 실린다**는 것을 전제로 한다. 지난해 퇴직자(퇴직 `{Y-1}-06-30`)를 올해로 첫 읽기하면, 퇴직일이 없으면 대체 연도가 올해로 떨어져 06 E2E(`?year` 없음 → 부제 `{Y-1} 회계연도`)가 깨진다.
- 03의 지금 문장은 이 점이 모호하다:
  - 04.1-03:217 「`LEAVE_BALANCE_DTO_SPEC`(퇴직 줄에 필요한 입사일·퇴직일을 여기에만 둔다)」 · 「퇴직일이 있고 그 연도가 퇴직 연도일 때만 퇴직 줄 재료를 싣고, 다른 연도면 그 해의 보통 잔고다」 — 두 날짜가 「퇴직 줄 재료」에 속해 퇴직 연도에만 실리는 것으로 읽힐 수 있다.
  - 04.1-03:310 통합 사례 「`fiscalYear` 2027 → 퇴직 줄 재료가 없고 …」도 두 날짜 필드의 유무를 단언하지 않는다.
- **요청(한 문장 + 단언 하나)**: 03 ⑤에 「`LEAVE_BALANCE_DTO_SPEC`의 `hireDate` · `resignationDate` 필드는 조회 `fiscalYear`와 무관하게 늘 싣는다(`leave.value` 투영만 따른다) — 퇴직 연도에만 실리는 것은 퇴직 줄 요약 재료다(04.1-06 사람 상세가 올해 첫 읽기에서 퇴직일을 얻는다, C-N01)」를 더하고, :310 사례의 `fiscalYear` 2027 · 2025 결과에 「`resignationDate`가 `2026-10-31`이다」 단언을 더한다.
- 03이 대신 연도 없는 좁은 읽기(예: `getPersonLeaveDates` — `admin.people` view · `leave.value` 투영)를 더하는 쪽을 고르면, 06 Task 3 ③의 첫 읽기를 그 함수로 바꾸는 한 줄 수정이 06에 필요하다 — 06 담당에게 알려 달라.
- 참고: viewer 계급이 `leave.value`를 숨기면 두 날짜가 투영에서 빠진다. 06은 그때 대체 연도를 올해로 둔다(둘째 읽기 없음)고 적었다 — 03이 다른 투영 규칙을 정하면 알려 달라.

## 그 밖

- C-04(가장 이른 신청 연도)는 01의 `listMyLeave` DTO를 바꾸지 않고 06이 새 읽기 `earliestMyLeaveYear` + `repositories/leave-requests.ts` `findEarliestLeaveFiscalYear`(`min(fiscal_year)`)를 더하는 쪽으로 닫았다 — 01 · 02 · 05 소유자에게 요청할 것 없음. 06이 `domain/leave/index.ts` · `repositories/leave-requests.ts` 끝에 덧붙이므로 01 · 02의 같은 파일 변경과 wave가 겹치지 않는다(06은 wave 6).
- C-01의 기존 E2E 넷(`admin-master-list-first` · `corp-cards` · `mobile-corp-cards` · `single-column`)은 06 files로 들였다 — 07이 고칠 일 없음.
