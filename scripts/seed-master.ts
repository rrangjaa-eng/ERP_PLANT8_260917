import { pathToFileURL } from "node:url";
import { seedMasterData } from "@/domain/seed";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { closeDb } from "@/db/client";

// 파생 시드(권한표·노출표·프로젝트 상태 코드표) 전용 CLI(로컬 tsx, 01-06 Cloud
// Run Job 번들 공용). 계급 5행과 계급 백필은 마이그레이션 SQL에 있다 — 이
// 스크립트는 MENUS·INFO_ITEMS 레지스트리에서 파생되는 값만 다룬다(정본이 둘로
// 갈라지지 않게).
export async function main(): Promise<void> {
  const result = await seedMasterData(SYSTEM_VIEWER);
  console.log(
    `seed complete: roles=${result.roles} permissions=${result.permissions} visibility=${result.visibility} codeItems=${result.codeItems} settings=${result.settings}`,
  );
}

// 테스트가 이 파일을 import해도 실행되지 않게: 직접 실행될 때만 main()을 부른다
// (scripts/account-cli.ts와 같은 결).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main()
    .then(async () => {
      await closeDb();
      process.exit(0);
    })
    .catch(async (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      await closeDb().catch(() => undefined);
      process.exit(1);
    });
}
