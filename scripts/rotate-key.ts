import { pathToFileURL } from "node:url";
import { eq, isNotNull } from "drizzle-orm";
import { db, closeDb } from "@/db/client";
import { vendors } from "@/db/schema";
import { env } from "@/lib/env";
import { encrypt, decrypt } from "@/lib/crypto";
import { log } from "@/lib/log";

// 03-06 Task 1 결정 ④: 키 회전 — 옛 버전 암호문을 읽어 새 버전으로 다시
// 쓴다. 두 키가 모두 설정돼 있지 않으면 즉시 중단한다. 중단·재실행이
// 안전하도록 이미 최신 버전(env가 가리키는 가장 높은 버전)인 행은
// 건너뛴다(멱등) — encrypt()가 항상 그 버전을 쓰므로 재암호화 결과의
// 접두어로 판정한다.
//
// 대상 표·컬럼은 코드 상수로 둔다(현재는 거래처 계좌번호 하나). 새 암호화
// 컬럼이 늘면 TARGETS 배열에 항목만 추가한다.
export class UsageError extends Error {}

type RotateTarget = {
  label: string;
  fetchRows: () => Promise<{ id: string; value: string | null }[]>;
  writeRow: (id: string, value: string) => Promise<void>;
};

const TARGETS: RotateTarget[] = [
  {
    label: "vendors.account_number_encrypted",
    async fetchRows() {
      return db
        .select({ id: vendors.id, value: vendors.accountNumberEncrypted })
        .from(vendors)
        .where(isNotNull(vendors.accountNumberEncrypted));
    },
    async writeRow(id, value) {
      await db.update(vendors).set({ accountNumberEncrypted: value, updatedAt: new Date() }).where(eq(vendors.id, id));
    },
  },
];

function currentVersionPrefix(value: string): string | undefined {
  return value.split(":")[0];
}

export function newestVersion(): string {
  return env.APP_DATA_KEY_v2 ? "v2" : "v1";
}

export type RotateResult = { target: string; rotated: number; skipped: number }[];

export async function rotateKey(targets: RotateTarget[] = TARGETS): Promise<RotateResult> {
  if (!env.APP_DATA_KEY_v1 || !env.APP_DATA_KEY_v2) {
    throw new Error("두 키(APP_DATA_KEY_v1, APP_DATA_KEY_v2)가 모두 설정돼 있어야 회전할 수 있습니다.");
  }

  const newest = newestVersion();
  const results: RotateResult = [];

  for (const target of targets) {
    let rotated = 0;
    let skipped = 0;
    const rows = await target.fetchRows();

    for (const row of rows) {
      const value = row.value;
      if (!value) continue;
      if (currentVersionPrefix(value) === newest) {
        skipped++;
        continue;
      }
      const plaintext = decrypt(value);
      const reencrypted = encrypt(plaintext);
      await target.writeRow(row.id, reencrypted);
      rotated++;
    }

    results.push({ target: target.label, rotated, skipped });
  }

  return results;
}

// scripts/account-cli.ts와 같은 인자 규약 — 플래그와 값은 항상 별개 argv
// 원소, 등호 결합(--flag=value) 거부. 지금은 사용하는 플래그가 없지만
// 규약을 통일해 둔다(미래에 --dry-run 등을 추가할 때 파서를 새로 만들지
// 않는다).
export function parseArgs(argv: string[]): void {
  for (const token of argv) {
    if (token.startsWith("--") && token.includes("=")) {
      throw new UsageError(`등호 결합(--flag=value) 토큰은 지원하지 않습니다: ${token}`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  parseArgs(process.argv.slice(2));
  void rotateKey()
    .then(async (results) => {
      for (const result of results) {
        log.info("rotate_key.done", result);
      }
      await closeDb();
      process.exit(0);
    })
    .catch(async (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      await closeDb().catch(() => undefined);
      process.exit(1);
    });
}
