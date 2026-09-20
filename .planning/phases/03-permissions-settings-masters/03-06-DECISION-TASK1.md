# 03-06 Task 1: 암호문 직렬화 형식과 키 회전 정책 — 확정 답

**결정:** 옵션 A — 다섯 항목 전부 계획 문서(03-RESEARCH.md 실측 Code Examples 1·
Assumptions Log A1·A2·Architecture Patterns §4, ROADMAP Phase 3 성공 기준 5) 그대로 확정.

**근거:** `.planning/todos/pending/2026-09-20-phase-3-checkpoint-answers.md`에
2026-09-20 계획 세션에서 사용자가 이미 검토·확정한 기록이 있다. 이 플랜의
`<resume-signal>`은 「A」 답변을 다섯 항목 그대로 확정하는 것으로 정의한다. 그 기록을
실행 시점에 그대로 적용한다 — 다시 묻지 않는다.

## 다섯 항목

**① 직렬화 형식: `v1:<iv>:<tag>:<ciphertext>` — 네 조각, 구분자는 콜론, 뒤 세 조각은 각각 base64**
사람이 읽고 어느 버전인지 즉시 알 수 있고, 한 컬럼에 담기며, 파싱이 문자열 분리 하나다.
03-RESEARCH.md Code Examples 1이 이 형식으로 실제 라운드트립을 실행해 확인했다.

**② 키 인코딩: `APP_DATA_KEY_v1`/`APP_DATA_KEY_v2`는 base64로 인코딩된 32바이트**
코드가 형식을 정하고 Secret Manager 등록이 그 형식을 따른다. `lib/crypto.ts`가 키
길이를 즉시 검증하고 명확한 오류를 낸다.

**③ 키가 없으면 fail-closed**
`lib/env.ts`가 이 키를 선택 문자열로 두어 값 없이도 앱이 뜬다(Phase 1 계약). 암호화·
복호화는 키가 없으면 즉시 예외를 던진다 — 평문 저장이나 빈 값 통과로 떨어지지 않는다.

**④ 키 회전: 새 버전 키를 더하고 옛 키를 남긴다**
`APP_DATA_KEY_v2`를 `lib/env.ts`에 선택 문자열로 추가한다. 새 암호화는 항상 가장 높은
버전 키를 쓰고, 복호화는 접두어의 버전으로 키를 고른다. `scripts/rotate-key.ts`가 옛
버전 암호문을 읽어 새 버전으로 다시 쓴다. 회전이 끝날 때까지 옛 키를 지우지 않는다.

**⑤ 마스킹 저장: 뒤 4자리를 별도 평문 컬럼에 함께 저장한다**
목록 화면이 마스킹 표시를 그리려면 복호화 없이 뒤 4자리를 알아야 한다. 매 행을
복호화하면 목록 하나가 수십 번의 복호화가 되고, 그 복호화들은 「마스킹 해제」가
아니므로 로그를 남기지 않아 해제 로그의 의미가 흐려진다.

## Task 2가 이 값을 쓰는 지점

- `lib/crypto.ts`의 `encrypt`/`decrypt`가 ①·②·③·④를 그대로 구현한다
- `db/schema/vendors.ts`가 ⑤(`accountNumberEncrypted`·`accountNumberLast4` 두 컬럼,
  평문 컬럼 없음)를 반영한다
- `test/unit/crypto.test.ts`가 ①(형식 고정)·③(fail-closed)·④(v1·v2 혼재 복호화)를
  단위 테스트로 증명한다
- `scripts/rotate-key.ts`가 ④(두 키 모두 없으면 즉시 중단, 멱등)를 구현한다

이 답은 마이그레이션 없이 되돌릴 수 없다(reversibility: one-way) — Task 2부터는 이
문서의 값을 사실로 취급한다.
