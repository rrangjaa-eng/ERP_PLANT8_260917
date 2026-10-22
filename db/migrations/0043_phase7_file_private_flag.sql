-- 07-11(07 S3) — R20 · AQ-15 파일 칸 files.private_to_owner(올릴 때 문서 증빙 종류가 비공개면 true — 찍기 · 판정 OR은 07-27 무인 PR).
-- 칸은 상수 기본값(false)이라 PG16이 카탈로그에만 적어 표를 다시 쓰지 않는다. 기존 행 백필: 지금 문서 증빙 종류가 비공개인 지출결의의 파일만
-- true — 판정 정의는 domain/evidence/private-files.ts privateEvidenceTypeOf와 같다(code_items table_key = 'evidence_type' · value =
-- expenses.evidence_type · private_to_owner, 보관 · 사용 끔 항목 포함). 다른 주인 종류(차수 · 리저브 · 카드) 파일은 false로 남는다.
-- 백필 UPDATE는 대상 행에 행 잠금(ROW EXCLUSIVE)만 잡는다 — 운영 전환 전이라 대상은 스테이징 시험 데이터뿐(운영 데이터는 Phase 8 이관)이고
-- statement_timeout = 5s 안에 끝난다. 이미 true인 행은 건드리지 않아 다시 돌려도 같다(멱등). rollback-floor 없음: 더하기만, 옛 리비전은
-- 이 칸을 읽지 않고 넣기는 기본값을 받는다.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "private_to_owner" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE files SET private_to_owner = true
WHERE owner_kind = 'expense'
  AND private_to_owner = false
  AND owner_id IN (
    SELECT e.id FROM expenses e
    JOIN code_items ci ON ci.table_key = 'evidence_type' AND ci.value = e.evidence_type
    WHERE ci.private_to_owner = true
  );
