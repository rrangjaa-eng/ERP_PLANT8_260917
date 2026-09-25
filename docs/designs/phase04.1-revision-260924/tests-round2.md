# 회차 2 (Codex 1회차 반영) 새·바뀐 테스트
## 01
- test/integration/approvals-route-fixed.test.ts · ENG-6/D1 단독 옛 version: 이름·HH:MM 없음은 무관한 PM만, 기안자는 오류 종류만 (CX-R01, changed)
- test/integration/approvals-inbox-projection.test.ts · previewRoute approval.value 켬: drafterName + 단계 holderNames, 빈 자리 생략, 쓰기 0행 (CX-R3)
- test/integration/approvals-inbox-projection.test.ts · previewRoute approval.value 끔: 단계 키 [label, skipped]만, 이름 없음 (CX-R3)
- test/integration/leak-scan.test.ts · routePreview · routePreviewStep · leaveAdjustment 자동 생성 사례
## 03
- test/unit/domain/leave/balance.test.ts · 첫해 초과분 0부여 연차 칸 (CX-R02) · annual_days 0 (CX-R02)
- test/integration/leave-balance.test.ts · 주입 시계 두 날짜 = 순수 함수 값 (CX-B2)
- test/integration/leave-balance.test.ts · 조정 기록 연도별 목록 · 여섯 키 · admin.people view만 있는 계급도 목록 · 권한 없는 기획 PM ForbiddenError (CX-R2)
## 02
- test/integration/approvals-lifecycle.test.ts · 반려 문서 기안자 다시 신청 성공 · 반려 문서 승인/반려/회수 거부 · 승인됨/회수됨에서 다시 신청 거부 (CX-B1)
- test/integration/approvals-concurrency.test.ts · 반려 문서 관련자 셋 `{팀장}이/가 HH:MM에 반려함 · 새로 고침` · 무관한 PM not_holder · 뒤이어 기안자 다시 신청 성공 (CX-B1)
- test/integration/approvals-concurrency.test.ts · 무관한 PM(leave write) 옛 version resubmitLeave → 일반 문구 (CX-W4)
- test/integration/leave-permission.test.ts · write 끄면 [다시 신청] 사라짐 · [회수] 유지 · 다시 켜면 복귀 (CX-W1)
## 05
- test/integration/leave-balance.test.ts · 결재함 상세 잔고 주입 now 두 날짜 일치 (CX-B2)
- test/unit/domain/approvals/document-kind-registry.test.ts · 엔진이 now를 loadDetails로 넘김 (CX-B2)
## 04
- test/unit/domain/approvals/settings-options.test.ts (new) · routeActiveWhen 12키 · isSettingActive (CX-W2)
- test/integration/settings-approval-route.test.ts · 종속 값 보존 후 다시 켜면 적용 (CX-W2)
- test/e2e/settings-approval-route.spec.ts · `1단 특정 부서` disabled · `3단 특정 부서` enabled (CX-W2) · playwright --list 결과 먼저 담기 (CX-W3)
## 06
- test/unit/e2e/leave-dates.test.ts · onStableSeoulDay 5사례 (R8) — 06이 02의 test/e2e/leave-dates.ts에 도우미 추가
- test/e2e/leave-list.spec.ts · 보기 전용 계급 연차 신청 버튼 없음 (R5) · approval.value 숨김 결재선 계급 이름만 (CX-R3) · 미리보기 응답 순서 (R4)
- test/e2e/admin-person-leave.spec.ts · 보기 전용 관리자 표 보임·추가 폼 없음 · 권한 없음 섹션 없음 (CX-R2) · 월차 비활성 두 경우 (R5) · 지난 연도 정정 링크 이동 (R6, changed)
## 07
- T1 verify #1 두 경로(병합 / 이미 최신) · #3 db:generate 종료 코드 · T2 verify #4 buildDetailRows · #5 MAIN_SHA 기준
