# Phase 04.3 엔지니어링 리뷰 (plan-eng-review) — 2026-09-25

- 대상: `.planning/phases/04.3-qr-certificate-intake/` 미실행 플랜 13개(04.3-01~04.3-13, 웨이브 1~7)
- 브랜치 `claude/plan-phase-04-3-9wian4` · 커밋 `ba9436f`
- 검토자 구성: 1차 Opus 4명(A = 01·02·13, B = 03·04·05, C = 06·07·08, D = 09·10·11·12) + 교차 검토(Outside Voice) Opus 1명. **Codex 한도(2026-09-29 전후까지)로 Opus가 대체했다. 한도가 풀리면 Codex로 다시 확인해야 한다.**
- 판정·통합: Opus. outside의 P1 4건은 플랜 줄, 현재 코드, `origin/claude/gsd-progress-e1nzgu`(Phase 4, `2732d16`)로 직접 검증했다.
- 결정 방식: **추천 기본값 자동 적용(사용자 수면 중, 2026-09-25 KST).** 잠긴 결정(D-1101~1108, `.continue-here.md` decisions_made)은 바꾸지 않았다. 사용자 결정은 되돌리기 어렵거나 범위를 바꾸는 2건만 남겼다. 두 건 모두 기본값은 「현 계획 유지」다.

## 요약

| 등급 | 수 | 항목 |
|---|---|---|
| P1 | 2 | E3-01 Phase 4 겹침 파일을 마지막(13)에 한 번에 머지 → 멈춤이 거의 확실하고 구현도 중복된다 · E3-07 스테이징에서도 기능이 꺼져 있어 13의 사람 확인과 GCS·KMS 실제 경로 확인을 할 수 없고, 부트스트랩 순서가 자동 배포와 부딪힌다 |
| P2 | 13 | E3-02 · 03 · 08 · 09 · 10 · 11 · 17 · 18 · 19 · 20 · 21 · 22 · 32 |
| P3 | 20 | E3-04~06 · 12~16 · 23~31 · 33~35 |
| 합계 | 35 | critical gap 1(E3-16 파기 Job 실행 누락이 조용히 실패) · 사용자 결정 대기 2(E3-03 · E3-04) |

outside P1 4건 판정:
- (a) Phase 4 공통 파일 충돌을 13까지 미룸 → **P1 유지**
- (b) 스테이징에서 기능 꺼짐 → **P1 유지**. B-2(부트스트랩 순서)와 합쳐 E3-07로 둔다.
- (c) 행사 전체 한도(60분 30회) → **P2로 강등**(E3-08)
- (d) 병렬 웨이브의 `erp_test`·포트 3100 공유 → **P1 기각, P3 한 줄로 남김**(E3-33)

판정: **계획 수정 뒤 실행.** P1 2건과 P2 11건(사용자 결정 2건 제외)을 다음 세션에서 `/gsd-plan-phase 04.3` 수정 모드로 반영한다. 반영할 내용은 대부분 frontmatter와 태스크 문장 몇 줄이다. 구조를 크게 바꾸는 것은 E3-01(Phase 4 기준으로 맞추기) 하나다. 그다음 `/plan-design-review` → 설계 `/cso`(D-1107) → 실행 순서로 간다.

## Step 0 — Scope Challenge

**E3-01 [P1] (confidence: 9/10) 04.3-13-PLAN.md:99 · 04.3-PATTERNS.md:245 — Phase 4가 이미 고친 비등록부 파일을 04.3이 옛 main 기준으로 다시 고치고, 마지막 13에서야 머지한다**
- 13:99 인용: 「추가 전용 등록부(…)는 **양쪽 항목을 모두 남긴다** … 그 밖의 파일에서 충돌이 나면 **멈추고**」. PATTERNS:245와 CONTEXT:119의 전제는 「Phase 4와 겹치는 것은 등록부 몇 개뿐」이다.
- 직접 검증: `git diff --stat origin/main...origin/claude/gsd-progress-e1nzgu`로 보면 Phase 4는 등록부가 아닌 파일 19개를 고쳤다(+1199/−114). 목록: `ui/button/Button.tsx`(+43) · `Button.module.css`, `ui/table/Table.tsx`(+108) · `use-grid-keyboard.ts`(+58) · `Table.module.css`, `ui/confirm-dialog/ConfirmDialog.tsx`(새 파일, 276줄), `db/client.ts`(+7), `domain/action-log/record.ts`(45), `repositories/action-log.ts`(8), `docs/design/SYSTEM.md`(180) · `DECISIONS.md`(+227), `docs/ARCHITECTURE.md`(+28).
- 04.3에서 같은 파일을 고치는 플랜: Button은 02·03·07·11, Table은 04·10, grid 키보드는 10, `db/client.ts`는 02·06·07·10, SYSTEM.md는 01~04·06·07·09~11, DECISIONS는 01·09·10, ARCHITECTURE는 08·13, confirm-dialog는 04·10·13.
- 중복 구현:
  - 03:301 ①의 `Button` 작업(`disabledReason` → `useId` + `aria-describedby`)은 Phase 4 `Button.tsx:43-47`에 이미 있다. Phase 4는 여기에 더해 네이티브 `disabled`를 `aria-disabled`로 바꿨다(DECISIONS 「Phase 4(04-08) ⑦: 비활성 이유 두 색 + aria-disabled」). 04.3의 버튼 테스트가 네이티브 disabled를 전제하면 머지 뒤 서로 모순된다.
  - 10이 새로 만드는 `confirm-dialog.tsx`와 04의 화면 안 `<dialog>`는 Phase 4 `ui/confirm-dialog`(DECISIONS ⑮ §7-17)와 겹친다. 04:58에는 이미 「`ui/confirm-dialog`가 main에 없을 때 — 생기면 옮기는 후속」이라고 적혀 있다.
  - 04-32 `recordAction(…, {tx})`는 Phase 4 브랜치에 있다(`c9e70ea`, record.ts `deps.tx`, 설정 조회도 같은 tx). 아직 main에는 없다(`merge-base --is-ancestor` 결과 no). CONTEXT:119의 「바꾸는 중」은 사실과 다르다.
  - SYSTEM.md 개정 번호가 겹친다. 04.3-01이 쓰는 「§7-1/§7-2 ⑦」과 Phase 4의 「⑦」「⑮」이 부딪힌다.
- 덧붙여, 현재 브랜치 HEAD에는 origin/main `0341e36`(04.2 계획)이 들어 있지 않다.
- 추천 수정:
  - 13 머지 전략을 앞으로 당긴다. 실행 시작 조건은 「Phase 4 PR이 main에 머지된 뒤」로 둔다. 매 웨이브 시작에 `git merge origin/main`(리베이스·강제 푸시 금지)을 하는 단계를 둔다.
  - 03 Task 2 ①은 Phase 4 `Button` 확인으로 줄인다(aria-disabled 전제로 테스트한다).
  - 04 · 10의 확인 창은 `ui/confirm-dialog`를 쓴다.
  - 06·07·10·12의 tx 로그는 `recordAction(…, {tx})`로 통일한다(E3-02).
  - 01의 SYSTEM·DECISIONS 개정 번호는 main 기준으로 다시 매긴다.
  - 13 ① 「양쪽 모두 남김」 목록에 `docs/ARCHITECTURE.md` · `docs/OPERATIONS.md`(절 단위, main 절이 먼저)를 넣는다. ④에는 「300줄 상한(`test/unit/docs-limits.test.ts`)을 넘으면 이 페이즈 요약을 줄인다」를 넣는다.
  - PATTERNS:245의 「5개뿐」 전제는 SUMMARY에 정정으로 적는다(`.planning/` 산출물은 플래너가 고친다).
- 처분: **계획 수정(다음 세션 /gsd-plan-phase 수정 반영).** 합친 지적: outside P1-1, A P2-2(ARCHITECTURE 충돌), A P3(13:183 두 방식 혼재), C P2②(04-32 이미 끝남).

**E3-02 [P2] (confidence: 8/10) 04.3-06-PLAN.md:217 · 04.3-07-PLAN.md:186 · 04.3-10-PLAN.md:248 — tx 로그 도우미가 둘이고, 07 쪽은 `recordAction`을 다시 구현한 사본이다**
- 06:217은 `insertActionLogTx(viewer, entry, tx)`를 만들고 `recordAction`에 주입한다. 07:186은 `appendCertActionLogTx`를 따로 만든다. 07은 actorId 매핑·종류 검사를 다시 구현하고, 10:248은 그 사본의 타입 유니온을 07 계약과 다르게 고친다.
- 현재 코드 `domain/action-log/record.ts:127-134`에서는 끌 수 없는 종류가 설정 조회를 건너뛰고 주입된 `appendActionLog`로 INSERT한다. 그래서 06 모양 하나로 07·10·12 호출부를 모두 덮을 수 있다.
- `repositories/action-log.ts:18` 주석 「이 함수 외에 action_log를 겨냥한 INSERT는 이 리포에 없다」는 사실이 아니게 된다.
- 추천 수정:
  - E3-01을 따르면(Phase 4가 main에 있으면) 두 도우미를 만들지 않는다. 06·07·10·12 모두 `recordAction(viewer, entry, {tx})`를 쓴다.
  - 실행 시점에 `RecordActionDeps`에 `tx`가 없을 때만 쓰는 대비책을 둔다. `insertActionLogTx(viewer, entry, tx: DbOrTx)` 하나를 웨이브 2 플랜(02 ⑨)의 `repositories/cert-action-log.ts`에 두고, 02 ⑩ 8단계를 처음부터 tx 안 `recordAction(…, {appendActionLog: …, isActionTypeEnabled: async () => submitLogEnabled})`로 쓴다. 07 ③-b의 사본, 07:163의 종류 거부 케이스(`record.test.ts`가 이미 덮는다), 10 ②-c의 유니온 추가는 뺀다.
  - 07:162의 풀 장벽 케이스는 유지한다.
  - 도우미를 만드는 플랜이 `action-log.ts:18` 주석 한 줄을 고친다. 자기 변경이 거짓으로 만든 주석이라 CLAUDE.md §3.3 범위 안이다.
- 처분: **계획 수정.** 합친 지적: A P2-1 · A P3(주석) · C P2① · D P3(10:248 타입, 공유 코드) · outside P1-1 일부.

**E3-03 [P2] (confidence: 7/10) 04.3-06-PLAN.md:210 · 04.3-05 전체 — 서명 저장소를 GCS가 아니라 DB(bytea)에 두는 안을 비교하지 않았다**
- 서명 PNG는 최대 180 KiB이고 연간 수백 건이다. CONTEXT에서 저장 위치는 「재량」이다. RESEARCH:141은 「서명 URL 대 서버 업로드」만 비교했다.
- DB에 두면 없어지는 것: 05 전체(버킷·IAM·부트스트랩 재실행), C3 `cert_signature_uploads`와 24시간 고아 정리, 06 (e)(g)의 커밋 불명 복구 세 갈래, 「DB 먼저·파일 나중」 파기 순서. 서명도 앱 단에서 암호화할 수 있다.
- 치르는 것: DB 크기 증가, 백업 크기. 여러 차례 검토로 수렴한 플랜 05·06·11·12를 다시 쓰는 비용도 든다.
- 처분: **사용자 결정 필요(아침에 카드).** 저장 구조를 바꾸면 되돌리기 어렵고 플랜 범위가 바뀐다. 기본값은 **현 계획 유지(GCS)**다. 다음 세션은 기본값으로 진행하고, 사용자가 DB를 고르면 05를 빼고 02·06·11·12를 줄이는 재계획을 한다.

**E3-04 [P3] (confidence: 6/10) 전략 — 켜는 시점이 Phase 11 뒤인 기능에 약 177만 토큰이 들어간다. 12(파기)·08(KMS)의 범위와 시점을 다시 볼 만하다**
- 12의 첫 실제 파기 대상은 기한 공식(12:92)상 2032년 이후다. 08은 확인증과 상관없이 운영 중인 거래처 계좌번호 키의 보관 방식을 프로덕션에서 바꾼다(기동 때 KMS가 실패하면 앱 전체가 뜨지 않는다).
- 처분: **사용자 결정 필요(아침에 카드).** ROADMAP 범위가 바뀐다. 기본값은 **현 계획 유지**다. 선택지는 「12는 미제출 명단 파기 + 미리 보기 CLI로 줄이기」와 「08을 별도 작업으로 떼어 자체 배포·롤백 창에서 진행하기」다.

**E3-05 [P3] (confidence: 5/10) 04.3-03-PLAN.md:262 — 03 Task 2가 E2E 16줄, 단위 3개, Button 개정을 한꺼번에 담는다(`tokens: 140000`, `confidence: low`)**
- 추천 수정: 「2a 기본 E2·E3(+Button 확인 — E3-01)」와 「2b 누적 잠김 묶음·잠금 다시 확인」으로 나눈다. 파일 경계는 바뀌지 않는다.
- 처분: **계획 수정.** 출처: B-11.

**E3-06 [P3] (confidence: 6/10) 04.3-10-PLAN.md:175 — 공용 표 행동 셀(⓪-b)은 화면과 떼어도 혼자 녹색이 된다**
- 추천 수정: 「⓪-b 커밋은 ①~⑦보다 먼저」로 못박는다. Phase 4 `Table.tsx`·`use-grid-keyboard.ts` 변경을 기준으로 다시 쓴다(E3-01).
- 처분: **계획 수정.** 출처: D Step 0.

## Step 1 — Architecture

**E3-07 [P1] (confidence: 9/10) 04.3-02-PLAN.md:193 · :292 · 04.3-13-PLAN.md:192 · 04.3-05-PLAN.md:27 — 스테이징에서 기능이 켜지지 않아 13의 사람 확인이 불가능하다. 소유자 부트스트랩을 「머지 뒤 첫 스테이징 배포 전」에 돌리라는 시점도 존재하지 않는다**
- 직접 검증:
  - 02:193 「`scripts/deploy.sh`는 이 변수를 두지 않는다(Phase 11이 켠다)」, 02:292 「`grep -rn "CERT_FEATURE_ALLOWED" scripts/deploy.sh` 결과가 0줄」. 환경 게이트가 없으면 모든 확인증 경로가 `notFound()`다.
  - 그런데 13:192 human-check는 「I3 화면의 QR을 폰 카메라로 찍으면 `/c/{token}` E2가 열린다(**스테이징 URL**)」이고, 13:190(VoiceOver/TalkBack 서명)·13:191(실제 인쇄)도 폰이 접속할 HTTPS 주소가 필요하다. 이대로면 스테이징에서 404가 난다.
  - 그 결과 05 GCS 드라이버(가짜 request 단위뿐), 버킷 IAM, 08 KMS 복호화가 이 페이즈 안에서 실제 환경을 한 번도 거치지 않는다.
  - 부트스트랩: 05:27 「이 플랜이 머지된 뒤 첫 스테이징 배포 전에 … 다시 돌린다」. 그러나 `.github/workflows/deploy.yml:3,9-10`은 「main push는 스테이징에 자동 배포」다. 틈이 없다. 머지 순간 `ensure_cert_bucket`에서 배포가 멈추고, 소유자가 부트스트랩을 돌릴 때까지 다른 스레드의 main 배포도 함께 막힌다. 08의 KMS 역할도 같은 구조다.
- 잠긴 결정과의 관계: CONTEXT:39·D-1107이 잠근 것은 「**프로덕션**에서 꺼져 있다」다. 스테이징은 잠겨 있지 않다. `cert.enabled` 설정 기본값은 꺼짐이므로, 스테이징에서 환경 게이트를 허용해도 관리자가 켜기 전에는 열리지 않는다.
- 추천 수정:
  - `deploy.sh`는 `--env staging`일 때만 `CERT_FEATURE_ALLOWED=true`를 싣는다. 02:292의 grep 0줄 단언은 `test/unit/deploy` 단위 테스트 「prod 배포 env에 `CERT_FEATURE_ALLOWED` 없음 · staging에만 있음」으로 바꾼다.
  - 13 Task 3에 스테이징 스모크(행사 만들기 → 폰 제출 → I4 서명 읽기 → 파기 미리 보기)를 넣는다. 스테이징 데이터는 가짜 인물만 쓴다는 한 줄도 넣는다.
  - 05·08 `user_setup`, `docs/OPERATIONS.md` §8, 13 PR 체크리스트의 시점을 「PR 머지 **전에** PR 브랜치의 `bootstrap-gcp.sh`로 한 번(머지 = 스테이징 자동 배포)」으로 고친다.
- 처분: **계획 수정.** 스테이징 게이트는 환경 변수 하나로 되돌릴 수 있어 자동으로 적용했다. 합친 지적: outside P1-2 · B-2.

**E3-08 [P2] (confidence: 7/10) 04.3-03-PLAN.md:54 · :63 · :376 — 행사 전체 한도(60분 틀림 30회)와 `throttled`가 운영자에게 보이지 않는다**
- 63 인용: 「그 행사 전체가 30번 이상이거나 같은 IP … 10번 이상이면 … `throttled`」. 54 인용: throttled는 「결과 불명」 줄(`다시 눌러 주세요`)로 처리한다. 서버 로그나 I3 표시는 03 어디에도 없다.
- outside P1을 강등한 근거:
  - T-04.3-30(376)이 악의적인 행사 정지(최대 60분)를 이미 accept했다.
  - 한도는 「이름 붙은 상수이고 설계 `/cso`가 조정한다」(63). 수치 결정은 계획상 `/cso` 몫이다.
  - UI-SPEC A2의 규모 가정은 「수~수십 명」이다. 이 규모에서는 정상 오타로 30회에 닿기 어렵다. outside가 든 200~500명 시나리오는 가정 밖이다.
  - 실행을 깨뜨리지 않는다.
- 그래도 P2로 남기는 이유:
  - 명단 최대 500명(10:333)과 가정 사이에 틈이 있다.
  - 정지가 일어나도 담당자는 원인을 알 수 없다. 조용한 운영 실패에 가깝다.
- 추천 수정:
  - 03 ④ (f)에 `log.warn("cert.verify_throttled", {scope, eventId})`를 넣는다(IP 해시만, 개인정보 없음).
  - 한도는 `eventMissLimit(rosterSize)` 순수 함수로 둔다. 기본은 `max(30, ceil(명단×0.3))`이고 수치는 `/cso`가 정한다.
  - 03 success_criteria의 「/cso 앞 수치」에 「정상 오타율 × 명단 크기」 줄을 넣는다.
  - throttled 문구를 「n분 뒤 다시 · 문의 줄」로 바꿀지는 `/plan-design-review`에 넘긴다. UI-SPEC은 승인된 계약이라 이 검토가 바꾸지 않는다.
- 처분: **계획 수정 + TODO(`/cso` 수치).** 합친 지적: outside P1-3 · B-5.

**E3-09 [P2] (confidence: 7/10) 04.3-03-PLAN.md:214 · :221 — `verifyLast4`를 행사 행 잠금 tx로 감싸면서 설정 읽기를 tx 밖으로 빼라는 규칙이 없다**
- 03에 「트랜잭션 전」 규칙이 0곳이다(`grep -c` = 0). 02:373의 동의 버전·보관 연수, 03의 `maxAttempts`·`lockMinutes`는 전역 풀(`getSettingValue`, `DB_POOL_MAX` 5)로 읽힌다. 동시 20건 통합 케이스에서 교착이 나지만, `fails_when`(03:239)은 원인을 「행 잠금 누락」으로 설명한다.
- 추천 수정: 03 ④ (c) 앞에 「설정·플래그는 tx 전에 읽어 값으로 넘긴다. 콜백 안 DB 호출은 전부 `tx`」를 넣는다(02:383 규칙을 넓힘). `fails_when`에 「시간 초과 = tx 안 전역 db 호출」을 넣는다. E3-01로 04-32(설정 조회 tx 전달)가 들어와도 규칙은 그대로 둔다.
- 처분: **계획 수정.** 출처: B-1.

**E3-10 [P2] (confidence: 7/10) 04.3-07-PLAN.md:44 · :118 — 「비활동 2시간」이 실제로는 「로그인 2시간 뒤 개인정보 화면을 처음 열면 ERP 전체 로그아웃」으로 동작한다**
- 44 인용: 「비활동 시간이 지난 세션은 서버가 끊고 … 활동 기록이 아직 없으면 로그인 시각(`sessions.created_at`)을 마지막 활동으로 본다」. 09시에 로그인해 지출결의에서 계속 일하던 경영관리가 11시 1분에 I4를 열면 세션 전체가 삭제된다. 다른 탭의 저장 안 한 작업도 함께 날아간다.
- 추천 수정: 이 세션에 개인정보 경로 활동 행이 없으면 **첫 방문 시각을 시작점으로 기록하고 끊지 않는다.** 활동 행이 있고 한도가 지났으면 지금처럼 끊는다. 단위·통합 케이스 「로그인 3시간 뒤 첫 I4 방문 → 통과, 그 뒤 2시간 무활동 → 끊김」을 넣는다. 끊는 범위(세션 전체 대 개인정보 경로만 재인증)는 `/cso` 확인 항목으로 둔다.
- 처분: **계획 수정.** 출처: outside P2-6.

**E3-11 [P2] (confidence: 5/10) 04.3-08-PLAN.md:165 — `lib/crypto.ts`에 KMS 어댑터를 정적으로 붙이면 클라이언트 번들이 오염된다**
- 직접 검증: `app/(app)/admin/vendors/vendor-form.tsx:1` `"use client"`, 같은 파일 12행 `import { maskTail4 } from "@/lib/crypto"`. 지금은 `lib/crypto.ts`가 `node:crypto`·`@/lib/env`만 import하는데도 빌드가 통과한다. 여기에 `google-auth-library`(`child_process`·`fs`)가 더해지면 결과가 같다는 보장이 없다.
- 추천 수정: 08 ③-b에 「`loadDataKeys` 안에서 `await import("@/lib/gcp/kms")`로 동적 import」를 적는다. `pnpm build` 실패가 나면 `maskTail4`를 따로 떼는 태스크를 둔다(요청된 변경으로 기록).
- 처분: **계획 수정.** 출처: outside P2-7.

**E3-12 [P3] (confidence: 6/10) 04.3-08-PLAN.md:29 · :250 · :301 — 배포자에게 프로젝트 단위 `roles/cloudkms.admin`은 필요보다 넓다. T-04.3-91 문장과 역할 현황 서술도 서로 어긋난다**
- 배포자가 실제로 쓰는 것은 describe/create·키 IAM 바인딩·encrypt/decrypt다. `cloudkms.admin`은 버전 만들기·파기·주 버전 변경까지 준다.
- 기밀성은 이미 `secretmanager.admin`이 넘어선 상태라 넓어지지 않는다. 키 수명주기 조작 능력은 새로 생긴다.
- 08:29는 「KMS 역할 없음」이라고 적고, `.continue-here.md:78`은 「이미 `cloudkms.admin` 있음」이라고 적는다.
- 추천 수정(기본값 = C의 (나)):
  - 계획 구조는 유지한다.
  - T-04.3-91 disposition에 「기밀성은 넓어지지 않지만 키 수명주기 권한이 생긴다 — 후속 축소」를 적는다.
  - 08 사전 조건에 `gcloud projects get-iam-policy … --filter="bindings.members:gha-deployer"` 확인 한 줄을 넣는다.
  - 최소 권한 (가)안(키링·키 생성을 소유자 bootstrap으로 옮기고 배포자에게는 키 단위 역할만 주기)은 후속으로 남긴다.
- 처분: **TODO/후속**(문장 두 곳은 계획 수정). 출처: C ③④⑤.

**E3-13 [P3] (confidence: 5/10) 04.3-09-PLAN.md:35 · `domain/seed/index.ts:163-168` — 시스템 관리자 계급의 `cert.rrn_unmasked` 노출과 `certs.submissions` 권한을 배포 시드가 매번 다시 켠다**
- CONTEXT는 「전체 보기는 경영관리만」이다. 소유자가 시스템 관리자 계급에서 이 권한을 꺼도 다음 배포에서 되살아난다.
- 추천 수정: 09 threat_model에 T-04.3 한 줄을 넣는다. 시스템 관리자가 개인정보취급자 범위에 드는지는 설계 `/cso`가 판단한다.
- 처분: **TODO/후속(`/cso` 항목)**(threat 줄은 계획 수정). 출처: D.

**E3-14 [P3] (confidence: 6/10) 04.3-10-PLAN.md:265 — `unlockWinner`에는 `visible(viewer, "cert_winner.value")` 판정이 없다**
- 같은 플랜의 `saveWinners`(254)와 `unlockable`(272)에는 이 판정이 있어, 서버 판정과 UI 판정이 어긋난다. 값은 `project()`를 거치므로 새지 않는다.
- 추천 수정: 1단계에 visible 거짓이면 `forbidden`을 넣고, 통합 거부 케이스 한 줄을 넣는다.
- 처분: **계획 수정.** 출처: D.

**E3-15 [P3] (confidence: 6/10) 04.3-03-PLAN.md:220 · :380 — IP 해시는 역산할 수 있고, 「60분 보관」 서술도 사실과 다르다**
- `sha256(eventId + ip)`는 IPv4 공간(2³²)을 대입해 몇 분이면 되돌릴 수 있다. 솔트도 같은 DB에 있다.
- `wrong` 항목은 그 자리에 다음 쓰기가 있을 때만 빠진다. 그래서 12 파기 때까지 남는다.
- 추천 수정: T-04.3-80 문장을 「역산 가능한 가명 · 파기까지 보관」으로 고친다. HMAC(서버 비밀 키)으로 바꿀지는 `/cso`가 정한다.
- 처분: **계획 수정(문장) + TODO(`/cso`).** 출처: B-6.

**E3-16 [P3] (confidence: 5/10) 04.3-12-PLAN.md:92 — 파기 Job은 사람이 월 1회 실행한다. 잊으면 기한이 지난 개인정보가 알림 없이 남는다**
- 12 플랜에는 런타임 SA의 버킷 삭제 권한 전제(bootstrap 재실행)도 적혀 있지 않다.
- 추천 수정: 12 Task 3 ③ 런북에 「`purge_certs.done`이 35일 넘게 없으면 확인」과 「첫 적용 전 bootstrap-gcp.sh 재실행 확인」 두 줄을 넣는다. 시스템 상태 화면에 마지막 `cert_purge` 시각을 보일지는 후속으로 둔다.
- 처분: **계획 수정(런북) + TODO.** critical gap 1건(실패 모드 표 참고). 출처: D.

## Step 2 — Code Quality

**E3-17 [P2] (confidence: 7/10) 04.3-10-PLAN.md:253 · :257-258 — 칸 단위 저장에서 표시형 값(`010-4821-7730`)과 저장형 값(숫자만·`onsite`·정수)을 섞어 비교하고 병합한다**
- 결과 셋:
  - 「내 전화 × 남의 경품명」이 거짓 충돌이 된다.
  - 보내지 않은 칸을 병합해 `validateWinnerRows`에 넣으면 `delivery`/`phoneFormat` 오류가 난다.
  - 충돌 문장에 저장형 값이 노출된다.
- 추천 수정:
  - 비교는 정규형(`normalizePhone`·전달 enum·정수·trim/NFC)으로 한다.
  - 검사 입력은 화면형(`formatPhone`·라벨)으로 바꾼 뒤 넣는다.
  - 충돌 `value`는 표시형으로 돌려준다.
  - 통합 케이스 둘(「내 전화만 × 남의 경품명 → saved」 · 「전달만 → saved」)을 넣는다.
- 처분: **계획 수정.** 출처: D.

**E3-18 [P2] (confidence: 8/10) 04.3-09-PLAN.md:111 · :121 — `withCertMenusGated`는 비동기여야 하는데 동기처럼 적혀 있고 deps도 없다**
- 02:196 `isCertFeatureEnabled(deps?): Promise<boolean>`. 09:121은 동기 필터처럼 적었다. 테스트 자리인 `test/unit/ui/role-menu.test.ts`는 ui 경계라 domain을 import할 수 없다.
- 추천 수정: `withCertMenusGated(allowedMenus, deps?): Promise<string[]>`로 바꾸고 두 호출부에 `await`를 붙인다. 켜짐/꺼짐 단위 테스트는 `test/unit/certs/feature.test.ts`에 deps를 주입해 쓴다.
- 처분: **계획 수정.** 출처: D.

**E3-19 [P2] (confidence: 7/10) 04.3-09-PLAN.md:115 — 복제 목록 `ADMIN_MENU_KEYS`에 `certs.events`를 넣으면 기존 전제 테스트가 빨개진다**
- 직접 검증: `test/unit/ui/role-menu.test.ts:143-156`의 `adminRouteExists`가 `key.slice("admin.".length)`로 `app/(app)/admin/<name>/page.tsx`를 찾는다. `certs.events`면 `admin/events/page.tsx`를 찾게 되는데 그런 파일은 없다.
- 추천 수정: `ADMIN_MENU_KEYS`는 그대로 둔다. `CERT_ADMIN_MENU_KEYS = ["certs.events"]`와 `app/(app)/certs/events/page.tsx` 존재 단언을 따로 둔다. §6-10 합계는 두 목록 길이를 합해서 센다. admin-menu-registry의 확인증 케이스는 별도 `it`으로 둔다.
- 처분: **계획 수정.** 출처: D.

**E3-20 [P2] (confidence: 5/10) 04.3-10-PLAN.md:345 · :371 — 확인 창이 행동 셀 `td` 안에 그려지면 모달 안에서 누른 Enter/방향키가 셀 `onKeyDown`(`Table.tsx:307-309`)으로 올라간다**
- 올라간 키는 셀 버튼을 다시 누르거나 표 포커스를 옮긴다.
- 추천 수정: `ConfirmDialog`(E3-01에 따라 `ui/confirm-dialog`)는 `winners-section` 최상위, 표 밖에 하나만 그린다. 여는 줄의 상태는 state로 넘긴다. E2E에 「모달 1차 Enter → 요청 1회 · 다시 열리지 않음」 단언을 넣는다.
- 처분: **계획 수정.** 출처: D.

**E3-21 [P2] (confidence: 7/10) 04.3-04-PLAN.md:184 — `validateWinnerRows`에 이름 40자·경품명 80자 길이 오류 코드가 없다**
- 길이를 넘으면 zod의 `serverError`가 나서 어느 칸인지 알 수 없다. 상한이 빠지면 10의 본문 한도 계산 전제(T-04.3-182)가 깨진다.
- 추천 수정: `nameTooLong`·`prizeTooLong` 코드와 경계 단위 케이스(40/41·80/81)를 넣고, 편집 입력에 `maxLength`를 준다. 셀 문장은 `/plan-design-review`에서 UI-SPEC I2에 넣는다.
- 처분: **계획 수정.** 출처: B-3.

**E3-22 [P2] (confidence: 6/10) 04.3-04-PLAN.md:304 — 만들기 제출에 `serverError`(본문 한도·`contactMissing` 경합)와 연결 실패 갈래가 없다. 다시 누르면 행사(QR)가 둘 생길 수 있다**
- 추천 수정:
  - (f)에 「`serverError` → 합계 행 자리에 `--danger` 한 줄, 편집 값 유지, 1차 다시 활성」과 「연결 실패 → 같은 줄 + 다시 누르기」를 넣는다. `create-form-rules` 단위 케이스도 하나 넣는다.
  - 멱등 키(클라이언트가 만든 `requestId`와 unique)를 둔다.
  - 한 요청의 당첨자 상한 500(10과 같게)을 zod에 둔다.
- 처분: **계획 수정.** 출처: B-4.

**E3-23 [P3] (confidence: 5/10) 04.3-10-PLAN.md:173 · :248 — 재전송 판정 `detail->>'lockStamp' = lockStamp`가 문자열을 정규화하지 않은 채 비교한다**
- 추천 수정: zod를 `z.string().datetime({offset: false, precision: 3})`로 좁히거나, domain 입구에서 `new Date(x).toISOString()`으로 정규화한다.
- 처분: **계획 수정.** 출처: D.

**E3-24 [P3] (confidence: 5/10) 04.3-03-PLAN.md:206 · :208 — `lockEventRow(viewer, tx, eventId)` · `countRecentMisses(viewer, tx, …)`의 인자 순서가 저장소 관례(tx 마지막)와 다르다**
- 관례: `repositories/quote-lines.ts:23`, 12:165.
- 추천 수정: `(viewer, eventId, tx)` · `(viewer, {…}, tx)`로 바꾸고 기본값은 두지 않는다. 06·07·10·12의 호출부도 맞춘다.
- 처분: **계획 수정.** 출처: B-8 · C 부록.

**E3-25 [P3] (confidence: 5/10) 04.3-04-PLAN.md:178 — `qrcode.toString`은 비동기라 `renderQrSvg`도 `async`가 된다**
- 추천 수정: `async renderQrSvg(link): Promise<string>`으로 적고, `getEventDetail`과 단위 테스트에서 `await`한다.
- 처분: **계획 수정.** 출처: B-10.

**E3-26 [P3] (confidence: 5/10) 04.3-05-PLAN.md:137 — `getClient()` Promise를 모듈 수준에서 캐시하면 첫 순간 장애가 인스턴스 수명 내내 재생된다**
- 추천 수정: 성공한 클라이언트만 캐시하고, 거부되면 캐시를 비운다. 단위 케이스(첫 거부 → 두 번째 성공)를 넣는다.
- 처분: **계획 수정.** 출처: B-9.

**E3-27 [P3] (confidence: 6/10) 04.3-02-PLAN.md:379-380 — 번호 서식 읽기가 서명 `put` 뒤라, 서식 조회가 실패하면 고아 객체가 24시간 남는다**
- 추천 수정: 서식과 `submitLogEnabled` 읽기를 5단계(의도 행·put) 앞으로 옮긴다.
- 처분: **계획 수정.** 출처: A.

**E3-28 [P3] (confidence: 5/10) 04.3-02-PLAN.md:365 — `createEvent`의 설정 읽기와 `recordAction` 위치가 트랜잭션 기준으로 적혀 있지 않다**
- 추천 수정: 02 ⑧에 「설정 둘은 tx 전에 읽고, 로그는 커밋 뒤(또는 E3-02 방식)」 한 줄을 넣는다.
- 처분: **계획 수정.** 출처: A.

**E3-29 [P3] (confidence: 5/10) 04.3-02-PLAN.md:260 · `domain/settings/export.ts:94-97` — 게이트가 켜진 환경에서 내보낸 설정을 게이트가 꺼진 환경에서 가져오면 `cert.enabled`가 「등록되지 않은 키」로 걸린다**
- 의도한 동작이다. 다만 운영자는 이 키 때문에 가져오기가 막히는 이유를 알 수 없다.
- 추천 수정: 13 운영 문서에 「게이트가 꺼진 환경은 `cert.enabled`를 거부한다(의도)」 한 줄을 넣는다. 코드는 바꾸지 않는다. E3-07로 스테이징↔프로덕션 사이에서 실제로 생기는 경로가 된다.
- 처분: **계획 수정.** 출처: A.

**E3-30 [P3] (confidence: 5/10) 04.3-11-PLAN.md:45 — 동적 제목 `확인증 인쇄 · {번호}`를 쓰려면 `generateMetadata`가 게이트·권한 순서를 따로 밟아야 한다**
- 추천 수정: 고정 제목 `확인증 인쇄`로 둔다(가장 단순하다).
- 처분: **계획 수정.** 출처: D.

**E3-31 [P3] (confidence: 5/10) 04.3-02-PLAN.md:167 — 스키마를 전부 02에 몰았는데, 뒤 플랜이 칸을 더해야 할 때의 규칙이 없다**
- 추천 수정: 02 C-규약에 「뒤 플랜은 `db/schema/cert-*.ts`를 고치고 02의 `cert_intake` 마이그레이션을 `db:generate`로 다시 만든다(새 파일 금지). 해당 플랜 `files_modified`에 스키마를 적는다」를 넣는다.
- 처분: **계획 수정.** 출처: outside P3-9.

## Step 3 — Tests

**E3-32 [P2] (confidence: 6/10) 04.3-07-PLAN.md:283 — 07 E2E는 02의 E4 폼 조작으로 제출 표본을 만든다. 그런데 같은 웨이브의 06이 그 폼(주민번호 두 칸·동의·서명·결과 이름)을 다시 쓴다**
- 추천 수정: 02 C4 `test/e2e/helpers/cert.ts`에 domain을 직접 부르는 `seedSubmittedCert()`를 넣는다. 07·10·11·12의 표본은 이 함수만 쓴다.
- 처분: **계획 수정.** 출처: outside P2-8.

**E3-33 [P3] (confidence: 4/10) playwright.config.ts:51-76 · .planning/config.json — 같은 웨이브 병렬 실행이 `erp_test`와 포트 3100을 함께 쓴다는 주장**
- 직접 검증:
  - `.planning/config.json`은 `"parallelization": true`이고, `playwright.config.ts`는 `PORT "3100"` · `reuseExistingServer: false` · `erp_test`다.
  - 그러나 이 프로젝트의 훅(`.planning/quick/260923-odg-hook` D-04, `plant8-skill-gate.sh`)은 **세션당 gsd-executor 디스패치를 한 번만** 허용한다. 같은 메시지 안 병렬 디스패치도 정확히 하나만 통과한다. 실제 실행은 「세션당 플랜 하나, 통합·E2E 한 번에 하나」다.
  - 클라우드 세션은 각자 컨테이너와 DB를 쓴다. `playwright.config.ts:76` 주석도 공유 DB 함정을 이미 알고 있다.
- **P1 기각.** 남는 위험은 한 사람이 로컬에서 두 세션을 동시에 돌리는 경우뿐이다.
- 추천 수정: 13(또는 02 C4)에 「웨이브 안 플랜도 통합·E2E는 한 번에 하나(세션당 플랜 하나)」 한 줄을 넣는다.
- 처분: **기각(P1 근거: 실행 방식이 직렬) → 계획 수정 한 줄.** 출처: outside P1-4.

그 밖의 회귀 위험(Button·Table·deploy 도우미·leak-scan·page-auth-guard·RowSheet·role-menu PM)은 각 1차 검토가 회귀 단언과 짝지어 확인했다. 단, E3-01에 따라 Button·Table 회귀 단언은 Phase 4 구현을 기준으로 다시 쓴다.

## Step 4 — Performance

**E3-34 [P3] (confidence: 5/10) 04.3-03-PLAN.md:208 — `(value->>'at')::timestamp` 캐스트는 `Z`를 버린다. 프로세스 TZ가 KST면 판정 창이 9시간 어긋난다**
- CI와 Cloud Run은 UTC라 테스트로는 드러나지 않는다.
- 추천 수정: `(value->>'at')::timestamptz >= ${since.toISOString()}::timestamptz`로 비교한다고 명시한다.
- 처분: **계획 수정.** 출처: B-7.

**E3-35 [P3] (confidence: 5/10) 04.3-10-PLAN.md:255-259 — 500줄 저장은 행사 행 잠금을 쥔 채 줄마다 UPDATE한다. 행사당 누적 당첨자 수에는 상한이 없다**
- 현장 확인·제출이 몇 초 기다릴 수 있다. A2 규모(수~수십)에서는 받아들일 만하다.
- 추천 수정: 이번 페이즈에서는 T-04.3 accept 한 줄로 기록한다. 누적 상한(병합 뒤 > 500이면 `invalid`)은 `/cso`와 UI 검토로 넘긴다.
- 처분: **TODO/후속.** 출처: D.

## 테스트 커버리지 다이어그램

★★★ = 단위·통합·E2E 중 셋 · ★★ = 둘 · ★ = 하나 · [GAP] = 없음 · [→E2E] = E2E만 증명 · (E3-xx) = 이 리뷰가 닫는 공백

```
[수령자 /c/{token}]
 ├─ 기능 꺼짐 / 잘못된 토큰 → 404 ........................ ★★★ E2E + 통합
 ├─ 액션 직접 POST(꺼짐) → not-found ..................... ★★★ E2E
 ├─ verifyLast4
 │   ├─ 게이트 · 닫힘 판정 · 누적 잠김 우선 · 재생 8종 ....... ★★★ 통합 + 단위
 │   ├─ 속도 제한 행사/IP/동시 ............................. ★★★ 통합 공격 3종
 │   │   └─ throttled 운영 가시성 · 명단 비례 한도 ......... [GAP] (E3-08)
 │   ├─ tx 안 전역 db 호출(풀 교착) ........................ ★  간접, 설명 틀림 (E3-09)
 │   └─ at 비교 타임존(KST 프로세스) ....................... [GAP] (E3-34)
 ├─ 화면 E2/E3 5갈래 · Button 개정 ......................... ★★★ E2E + 단위 (Phase 4 aria-disabled 기준으로 재작성, E3-01)
 ├─ submitCertificate
 │   ├─ 정상 · 증표 · 동의 · rrnRecheck ..................... ★★★ 통합 + E2E
 │   ├─ put 뒤 tx 실패 / 삭제 실패 ......................... ★★★ 통합 주입
 │   ├─ 서식 조회 실패(put 뒤) → 고아 24h .................. [GAP] (E3-27 순서 이동으로 경로 제거)
 │   ├─ 로그 같은 tx · 실패 롤백 → 재전송 .................. ★★★ (E3-02 방식으로 통일)
 │   ├─ 커밋 불명 3갈래 .................................... ★★ 주입
 │   └─ 풀 + 1 동시 제출 .................................... ★★★ 통합 장벽
[내부 — 행사]
 ├─ validateWinnerRows 형식·중복·모양 ....................... ★★★ 단위
 │   └─ 이름 40 · 경품명 80 길이 ............................ [GAP] (E3-21)
 ├─ 만들기 제출 invalid → 셀 고정 ........................... ★★ 단위 + E2E
 │   ├─ serverError(본문 한도 · contactMissing 경합) ........ [GAP] (E3-22)
 │   └─ 연결 실패 → 재시도 중복 행사 ....................... [GAP] (E3-22)
 ├─ saveWinners 권한·범위·충돌·병합 ......................... ★★★ 통합 + E2E
 │   └─ 표시형/저장형 비교(내 전화 × 남의 경품명) ........... [GAP] (E3-17)
 ├─ unlockWinner 20회·재전송·동시·롤백 ...................... ★★ 통합 + E2E
 │   ├─ visible 꺼진 writer 직접 POST ...................... [GAP] (E3-14)
 │   └─ lockStamp 문자열 정규화 ............................ [GAP] (E3-23)
 ├─ 행동 셀 키보드 ......................................... ★★ 단위 + E2E
 │   └─ 모달 안 Enter 버블링 ................................ [GAP] (E3-20)
 └─ 관리 메뉴 withCertMenusGated 켬/끔 ....................... ★  E2E만 — 단위 주입 [GAP] (E3-18) · 전제 테스트 파손 (E3-19)
[경영관리 — 검토 · 인쇄]
 ├─ revealRrn 권한 · 기록 먼저 · 풀 장벽 ..................... ★★★ 통합
 ├─ correctSubmission 버전 · 권한 · 로그 ..................... ★★★ 통합
 ├─ 비활동 판정(로그인 오래 + 첫 방문) ...................... [GAP] (E3-10)
 ├─ 인쇄 가린 값 · 거부 · 게이트 순서 ........................ ★★ 통합 + E2E
 └─ generateMetadata 권한 순서 ............................... [GAP] (E3-30 고정 제목으로 제거)
[저장소 · 키 · 파기]
 ├─ GCS put/get/delete · 드라이버 선택 ....................... ★★★ 단위(주입)
 │   └─ getClient 첫 실패 뒤 복구 ........................... [GAP] (E3-26)
 ├─ KMS decrypt · loadDataKeys 인코딩 · deploy 옮기기 ......... ★★★ 단위(fake)
 │   └─ 클라이언트 번들 오염 ............................... [GAP] (E3-11, pnpm build가 잡음)
 ├─ 실제 GCS · 버킷 IAM · KMS 권한 · 실기기 ................. [GAP] 스테이징 꺼짐 (E3-07 스테이징 스모크)
 ├─ 파기 기한 · 적용 · 멱등 · 로그 tx · 고아 의도 ............. ★★ 단위 + 통합
 └─ 파기 Job 실행 누락 감시 .................................. [GAP] 운영 (E3-16)
[13 머지]
 ├─ 마이그레이션 재생성 · 빈 DB 적용 · DEFERRABLE ............. ★★★
 ├─ Phase 4 비등록부 파일 충돌(Button·Table·SYSTEM·ARCH …) ... [GAP] 규칙상 멈춤 (E3-01)
 └─ DOM 감사 · 전체 게이트 CI=true ........................... ★★★

COVERAGE: 경로 약 60 중 계획된 테스트 있음 약 44(73%) · [GAP] 16 — 이 리뷰의 계획 수정을 반영하면 [GAP] 2(파기 누락 감시 = 운영 절차, 실제 인프라 = 스테이징 스모크의 사람 확인)만 남는다
```

## 실패 모드 표

| 경로 | 현실적 운영 장애 | 테스트 / 에러 처리 | 사용자에게 보이나 | 지적 |
|---|---|---|---|---|
| 13 머지 | Phase 4 비등록부 파일 충돌 · 중복 Button/Dialog | 규칙상 멈춤 | 실행자에게 보임(멈춤) | E3-01 |
| 스테이징 | 게이트 꺼짐 → 사람 확인 404 · GCS/KMS 미검증 | 없음 | 실행자에게 보임 | E3-07 |
| 배포 | 머지 즉시 자동 배포, 버킷·KMS 역할 없음 → 다른 스레드 배포도 막힘 | 단위(버킷 없음 exit 1) | 보임(배포 실패) | E3-07 |
| verifyLast4 속도 제한 | 큰 행사에서 행사 한도 소진 → 전원 「결과 불명」 | 공격 테스트 있음 · 로그 없음 | 수령자: 모호함 · 담당자: 원인 모름 | E3-08 |
| verifyLast4 동시 | tx 안 설정 읽기로 풀 5 고갈 | 동시 20 케이스(설명 틀림) | 20초 뒤 결과 불명 | E3-09 |
| 개인정보 세션 | 활동 중인 경영관리가 ERP 전체에서 로그아웃 | 없음 | 보임(저장 안 한 작업 손실) | E3-10 |
| 행사 만들기 | 256KB 초과 · 연결 끊김 · 설정 비워짐 · 재클릭 중복 | 없음 / 없음 | 반응 없음 · 행사 둘 | E3-22 |
| 명단 붙여넣기 | 41자 이름 | ZodError → serverError | 어느 칸인지 모름 | E3-21 |
| saveWinners | 표시형/저장형 거짓 충돌 · 병합 검사 오류 | 없음 | 보임(원인 모름) | E3-17 |
| 행동 셀 모달 | Enter가 셀로 올라가 모달이 다시 열림 | 없음 | 보임 | E3-20 |
| GCS 인증 | 첫 getClient 순간 장애가 캐시됨 | 없음 | 재시작 전까지 모든 제출 실패 | E3-26 |
| 기동 KMS | 권한 누락 · 번들 오염 | 기동 실패 → 스모크 실패, 이전 리비전 유지 | 운영자만 | E3-11 · E3-12 |
| 제출 | put 뒤 서식 조회 실패 | 의도 행 → 24h 정리 | 일반 오류 | E3-27 |
| **12 파기 Job** | **사람이 실행을 잊음 → 기한 지난 개인정보가 남음** | **테스트 없음 · 알림 없음** | **안 보임** | **E3-16** |

critical gap(테스트도 에러 처리도 없이 조용히 실패): **1건** — E3-16(파기 Job 실행 누락). 코드 결함이 아니라 운영 절차가 조용히 실패하는 지점이다. 런북 감시 줄로 줄이고, 자동화는 후속으로 둔다. B-4(E3-22)는 사용자에게 보이는 실패라 critical에서 뺐다.

## Decision ledger

모든 행의 Actual answer는 「추천 기본값 자동 적용 — 사용자 수면 중(2026-09-25 KST)」이다.

| R | Finding | Plan baseline | Runtime evidence | 추천 | State | Actual answer | Accepted scope |
|---|---|---|---|---|---|---|---|
| R1 | E3-01 Phase 4 겹침 파일 늦은 머지 | 13:99 마지막에 한 번 머지, 비등록부 충돌은 멈춤 | `git diff --stat` Phase 4 비등록부 19파일 · `Button.tsx:43-47` useId+aria-disabled · `c9e70ea` recordAction tx | 시작 조건 = Phase 4 main 머지 뒤, 매 웨이브 main 머지, Phase 4 부품 재사용 | approved-auto | 추천 기본값 자동 적용 — 사용자 수면 중 | 01·03·04·06·07·10·12·13 수정 |
| R2 | E3-02 tx 로그 도우미 둘 | 06 `insertActionLogTx` · 07 `appendCertActionLogTx` | `record.ts:127-134` 주입 자리 · `action-log.ts:18` 주석 | `recordAction({tx})` 통일, 대비책은 02의 도우미 하나 | approved-auto | 추천 기본값 자동 적용 — 사용자 수면 중 | 02·06·07·10·12 |
| R3 | E3-03 서명 DB 저장 | GCS + C3 의도 행 | 180 KiB · 연 수백 건 · CONTEXT 재량 | 사용자 선택. 기본 GCS 유지 | pending-user | 추천 기본값 자동 적용 — 사용자 수면 중(기본값으로 진행, 아침 확인) | 없음(기본값) |
| R4 | E3-04 12·08 범위·시점 | 12 전체 파기 · 08 KMS 이번 페이즈 | 첫 파기 대상 2032년 이후 · 08은 운영 키 변경 | 사용자 선택. 기본 유지 | pending-user | 추천 기본값 자동 적용 — 사용자 수면 중(기본값으로 진행, 아침 확인) | 없음(기본값) |
| R5 | E3-05 03 Task 2 분할 | Task 하나 140k | 03:28-31 confidence low | 2a/2b 분할 | approved-auto | 추천 기본값 자동 적용 — 사용자 수면 중 | 03 |
| R6 | E3-06 10 ⓪-b 먼저 커밋 | 「GREEN 뒤 커밋」 | 10:175 | ⓪-b 먼저 못박기 | approved-auto | 추천 기본값 자동 적용 — 사용자 수면 중 | 10 |
| R7 | E3-07 스테이징 게이트 · 부트스트랩 순서 | deploy.sh에 게이트 0줄 · 「머지 뒤 첫 배포 전」 | 02:193 · 13:190-192 · `deploy.yml:3,9-10` | staging만 허용 + prod 단위 단언 + 스테이징 스모크 + 머지 전 부트스트랩 | approved-auto | 추천 기본값 자동 적용 — 사용자 수면 중 | 02·05·08·13 |
| R8 | E3-08 행사 한도 · 가시성 | 30회 고정, 로그 없음 | 03:63 · T-04.3-30 accept · UI-SPEC A2 | 로그 + 명단 비례 함수 + /cso 수치 | approved-auto | 추천 기본값 자동 적용 — 사용자 수면 중 | 03 (+/cso) |
| R9 | E3-09 tx 안 설정 읽기 | 규칙 없음 | 03 「트랜잭션 전」 0곳 · `DB_POOL_MAX` 5 | tx 전 읽기 규칙 + fails_when | approved-auto | 추천 기본값 자동 적용 — 사용자 수면 중 | 03 |
| R10 | E3-10 비활동 판정 | 활동 없으면 로그인 시각 기준 | 07:44 | 첫 방문 = 시작점 | approved-auto | 추천 기본값 자동 적용 — 사용자 수면 중 | 07 (+/cso) |
| R11 | E3-11 번들 오염 | 정적 import | `vendor-form.tsx:1,12` | 동적 import | approved-auto | 추천 기본값 자동 적용 — 사용자 수면 중 | 08 |
| R12 | E3-12 KMS 역할 | 프로젝트 단위 cloudkms.admin | `bootstrap-gcp.sh:119` · `.continue-here:78` | (나) 유지 + 문장 보정 + 확인 줄, 축소는 후속 | approved-auto | 추천 기본값 자동 적용 — 사용자 수면 중 | 08 문장 · TODO |
| R13 | E3-13 시스템 관리자 시드 | 매번 켬 | `seed/index.ts:163-168` | threat 줄 + /cso | approved-auto | 추천 기본값 자동 적용 — 사용자 수면 중 | 09 · TODO |
| R14 | E3-14 unlockWinner visible | 판정 없음 | 10:254 · 272와 비대칭 | forbidden 추가 | approved-auto | 추천 기본값 자동 적용 — 사용자 수면 중 | 10 |
| R15 | E3-15 IP 해시 | sha256 · 「60분 보관」 | 03:220 · 380 | 문장 정정 + /cso HMAC | approved-auto | 추천 기본값 자동 적용 — 사용자 수면 중 | 03 · TODO |
| R16 | E3-16 파기 실행 누락 | 사람이 월 1회 | 12:92 | 런북 감시 두 줄 | approved-auto | 추천 기본값 자동 적용 — 사용자 수면 중 | 12 · TODO |
| R17 | E3-17 표시형/저장형 | 그대로 비교 | 04:239 · 10:253-258 | 정규형 비교 + 케이스 둘 | approved-auto | 추천 기본값 자동 적용 — 사용자 수면 중 | 10 |
| R18 | E3-18 async gated | 동기 서술 | 02:196 Promise | async + deps | approved-auto | 추천 기본값 자동 적용 — 사용자 수면 중 | 09 |
| R19 | E3-19 ADMIN_MENU_KEYS | certs.events 추가 | `role-menu.test.ts:143-156` | 별도 상수 | approved-auto | 추천 기본값 자동 적용 — 사용자 수면 중 | 09 |
| R20 | E3-20 모달 버블링 | 위치 미정 | `Table.tsx:307-309` | 표 밖 하나 + E2E | approved-auto | 추천 기본값 자동 적용 — 사용자 수면 중 | 10 |
| R21 | E3-21 길이 코드 | 없음 | 02:365 40/80 | 코드 둘 + maxLength | approved-auto | 추천 기본값 자동 적용 — 사용자 수면 중 | 04 (+UI-SPEC 문장) |
| R22 | E3-22 제출 오류 갈래 | 두 갈래뿐 | `lib/actions/client.ts:27-29` | 갈래 + 멱등 키 + 500 | approved-auto | 추천 기본값 자동 적용 — 사용자 수면 중 | 04 |
| R23 | E3-23 lockStamp | 정규화 없음 | drizzle ms 절삭 실측 | zod 좁히기 | approved-auto | 추천 기본값 자동 적용 — 사용자 수면 중 | 10 |
| R24 | E3-24 tx 인자 순서 | tx 두 번째 | `quote-lines.ts:23` | tx 마지막 | approved-auto | 추천 기본값 자동 적용 — 사용자 수면 중 | 03 (+호출부) |
| R25 | E3-25 QR async | 동기 서술 | node-qrcode API | async | approved-auto | 추천 기본값 자동 적용 — 사용자 수면 중 | 04 |
| R26 | E3-26 getClient 캐시 | 한 번 만들어 재사용 | `cloud-sql-admin.ts:13-17` 선례 | 성공만 캐시 | approved-auto | 추천 기본값 자동 적용 — 사용자 수면 중 | 05 |
| R27 | E3-27 서식 읽기 순서 | put 뒤 | 02:379-380 | put 앞으로 | approved-auto | 추천 기본값 자동 적용 — 사용자 수면 중 | 02 |
| R28 | E3-28 createEvent 위치 | 미기재 | 02:365 | 한 줄 | approved-auto | 추천 기본값 자동 적용 — 사용자 수면 중 | 02 |
| R29 | E3-29 설정 가져오기 | 미기재 | `export.ts:94-97` | 문서 한 줄 | approved-auto | 추천 기본값 자동 적용 — 사용자 수면 중 | 13 |
| R30 | E3-30 인쇄 제목 | 동적 제목 | 11:45 | 고정 제목 | approved-auto | 추천 기본값 자동 적용 — 사용자 수면 중 | 11 |
| R31 | E3-31 스키마 규칙 | 없음 | 02:167 | C-규약 한 줄 | approved-auto | 추천 기본값 자동 적용 — 사용자 수면 중 | 02 |
| R32 | E3-32 E2E 표본 | 폼 조작 | 06이 같은 웨이브에서 폼 변경 | `seedSubmittedCert()` | approved-auto | 추천 기본값 자동 적용 — 사용자 수면 중 | 02·07·10·11·12 |
| R33 | E3-33 병렬 DB/포트 | config parallelization true | 훅 D-04 세션당 executor 1회 | P1 기각, 한 줄 명시 | approved-auto | 추천 기본값 자동 적용 — 사용자 수면 중 | 13 |
| R34 | E3-34 at 비교 | 캐스트 미기재 | 02:247 ISO · timestamp 칸 | timestamptz 명시 | approved-auto | 추천 기본값 자동 적용 — 사용자 수면 중 | 03 |
| R35 | E3-35 500줄 잠금 | 상한 없음 | 10:255-259 | accept 줄 + /cso | approved-auto | 추천 기본값 자동 적용 — 사용자 수면 중 | 10 · TODO |

Approval readiness: PASS (자동 결정 ids R1–R2, R5–R35). 사용자 대기 2건 — R3(E3-03 서명 저장 위치) · R4(E3-04 12·08 범위). 둘 다 기본값(현 계획 유지)으로 다음 세션 계획 수정을 막지 않는다.

## 다음 세션 반영 지시

`/gsd-plan-phase 04.3` 수정 모드에서 플랜별로 적용한다. 잠긴 결정과 UI-SPEC 승인 계약은 건드리지 않는다. 괄호는 근거 id다.

- **공통(모든 플랜 frontmatter · 13)**
  - 실행 시작 조건: 「Phase 4 PR이 main에 머지된 뒤」. 각 웨이브 첫 단계로 `git merge origin/main`(리베이스·강제 푸시 금지)을 한다. (E3-01)
  - 웨이브 안에서도 통합·E2E는 한 번에 하나다(세션당 플랜 하나). (E3-33)
  - Phase 4 부품(`ui/button` aria-disabled · `ui/confirm-dialog` · `Table`/`use-grid-keyboard` · `recordAction({tx})`)을 기준으로 쓴다. PATTERNS:245 「5개뿐」 정정은 SUMMARY에 적는다. (E3-01)
- **04.3-01**
  - SYSTEM.md·DECISIONS.md 개정 번호를 main(Phase 4 머지 뒤) 기준으로 다시 매긴다. Phase 4의 ⑦(aria-disabled)·⑮(§7-17 확인 모달)와 겹치는 개정은 「이미 있음」으로 바꾼다. (E3-01)
- **04.3-02**
  - ⑨: `recordAction({tx})`를 쓴다. 04-32가 없을 때의 대비책으로 `repositories/cert-action-log.ts`에 `insertActionLogTx` 하나를 두고 `action-log.ts:18` 주석을 고친다. (E3-02)
  - ⑩: 8단계의 제출 로그를 처음부터 tx 안에서 쓴다. 서식·`submitLogEnabled` 읽기는 5단계(의도 행·put) 앞으로 옮긴다. (E3-02 · E3-27)
  - ⑧: 「설정 둘은 tx 전, 로그는 커밋 뒤(또는 tx 안 `recordAction({tx})`)」 한 줄. (E3-28)
  - C-규약: 뒤 플랜의 스키마 변경 규칙 한 줄. (E3-31)
  - :193/:292: 「deploy.sh는 staging에만 `CERT_FEATURE_ALLOWED=true`」로 바꾸고, grep 0줄 단언은 deploy 단위 테스트(prod 없음·staging 있음)로 바꾼다. (E3-07)
  - C4 `test/e2e/helpers/cert.ts`에 `seedSubmittedCert()`를 넣는다. (E3-32)
- **04.3-03**
  - Task 1 ③: 시그니처를 `(viewer, eventId, tx)` · `(viewer, {…}, tx)`로 바꾸고, `at` 비교를 timestamptz로 명시한다. (E3-24 · E3-34)
  - ④ (c) 앞: 설정·플래그는 tx 전에 읽는다. `fails_when`에 「시간 초과 = tx 안 전역 db」를 넣는다. (E3-09)
  - ④ (f): `cert.verify_throttled` 경고 로그, `eventMissLimit(rosterSize)` 함수(기본 `max(30, ceil(n×0.3))`), success_criteria에 「정상 오타율 × 명단」 줄. (E3-08)
  - T-04.3-80: 「역산 가능한 가명 · 파기까지 보관」으로 고친다. (E3-15)
  - Task 2: 2a/2b로 나누고, ① Button 개정은 Phase 4 구현 확인으로 줄인다(aria-disabled 전제 테스트). (E3-05 · E3-01)
- **04.3-04**
  - ③: `nameTooLong`·`prizeTooLong` 코드, 경계 케이스, `maxLength`. (E3-21)
  - ②: `async renderQrSvg`. (E3-25)
  - Task 3 (f): serverError·연결 실패 갈래, 멱등 `requestId`, 당첨자 상한 500 zod. (E3-22)
  - 「입력 버리기」 확인은 `ui/confirm-dialog`를 쓰고 04:58의 후속 항목을 지운다. (E3-01)
- **04.3-05**
  - ②: 성공한 클라이언트만 캐시하고 거부되면 비운다. 단위 케이스 하나. (E3-26)
  - `user_setup`: 「PR 머지 **전에** PR 브랜치의 bootstrap-gcp.sh」. ⑥ OPERATIONS §8에도 같은 순서를 적는다. (E3-07)
- **04.3-06**
  - ③(h)·④: 자체 `insertActionLogTx`를 만들지 않고 `recordAction({tx})`(또는 02의 대비 도우미 import)를 쓴다. (E3-02)
  - `lockEventRow` 호출부 인자 순서를 맞춘다. (E3-24)
- **04.3-07**
  - ③-b: `repositories/cert-action-log.ts` 사본을 없앤다. `revealRrn`·`correctSubmission`은 `recordAction({tx})`를 쓴다. 07:163 종류 거부 케이스는 지우고 07:162 풀 장벽 케이스는 유지한다. verify(07:214)의 grep 단언을 맞춘다. (E3-02)
  - :44/:118: 활동 행이 없으면 첫 방문을 시작점으로 기록한다(끊지 않음). 케이스 「로그인 3시간 뒤 첫 방문 통과 → 2시간 무활동 끊김」. (E3-10)
  - E2E 표본은 `seedSubmittedCert()`를 쓴다. (E3-32)
- **04.3-08**
  - ③-b: `loadDataKeys` 안에서 `await import("@/lib/gcp/kms")`. (E3-11)
  - :29 사전 조건: 배포자 역할 확인 명령 한 줄. T-04.3-91 disposition에 「키 수명주기 권한 — 후속 축소」. `user_setup`의 부트스트랩은 머지 전에 한다. (E3-12 · E3-07)
- **04.3-09**
  - ④: `withCertMenusGated(allowedMenus, deps?): Promise<string[]>`, 호출부 `await`. 단위 테스트는 `test/unit/certs/feature.test.ts`에 둔다. (E3-18)
  - ①: `ADMIN_MENU_KEYS`는 그대로 두고 `CERT_ADMIN_MENU_KEYS` + `app/(app)/certs/events/page.tsx` 존재 단언. 합계는 두 목록 합. registry 케이스는 별도 `it`. (E3-19)
  - threat_model: 시스템 관리자 시드 재활성 T-04.3 줄 → `/cso`. (E3-13)
- **04.3-10**
  - ⓪-b: 커밋을 ①~⑦보다 먼저 한다. Phase 4 `Table`·`use-grid-keyboard` 기준으로 다시 쓴다. (E3-06 · E3-01)
  - ②-c: 유니온을 추가하지 않는다. `closeEvent`·`unlockWinner` 로그는 `recordAction({tx})`. (E3-02)
  - Task 1 ④ 4·5단계: 정규형 비교, 화면형 검사 입력, 충돌 value 표시형. 케이스 둘을 넣는다. (E3-17)
  - ④ `unlockWinner` 1단계: visible 판정 + 통합 거부 케이스. (E3-14)
  - ⑤: lockStamp zod `datetime({offset:false, precision:3})`. (E3-23)
  - Task 2: `confirm-dialog.tsx` 대신 `ui/confirm-dialog`를 쓰고 표 밖에 하나만 그린다. E2E 「모달 Enter → 요청 1회」. (E3-20 · E3-01)
  - threat_model: 500줄 잠금·누적 상한 accept 줄 → `/cso`. (E3-35)
  - E2E 표본은 `seedSubmittedCert()`를 쓴다. (E3-32)
- **04.3-11**
  - Task 2 ①: 제목을 고정 `확인증 인쇄`로 한다. (E3-30)
  - E2E 표본은 `seedSubmittedCert()`를 쓴다. (E3-32)
- **04.3-12**
  - ③ deps: `recordAction({tx})`에 맞춘다. (E3-02)
  - Task 3 ③ 런북: `purge_certs.done` 35일 감시 줄, 첫 적용 전 bootstrap 재실행 확인 줄. (E3-16)
  - 표본은 `seedSubmittedCert()`를 쓴다. (E3-32)
- **04.3-13**
  - ①: 「양쪽 유지」 목록에 `docs/ARCHITECTURE.md`·`docs/OPERATIONS.md`(절 단위, main 절 먼저)를 넣는다. (E3-01)
  - ④: 300줄 상한이면 이 페이즈 요약을 줄인다. (E3-01)
  - Task 3: 스테이징 스모크(행사 → 폰 제출 → I4 서명 → 파기 미리 보기, 가짜 인물만). PR 체크리스트에 「머지 전 소유자 bootstrap」. (E3-07)
  - 운영 문서: 「게이트 꺼진 환경은 `cert.enabled` 가져오기를 거부(의도)」. (E3-29)
  - 「통합·E2E 한 번에 하나」 한 줄. (E3-33)
- **`/plan-design-review`에 넘김(UI-SPEC)**: I2 길이 셀 문장(E3-21), 만들기 serverError 줄(E3-22), throttled를 확정 판정·「n분 뒤 · 문의」로 바꿀지(E3-08).
- **설계 `/cso`에 넘김**: 행사·IP 한도 수치(E3-08), 비활동 끊는 범위(E3-10), 배포자 KMS 축소(E3-12), 시스템 관리자 개인정보취급자 범위(E3-13), IP 해시 HMAC(E3-15), 파기 실행 감시(E3-16), 행사 누적 상한(E3-35).

## 사용자 확인 필요(아침)

1. **E3-03 서명 이미지 저장 위치** — GCS(현 계획) 대 DB bytea.
   - DB를 고르면 플랜 05 전체, C3 의도 행·고아 정리, 커밋 불명 복구가 사라지고 서명도 앱 단에서 암호화된다. 대신 05·06·11·12를 다시 계획해야 하고 DB·백업이 커진다.
   - **기본값: GCS 유지** — 다음 세션은 이 기본값으로 진행한다.
2. **E3-04 12·08의 범위와 시점** — 선택지는 「12를 미제출 명단 파기 + 미리 보기 CLI로 줄이기」와 「08(KMS)을 운영 키 변경이라 별도 작업·자체 배포 창으로 떼기」다.
   - **기본값: 현 계획 유지.**

알림(자동 적용, 되돌릴 수 있음):
- E3-07: 스테이징에서만 `CERT_FEATURE_ALLOWED=true`를 허용한다(설정 `cert.enabled` 기본값은 꺼짐).
- E3-01: 04.3 실행은 Phase 4가 main에 머지된 뒤에 시작한다.

## NOT in scope

- `domain/projects/index.ts:258` 동시 생성 풀 교착(다른 스레드, 코디네이터 보고 사항)
- 잠긴 결정 재론: 누적 잠금 20회 · qrcode · 262,144 B 한도(T-04.3-182) · 08 v1 키 유지 · deploy.sh가 KMS 버전을 만들지 않음 · D-1101~1108 · 10의 31파일 슬라이스
- 속도 제한 수치·HMAC·KMS 최소 권한의 최종 결정(설계 `/cso` 몫)
- UI-SPEC 문구 변경(`/plan-design-review` 몫)
- 서명 이미지 앱 단 암호화(CONTEXT는 주민등록번호만 요구 — E3-03이 DB를 고를 때만 따라온다)
- fable-final4 A·B·C의 NOTE(이미 다룬 것은 반복하지 않음)
- 프로덕션 플래그 켜기(Phase 11)

## 이미 있는 것(재사용)

- `recordAction`의 `deps.appendActionLog` · `isActionTypeEnabled` 주입(`domain/action-log/record.ts:84-92, 127-134`). Phase 4 브랜치의 `deps.tx`(`c9e70ea`)
- Phase 4 브랜치의 `ui/button`(disabledReason·useId·aria-disabled), `ui/confirm-dialog`, `ui/table` 행동 셀 키보드
- `withTransaction`(`lib/db-transaction.ts:9`) · `allocateDocumentNumber(…, tx)` · `DbOrTx`
- `checkPayloadSize`(`lib/actions/payload-size.ts`) — 서버·화면 공용
- `clientIp`(`lib/client-ip.ts`, XFF 마지막 항목) · `encrypt/decrypt`(`lib/crypto.ts`) · `getSettingValue`
- `insertPermissionIfAbsent`(`repositories/permissions.ts:55`) — 09의 `insertVisibilityIfAbsent` 선례
- `lib/gcp/cloud-sql-admin.ts` 주입 선례 · `google-auth-library` 11.1.0(이미 의존성) · `test/unit/deploy/fakebin/gcloud`
- `scripts/reset-test-db.sh` 방식(13 `erp_migcheck`) · `deploy.sh` account Job `--command` 선례
- `test/e2e/code-tables-write-gate.spec.ts`(E2E에서 domain 직접 호출 — `seedSubmittedCert()`의 근거)

## Worktree 병렬화 전략

실행 규칙상 세션당 플랜 하나(훅 D-04)이고, 통합·E2E는 한 번에 하나다. 아래 표는 **순서 제약**과 **동시에 계획을 고치거나 리뷰할 수 있는 단위**를 보여 준다.

| 웨이브 | 플랜 | 모듈 | 같은 웨이브 파일 겹침 | 비고 |
|---|---|---|---|---|
| 0(신설) | — | main(Phase 4) 머지 | — | E3-01. 이후 매 웨이브 시작에 main 머지 |
| 1 | 01 | docs/design · REQUIREMENTS | 없음 | 개정 번호 재매김 |
| 2 | 02 | db/schema · domain/certs · app/c · lib/env · test helpers | 없음 | tx 로그 대비책·`seedSubmittedCert` 여기서 |
| 3 | 03 · 04 · 05 | 03: domain/certs/verify-lock · app/c / 04: app/(app)/certs/events · ui/table / 05: lib/storage · scripts/bootstrap·deploy | 없음(outside 확인) | `keys.ts` 02→03 순차 |
| 4 | 06 · 07 · 08 · 09 | 06: 제출 / 07: 검토·개인정보 세션 / 08: lib/crypto·KMS·deploy / 09: 셸 메뉴·seed | 없음 | 07·10·12의 표본은 06 UI에 기대지 않음(E3-32) |
| 5 | 10 · 11 | 10: 행사 상세 편집 · ui/table / 11: app/print | 없음 | `depends_on`에 10→09가 없음 — 웨이브 번호로 보장(참고) |
| 6 | 12 | jobs/purge · deploy.sh Job | — | `depends_on`에 12→11이 없음(참고) |
| 7 | 13 | 머지·마이그레이션·DOM 감사·전체 게이트 | — | 스테이징 스모크 추가(E3-07) |

같은 모듈을 여러 웨이브에서 이어 고치는 등록부(`record.ts` 07→10→12, `keys.ts` 02→03→07, `deploy.sh` 05→08→12, `ui/table` 04→10)는 웨이브 순서대로 차례로 고친다. 워크트리를 나눠도 같은 웨이브 안에서만 나눈다.

## Implementation Tasks

- [ ] **T1 (P1, human: ~3h / CC: ~40m)** — 전 플랜 · 13 — Phase 4 기준으로 맞추기(시작 조건 · 웨이브 머지 · Button/ConfirmDialog/Table 재사용 · 개정 번호)
  - Surfaced by: E3-01 · Files: 04.3-01·03·04·06·07·10·12·13-PLAN.md · Verify: 플랜에 `ui/confirm-dialog` 재사용, 새 `confirm-dialog.tsx` 0곳, 03 Button 작업이 확인 수준, 13 ① 목록에 ARCHITECTURE·OPERATIONS
- [ ] **T2 (P1, human: ~1.5h / CC: ~20m)** — deploy · 13 — 스테이징 게이트 허용 · 스테이징 스모크 · 머지 전 부트스트랩
  - Surfaced by: E3-07 · Files: 04.3-02·05·08·13-PLAN.md · Verify: 02 verify가 grep 0줄이 아니라 deploy 단위(prod 없음/staging 있음), 13 Task 3에 스모크, 05·08 user_setup에 「머지 전」
- [ ] **T3 (P2, human: ~1h / CC: ~15m)** — action-log — tx 로그 도우미 통일
  - Surfaced by: E3-02 · Files: 04.3-02·06·07·10·12-PLAN.md · Verify: `appendCertActionLogTx` 0곳, `insertActionLogTx`는 02 대비책 한 곳
- [ ] **T4 (P2, human: ~1h / CC: ~15m)** — 03 확인 — 행사 한도 로그·비례 함수 · tx 전 설정 읽기 · 인자 순서 · timestamptz · IP 해시 문장 · Task 분할
  - Surfaced by: E3-08 · 09 · 24 · 34 · 15 · 05 · Files: 04.3-03-PLAN.md · Verify: 「트랜잭션 전」 규칙 존재, `eventMissLimit`, `cert.verify_throttled`, 2a/2b
- [ ] **T5 (P2, human: ~1h / CC: ~15m)** — 04 행사 만들기 — 길이 코드 · 제출 오류 갈래·멱등 키·500 상한 · async QR
  - Surfaced by: E3-21 · 22 · 25 · Files: 04.3-04-PLAN.md · Verify: behavior에 `nameTooLong`/`prizeTooLong`·serverError 케이스
- [ ] **T6 (P2, human: ~1.5h / CC: ~20m)** — 10 행사 상세 — 정규형 비교 · 모달 위치 · unlock visible · lockStamp · ⓪-b 먼저
  - Surfaced by: E3-17 · 20 · 14 · 23 · 06 · Files: 04.3-10-PLAN.md · Verify: 새 통합 케이스 둘, 모달 Enter E2E 단언
- [ ] **T7 (P2, human: ~45m / CC: ~10m)** — 09 셸 메뉴 — async gated + deps · CERT_ADMIN_MENU_KEYS · 시드 threat 줄
  - Surfaced by: E3-18 · 19 · 13 · Files: 04.3-09-PLAN.md · Verify: 시그니처 `Promise<string[]>`, `ADMIN_MENU_KEYS` 10 유지
- [ ] **T8 (P2, human: ~45m / CC: ~10m)** — 07 검토 · 08 KMS — 비활동 첫 방문 기준 · 동적 import · KMS 문장·확인 줄
  - Surfaced by: E3-10 · 11 · 12 · Files: 04.3-07·08-PLAN.md · Verify: 07 behavior에 「로그인 3시간 뒤 첫 방문 통과」, 08에 `await import`
- [ ] **T9 (P2, human: ~30m / CC: ~10m)** — test helpers — `seedSubmittedCert()`와 07·10·11·12 표본 전환
  - Surfaced by: E3-32 · Files: 04.3-02·07·10·11·12-PLAN.md · Verify: 07 E2E 표본이 폼 조작에 기대지 않음
- [ ] **T10 (P3, human: ~45m / CC: ~10m)** — 02·05·11·12·13 잔여 — 서식 순서 · createEvent 위치 · 스키마 규칙 · getClient 캐시 · 고정 제목 · 파기 런북 · 가져오기 문서 · 직렬 테스트 한 줄
  - Surfaced by: E3-27 · 28 · 31 · 26 · 30 · 16 · 29 · 33 · Files: 해당 PLAN.md · Verify: 각 문장 존재(grep)
- [ ] **T11 (P3, human: ~15m / CC: ~5m)** — 설계 `/cso` 입력 목록 — E3-08·10·12·13·15·16·35를 `/cso` 질문으로 묶기
  - Surfaced by: 위 id · Files: 04.3-13-PLAN.md(열린 질문) 또는 다음 `/cso` 프롬프트 · Verify: 7개 항목 모두 있음
- [ ] **T12 (P3, human: ~10m / CC: ~5m)** — 리뷰 — Codex 한도가 풀리면(2026-09-29 전후) 이 보고서의 P1·P2를 Codex로 재확인
  - Surfaced by: 검토자 구성 · Files: 없음 · Verify: Codex 결과를 이 문서 부록에 추가

## Outside Voice (Opus 대체)

Codex 한도로 Opus가 독립 교차 검토를 했다(`/mnt/project-files/04.3-gates/eng-outside-opus.md`). 범위는 CONTEXT · .continue-here · 플랜 13개와 저장소 실측(main `0341e36`, Phase 4 `2732d16`)이다. 요지: 같은 웨이브 안 `files_modified` 겹침은 없다. 대신 Phase 4 브랜치와의 비등록부 겹침, 스테이징 꺼짐, 행사 한도, 병렬 테스트 경합을 P1로, 서명 DB 저장·비활동 판정·번들 오염·E2E 표본을 P2로, 스키마 규칙·전략 범위를 P3로 올렸다.

| # | 주장(outside 등급) | 판정 | 근거 |
|---|---|---|---|
| 1 | Phase 4 비등록부 겹침을 13까지 미룸(P1) | **P1 유지** → E3-01 | `git diff --stat`에서 19파일 확인, `Button.tsx:43-47` 중복, `c9e70ea` tx 인자, DECISIONS ⑦·⑮ |
| 2 | 스테이징도 꺼짐 → 사람 확인 불가(P1) | **P1 유지** → E3-07(B-2와 통합) | 02:193·292, 13:190-192, 잠긴 것은 「프로덕션」만(CONTEXT:39) |
| 3 | 행사 전체 30회/60분으로 현장 정지(P1) | **P2로 강등** → E3-08(B-5와 통합) | T-04.3-30이 악의적 정지를 accept, 수치는 `/cso` 몫(03:63), A2 규모는 수~수십 명, 실행은 깨지지 않음. 가시성 공백은 인정 |
| 4 | 병렬 웨이브가 erp_test·3100 공유(P1) | **기각(P3 한 줄)** → E3-33 | 훅 D-04가 세션당 executor 한 번만 허용 → 실제 실행은 직렬. `config.json` parallelization은 이 규칙에 막힘 |
| 5 | 서명 DB 저장(P2) | **P2 유지, 사용자 결정** → E3-03 | 재량 항목이지만 되돌리기 어려운 구조 변경 |
| 6 | 비활동 2시간 → 전체 로그아웃(P2) | **P2 유지** → E3-10 | 07:44 문장 확인 |
| 7 | 번들 오염(P2) | **P2 유지(확신 5)** → E3-11 | `vendor-form.tsx:1,12` 확인. 지금은 `node:crypto`만으로 빌드가 통과해 영향은 불확실 |
| 8 | E2E 표본이 06 UI에 기댐(P2) | **P2 유지** → E3-32 | 06·07 같은 웨이브 |
| 9 | 스키마 변경 규칙 없음(P3) | **P3 유지** → E3-31 | 02:167 |
| 10 | 177만 토큰 · 12·08 범위(P3) | **P3 유지, 사용자 결정** → E3-04 | ROADMAP 범위 변경 |

## Suppressed findings 부록 (확신 ≤3)

- (3/10) 02:266 — `CERT_FEATURE_ALLOWED=true`가 desktop·mobile-375 webServer에도 걸려 설정 화면에 확인증 줄이 생긴다. 깨지는 스펙은 찾지 못했다. (A)
- (3/10) 11 Task 1 — 「같은 웨이브 04.3-12」는 「다음 웨이브」의 오기다(11 = w5, 12 = w6). 실행에는 영향이 없다. (D)
- (3/10) 09:117 ② — §6-10 표에 넣을 「기능 게이트」 줄은 표 밖에 두는 편이 안전하다(`expectedAdminIndexGroups` 파서를 확인하지 못함). (D)
- (3/10) 04 `createEvent` × 10 `closeEvent` 동시 경합 — 04 범위에서는 볼 수 없다. (B)
- (3/10) 05 런타임 `roles/storage.objectUser`에는 delete가 들어 있다. 「지우고 다시 올리기」로 서명을 바꿀 수 있다는 점을 T-04.3-32에 적을지는 `/cso`가 정한다. (B)
- (3/10) `lockEventRow` 인자 순서 — 본문 E3-24로 올렸다(B-8과 같음). (C)

## Completion summary

- Step 0: Scope Challenge — 6건(P1 1 · P2 2 · P3 3). 범위는 유지하고 사용자 결정 2건을 기본값 「유지」로 둔다
- Architecture Review: 10 issues found (P1 1 · P2 4 · P3 5)
- Code Quality Review: 15 issues found (P2 6 · P3 9)
- Test Review: diagram produced, 16 gaps identified (계획 수정 뒤 2) · 지적 2건(P2 1 · P3 1)
- Performance Review: 2 issues found (P3 2)
- NOT in scope: written
- What already exists: written
- TODOS.md updates: 7 items proposed(E3-08 수치 · E3-12 · E3-13 · E3-15 · E3-16 · E3-35 · Codex 재확인) — `.planning/`는 다음 세션 플래너가 반영
- Failure modes: 1 critical gap flagged (E3-16)
- Outside voice: Opus 대체, in-host (Codex 미실행 — 한도)
- Parallelization: 7웨이브(+웨이브 0 main 머지), 같은 웨이브 파일 겹침 없음, 실행은 세션당 플랜 하나(직렬)
- Unresolved decisions: 2 (E3-03 · E3-04, 기본값 적용 중)
- Lake Score: 33/35 권고가 완전한 쪽을 골랐다(예외 둘: E3-12는 최소 권한 (가) 대신 (나)+후속, E3-35는 누적 상한 대신 accept+`/cso`)

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|---|---|---|---|---|---|
| CEO Review | `/plan-ceo-review` | 범위·전략 | 0 | 면제 — 소수점 페이즈(04.3), PR #68 | — |
| Outside Review | Opus 대체 in-host | 독립 두 번째 의견 | 1 | Codex 미실행 — 한도(2026-09-29 전후), 풀리면 재확인 | P1 4 주장 → 유지 2 · 강등 1 · 기각 1 |
| Eng Review | `/plan-eng-review` | 아키텍처·테스트(필수) | 1 | ISSUES OPEN | 35 issues, 1 critical gaps |
| Design Review | `/plan-design-review` | UI/UX 공백 | 0 | 다음 세션 | — |
| DX Review | `/plan-devex-review` | 개발자 경험 | 0 | 해당 없음 | — |

- **OUTSIDE COVERAGE:** Codex 대신 Opus 1명이 독립 교차 검토를 했다(in-host). P1 4건 중 2건은 유지했다(E3-01 · E3-07). 1건은 P2로 강등했고(E3-08), 1건은 실행 규칙(훅 D-04, 세션당 executor 1회)으로 기각했다(E3-33). Codex 한도가 풀리면 P1·P2를 Codex로 재확인해야 한다.
- **VERDICT:** ENG ISSUES OPEN — P1 2건(Phase 4 기준 맞추기, 스테이징 게이트·부트스트랩 순서)과 P2 11건을 다음 세션 `/gsd-plan-phase 04.3` 수정 모드로 반영한 뒤 `/plan-design-review` → 설계 `/cso` → 실행. 실행 시작은 Phase 4 main 머지 뒤.

**UNRESOLVED DECISIONS:**
- E3-03 서명 이미지 저장 위치: GCS(현 계획, 기본값) 대 DB bytea(05 제거 · 02·06·11·12 축소)
- E3-04 12(파기)·08(KMS) 범위와 시점: 현 계획 유지(기본값) 대 12 축소 · 08 별도 작업으로 분리
