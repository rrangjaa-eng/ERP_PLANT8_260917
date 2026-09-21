# Phase 4: 프로젝트·견적 원장 - Context

**Gathered:** 2026-09-21
**Status:** Ready for planning

<domain>
## Phase Boundary

이 페이즈가 세우는 것은 **이 시스템의 돈 뼈대**다. 기획 PM이 프로젝트를 등록하고
엑셀처럼 견적 줄을 입력하면 차익이 서버에서 계산되고, 사전→상세 차수와 고객 승인,
매출 칸, 상태 전환까지 선다. 모든 금액은 `domain/money` 하나를 지나고 모든 게이트
판정은 `domain/rules.gate` 하나를 지난다.

범위 밖: 지출결의 문서 자체(Phase 5) · 지급·증빙(Phase 6) · 손익 계산(Phase 9) ·
리저브 충당(Phase 9 RSV-02) · 인트라넷 적재·검증·전환(Phase 8) ·
관리자 화면 7개의 폼·표 이관(Phase 7).

</domain>

<decisions>
## Implementation Decisions

Phase 1의 D-01~D-18, Phase 2의 D-19~D-32, Phase 3의 D-33~D-40은 그대로 유효하다.
번호를 이어 붙인다. 아래는 전부 2026-09-21 사용자 선택이다(위임 아님).

### 프로젝트 상태

- **D-41:** **수주중·미수주 상태를 요구사항에 전부 반영한다.** `REQUIREMENTS.md`의
  PROJ-04(상태 4종)·EXP-08(수주중 프로젝트에 붙는 경로 추가)·PNL-07(「수주 실패 비용」
  → 「미수주 비용」, 미수주로 닫힌 프로젝트의 비용 합으로 정의를 굳힘)과 `ROADMAP.md`
  Phase 4 기준 4(수주중→진행, 수주중→미수주 전환을 게이트에 추가)를 고친다. 근거:
  상태 그릇이 없으면 제안·PT 비용을 팀 이름으로 올렸다가 수주 성공 시 사람이 하나씩
  찾아 프로젝트로 재연결해야 한다(`docs/inputs/phase-04-project-quote.md` §1).
  — **Reversibility:** costly — 요구사항·로드맵 4곳과 상태 전이 코드·게이트가 함께 움직인다.
- **D-42:** **프로젝트 번호는 등록 시 부여한다 — 수주중 단계부터.** 미수주로 닫힌 건이
  번호를 먹지만 결번 허용은 `ROADMAP.md` Phase 4 기준 1이 이미 확정한 규약이다.
  결정적 근거: 지출결의 번호가 `26001-0001`로 프로젝트 번호에 업혀 있어, 번호가 없으면
  수주중에 지출결의를 문서로 만들 수 없다(D-43과 맞물린다).
  — **Reversibility:** costly — 지출결의·구매 요청·법인카드 사용 번호가 전부 프로젝트
  번호를 접두어로 쓰므로 부여 시점을 바꾸면 번호 체계 전체가 움직인다.
- **D-43:** **수주중에는 지출결의를 올릴 수 있고 고객 승인 게이트는 면제된다.** 수주중에는
  승인받을 고객 견적이 아직 없기 때문이다. 이 면제도 `domain/rules.gate` 안에서 단락한다
  — Phase 8의 legacy 면제와 같은 자리이고, 게이트 밖에 면제 분기를 두지 않는다(Issue 9).
- **D-44:** **미수주 → 진행 되살리기를 허용한다.** 상태 전이로 처리하고 행동 로그에 남긴다.
  그때까지 쌓인 비용이 팀 손익의 미수주 비용에서 프로젝트 비용으로 자동으로 돌아온다 —
  상태로 비용이 따라 움직이게 한다는 이 설계의 원래 목적 그대로다.

### 엑셀식 표

- **D-45:** **자체 구현한다. 새 의존성 0.** 근거 셋: (1) 함정 10의 실측 결론이 「계약을
  컴포넌트로 만들어라」인데 라이브러리를 쓰면 계약이 설정·CSS 오버라이드라는 산문으로
  돌아간다 (2) `SYSTEM.md` §7-3이 요구하는 폰 칸 접기(P1/P2/P3)·서버가 아예 안 보내는
  열·다른 셀을 편집해도 남는 고정 오류 셀·외화 2행 셀은 어느 라이브러리에도 없어 어차피
  직접 만든다 (3) 열 집합이 서버 고정이라 동적 열 모델이 필요 없다. canvas 기반 그리드
  (Glide 등)는 이 프로젝트가 UI를 실제 DOM 실측으로 검증하므로 애초에 후보가 아니다.
  — **Reversibility:** costly — 견적 줄 화면 전체가 이 컴포넌트 위에 선다.
- **D-46:** **`ui/table`(§6-1 읽기용 목록)과 `ui/grid`(§7-3 편집)를 둘로 나누되, 폰 칸 접기
  P1/P2/P3 로직은 공유한다.** 근거: 읽기 표는 지금 당장 8곳이 쓰고(`.table` CSS가 8개 파일에
  복제돼 있다) 편집 그리드는 견적 줄 한 곳이 쓴다. 편집 기계장치를 8곳에 지우지 않는다.
- **D-47:** **관리자 읽기 표 6개의 `ui/table` 이관은 Phase 7이다.** 폼 8개 이관이 이미
  `ROADMAP.md` Phase 7 성공 기준 5에 명시돼 있으니 표도 같은 자리에서 한 번에 한다.
  Phase 4는 컴포넌트만 만들고 견적 줄·프로젝트 목록에만 쓴다. 이 결정으로 03-OPEN-ITEMS의
  DOM 감사 2·6·7(관리자 표 375px 가로 스크롤)은 Phase 7까지 계속 열려 있다.
- **D-48:** **일괄 저장 충돌은 행별 `updatedAt` 비교로 감지한다.** 클라이언트가 읽은 시점의
  `updatedAt`을 저장 요청에 실어 보내고 서버가 조건부 `UPDATE ... WHERE updated_at = ?`로
  판정한다. 새 컬럼이 없고 Phase 3의 조건부 UPDATE 선례를 그대로 쓴다. 바뀐 값을 함께
  돌려주면 §7-3의 「그 값으로」 동작이 된다.

### 문서 번호

- **D-49:** **`document_counters`의 기존 컬럼명을 유지한다.** `(counter_key, period, value)`는
  ROADMAP이 적은 `(format_key, scope_key, next_no)`와 **이름만 다르고 구조가 같다** —
  스키마 주석이 `period`를 「순번 범위의 구분자(연도 등 — 전사 범위는 고정 문자열)」로
  정의해 둔 것이 정확히 `scope_key`다. 매핑을 `docs/ARCHITECTURE.md`에 기록하고 마이그레이션은
  만들지 않는다(CLAUDE.md 3번 — 요청받지 않은 리팩터 금지).
- **D-50:** **순번 통은 넷이다.** 프로젝트(연도별 전사) · 지출결의 뒷자리(연도별 전사 **한 통**,
  일반관리비 `26GA-`와 공유) · 구매 요청 `C`(별개 통) · 법인카드 사용 `K`(또 별개 통).
  지출결의 앞자리(`26001`·`26GA`)는 어느 프로젝트인지를 보여 주는 접두어일 뿐이므로, 프로젝트
  A의 첫 지출결의가 `26001-0042`일 수 있다. 출처: `docs/inputs/phase-04-project-quote.md` §5,
  사용자 확인 2026-09-21.
- **D-51:** **견적 차수는 정수 컬럼으로 저장하고 「1차」는 표시 시점에 조립한다.** 사전 견적은
  별도 값으로 구분한다. 근거: 정렬·비교·다음 차수 계산이 자연스럽고, §5의 「가름 글자는 반드시
  영문」 규칙과 충돌하지 않는다.
- **D-52:** **번호 서식은 문서 종류마다 설정 키 한 줄이다** — 접두어·연도·가름 글자·자릿수·
  구분자·순번 범위(전사/프로젝트별)를 한 키에 담는다. **Phase 4는 프로젝트·견적 둘만 등록**하고
  나머지 5종은 그 문서를 만드는 페이즈가 등록한다. Phase 3의 `registry-coverage` 테스트가
  「등록만 되고 안 읽히는 키」를 잡으므로 `readBy` 표시를 맞춰야 한다.

### 금액 모델

- **D-53:** **`Money`는 최소단위 정수로 담고 DB는 `bigint`다.** 원화는 1원 단위 정수, 외화는
  1/100 단위 정수, 환율은 1/10000 단위 정수. 근거: 산술이 전부 정수라 부동소수점 오차가
  원리적으로 없고, 새 의존성이 없으며, `round()`가 진짜 한 곳이 된다. 100억 원도 안전 정수
  범위 안이다. 스케일은 브랜디드 타입에 박아 코드가 기억하지 않게 한다.
  — **Reversibility:** one-way — 컬럼 타입과 저장된 값의 스케일이 함께 바뀌므로 데이터
  마이그레이션이 필요하고, Phase 5·6·9·11이 전부 이 표현을 참조만 한다.
- **D-54:** **통화별 최근 환율은 별도 `exchange_rates` 표에 둔다 — 설정 레지스트리 키가 아니다.**
  `ROADMAP.md`와 `docs/inputs` §7이 「설정의 통화별 최근 환율」이라고 적었으나 `domain/settings/keys.ts`에
  FX·통화 키가 **0건**이고(실측 2026-09-21), §7이 「입력할 때마다 최근값이 갱신된다」고 하므로
  지출결의를 쓰는 PM이 환율을 적으면 그 값이 저장소로 되돌아가야 한다. 설정 쓰기는
  `admin.settings` 권한 게이트 뒤에 있어 비관리자 쓰기 경로가 설정 계층에 생기고 설정 변경
  이력이 환율로 덮인다. `(통화, 환율, 기록 시각, 기록한 사람)` 행을 쌓고 기본값은 최신 행으로
  한다. **ROADMAP 문구를 이 결정에 맞게 고친다.**

### 견적 차수 구조

- **D-55:** **견적 줄은 차수에 속하고, 새 차수는 줄 전부의 복사본이다.** 이전 차수는 읽기
  전용으로 남아 「그때 얼마로 잡았나」가 보존된다(`docs/inputs` §2의 「차수마다 견적 한 벌이
  통째로 남는다」 + 「되돌리기 불가, 고치려면 새 차수」). 지출결의가 붙은 줄은 FK RESTRICT로
  원래 차수에 그대로 남고, **프로젝트 비용 합계는 차수가 아니라 지출 쪽에서 집계한다.**
  차수 기준으로 세는 것은 견적가 합계뿐이다.
  — **Reversibility:** one-way — 줄의 소유 축을 바꾸면 FK와 이미 들어온 행이 함께 움직인다.

### 게이트

- **D-56:** **`rules.gate`는 이유를 담은 객체를 돌려준다** — `{ allowed, reason, ruleKey }` 형태.
  근거: PROJ-06이 「이유와 함께 막는다」를 요구하고 §7-3이 오류 셀에 이유 한 줄을 요구한다.
  boolean이면 호출처마다 이유를 다시 쓰게 되고, 그것이 정확히 함정 10의 「산문으로 남은 계약」
  패턴이다. — **Reversibility:** costly — Phase 5·6·7의 모든 게이트 호출처가 이 반환 형태를 쓴다.

### 이전 준비 · 페이즈 운영

- **D-57 (2026-09-21 개정 — 실측으로 전제가 바뀌었다):** 인트라넷 덤프는 **별도 private 레포
  `rrangjaa-eng/PLANT8_INTRANET_BACKUP_260915`**에 Git LFS로 있다(`db_backup_260915.sql`,
  19.2MB, 8개 DB · 46표). `분석산출물/요약.json`의 수치가 ROADMAP과 정확히 일치한다
  (projects 125 · lines 1,379 · payments 464 · cards 433). **`ERP_PLANT8_260917`은 public이고
  사용자가 그것을 의도했다**(2026-09-21 확인). 그래서 **인트라넷에서 나온 값은 익명화해도 이
  레포에 커밋하지 않는다** — 프로젝트명·클라이언트명은 물론 `quotationSum` 같은 집계도
  회사 매출 규모 공개라 제외다. **픽스처는 전부 합성으로 만들고, 실데이터는 transform을
  검증하는 데만 쓴다.** 변환 결과 보고서도 커밋하지 않는다.
- **D-57a — extract 허용목록은 DB가 아니라 표 단위다.** `PLANT8_INTRANET` **안에도**
  개인정보가 있다: `fone_member`(`neo_pass`·`neo_mail`·`neo_name`) · `tb_admin_member`
  (`admin_pw`·`admin_pwkey`) · `fone_partners`(`contact_phone`·`contact_hphone`·평문
  `account_number`) · `QUOTATION_PAYMENT`(`pay_name`·`pay_phone`·`pay_account`). 나머지 7개
  DB(`AWS_DATA` · `LGCNS` · `Verkada_DATA` · `fortinet_DATA` · `snowflake_database` ·
  `Sivantos_DATA` · `PLANT8_DATA`)는 고객사 행사 참가자 DB로 실명·전화·이메일 약 3,800행이다.
  성공 기준 7이 요구하는 것은 **프로젝트·견적 줄**뿐이므로 허용목록은 `fone_project` ·
  `QUOTATION_LINE` · `REPORT_CATEGORY1` · `REPORT_CATEGORY2` · `fone_client` · `fone_team` ·
  `fone_card` **일곱 표**다. 허용목록 밖 표·DB를 만나면 extract가 실패하게 만들고 그것을
  테스트로 고정한다.
- **D-63:** **프로젝트 상태는 고정 값 네 개이고 코드표는 라벨만 공급한다.** `projects.status`는
  CHECK 제약이 붙은 컬럼이고 값 네 개가 고정이다. `project_status` 코드표는 그 네 값의 한글
  라벨만 담도록 **재시드**하며(Phase 3이 시드한 `planning`·`in_progress`·`on_hold`·`done`·
  `cancelled` 다섯은 D-41의 넷과 겹치는 것이 `in_progress` 하나뿐이다 — `domain/seed/index.ts:19-25`
  실측), 네 항목은 비활성화되지 않게 막는다. 관리자는 「진행」을 「실행」으로 바꿀 수 있지만
  상태를 늘리거나 없앨 수는 없다. 근거: `docs/inputs/README.md`가 40행에서 프로젝트 상태
  **이름**을 마스터 데이터로, 42행에서 상태 **전이**를 「코드 수정 필요」 층으로 이미 갈라
  놨다. 두 줄을 모두 지키는 유일한 형태다. 리서처가 짚은 구멍(관리자가 「완료(정산)」을
  비활성화하면 완료 처리가 막힌다)도 이것으로 닫힌다.
  — **Reversibility:** costly — CHECK 제약과 코드표 시드가 함께 움직이고 Phase 5·6의 게이트가
  이 값들을 참조한다.
- **D-58:** **`source`·`source_id` 컬럼을 이전 대상 업무 표마다 둔다.** `source NOT NULL
  DEFAULT 'demo'`이고, 새 표가 빠뜨리면 잡는 테스트를 함께 둔다. 근거: Phase 8의
  `(source, source_id)` upsert 규약이 그 두 컬럼을 요구하고, `registry-coverage`·
  `leak-scan-coverage` 테스트가 같은 결의 선례다.
- **D-59:** **F1·F2를 Phase 4 맨 앞에서 닫는다** — UI 컴포넌트 작업보다 앞에, 회귀 테스트와
  함께 별도 커밋으로. **F1**: Dockerfile 런타임 스테이지(40행~)가 `APP_ENV`를 안 세워
  `lib/env.ts:47-49`의 zod 기본값 `"local"`로 떨어지고 `:85`의 `APP_ENV !== "local"` 블록이
  통째로 건너뛰어져 `BETTER_AUTH_SECRET` 길이 검사가 안 돈다(원문 확인 2026-09-21).
  **F2**: `repositories/vendors.ts:47` `findVendorById`가 `where(eq(vendors.id, id))` 하나뿐이라
  보관된 거래처의 계좌번호가 `revealAccountNumber`로 평문 노출된다 — 바로 아래
  `findVendorsByNormalizedName`는 `isNull(vendors.archivedAt)`를 걸고 있어 한쪽만 빠진 것이
  같은 파일에서 보인다.
- **D-60:** **UI 컴포넌트를 화면보다 먼저 만든다** — `ui/form`(폼 래퍼 + `--form-max` + 칸 폭
  변형) · `ui/select` · `ui/table` · `ui/grid`. 03-OPEN-ITEMS의 A-H2·A-H3·A-M1·A-M6·A-M7이
  이 한 작업에 걸려 있다. 화면마다 고치면 7번 고쳐야 한다(함정 10).
- **D-61:** **사용처 0인 토큰을 잡는 단위 테스트의 감시 범위는 `app/**` + `ui/**`다.**
  `docs/design/system/*.html` 목업은 제외한다 — 실측 결과 `--form-max`는 레포 전체로는
  **4곳**(목업 `form-expense.html` 3 · `preview.html` 1)에서 쓰이고 있어, 레포 전체를 세는
  테스트는 오늘 바로 통과해 아무것도 잡지 못한다. 출하 코드에서는 0이다.
- **D-62:** **플랜 수 상한은 계획자 판단에 맡긴다.** 5를 넘기면 그때 리저브 대장(RSV-01)을
  뗀다 — `ROADMAP.md` Overview가 사전 승인한 절단선이다. Phase 3에서 같은 판단(D-33)으로
  7플랜이 됐고 무너지지 않았다.

### UI 설계 계약이 올린 것 (2026-09-21, 04-UI-SPEC.md의 GAP 7건)

UI 리서처가 「SYSTEM.md가 다루지 않는다」로 올린 일곱이다. 넷은 사용자 선택,
셋은 오케스트레이터가 원문 확인으로 닫았다.

- **D-64 (GAP-1):** **리저브 대장 진입점은 「손익」 메뉴 하위다.** `ui/shell/role-menu.ts:45-51`의
  `TOP_BAR_MENU`가 1차 메뉴를 정확히 다섯(프로젝트·지출결의·법인카드·결재·손익)으로 박아 뒀고
  `test/e2e/keyboard-nav.spec.ts:134`가 「메뉴 5개」를 단언한다(실측). 1차 메뉴를 늘리면 §6-0 ·
  `role-menu.ts` · `DECISIONS.md` · 테스트 둘을 전부 고쳐야 한다. 손익 아래 두는 근거: 리저브는
  경영관리의 것이고 Phase 9의 RSV-02(리저브 → 매출 충당)가 손익에서 만나며, 기획본부 기본
  숨김과도 결이 맞는다.
- **D-65 (GAP-3):** **상태 4종 색은 수주중 `--muted` · 진행 `--accent` · 완료(정산) `--success` ·
  미수주 `--muted`.** 수주중·미수주가 같은 토큰이지만 `SYSTEM.md:707`이 `--muted`를
  「대기·미착수·임시」로 정의해 둘 다 맞고, `:708`이 **표 상태 열은 테두리 태그가 아니라 색
  글자만** 쓰라고 해서 글자가 구분한다. `--accent`를 아껴 쓰는 것이 §1-3(accent는 다섯 곳만)의
  결과와도 맞는다.
- **D-66 (GAP-5):** **클라이언트·거래처 자동완성은 `<input list>` + `<datalist>`.**
  `SYSTEM.md:633`의 「네이티브 `<select>` 그대로. 커스텀 드롭다운 만들지 않는다」는 enum select
  얘기지 자유 입력 자동완성을 다루지 않는다. 네이티브라 그 규칙과 충돌하지 않고, 키보드 흐름이
  끊기지 않아 견적 줄 그리드 셀 안에서도 쓸 수 있다(UX-05의 「키보드만으로 끝난다」).
- **D-67 (GAP-6):** **단축키 동작은 `metaKey || ctrlKey` 둘 다 받고, 표기는 플랫폼별로 바꾼다**
  (Mac `⌘S` · Windows `Ctrl+S`). `SYSTEM.md`는 §6-0·§7-3·§7-9에서 `⌘`로 고정했지만 같은 문서
  `:104`가 「회사 PC는 Windows가 많아」를 서체 결정의 근거로 삼는다 — 그 사용자에게 `⌘`를
  보이는 것은 시스템 자신의 사용자 모델과 어긋난다. **이 페이즈에서 유일하게 시스템을 실제로
  벗어나는 항목이므로** CLAUDE.md 프론트엔드 규칙대로 `docs/design/DECISIONS.md`에 이유를
  기록한 뒤 `SYSTEM.md` §7-9를 고친다. **코드보다 먼저** 한다 — Phase 3의 D-30·D-31이 로그인
  템플릿·알림함 계약에 쓴 것과 같은 절차이고, `03-02-PLAN.md` Task 1(「SYSTEM.md … 교체한다
  (코드보다 먼저)」)이 그 형태다.
- **D-68 (GAP-2):** **`ui/confirm`이 다섯 번째 컴포넌트다.** §7-3의 「Delete 줄 삭제(확인 모달)」 ·
  §7-1의 「위험 행동은 확인 모달」 · §7-3의 「폰 행 탭 → 시트」가 §7-8 골격을 요구한다. 다만
  **새로 발명하는 게 아니다** — `ui/shell/MoreSheet.tsx`가 이미 네이티브 `<dialog>.showModal()`
  기반이고 그 주석이 「포커스 트랩에 새 런타임 의존성을 두지 않는다 — 네이티브 `<dialog>`가
  포커스 트랩·가림막·Esc를 브라우저 차원에서 제공한다」는 확립된 패턴을 적어 뒀다(실측).
  MoreSheet은 `moreMenu`/`accountGroup`/`adminMenu`를 받는 단일 목적이라 재사용할 수 없고,
  **패턴만** 가져온다. 이것으로 03-OPEN-ITEMS의 A-M1(위험 행동 확인이 §7-8 모달이 아님)도
  메커니즘 쪽이 닫힌다. **D-62의 플랜 수 계산에 이 컴포넌트를 넣는다.**
- **D-69 (GAP-7):** `SYSTEM.md:404`의 `--success` **500은 오탈자**다 — `:102`가 굵기를
  「400 · 600 · 700. **세 단계만**」으로 못박았다. **600으로 구현**하고 문서는 고치지 않는다
  (오탈자 정정은 이 페이즈의 범위가 아니다 — 발견 사실만 여기 남긴다).
- **D-70 (GAP-4):** `?new=1` 토글을 프로젝트 목록까지 넓힌다. §6-1의 해당 문단이 「관리자 마스터
  화면」으로 한정돼 있으나 이는 **적용 확장이지 계약 이탈이 아니다** — 같은 §6-1 「목록 우선」
  규칙이 업무 목록에도 그대로 적용된다.

**D-60 문구 정정 (UI 리서처 지적, 타당함).** D-60은 A-H2·A-H3·A-M1·A-M6·A-M7이 「이 한 작업에
걸려 있다」고 적었으나, D-47이 관리자 화면 이관을 Phase 7로 미뤘으므로 **이 페이즈가 닫는 것은
메커니즘 절반이고 이관 절반은 Phase 7**이다. 특히 **A-M6은 판단 항목이라 컴포넌트를 만들어도
닫히지 않는다** — 「관리자 마스터 표가 §7-3 편집용인가」는 SYSTEM.md가 다루지 않는다. 대신
`ui/table`(흰 머리글)과 `ui/grid`(`--g-100` 머리글)로 신호를 갈라 두어, Phase 7의 이관이 CSS
재작성이 아니라 **컴포넌트 선택**이 되게 한다.

### Claude's Discretion

- **`Money`의 객체 모양** — 통화·외화금액·환율·환산액을 담은 단일 객체로 갈지, 금액만 브랜디드
  타입이고 나머지는 행 컬럼으로 갈지. D-53이 정한 것은 **수치 표현과 DB 타입**뿐이다.
  `eslint/rules/money-boundary.mjs`가 TS 타입 문자열에 `Money`가 있는지로 판정하므로
  (`MONEY_TYPE_PATTERN = /\bMoney\b/`), 어떤 모양이든 타입 이름에 `Money`가 들어가야 한다.
- **`ui/form`의 칸 폭 변형 API 형태** — §6-3의 280/480/200을 prop으로 받을지 변형 클래스로 둘지.
- **엑셀 그리드의 범위 선택·클립보드 구현 세부** — §7-3의 키 구성은 계약이지만 내부 구조는 재량.
- **`custom_fields`를 프로젝트·견적 줄에 어떤 키로 적용할지** — 관리 UI가 없으므로 최소로.
- **목록 p99 500ms를 어떻게 증명할지** — 125건 규모에서 자명하나 기준 1이 수치를 못박았다.
- **`rules.gate`의 `rule` 인자 모양**(문자열 키 + 레지스트리 vs 선언 객체) — D-56이 정한 것은
  **반환 형태**뿐이다.
- **그리드 클립보드는 네이티브 `copy`/`paste` DOM 이벤트로 간다**(Claude 판단, 2026-09-21).
  `navigator.clipboard`는 권한 프롬프트와 HTTPS/localhost 조건이 붙고 Playwright에서
  `grantPermissions`가 필요하다. 네이티브 이벤트는 둘 다 없고 E2E가 바로 된다.
- **`scripts/migrate/`는 CLI 번들(`scripts/build-cli.mjs`)에 넣지 않는다**(Claude 판단).
  `scripts/settings-import.ts`처럼 로컬 운영자 스크립트로 둔다 — 적재(load)가 Cloud Run Job을
  필요로 하는 시점은 Phase 8이다.

### Folded Todos

없음.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 이 페이즈의 범위·기준
- `.planning/ROADMAP.md` §Phase 4 (192~215행) — 목표·성공 기준 7개·요구사항 11개.
  **D-41·D-54가 이 절의 문구를 고치도록 요구한다**
- `.planning/REQUIREMENTS.md` — PROJ-01~05·07, ADMN-09, UX-04·05, RSV-01, FX-01.
  **D-41이 PROJ-04·EXP-08·PNL-07을 고치도록 요구한다**
- `docs/inputs/phase-04-project-quote.md` — 회사 문답(2026-09-18) 결과. 매출 칸·리저브·
  외화·필수 칸·번호 서식 7종·차수 규칙이 여기서 확정됐다. **미정 0건**
- `docs/inputs/README.md` — 개인정보 금지 규칙(D-57의 근거) · 마스터/설정/코드 3층 분리

### 이월 대장 · 함정
- `.planning/phases/03-permissions-settings-masters/03-OPEN-ITEMS.md` — A-H2·A-H3·A-M1·
  A-M6·A-M7이 D-60의 대상. DOM 감사 2·6·7은 D-47로 Phase 7까지 열려 있다
- `docs/HANDOFF.md` §함정 10 (96~139행) — 「컴포넌트가 된 계약은 지켜졌고 산문으로 남은
  계약은 전부 어긋났다」. D-45·D-46·D-56·D-60·D-61의 공통 근거
- `.planning/phases/03-permissions-settings-masters/03-CONTEXT.md` — D-25·D-33~D-40.
  특히 **D-39**(§7-3은 Phase 4가 라이브러리 선택과 함께)와 **D-40**(권한 격자는 별개 컴포넌트)

### 디자인 계약
- `docs/design/SYSTEM.md` §7-3 (660~696행) — 엑셀식 표의 전체 계약: 구조·키 구성·오류 셀·
  충돌·외화 2행·폰 칸 접기 P1/P2/P3·가변 열
- `docs/design/SYSTEM.md` §6-1(목록) · §6-3(폼 max 720·칸 폭 280/480/200·라벨 왼쪽 96) ·
  §7-2(오류 표시) · §7-8(모달·시트) · §8-3(오류 문구 형식)
- `docs/design/tokens.css` — 유일한 토큰 원천. `--form-max: 720px`는 116행
- `docs/DESIGN.md` §4 — 새 화면·컴포넌트 제작 절차
- `docs/design/DECISIONS.md` — 시스템을 벗어날 때 근거를 남기는 곳

### 인트라넷 원천 (별도 private 레포 — 값을 이 레포로 옮기지 않는다)
- `rrangjaa-eng/PLANT8_INTRANET_BACKUP_260915` — `db_backup_260915.sql`(Git LFS, 19.2MB,
  8 DB · 46표) · `분석도구/parse_dump.js`(mysqldump → 표별 JSON, extract의 뼈대) ·
  `분석도구/analyze.js` · `분석도구/recon2.js` · `분석산출물/요약.json`(ROADMAP 수치와 일치) ·
  `분석산출물/행사DB_개인정보_인벤토리.csv`(허용목록의 근거) · `보고서_구인트라넷백업분석_260915.md`
- **읽기 전용이다.** 허용목록은 D-57a, 커밋 금지 범위는 D-57

### 아키텍처·강제 지점
- `docs/ARCHITECTURE.md` — 4계층 경계. **D-49가 `document_counters` 컬럼명 매핑을,
  기준 1이 목록·검색 인덱스 목록을 여기 적도록 요구한다**
- `eslint/rules/money-boundary.mjs` — **이미 존재한다.** type-aware, `domain/money` 경로만
  예외, TS 타입 문자열의 `Money`에 반응. 모듈이 아직 없는 상태로 규칙만 서 있다
- `test/unit/eslint-rules/money-boundary.test.ts` — 그 규칙의 기존 테스트
- `db/schema/document-counters.ts` — `(counter_key, period, value)` 복합 PK.
  주석이 「실제 번호 부여와 행 잠금은 Phase 4다」라고 적어 둔 그 자리
- `repositories/document-counters.ts` — 읽기·upsert만 있다. 원자적 증가가 이 페이즈의 몫
- `domain/settings/keys.ts` — 세율·절사·기준일 키가 전부 `readBy: { phase: "4" }`로 등록돼
  있다(`tax.basis_date.withholding = "payment_date"` · `tax.basis_date.vat = "evidence_date"`).
  **FX·통화 키는 0건** — D-54의 근거
- `domain/settings/registry.ts` — `simple`/`historized` 두 종류. `applyTaxRule()`이 쓸
  「특정 시점 기준 유효값」 조회가 여기 있다

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `eslint/rules/money-boundary.mjs` + 그 테스트: `domain/money`를 만들면 **즉시 강제된다**.
  규칙이 먼저 서 있고 모듈이 비어 있는 상태라, 모듈을 만드는 순간 레포 전체의 금액 산술이
  경계 안으로 들어온다
- `db/schema/document-counters.ts` · `repositories/document-counters.ts`: 표와 복합 PK 규약이
  이미 있다. Phase 4는 원자적 증가 함수와 행 잠금만 얹는다
- `domain/settings/`: 세금 규칙에 필요한 설정 키 12종이 이미 등록·기본값까지 들어와 있다
- `ui/` 15종(`auth-frame` `banner` `button` `form-alert` `history-list` `kv-list` `list-empty`
  `logout` `next-turn` `page-header` `permission-grid` `shell` `status-tag` `toast` `input`):
  **Form·Select·Table·Grid가 없다** — D-60이 채운다
- Phase 3의 조건부 UPDATE 선례: D-48의 충돌 감지가 그대로 따른다
- `test/unit/settings/registry-coverage.test.ts` · `test/unit/leak-scan-coverage.test.ts`:
  D-58(새 표 누락 감지)·D-61(사용처 0 토큰)이 따를 테스트 형태

### Established Patterns
- 4계층 `app/ → domain/ → repositories/(viewer 필수) → db/`, ESLint boundaries가 강제
- 커스텀 lint 4종: `money-boundary` · `no-row-type-escape` · `repository-viewer-param` ·
  `require-action-client`
- 판정 3함수 `can()` / `visible()` / `scopeFor()` — 리저브는 정보 노출표의 새 항목이라
  `visible()`에 등록해야 한다(기획본부 기본 숨김)
- 보관함(soft delete) · 행동 로그 · `custom_fields` JSONB + `field_definitions` 규약(Phase 3)

### 인트라넷 원천 스키마 — 실측 (2026-09-21, `PLANT8_INTRANET`)

transform 규칙을 정하는 사실이다. 값은 열어 보지 않았고 컬럼 정의만 읽었다.

- **`fone_project`에 상태 컬럼이 없다.** 있는 것은 `confirm_manager`·`confirm_kuckjang`·
  `confirm_admin`·`confirm_ceo` 네 장의 `char(1)` 결재 플래그뿐이다. **D-41/D-63의 상태 4종은
  이전할 원천이 없다** — transform이 유도하거나 기본값을 준다
- **시작일이 없다.** `project_edate datetime` 하나와 자유 텍스트 `project_date varchar(500)`
  뿐인데 PROJ-01은 기간(시작일·종료일)을 필수로 요구한다
- **`QUOTATION_LINE`에 차수 컬럼이 없다.** D-55의 차수 모델도 원천이 없어 옛 줄은 전부 한
  차수로 들어간다
- **`quo_benefit decimal(15,0)`이 저장돼 있다** — ROADMAP 기준 2가 말한 「차익 불일치 66줄」이
  이 컬럼이다. transform은 믿지 말고 재계산한다
- **`invoice_money varchar(500)` · `invoice_date varchar(1000)` · `QUOTATION_PAYMENT.pay_money
  varchar(45)`** — 금액이 자유 텍스트다. `분석도구/README.md`가 「계산서 금액 칸에
  `(카결 28,999,000)` 같은 주석이 섞여 있다 — 앞 숫자만 취해야 앱 합계와 맞는다」고 경고했고,
  이것이 `요약.json`의 `invoiceSum: 4887400581393167`(4,887조)을 만든 원인이다.
  **`amount_basis` 판정이 다뤄야 할 대상이 바로 이 칸들이다**
- **통화·환율 컬럼이 어디에도 없다** — 「옛 금액은 통화 KRW·환율 1」(Phase 8 규약)이 실측으로
  확인된다. `quo_price`·`quo_expect`·`quo_execute`는 전부 `decimal(15,0)` 정수라 D-53의
  최소단위 정수와 맞는다
- **`pro_num`은 `AUTO_INCREMENT=363`인데 프로젝트는 125건** — 결번이 이미 있다. 옛 id에서
  결정적으로 파생하는 번호(MIG-01)는 그 결번을 그대로 물려받는다
- **재사용 가능한 파서가 이미 있다.** `분석도구/parse_dump.js`가 mysqldump의 `INSERT ... VALUES`를
  직접 파싱해 표별 JSON을 낸다(46표). 같은 폴더의 README가 「덤프 → JSONL 어댑터를 만들 때 이
  파서를 뼈대로 쓸 수 있다」고 적어 뒀다. 함께 기록된 교훈 하나 더: 긁기 자료 JSONL의 id는
  **문자열**, DB는 **숫자**라 대조 시 형변환이 필수다

### Integration Points
- `app/(app)/projects` 라우트가 이미 비어 있는 상태로 존재한다
- 리저브 대장은 정보 노출표·행동 로그·보관함 규약을 그대로 따른다
- `domain/money.applyTaxRule()`이 Phase 3 코드표의 세금 규칙 필드(절사 단위·방식·최소
  징수액·기준일 종류)를 읽는다
- 견적 대·소분류는 Phase 3 코드표를 참조한다

</code_context>

<specifics>
## Specific Ideas

- **순서가 가장 중요하다**(사용자, 2026-09-21): 프로젝트 등록 폼을 만들기 **전에**
  `ui/form`·`ui/select`·`ui/table`·`ui/grid`를 먼저 만든다. 화면부터 만들면 안 된다
- **게이트를 페이즈 끝에 몰지 않는다**(사용자): 웨이브마다 `/review`·`/design-review`를
  돌린다. Phase 3에서 몰았다가 `/review` 14건 + `/design-review` 26건이 한꺼번에 나왔고
  그중 3건은 사용자가 스테이징에서 먼저 찾았다
- **서브에이전트 보고를 그대로 믿지 않는다**(사용자): 인용한 원문을 직접 확인한다.
  이번 세션에서도 인계 문서의 「`--form-max` 사용처 0」이 실측과 달랐다(D-61)

</specifics>

<deferred>
## Deferred Ideas

- **관리자 읽기 표 6개의 `ui/table` 이관** — Phase 7 (D-47). 폼 8개 이관과 같은 자리
- **03-OPEN-ITEMS의 DOM 감사 2·6·7**(관리자 표 375px 가로 스크롤) — D-47에 묶여 Phase 7
- **RSV-02**(리저브에서 매출 충당) — Phase 9, 매출 기준(PNL-03)이 생긴 뒤
- **PROJ-06**(완료 시 미결 점검) — Phase 6, 지출결의가 생긴 뒤. 설정 키 3종은 Phase 3이 이미 등록
- **번호 서식 설정 키 5종**(지출결의·일반관리비·구매 요청·법인카드 사용·연차) — 각 문서를
  만드는 페이즈가 등록 (D-52)
- **인트라넷 적재·검증·델타 이전·전환** — Phase 8. 이 페이즈는 extract·transform까지

### Reviewed Todos (not folded)
- `2026-09-20-phase-3-checkpoint-answers.md` (score 0.6) — Phase 3 실행 전 결정 4건의 답이다.
  「phase」·「plan」 키워드로 매칭됐을 뿐 Phase 4 범위와 무관해 접지 않았다

</deferred>

---

*Phase: 04-project-quotation-ledger*
*Context gathered: 2026-09-21*
