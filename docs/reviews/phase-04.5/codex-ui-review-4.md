3차의 **MAJOR 6건·MINOR 1건 모두 RESOLVED**입니다. 새 MINOR 1건이 있습니다. 파일은 수정하지 않았습니다.

`S` = [.planning/phases/04.5-custom-field-admin/04.5-UI-SPEC.md](/home/user/ERP_PLANT8_260917/.planning/phases/04.5-custom-field-admin/04.5-UI-SPEC.md), 줄 번호는 작업 사본 기준입니다.

| 3차 지적 | 판정 | 근거 |
|---|---|---|
| MAJOR #4 삭제 확인 방식 | RESOLVED | S:324·328, `SYSTEM.md:671`, `DECISIONS.md:557–570` — 관리자 마스터 전체에 적용하고 일괄 전환 시 종료하는 정본 예외 기록. |
| MAJOR #5 pending·포커스 | RESOLVED | S:330–331, `SYSTEM.md:671` — 취소 미잠금·포커스 미복귀까지 공통 예외에 명시. |
| MAJOR #7 오류 위치·접근성 | RESOLVED | S:283 — 기존 `FormAlert` 제거, 제출 버튼 옆 이유 자리와 `aria-describedby`, 검증 항목 명시. |
| MAJOR #11 동시 편집 | RESOLVED | S:262 — 버전 조건부 UPDATE, 보관·복원 시 버전 증가, 충돌 거부·재조회·재마운트 명시. |
| MAJOR #12 권한·직접 진입 | RESOLVED | S:230–232 — 공용 보관·복원에도 두 쓰기 권한 검사. 직접 액션 호출 거부·행 불변·로그 없음 검증 포함. |
| MAJOR 보관 이름 중복 | RESOLVED | S:265 — 보관 여부와 무관한 이름 unique, 기존 key로 채우기, 경합 오류 처리·복원 검증 명시. |
| MINOR X2 위반 근거 오류 | RESOLVED | S:106·329 — accent 자체가 아니라 확인 표면·1차 버튼 중복 문제로 정정. |

새 문제:

- **[MINOR] 복원 권한과 안내·버튼 노출 조건이 다릅니다.** S:232는 복원에 두 **write** 권한을 요구하지만, S:265의 「보관함에서 복원」 링크는 `admin.archive.view`만 검사합니다. 두 메뉴의 view와 정의 write는 있지만 보관함 write가 없는 사용자는 복원을 권유받고 실패합니다. 보관함도 정의 view만으로 행을 남기며, 기존 [archive-table.tsx:66](/home/user/ERP_PLANT8_260917/app/(app)/admin/archive/archive-table.tsx:66)은 복원 버튼을 무조건 렌더합니다. **수정:** 복원 안내·버튼에도 두 write 권한을 반영하고, 불충족 시 이름 오류의 다음 행동을 「이름 바꾸기」로 지정하십시오. 조회 권한이 있는 보관 행은 그대로 열람할 수 있어야 합니다.

이번 개정에서 거래처 밖 관리 범위 확장이나 Phase 4 저장 동작 변경을 요구하는 새로운 계약은 발견하지 못했습니다.

판정: 막는 문제 없음
