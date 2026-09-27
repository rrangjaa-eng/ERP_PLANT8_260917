---
paths:
  - "db/**"
  - "drizzle.config.ts"
  - ".squawk.toml"
---

# 스키마·마이그레이션을 만지는 세션이 먼저 알아야 할 것

- 마이그레이션은 `pnpm db:generate`(drizzle-kit)로만 만든다. 손으로 번호를 매기거나 스냅샷·저널을 고치지 않는다.
- **번호는 main의 마지막 번호 다음이어야 한다.** 웨이브를 시작하기 전과 푸시 전에 `origin/main`을 머지해 번호가 겹치는지 본다. 겹치면 내 마이그레이션·스냅샷·저널을 지우고 `pnpm db:generate`로 다시 만든다. 한 웨이브에서 스키마를 바꾸는 플랜은 하나만 둔다.
- `pnpm lint:sql`(Squawk)이 CI quality 잡에서 돈다. `.squawk.toml` 키는 최상위(섹션 없음)여야 적용된다. 배제 규칙 4건(prefer-timestamp-tz·prefer-bigint-over-int·adding-required-field·require-concurrent-index-creation)은 WINDOWS.md #1~#4에 이유가 있다 — 새 배제는 같은 방식으로 기록한다.
- drizzle `migrate()`는 단일 트랜잭션이다. `CREATE INDEX CONCURRENTLY`와 양립하지 않는다.
- 금액 칸은 `bigint`(원화 정수 원)다. 04-06·PR #82에서 int 한계(21억)로 저장이 깨진 적이 있다.
- 마이그레이션이 트래픽 전환 전에 돌아 옛 코드가 새 스키마 위에서 몇 분 동작한다(T-04-372). 칸 삭제(DROP)는 코드가 그 칸을 더 읽지 않는 배포 뒤에만, 롤백 하한(`rollback.sh` 스키마 하한)을 함께 표시한다.
- 프로덕션 DB에 직접 명령을 내리지 않는다(CLAUDE.md §2). 운영 작업은 Cloud Run Job(`plant8-{env}-migrate`)과 `scripts/deploy.sh`가 한다.
