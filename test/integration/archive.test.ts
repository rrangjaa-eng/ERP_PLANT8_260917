import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { auth } from "@/lib/auth";
import { CLIENT_IP_HEADER } from "@/lib/client-ip";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { createCodeItem } from "@/domain/code-tables";
import { listCodeItems as repoListCodeItems } from "@/repositories/code-tables";
import { createVendor } from "@/domain/vendors";
import { createAccount } from "@/domain/auth/accounts";
import { archivePerson } from "@/domain/people";
import { archive, restore, listArchive, ForbiddenError } from "@/domain/archive";
import { queryActionLog } from "@/domain/action-log";

let ipCounter = 0;
function nextTestIp(): string {
  ipCounter += 1;
  return `192.0.2.${100 + ipCounter}`;
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@example.test`;
}

describe("보관함 (ADMN-12, 실제 Postgres)", () => {
  it("여러 표의 보관 항목이 한 조회에 나오고, 두 번 조회해도 같은 순서다(결정적 정렬)", async () => {
    const tableKey = `test_archive_${randomUUID()}`;
    const codeItem = await createCodeItem(SYSTEM_VIEWER, { tableKey, value: "a", label: "A" });
    const { vendor } = await createVendor(SYSTEM_VIEWER, { name: `거래처-${randomUUID()}` });

    await archive(SYSTEM_VIEWER, "code_items", codeItem.id);
    await archive(SYSTEM_VIEWER, "vendor", vendor.id);

    const first = await listArchive(SYSTEM_VIEWER);
    const second = await listArchive(SYSTEM_VIEWER);

    expect(first.some((item) => item.entity === "code_items" && item.id === codeItem.id)).toBe(true);
    expect(first.some((item) => item.entity === "vendor" && item.id === vendor.id)).toBe(true);
    expect(second.map((item) => `${item.entity}:${item.id}`)).toEqual(first.map((item) => `${item.entity}:${item.id}`));
  });

  it("복원 후 원래 표의 기본 목록에 다시 나타난다", async () => {
    const tableKey = `test_archive_restore_${randomUUID()}`;
    const codeItem = await createCodeItem(SYSTEM_VIEWER, { tableKey, value: "a", label: "A" });

    await archive(SYSTEM_VIEWER, "code_items", codeItem.id);
    const hiddenList = await repoListCodeItems(SYSTEM_VIEWER, { tableKey, scope: { rows: "all", includeArchived: false }, includeInactive: true });
    expect(hiddenList.some((item) => item.id === codeItem.id)).toBe(false);

    await restore(SYSTEM_VIEWER, "code_items", codeItem.id);
    const restoredList = await repoListCodeItems(SYSTEM_VIEWER, { tableKey, scope: { rows: "all", includeArchived: false }, includeInactive: true });
    expect(restoredList.some((item) => item.id === codeItem.id)).toBe(true);
  });

  it("이미 복원된 항목을 다시 복원해도 상태가 바뀌지 않는다(멱등)", async () => {
    const tableKey = `test_archive_idem_${randomUUID()}`;
    const codeItem = await createCodeItem(SYSTEM_VIEWER, { tableKey, value: "a", label: "A" });
    await archive(SYSTEM_VIEWER, "code_items", codeItem.id);
    await restore(SYSTEM_VIEWER, "code_items", codeItem.id);

    // 두 번째 복원도 예외 없이 성공하고, 여전히 기본 목록에 있다.
    await restore(SYSTEM_VIEWER, "code_items", codeItem.id);
    const list = await repoListCodeItems(SYSTEM_VIEWER, { tableKey, scope: { rows: "all", includeArchived: false }, includeInactive: true });
    expect(list.some((item) => item.id === codeItem.id)).toBe(true);
  });

  it("보관과 복원이 동시에 오면 최종 상태가 둘 중 하나로 확정되고 중간 상태가 남지 않는다", async () => {
    const tableKey = `test_archive_race_${randomUUID()}`;
    const codeItem = await createCodeItem(SYSTEM_VIEWER, { tableKey, value: "a", label: "A" });

    const results = await Promise.allSettled([
      archive(SYSTEM_VIEWER, "code_items", codeItem.id),
      restore(SYSTEM_VIEWER, "code_items", codeItem.id),
    ]);
    // 조건부 UPDATE라 둘 다 성공(멱등 경로)하거나 순서에 따라 둘 다 no-op일
    // 수 있다 — 예외로 끝나지 않는 것이 계약이다.
    for (const result of results) expect(result.status).toBe("fulfilled");

    const archived = await listArchive(SYSTEM_VIEWER);
    const inList = await repoListCodeItems(SYSTEM_VIEWER, { tableKey, scope: { rows: "all", includeArchived: false }, includeInactive: true });
    const isArchived = archived.some((item) => item.entity === "code_items" && item.id === codeItem.id);
    const isVisible = inList.some((item) => item.id === codeItem.id);
    // 둘 중 정확히 하나만 참이다 — 중간(둘 다 참 또는 둘 다 거짓) 상태가 없다.
    expect(isArchived).toBe(!isVisible);
  });

  it("보관함 권한이 없는 계급의 조회가 거부된다", async () => {
    const pmViewer = { id: `pm-${randomUUID()}`, roleId: DEFAULT_ROLE_ID };
    await expect(listArchive(pmViewer)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("보관·복원이 각각 행동 로그에 남는다", async () => {
    const tableKey = `test_archive_log_${randomUUID()}`;
    const codeItem = await createCodeItem(SYSTEM_VIEWER, { tableKey, value: "a", label: "A" });

    await archive(SYSTEM_VIEWER, "code_items", codeItem.id);
    const archiveLogs = await queryActionLog(SYSTEM_VIEWER, { actionType: "archive" });
    expect(archiveLogs.some((log) => log.entity === "code_items" && log.entityId === codeItem.id)).toBe(true);

    await restore(SYSTEM_VIEWER, "code_items", codeItem.id);
    const restoreLogs = await queryActionLog(SYSTEM_VIEWER, { actionType: "restore" });
    expect(restoreLogs.some((log) => log.entity === "code_items" && log.entityId === codeItem.id)).toBe(true);
  });

  it("시드 계급의 보관이 거부된다(03-01의 규칙이 보관함 화면 경로에서도 성립)", async () => {
    await expect(archive(SYSTEM_VIEWER, "roles", SYSADMIN_ROLE_ID)).rejects.toThrow();
  });

  it("사람을 보관하면 세션이 0개가 되고 sign-in이 잘못된 비밀번호와 상태·본문이 깊게 같은 응답으로 거부되며, 복원 뒤에는 성공한다", async () => {
    const email = uniqueEmail("archive-person");
    const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name: "보관 테스트" });

    // 로그인해 실제 세션을 하나 만든다.
    await auth.api.signInEmail({
      body: { email, password: tempPassword },
      headers: new Headers({ [CLIENT_IP_HEADER]: nextTestIp() }),
    });

    const ctxBefore = await auth.$context;
    const sessionsBefore = await ctxBefore.internalAdapter.listSessions(userId);
    expect(sessionsBefore.length).toBeGreaterThan(0);

    await archivePerson(SYSTEM_VIEWER, userId);

    const ctxAfter = await auth.$context;
    const sessionsAfter = await ctxAfter.internalAdapter.listSessions(userId);
    expect(sessionsAfter.length).toBe(0);

    // 살아 있는 다른 계정에 잘못된 비밀번호로 로그인해 "진짜" 자격 증명
    // 오류 응답을 얻는다 — 리터럴 문구가 아니라 이 실제 응답과 깊은 비교한다.
    const liveEmail = uniqueEmail("archive-control");
    await createAccount(SYSTEM_VIEWER, { email: liveEmail, name: "대조군" });
    let controlError: { status: unknown; statusCode: unknown; body: unknown } | undefined;
    try {
      await auth.api.signInEmail({
        body: { email: liveEmail, password: "definitely-wrong-password" },
        headers: new Headers({ [CLIENT_IP_HEADER]: nextTestIp() }),
      });
    } catch (e) {
      controlError = e as { status: unknown; statusCode: unknown; body: unknown };
    }
    expect(controlError).toBeDefined();

    let archivedError: { status: unknown; statusCode: unknown; body: unknown } | undefined;
    try {
      await auth.api.signInEmail({
        body: { email, password: tempPassword },
        headers: new Headers({ [CLIENT_IP_HEADER]: nextTestIp() }),
      });
    } catch (e) {
      archivedError = e as { status: unknown; statusCode: unknown; body: unknown };
    }
    expect(archivedError).toBeDefined();

    expect(archivedError?.status).toEqual(controlError?.status);
    expect(archivedError?.statusCode).toEqual(controlError?.statusCode);
    expect(archivedError?.body).toEqual(controlError?.body);

    // 복원하면 다시 로그인된다.
    await restore(SYSTEM_VIEWER, "user", userId);
    const afterRestore = await auth.api.signInEmail({
      body: { email, password: tempPassword },
      headers: new Headers({ [CLIENT_IP_HEADER]: nextTestIp() }),
    });
    expect(afterRestore.token).toBeTruthy();
  });
});
