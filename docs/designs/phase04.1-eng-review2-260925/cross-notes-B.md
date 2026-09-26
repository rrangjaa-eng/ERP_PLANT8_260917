# 04.1 eng-review 2회차 반영 — 갈래 B(02·04·05) 플래너의 교차 메모

02 · 04 · 05 수정 중 다른 파일에 걸린 것만 적는다. 이 파일들은 고치지 않았다.

## 04.1-01 (플래너 A)

- **B-NEW02**: 04 Task 2 통합 (i)(비uuid `org_unit_id` 가져오기 → `ImportValidationError`, `""`는 통과)은 01:308 키 정의가 `z.union([z.literal(""), z.string().uuid()])`로 바뀌어야 녹색이 된다. 04는 `keys.ts`를 고치지 않고 `export.ts`에 형식 코드도 덧대지 않는다. judge.md는 `role_id`도 같은 모양으로 맞추라고 권한다(text 열이라 INSERT는 안 깨짐, 일관성용) — 01 판단.
- **A-01**: 05 Task 2 ②와 truth는 「종결 상태(`approved` · `rejected` · `withdrawn`)면 `getApprovalView`가 walkRoute 없이 저장된 처리 기록만 준다」를 전제로 한다. 05 E2E(CXF-B-F03 줄)는 최종 승인 문서 결재선에 `담당 없음`이 없다고 단언한다.
- **B-A1**: 02 Task 1 ④가 01의 `domain/approvals/dto.ts`에 DTO `ApprovalActionResultDto`(`nextHolderNames` · `drafterName` → `approval.value`, `deductedDays` → `leave.value`)와 `projectActionResult`를 더한다. 02 frontmatter와 Task 1 files에 이 파일을 넣었다. 01이 이 파일에 대해 「02가 고치지 않는다」 같은 조건을 두었다면 서로 부딪친다.

## 04.1-06 · 04.1-VALIDATION (플래너 C)

- **B-C3**: 05의 `error.tsx` 둘을 `retry`로 바꿨다(Next 16.3 `error.md` 117–157행 · `app/(app)/projects/error.tsx`). 06의 `/leave` `error.tsx`도 같은 인자를 쓰는 편이 맞다. 02 Task 3의 자동 재시도 금지 grep은 이제 `--exclude=error.tsx`다 — 06이 그 경로 아래 `error.tsx`에서 `retry`를 써도 02 수락 기준이 깨지지 않는다.
- **B-A1**: 연차 신청 · 다시 신청 토스트는 이름 조각이 투영에서 빠지면 `연차 신청 · 결재 요청됨` · `연차 다시 신청 · 결재 요청됨`으로 줄어든다(02 ④). 06이 `leave-form.tsx`에서 토스트를 다시 조립한다면 받은 필드만으로 조립해야 한다.
- **B-C7 · B-T5**(P3, 02 · 05에서 미룸): E2E 픽스처 이름이 모두 같은 문제와 `/leave/new` 404 E2E는 06의 C-07(고유 이름 `registerPerson`)과 06 E2E에서 함께 처리할 수 있다.
- **VALIDATION에 추가할 행**: 04 `test/unit/settings/effective-from-rule.test.ts`의 취소 경로 사례(B-NEW01 — 비정규 날짜 셋 · `year_start` 형식/지난 연도 · 서울 연초 경계) · 04 `test/integration/settings-export.test.ts` (i)(B-NEW02) · 02 `approvals-lifecycle.test.ts`의 액션 반환 투영(B-A1) · 02 `document-kinds-import.test.ts`의 `"use client"` 검출기(B-A3) · 02 `conflict-message.test.ts` + `approvals-concurrency.test.ts`의 `다시 신청함` 문구(B-C1) · 05 `leave-document.spec.ts`의 종결 문서 결재선 `담당 없음` 부재(A-01).

## 04.1-UI-SPEC (담당 플래너 없음 — 조정자가 판단)

- **B-C1**: 205행 동시 처리 문구에 여섯째 `{기안자}이/가 HH:MM에 다시 신청함 · 새로 고침`을 더해야 한다(02 Task 3 ①이 새로 만든 문구다).
- **B-A1**: 214행 토스트 문구에 「이름 · 일수 조각이 투영에서 빠지면 그 조각을 뺀다」(`승인 · 결재 요청됨` · `승인 · 최종 승인` · `반려 · 기안자에게 돌아감` · `연차 신청 · 결재 요청됨` · `연차 다시 신청 · 결재 요청됨`)는 메모를 더해야 한다.
