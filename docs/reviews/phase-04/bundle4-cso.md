# 묶음 ④ (PR #85) /cso 보안 감사

- 상태: **partial**. 정적 감사만 했다(실행·재현 없음). 범위는 `git diff 90465dc..origin/ccr-dd6b4285-ekko98`(docs/·.planning/ 제외, 97파일). 독립 검토자가 없어서 순차 반박(sequential challenge)으로 대신했다.
- 결론: **이 범위에서 고쳐야 할(High/Medium) 확인된 취약점은 없다.** Low 1건, Info 3건.

## 발견 표

| id | 등급 | 확신 | 위치 | 문제 | 추천 |
|---|---|---|---|---|---|
| C1 | Low | 중 | `ui/table/use-dirty-storage.ts` · `ui/logout/use-logout.ts` | `quote-ledger:dirty*`는 로그아웃에 **성공**했을 때만 지워진다. 세션 만료·로그아웃 실패·탭 닫기 뒤에는 미저장 편집(금액·리저브 줄 포함)이 localStorage에 평문으로 남는다. 키에 viewer id가 붙어 있어 **다른 사용자가 로그인해도 화면에 복원되지는 않는다**(확인함). 남는 위험은 공용 PC에서 개발자 도구로 저장소를 직접 읽는 경우뿐이다. | 지금 고칠 필요는 없다. 원하면 로그인 성공 시(또는 앱 셸 마운트 시) 현재 viewer id가 아닌 보관본 키를 지우는 한 줄을 넣는다. |
| C2 | Info | 높음 | `domain/reserves/index.ts` `RESERVE_DTO_SPEC` vs `listReserveReferences` | 대장 DTO의 `clientName`은 `reserve.amount`만 요구하는데, 선택지(clients)는 `reserve.amount + vendor.value` all-of를 요구한다. 같은 이름에 게이트가 두 가지인 불일치다. `vendor.value` 기본값이 참이라, 실제 노출 차이는 관리자가 vendor.value를 끈 계급에서만 생긴다. | 항목 2 참조. 일관성을 원하면 DTO `clientName`도 `projectName`처럼 `[reserve.amount, vendor.value]` all-of로 바꾼다. |
| C3 | Info | 높음 | `domain/archive/index.ts` `listArchive` | R3로 `canViewReserves`(pnl 보기 + reserve.amount)가 없으면 리저브 줄이 빠진다. 확인함. 보관함 자체도 `archive.value`(기본 거짓, 관리자 화면) 게이트 뒤에 있다. | 유지. |
| C4 | Info | 높음 | `app/(app)/pnl/reserves/actions.ts`, `domain/settings/export.ts`, `ui/table/parse-tsv.ts`·`use-clipboard-paste.ts` | 입력 검증 점검 결과 이상 없음. 리저브 액션: uuid·enum·길이 검사, 줄 수 상한 300, 날짜는 도메인 `isCalendarDate`, 금액 ≤0 거부, 증빙 종류는 코드표 대조, 권한은 `saveReserves`의 pnl 쓰기 + reserve.amount. 설정 가져오기: 순번 시작값 낮추기 가드를 쓰기와 같은 트랜잭션에서 지난다(R7). 붙여넣기 파서: 클라이언트에서 문자열만 나누고, 서버 저장은 같은 액션 검증을 지난다. | 없음. |

## 지정 항목별 판단

1. **로그아웃 뒤 초안 잔존**: 막힌 것을 확인했다. `quote-table.tsx:1223`·`reserves-table.tsx:580`이 `viewerDirtyScope(viewerId, …)` 키를 쓰고, 로그아웃에 성공하면 `clearAllDirtyEdits()`가 접두어 `quote-ledger:dirty`로 시작하는 키 전체(옛 형식 포함)를 지운다. 남은 경로는 다음과 같다.
   - 로그아웃 실패: 세션이 그대로라 같은 사용자다. 문제 아님.
   - 세션 만료·다른 사용자 로그인: 키가 달라 복원되지 않는다. 다만 데이터는 저장소에 남는다(C1, Low).
2. **리저브 clientName에 vendor.value도 요구해야 하나**: 근거는 다음과 같다.
   - `info-items.ts`에서 `vendor.value`는 거래처 정보(기본 참)다. `archive.value` 주석은 "여러 표를 섞은 화면이라 표 전용 항목으로 게이트할 수 없다"고 적고 있다.
   - B-15(D-59)는 "대장 전체를 reserve.amount로 게이트하고 부분 노출을 금지"하라고 할 뿐, vendor.value는 언급하지 않는다.
   - 보관함은 이미 archive.value + reserve.amount 두 겹이다. 대장 본 화면 DTO도 clientName에 vendor.value를 요구하지 않는다. 보관함에만 추가하면 규칙이 오히려 셋으로 갈라진다.

   **추천: 보관함에는 추가하지 않는다(필수 아님). 일관성을 원하면 대장 DTO clientName을 `[reserve.amount, vendor.value]` all-of로 바꾸고, 보관함도 같은 규칙을 따르도록 함께 바꾼다.**
3. **그 밖**: 이 diff의 인증·권한·외부 입력에서 실제 취약점은 없다(C4).

## 커버리지·한계
- gstack-cso 헬퍼 run은 시작했지만 소스는 git으로 직접 읽었다. worktree가 base 커밋(90465dc)에 있어서 PR 브랜치 `origin/ccr-dd6b4285-ekko98`를 git show/diff로 읽었다. 스캐너·런타임 재현은 없다.
- 보지 못한 부분: `reserves-table.tsx`(1267줄)의 렌더링 세부, 마이그레이션 0018의 권한(REVOKE) 세부.

## 사용자 결정

- 2026-09-28 채팅: 항목 2(C2) → **(가) 지금대로.** 리저브 clientName은 reserve.amount만 요구한다(B-15). vendor.value는 추가하지 않는다. 코드 변경 없음.
