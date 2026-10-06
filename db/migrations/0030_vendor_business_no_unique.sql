-- 거래처 사업자번호 중복 막기(사용자 결정 2026-10-06 · 260907-compare #17) — 숫자만 뽑은 사업자번호가 보관 안 된 거래처 사이에서
-- 유일하도록 부분 식 유일 색인을 건다(옛 030:1922 vendors_business_number_once와 같은 뜻 + 하이픈 차이 흡수). 숨김 행도 센다.
-- 이미 겹친 행이 있으면 색인 대신 아래 가드가 어느 번호가 몇 곳인지 말하며 멈추고, migrate() 한 트랜잭션이 통째로 되돌아간다(0015 선례).
-- CONCURRENTLY는 drizzle 단일 트랜잭션 안이라 쓸 수 없다(.squawk.toml require-concurrent-index-creation 제외). 행 수가 적어 잠금은 순간이다.
-- rollback-floor를 두지 않는다 — 옛 리비전도 이 색인 위에서 그대로 돈다.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
--> statement-breakpoint
DO $$
DECLARE
  dup_count integer;
  dup_list text;
BEGIN
  SELECT count(*), string_agg(digits || '(' || cnt || '곳)', ', ')
    INTO dup_count, dup_list
    FROM (
      SELECT regexp_replace("business_no", '[^0-9]', '', 'g') AS digits, count(*) AS cnt
        FROM "vendors"
        WHERE "archived_at" IS NULL
          AND regexp_replace(coalesce("business_no", ''), '[^0-9]', '', 'g') <> ''
        GROUP BY 1
        HAVING count(*) > 1
    ) d;
  IF dup_count > 0 THEN
    RAISE EXCEPTION '살아 있는 거래처에 같은 사업자번호가 %개 번호에서 겹칩니다: % — 한쪽을 보관하거나 번호를 고친 뒤 다시 배포하세요(사업자번호 유일 색인)', dup_count, dup_list;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX "vendors_business_no_live_key" ON "vendors" USING btree (regexp_replace("business_no", '[^0-9]', '', 'g')) WHERE "vendors"."archived_at" IS NULL AND regexp_replace("vendors"."business_no", '[^0-9]', '', 'g') <> '';
