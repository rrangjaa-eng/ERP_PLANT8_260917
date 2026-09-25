07~12 계획의 수정 내용을 라운드 1 지적과 대조하고, 실제 코드·승인 문서와 교차 확인하겠습니다. 지정하신 제외 경로는 읽지 않으며 파일 변경 없이 검토합니다.
전체 보기·정정·인쇄의 기능 게이트와 대표 차단은 수정 지시가 추가됐습니다. 현재는 KMS 배포·키 회전, 파기 경합, 테스트 격리가 실제 코드와 맞물리는 부분을 확인하고 있습니다.
추가 결함 후보가 확인됐습니다. 전체 보기의 권한 검사에서 메뉴 권한이 빠져 있고, 행 잠금을 유지한 채 별도 DB 연결로 로그를 쓰도록 해 연결 풀이 소진될 수 있습니다. 또 확인증 테스트를 워커 하나로 묶었지만 기존 E2E 프로젝트와의 실행 순서는 분리되지 않았습니다. 관련 코드와 재현 조건을 대조하고 있습니다.
키 회전 계획에는 CLI가 v2를 쓰도록 하는 수정이 있지만, 서비스 배포는 여전히 v1만 주입하도록 되어 있습니다. 파기·전체 보기의 행 잠금 보완과 별개로, 링크 닫기는 커밋 후 로그 쓰기가 실패하면 재시도에서도 감사 기록을 복구하지 못합니다. 라운드 1 판정과 신규 결함을 정리하겠습니다.
**VERDICT 대상은 계획의 수정 여부입니다. 구현·테스트 실행 없이 읽기 전용으로 검토했습니다.**

아래에서 `07`~`12`는 `.planning/phases/04.3-qr-certificate-intake/04.3-XX-PLAN.md`를 뜻합니다.

라운드 1 중 이 shard에 직접 연결되는 항목의 판정입니다.

| R1 | 판정 | 계획 근거 |
|---|---|---|
| #1 KMS 전환 후 기동 실패 | FIXED | base64 텍스트 계약과 셸→`loadDataKeys` 왕복 검증 추가. [08:154](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-08-PLAN.md:154), [08:225](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-08-PLAN.md:225) |
| #2 기능 OFF에서 열람·정정 허용 | FIXED | 내부 액션·domain·인쇄 경로에 게이트와 직접 요청 검증 추가. [07:176](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-07-PLAN.md:176), [07:234](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-07-PLAN.md:234), [11:211](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-11-PLAN.md:211) |
| #3 DB 오류의 개인정보 로그 | FIXED | 선행 C2에서 공통 오류 처리기의 SQL·message·params 기록을 제거하므로 내부 액션에도 적용됨. [02:406](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md:406) |
| #4 일반 설정으로 프로덕션 활성화 | FIXED | 환경 게이트와 설정의 이중 판정을 셸에도 사용. [09:114](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-09-PLAN.md:114), [02:190](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md:190) |
| #5 대표 차단을 기본 권한으로 대체 | FIXED | 권한을 켠 대표도 역할 ID로 거부하고 인쇄·제출 링크까지 적용. [07:162](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-07-PLAN.md:162), [10:171](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-10-PLAN.md:171), [11:127](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-11-PLAN.md:127) |
| #7 제출과 닫기·전화 변경 경합 | FIXED | 편집·닫기가 행사 행을 잠그며, 제출도 같은 잠금 순서와 잠금 후 재판정을 사용. [10:163](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-10-PLAN.md:163), [06:193](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-06-PLAN.md:193) |
| #10 키 회전 실패·확인증 누락 | PARTIAL | CLI 초기화·대상 추가는 됐지만 서비스의 v2 전환 절차가 빠짐. 아래 1번. |
| #11 정정과 필수 로그의 비원자성 | FIXED | 동일 tx의 UPDATE·로그 INSERT와 실패 시 롤백 검증. [07:160](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-07-PLAN.md:160), [07:186](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-07-PLAN.md:186) |
| #12 GCS 고아 서명 | FIXED | 업로드 의도 표를 통한 삭제·실패 재시도 추가. [12:141](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-12-PLAN.md:141), [12:156](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-12-PLAN.md:156) |
| #13 파기와 전체 보기 경합 | FIXED | 잠긴 행에서 암호문을 읽고 복호화 완료까지 `FOR SHARE` 유지. 양쪽 순서 검증 추가. [07:179](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-07-PLAN.md:179), [12:138](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-12-PLAN.md:138) |
| #15 동의·저장 보존 기간 불일치 | FIXED | 확인 당시 사본으로 기한을 계산하고 설정 변경을 끼운 통합 테스트 명시. [12:132](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-12-PLAN.md:132) |
| #17 문의 전화 정규화 충돌 | FIXED | 문의 전화 전용 스키마로 지역번호·대표번호·빈 값 검증. [09:155](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-09-PLAN.md:155) |
| #18 구별 표시 정규화 누락 | FIXED | I3가 선행 정규화 규칙을 저장된 줄까지 포함해 재사용. [10:165](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-10-PLAN.md:165), [04:189](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-04-PLAN.md:189) |
| #19 파기 리포지토리 lint 실패 | FIXED | 모든 export 함수에 `viewer` 첫 인자 명시. [12:160](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-12-PLAN.md:160) |
| #21 E2E 전역 상태 충돌 | PARTIAL | 확인증 스펙끼리만 직렬화됨. 기존 프로젝트와 충돌함. 아래 2번. |
| #22 누수 스캔을 비노출 증명으로 오인 | PARTIAL | 평문 번호·일부 거부 응답 검증은 추가됐지만 정보 노출표 OFF 검증과 실제 DTO 투영이 빠짐. 아래 3번. |
| #23 최초 접근의 비활동 제한 누락 | FIXED | 활동 기록이 없으면 `sessions.created_at` 기준으로 판정. [07:164](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-07-PLAN.md:164), [07:189](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-07-PLAN.md:189) |
| #25 ERROR·LOADING 누락 | PARTIAL | 인쇄 LOADING·서명 ERROR는 추가됐지만 서버 렌더 실패 ERROR 경로는 없음. 아래 8번. |
| #26 새 탭 인쇄 스파이 | FIXED | 팝업 생성 전 `context.addInitScript` 설치 명시. [11:204](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-11-PLAN.md:204) |

나머지 R1 항목의 주된 수정 대상은 이 shard 밖입니다. 원래 #24의 트레이서 수정과 별개로, 이 shard에도 TDD 순서 위반이 남아 있습니다.

1. **MAJOR — 키 회전 실행 뒤 서비스가 v2 암호문을 읽지 못한다.**  
   [08:216](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-08-PLAN.md:216)은 서비스에 `APP_DATA_KEY_v1_WRAPPED`만 연결합니다. 반면 [08:230](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-08-PLAN.md:230)의 새 런북은 운영자 CLI에 두 키를 넣고 회전하도록 지시하며, **서비스에 v2를 먼저 배포하는 단계가 없습니다**. 실제 회전은 즉시 DB 암호문을 바꾸고([scripts/rotate-key.ts:70](/home/user/ERP_PLANT8_260917/scripts/rotate-key.ts:70)), 서비스는 암호문 접두어에 해당하는 키가 없으면 실패합니다([lib/crypto.ts:79](/home/user/ERP_PLANT8_260917/lib/crypto.ts:79)). 배포의 `--set-secrets` 목록에도 v2 보존 지시가 없습니다([scripts/deploy.sh:441](/home/user/ERP_PLANT8_260917/scripts/deploy.sh:441)). 서비스 양쪽 키 배포 → 회전 → 잔존 구버전 확인 → 구키 제거 순서를 계획·배포 테스트에 넣어야 합니다.

2. **MAJOR — 기존 PM 관리자 메뉴 E2E와 새 시드가 충돌한다.**  
   [09:151](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-09-PLAN.md:151)은 PM에게 확인증 행사 권한을 기본 부여합니다. C4는 `certs`를 `cert-setup`에만 의존시키므로 기존 `desktop`과 동시에 돌 수 있습니다([02:260](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-02-PLAN.md:260)). 그런데 기존 [admin-nav.spec.ts:112](/home/user/ERP_PLANT8_260917/test/e2e/admin-nav.spec.ts:112)는 같은 PM에게 「관리」가 없고 `/admin`이 404라고 단언합니다. 확인증 setup이 기능을 켜면 이 단언이 깨집니다. `mode: "serial"`은 프로젝트 사이를 직렬화하지 않습니다. 기존 스펙의 전제를 수정하고, setup을 포함한 프로젝트 실행 순서나 DB를 분리해야 합니다.

3. **MAJOR — `cert_submission.value`를 꺼도 개인정보 DTO가 반환된다.**  
   [07:178](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-07-PLAN.md:178)과 [11:127](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-11-PLAN.md:127)은 메뉴 권한 확인 후 이름·연락처·주소·서명을 DTO에 넣고 `registerDto`만 하도록 지시합니다. `project()` 또는 해당 정보 항목의 `visible()` 판정은 없습니다. 실제 `registerDto`는 선언을 배열에 넣을 뿐이고([dto-registry.ts:14](/home/user/ERP_PLANT8_260917/domain/permissions/dto-registry.ts:14)), 필드 제거는 별도 [project.ts:28](/home/user/ERP_PLANT8_260917/domain/permissions/project.ts:28)이 수행합니다. 누수 스캔도 반환 payload가 아닌 등록 관계와 boolean 조회만 검사합니다([leak-scan.test.ts:115](/home/user/ERP_PLANT8_260917/test/integration/leak-scan.test.ts:115)). 메뉴 ON·정보 항목 OFF 조합의 실제 I4·인쇄 응답 검증이 필요합니다.

4. **MAJOR · NEW — 전체 보기·재열람 액션이 메뉴 권한을 우회한다.**  
   [07:179](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-07-PLAN.md:179)의 `revealRrn`과 다음 줄의 `recordRrnReopen`은 `visible(cert.rrn_unmasked)`만 확인합니다. 실제 `visible()`는 `can()`과 완전히 독립입니다([visible.ts:4](/home/user/ERP_PLANT8_260917/domain/permissions/visible.ts:4)). `authedActionClient`도 로그인만 확인합니다([client.ts:32](/home/user/ERP_PLANT8_260917/lib/actions/client.ts:32)). 따라서 제출 메뉴 권한을 회수했으나 정보 노출 권한이 남은 직원은 기존 submission ID로 직접 액션을 호출해 주민번호를 받을 수 있습니다. 두 함수에 메뉴 보기 권한을 추가하고 이 조합으로 직접 호출 테스트를 해야 합니다.

5. **MAJOR · NEW — 전체 보기의 별도 로그 연결이 DB 연결 풀을 소진한다.**  
   [07:179](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-07-PLAN.md:179)은 트랜잭션 연결을 점유한 채 **기존 전역 연결로 `recordAction`**을 기다리도록 명시합니다. 실제 로그 INSERT는 동일 풀의 `db`를 사용합니다([repositories/action-log.ts:33](/home/user/ERP_PLANT8_260917/repositories/action-log.ts:33)). 풀은 프로세스당 하나이고([db/client.ts:38](/home/user/ERP_PLANT8_260917/db/client.ts:38)) 기본 크기는 5입니다([lib/env.ts:54](/home/user/ERP_PLANT8_260917/lib/env.ts:54)). 다섯 요청이 각각 트랜잭션을 잡으면 모두 로그용 여섯 번째 연결을 기다려 진행할 수 없습니다. 로그 INSERT를 같은 tx로 옮기고, 풀 크기만큼 동시 열람하는 테스트를 추가해야 합니다.

6. **MAJOR · NEW — 링크 닫기 로그가 실패하면 영구 누락된다.**  
   [10:170](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-10-PLAN.md:170)은 닫힘을 먼저 커밋하고 `status_change`를 기록합니다. INSERT 실패 후 재시도하면 `alreadyClosed`로 끝나므로 로그를 복구할 수 없습니다. 실제 `recordAction`의 INSERT는 호출자 트랜잭션과 별개입니다([record.ts:133](/home/user/ERP_PLANT8_260917/domain/action-log/record.ts:133)). `status_change`는 끌 수 없는 상태 이력이라는 기존 계약도 있습니다([record.ts:69](/home/user/ERP_PLANT8_260917/domain/action-log/record.ts:69)). 닫힘 UPDATE와 로그를 원자화하고 로그 실패 시 닫힘도 롤백되는 테스트가 필요합니다.

7. **MAJOR · NEW — KMS 배포·권한 시드 태스크가 구현 후 테스트 순서다.**  
   [08:207](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-08-PLAN.md:207)부터 배포·IAM 구현을 하고 [08:223](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-08-PLAN.md:223)에서 테스트를 작성합니다. [09:151](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-09-PLAN.md:151)도 시드를 먼저 바꾸고 153행에서 테스트를 추가합니다. 명시된 순서대로 실행하면 [CLAUDE.md:104](/home/user/ERP_PLANT8_260917/CLAUDE.md:104)의 실제 실패 테스트 → 구현 규칙을 위반합니다. 테스트·가짜 어댑터 준비와 RED 실행을 구현 앞으로 옮겨야 합니다.

8. **MINOR — 인쇄 서버 렌더 실패에는 승인된 ERROR 화면이 없다.**  
   [11:161](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-11-PLAN.md:161)은 클라이언트 서명 decode 실패만 처리합니다. 서버 조회가 던지는 경우를 위한 `app/print/.../error.tsx`는 파일 목록·태스크에 없습니다. 기존 오류 경계 [app/(app)/error.tsx](/home/user/ERP_PLANT8_260917/app/(app)/error.tsx)는 그룹 밖 `/print`를 감싸지 않습니다. 따라서 서버 조회 실패 시 승인된 「인쇄물을 만들지 못했습니다 · 다시 시도」 계약([UI-SPEC:542](/home/user/ERP_PLANT8_260917/.planning/phases/04.3-qr-certificate-intake/04.3-UI-SPEC.md:542))을 충족하지 못합니다.

VERDICT: FAIL

tokens used: 1909401
EXIT 0
