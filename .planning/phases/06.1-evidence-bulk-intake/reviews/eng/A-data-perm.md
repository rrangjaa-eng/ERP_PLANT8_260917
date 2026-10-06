# 06.1 독립 엔지니어링 검토 A — 데이터 모델 · 권한 · 행 범위

검토 대상: 06.1-01(스키마 · evidenceScopeFor) · 06.1-05(목록 · scopeWhere · 공개) · 06.1-08(풀 · 2차 붙이기), 소비처 06 · 07 · 09 · 12 · 13.
근거 코드: main(63630bb1) + origin/claude/phase-05-execute-pxok9w. 06은 계획 문서만.

요약: P1 0 · P2 4 · P3 7. 확인된 것(문제 없음)은 맨 아래.

---

## P2

### A-1 (P2, 확신 8) 「본부 공개」 대상이 기획본부가 아닐 수 있다 — PA-1이 확정 입력 「모르면 기획본부 전체 공개」와 어긋난다
- 플랜: `06.1-05-PLAN.md:70` "플래너 가정 PA-1: 본부 공개 대상 = 제안 팀의 본부, 제안 팀이 없으면 `sort_order`가 가장 작은 본부(시드의 「기획본부」). 설정 키를 새로 만들지 않는다"
- 확정 입력: `06.1-CONTEXT.md:25` "팀을 알면 그 팀만 공개 / 모르면 기획본부 전체 공개", REQUIREMENTS EVID-07 「본부(기획본부) 공개」(RESEARCH:68).
- 코드: `domain/seed/index.ts:123-126` ORG_SEED에 본부가 둘 — `기획본부`(sortOrder 0) · `경영관리본부`(sortOrder 1). `db/schema/corp-cards.ts:21-22` 카드는 `team_id`(팀 카드) 또는 `holder_user_id`를 가진다.
- 문제: ① 카드 줄의 제안 팀이 경영관리팀(경영관리본부 소속)이면 경영관리가 select에서 「본부 공개」를 고를 때 대상이 경영관리본부가 된다 — 기획본부 작성자에게 안 보이고(풀에 없음), 경영관리본부 사람 중 `evidence` 보기를 가진 사람에게 보인다. ② 제안 팀이 없을 때 `sort_order` 최소 본부를 쓰는데, `org_units.sort_order`는 관리자가 화면에서 바꾸는 표시 순서다 — 순서만 바꿔도 이후 「본부 공개」 대상이 조용히 다른 본부로 바뀐다. ③ select 낱말이 그냥 `본부 공개`라 경영관리가 대상 본부를 볼 수 없다.
- 고칠 곳(06.1-05 truths PA-1 · Task 1 ③ 제안값 함수 · publishEvidence): 「본부 공개 대상은 항상 기획본부 하나」로 고정하고, 그 본부를 찾는 방법을 하나로 정한다. 표시 순서(sort_order)에 기대지 않는다. → 식별 방법은 아래 「사용자 결정 필요 U-1」.
- 06.1-05 Task 2 행 범위 통합 매트릭스에 「경영관리팀 카드 줄을 본부 공개 → 기획1팀 PM 풀에 보임」 케이스를 더한다.

### A-2 (P2, 확신 7) 문서 「증빙」 섹션의 붙은 증빙 읽기에 domain 함수 · DTO · 정보 항목 판정이 정해져 있지 않다
- 플랜: `06.1-06-PLAN.md:185` "`evidence-records-section.tsx`(신규, RSC 조각): 붙은 증빙 읽기 행(`StaticTable`) — `page.tsx`가 06 S4 「증빙」 섹션 자리에 넣는다" — 읽기 함수 이름 · `registerDto` · 문서 읽기 판정(`canSeeExpense`) 호출이 없다. 08 · 09(카드 사용 폼 · 구매 요청 행)도 같은 섹션 · 행을 쓴다.
- 근거: 붙은 기록은 PM의 `published` 범위에서 빠진다(`06.1-05-PLAN.md:52` "붙지 않고 취소 아닌 것", RESEARCH Pattern 4 "붙은 뒤에는 문서의 행 판정(`canSeeExpense` 등)으로만 보인다"). 즉 `getEvidence`/`listEvidence`로는 읽을 수 없고 별도 읽기 길이 반드시 생기는데, 그 길이 계획에 이름 없이 화면 조각 안에 남아 있다. leak-scan은 `registerDto`된 DTO만 돈다(`test/integration/leak-scan.test.ts:13-19` 부수 효과 import 목록) — 이름 없는 읽기는 칸 축 검사 밖이다.
- 위험: 실행자가 RSC에서 리포지토리 결과를 그대로 그리면 `evidence.amount` · `evidence.value` 노출 판정(관리자가 끈 계급)이 무시되고, 문서 읽기 권한 없는 사람이 URL로 붙은 증빙 내용을 볼 수 있다.
- 고칠 곳: 06.1-06 Task 1 ③에 `listLinkedEvidence(viewer, owner)`(가칭) — 문서 읽기 판정(지출결의 `canSeeExpense` · 구매 요청 · 카드 사용 읽기 범위) 통과 시에만, `EvidenceLinkedItemDto` + `registerDto`(금액 = `evidence.amount`, 나머지 = `evidence.value`), leak-scan import 한 줄을 명시. behavior에 「문서를 못 보는 계급 → 빈 결과」 · 「`evidence.amount` 끈 계급 → 금액 칸 없음」 케이스. 08 · 09는 이 함수를 재사용한다고 적는다.

### A-3 (P2, 확신 7) 문서가 삭제(지출결의) · 취소(구매 요청) · 보관(카드 사용)되면 붙임이 살아 있는 채 남아 증빙이 영구히 「붙음」에 갇힌다
- 플랜: `06.1-01-PLAN.md:206` `evidence_record_links` "owner_id uuid"(FK 없음) + 부분 유니크 `(evidence_record_id) WHERE detached_at IS NULL`. 06.1 전체에서 문서 삭제 · 취소 · 보관 때 붙임을 다루는 플랜이 없다(grep `deleted_at|문서 삭제|archived_at` — 거래처 보관만 나옴).
- 코드: 05 브랜치 `db/schema/expenses.ts` `deletedAt: timestamp("deleted_at")`(soft delete), `repositories/expenses.ts:22,42,54…` 모든 읽기가 `isNull(expenses.deletedAt)`. 06 계획 `06-05-PLAN.md:175` 카드 사용에 `archived_at`(H-4 삭제 = 보관), `06-08-PLAN.md:159` 구매 요청 `status … cancelled`.
- 문제: 작성 중 지출결의에 1차 · 2차로 붙인 뒤 작성자가 문서를 지우면, 붙임은 살아 있어 증빙이 풀(`NOT EXISTS live link`)로 돌아오지 않고, 그 문서는 어디서도 열리지 않아 경영관리도 떼지 못한다(떼기는 문서 행 잠금 · 결재 상태 판독을 거침 — 삭제된 행은 리포지토리가 읽지 않음). 상태 글자는 `붙음`인데 링크 대상이 404. 06.1-12 `hasEvidence`는 삭제 문서를 안 보므로 돈 계산엔 영향이 적지만 증빙 재사용이 막힌다.
- 고칠 곳: 06.1-06에 태스크 줄 하나 — 05 지출결의 삭제 · 06 구매 요청 취소 · 06 카드 사용 보관 트랜잭션 안에서 그 문서의 살아 있는 붙임을 `detached_by` = 실행자 · `detach_reason` = `문서 삭제`/`요청 취소`/`카드 사용 삭제`로 떼는 훅(06.1-06 `detachLink` 재사용, 같은 tx). 또는 최소한 `scopeWhere`·풀의 「살아 있는 붙임」 EXISTS가 주인 문서가 살아 있는지까지 보게 한다(전자를 권장 — 뗀 기록이 남는다). 선행 의존 표에 05 삭제 함수 · 06 취소 · 보관 함수 이름 확인 줄을 더한다. 되살리기(보관 해제)는 붙임을 되돌리지 않는다고 적는다.

### A-4 (P2, 확신 6) 작성자(PM)의 카드 사용 2차 붙이기가 카드 사용 합계 · 카드를 아무 공개 카드 줄 값으로 덮을 수 있다
- 플랜: `06.1-09-PLAN.md:57` "작성자 S5(06.1-08)가 … 작성자 = 카드 사용 `used_by`(PA-CUAUTH). 카드 줄을 고르면 … 붙이면 파일 값으로 덮인다(O-6104 기본값 — 붙이는 사람과 무관)", `:216` "작성자(카드 사용 `used_by`) S5 → 같은 덮기 · 같은 기록(O-6104)".
- 근거: 풀은 그 팀의 팀 공개 + 본부 공개 카드 줄 전부다(`06.1-08-PLAN.md:50`). 팀 카드는 팀 공개로 제안된다(`06.1-05-PLAN.md:59` "카드 줄 = 카드의 팀 또는 소지자의 오늘 팀"). 작성자 붙이기에는 「증빙의 카드 = 카드 사용의 카드」 같은 제약이 없다.
- 문제: PM이 자기 카드 사용(예: 1만 원)에 같은 팀 동료 카드의 30만 원 줄을 붙이면, 서버가 자기 카드 사용의 합계를 30만 원 · 카드를 동료 카드로 덮는다(D-6111 덮기). 기록은 남지만 돈 칸이 작성자 손으로 바뀐다. D-6111 「파일이 이긴다」는 대사(같은 거래 짝)의 규칙이지 아무 줄이나 고른 결과에 대한 규칙이 아니다.
- 고칠 곳(06.1-09 Task 2 · 06.1-08 풀): 작성자 모드에서 문서가 카드 사용이면 후보를 「증빙 `corp_card_id` = 그 카드 사용의 카드」로 좁히고(풀 where에 문서 조건 하나), 카드가 다른 줄 · 합계 차이가 있는 줄의 덮기는 registrar 모드에서만 허용 — 또는 작성자 모드에서는 값이 바뀌는 후보를 숨긴다. O-6104는 플래너 기본값이라 바꿀 수 있지만 사용자 의도 확인을 권한다(U-2).

---

## P3

### A-5 (P3, 확신 9) `viewer.userId`는 없다 — Viewer는 `{ id, roleId }`
- 플랜: `06.1-01-PLAN.md:253` "`findMembershipAtDate(viewer, viewer.userId, 오늘)`"
- 코드: `domain/viewer.ts:11` `export type Viewer = { id: string; roleId: string | null };` · 선례 `domain/projects/status.ts:84` `findMembershipAtDate(viewer, viewer.id, opts.todayKst)`.
- 고칠 곳: 06.1-01 Task 2 action의 `viewer.userId` → `viewer.id`. (typecheck가 잡지만 실행자 혼선 방지.)

### A-6 (P3, 확신 6) 제안 팀이 없는 줄에 브라우저가 `team`을 보내면 CHECK 위반(500)으로 일괄 저장이 터진다
- 플랜: `06.1-05-PLAN.md` truths "브라우저는 팀 id를 보내지 않는다 — 공개 값(`private`/`team`/`division`)만 보내고 팀 · 본부 id는 서버가 제안 규칙으로 정한다"; 줄별 검사 목록(version · 붙음 · 취소 · 확인 필요 · 카드 미등록 · 음수)에 「team인데 제안 팀 없음」이 없다.
- 근거: `06.1-01-PLAN.md:45` 공개 짝 CHECK — `team`이면 팀 id 필수. 세금계산서 줄은 제안 팀이 없다(제안 = division).
- 고칠 곳: 06.1-05 Task 1 ③ publishEvidence 줄 검사에 「`team`인데 서버 제안 팀 null → 그 줄 오류 칸(`팀 없음`)」을 더하고 통합 케이스 하나. 06.1-13 G-2 붙여넣기도 같은 거부를 탄다고 적는다.

### A-7 (P3, 확신 5) 작성자 붙이기 트랜잭션이 「붙일 수 있는 상태」(음수 · 확인 필요 · 카드 미등록)를 다시 보지 않는다
- 플랜: `06.1-08-PLAN.md:179` tx 순서 "증빙 행 `FOR UPDATE` → 공개 범위 칸 · version이 사전 판독과 같은지 → `findLiveLinkForRecordForUpdate` → `insertLink`" — 상태 재검사 없음. 사전 판독은 `getEvidence`(범위만 — `scopeWhere` published는 붙음 · 취소만 뺌, `06.1-05-PLAN.md` Task 1 ②).
- 근거: 풀 쪽은 「붙일 수 있는 상태」 조각을 더하지만(08 Task 1 ②) id를 직접 실은 요청은 풀을 안 거친다. 06.1-07 금액 고침으로 이미 공개된 줄이 음수가 될 수 있다(PA-NEG 「음수는 경영관리 몫」 위반 경로).
- 고칠 곳: 06.1-08 Task 1 ③ tx 안 증빙 잠금 뒤에 06.1-06 `attachEvidence`와 같은 상태 재검사(취소 · 확인 필요 · 카드 미등록 · 음수)를 명시. 또는 `scopeWhere` published 갈래 자체에 그 조건을 넣어 목록 · 단건 · 풀이 같이 막게 한다(단일 지점 쪽이 낫다).

### A-8 (P3, 확신 6) 행 범위 · 풀 질의용 인덱스가 부족하다
- 플랜: `06.1-01-PLAN.md:206` 인덱스 `(visibility)` · `(batch_id)` · `(corp_card_id, issued_on)` 뿐.
- 질의: published where = `(visibility='team' ∧ visible_team_id=?) ∨ (visibility='division' ∧ visible_org_unit_id=?)` + NOT EXISTS live link + NOT canceled(05 Task 1 ②), 목록 기본 정렬 = 서식 그룹 · `issued_on` 내림차순 + 매 쪽 전체 `count`/`sum`(05 truths), 기간 필터 `issued_on`.
- 고칠 곳: 06.1-01 Task 1 ①에 부분 인덱스 `(visible_team_id) WHERE visibility='team'` · `(visible_org_unit_id) WHERE visibility='division'`, `(format, issued_on)` 을 더한다(카드 줄은 월 수천 건 규모라 1년이면 수만 행). FK 칸 `visible_team_id` · `visible_org_unit_id`에 인덱스가 없는 것도 같이 해소된다.

### A-9 (P3, 확신 5) 경영관리 계급은 메뉴만이 아니라 정보 항목 두 개도 켜야 금액이 보인다 — 플랜이 메뉴만 말한다
- 플랜: `06.1-01-PLAN.md:52` "경영관리 계급은 관리자가 권한표에서 켠다" · `:255` "`evidence.intake`는 아무 시드 계급에도 켜지 않는다".
- 코드: `domain/seed/index.ts:253` 노출표 시드 대상은 `staffDefaultRoles = [DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID, DIVISION_HEAD_ROLE_ID]` + CEO + sysadmin뿐, `domain/permissions/visible.ts` "행이 없으면 false". 관리자가 만든 경영관리 계급은 `evidence.value` · `evidence.amount` 행이 없어 DTO 금액 · 내용이 빈다.
- 고칠 곳: 06.1-01 truths 문장을 「메뉴 `evidence.intake` write + 정보 항목 `evidence.value` · `evidence.amount`를 관리자가 켠다」로, 06.1-05 E2E 도우미 `createIntakeRole`(이미 정보 항목 둘을 줌 — 05 Task 1 ⑤)과 맞춘다. SUMMARY/운영 메모에 한 줄.

### A-10 (P3, 확신 4) 카드 dedupe 열쇠에 금액이 들어가 「승인 금액 ≠ 매입(청구) 금액」 재출력 파일이 중복 등록된다
- 플랜: `06.1-02-PLAN.md:55` "카드 `{서식}|{끝4}|{승인번호}|{사용일}|{부호 있는 합계}`".
- 근거: RESEARCH:286은 취소 줄이 원거래와 승인번호를 공유해서 금액을 넣었다. 그러나 같은 거래가 이용내역(승인 기준)과 청구내역(롯데 견본은 `청구예정일` 칸 — RESEARCH Pattern 2 판별 낱말)에서 금액이 달리 찍히면 두 행이 생기고 비용이 이중으로 잡힐 수 있다. 실측 근거 없음(확신 낮음).
- 고칠 곳: 06.1-02 「열린 선택」에 이 위험을 적고, 열쇠를 `{서식}|{끝4}|{승인번호}|{사용일}|{부호}`(금액 대신 부호, 같은 파일 안 충돌은 `#2`)로 할지 견본 실측으로 정한다. 최소한 06.1-04 결과에 「같은 승인번호 · 다른 금액 이미 있음」을 `needs_check`로 세우는 갈래를 검토.

### A-11 (P3, 확신 5) 붙임 이력 · 기록의 사람 칸 FK가 불균일
- 플랜: `06.1-01-PLAN.md:206` `uploaded_by(text → users.id)`만 FK가 명시되고 `created_by` · `attached_by` · `detached_by`는 FK 표기가 없다.
- 코드 관례: 05 `db/schema/files.ts` `uploadedBy … .references(() => users.id)` · `voidedBy … references(users.id)`.
- 고칠 곳: 06.1-01 Task 1 ①에 네 칸 모두 `text … references(users.id)`(detached_by는 null 허용) 명시.

---

## 사용자 결정 필요

- **U-1 (A-1에서)**: 「본부 공개」 대상 = 기획본부 하나를 무엇으로 찾을지. 선택지 ⒜ 설정 키 하나(`evidence.division_org_unit_id`, 관리자 지정 — 새 이름이라 D-6112 이름 묶음 밖) ⒝ 본부 이름 「기획본부」 정확 일치(이름 변경에 약함) ⒞ 지금 PA-1 유지(카드 팀 본부 따라감 + sort_order 최소). 권장 ⒜. ⒞를 고르면 「모르면 기획본부」 확정 입력과의 차이를 CONTEXT에 기록.
- **U-2 (A-4에서)**: 작성자(카드 사용자)가 2차 붙이기로 자기 카드 사용 합계 · 카드를 바꿀 수 있게 둘지. 권장: 작성자는 같은 카드 줄만 고를 수 있고, 카드 · 합계 덮기는 경영관리(1차 · 대사)만.

---

## 확인됨 — 문제 없음 (근거)

- 4계층 · 린트: `eslint.config.mjs:47` `{ from: "domain", allow: ["domain", "repositories", "lib"] }`, `:48` repositories → domain 허용 — `domain/permissions/scope-for.ts`가 `repositories/team-memberships` · `repositories/teams`를 부르고, `repositories/evidence-records.ts`가 `EvidenceScope` 타입을 import해도 경계 위반 아님. `plant8/repository-viewer-param` — `findMembershipAtDate(viewer, userId, date)`(`repositories/team-memberships.ts:11-15`) · `findTeamById(viewer, id)`(`repositories/teams.ts:19`) 둘 다 viewer 첫 인자.
- 팀 → 본부 조회: `db/schema/org.ts:28-30` `teams.orgUnitId uuid notNull → orgUnits.id`, `findTeamById`가 보관 여부로 거르지 않고 행을 돌려준다(`repositories/teams.ts:19-22`). FK 대상 표 이름 `teams` · `org_units` 실재.
- 발령 기준: `findMembershipAtDate`가 `effective_from ≤ date` 최신 한 행(`repositories/team-memberships.ts:16-21`) — 「미래 발령만 → null」 behavior와 일치. 발령 없음 → null 관례(`domain/projects/status.ts:82-85`)와 일치.
- 기존 `Scope` 불변 · 별도 `EvidenceScope`: `domain/permissions/scope-for.ts:11` — 타입 단언 · grep 수용 기준이 정확한 줄을 본다.
- `can`은 메뉴 키 정확 일치(`domain/permissions/can.ts:16-29`) → `evidence.intake` view만으로 all 안 됨, 정확.
- 시드: `insertPermissionIfAbsent`(`repositories/permissions.ts:58`)가 DoNothing — 회수 유지 성립. 시스템 관리자는 MENUS 루프 upsert(`domain/seed/index.ts:159-186`)로 두 키를 받음. 정보 항목 staffDefault 참이면 PM · 팀장 · 본부 책임자 · 대표에 노출 행이 생김(`domain/seed/index.ts:253-288`).
- owner_id uuid: 05 `expenses.id uuid`(05 브랜치 `db/schema/expenses.ts`), 05 `files.owner_id uuid` 관례와 같음. 06 계획의 `corp_card_usages` · `purchase_requests`는 `id`(관례상 uuid — 계획 문서라 ⓪ 확인 대상, 확신 6).
- owner_kind 값 `expense` · `purchase_request` · `corp_card_usage`가 05 `files_owner_kind_check`('expense') · 06-16/25(`corp_card_usage`) · 06-02/08(`purchase_request`)과 같은 철자.
- 2차 = 작성자 본인만: 08 `evidencePickerMode` author 갈래가 `drafterId`/`requested_by`/`used_by` = 나를 요구하고, 팀장 케이스 통합 · E2E가 있다(`06.1-08-PLAN.md:51`, Task 1 behavior). 작성자 풀 = published 범위뿐 → 미공개 증빙 노출 경로 없음. 작성자 떼기는 `attach_mode = author ∧ attached_by = 나`만.
- 기획본부 밖 사람: published 범위는 「본인 오늘 팀의 본부」만 보므로 경영관리본부 사람은 기획본부 본부 공개를 보지 못한다(단, A-1의 반대 방향 누수는 있음).
- 계약 이름 일관성: `EvidenceScope{rows; teamId; orgUnitId}` · `evidenceScopeFor(viewer, deps?)` · `scopeWhere` · `getEvidence` · `lockRecordsForUpdate` · `evidence_amount_change` 가 01 → 05 → 06 → 07 → 08 → 09에서 같은 이름으로 쓰인다.
