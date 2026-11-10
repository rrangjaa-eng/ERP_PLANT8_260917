import { beforeEach, describe, expect, it, vi } from "vitest";

// 07.2-10 /review P3 — PrintBar `failureToast` 갈래: 기록이 서버 오류 · 검증 오류 · 던짐으로 실패하면 토스트 상태를 켜고 합치기 시각을 비워 「인쇄 다시」가 바로 다시 기록하게 한다.
// jsdom 없이 훅을 가짜로 바꿔 함수 컴포넌트를 직접 부른다(이 저장소 단위 테스트는 node 환경).
const h = vi.hoisted(() => ({
  setFailed: vi.fn(),
  state: { failed: false },
  record: vi.fn(),
}));

vi.mock("react", () => ({
  useRef: (initial: unknown) => ({ current: initial }),
  useState: (initial: unknown) => [h.state.failed ?? initial, h.setFailed],
  useCallback: (fn: unknown) => fn,
  useEffect: () => undefined,
}));
vi.mock("@/app/print/_frame/actions", () => ({ recordDocumentPrintAction: h.record }));
vi.mock("@/ui/button/Button", () => ({ Button: () => null }));
vi.mock("@/ui/toast/Toast", () => ({ Toast: () => null }));
vi.mock("@/app/print/_frame/print-frame.module.css", () => ({ default: { bar: "bar" } }));

type Node = { type: unknown; props: { variant?: string; onClick?: () => void; children?: unknown; message?: string } };

function findAll(node: unknown, out: Node[] = []): Node[] {
  if (Array.isArray(node)) node.forEach((child) => findAll(child, out));
  else if (node && typeof node === "object" && "props" in node) {
    out.push(node as Node);
    findAll((node as Node).props.children, out);
  }
  return out;
}

const ID = "11111111-1111-4111-8111-111111111111";

async function click(failureToast: boolean) {
  const { PrintBar } = await import("@/app/print/_frame/PrintBar");
  const tree = PrintBar({ kind: "quote", id: ID, autoPrint: false, failureToast, closeHref: "/" });
  const primary = findAll(tree).find((node) => node.props.variant === "primary");
  primary?.props.onClick?.();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.resetModules();
  h.setFailed.mockClear();
  h.record.mockReset();
  h.state.failed = false;
  vi.stubGlobal("window", { print: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), close: vi.fn(), closed: true, location: { assign: vi.fn() } });
});

describe("PrintBar failureToast", () => {
  it("서버 오류면 실패 상태를 켠다", async () => {
    h.record.mockResolvedValue({ serverError: "x" });
    await click(true);
    expect(h.setFailed).toHaveBeenCalledWith(true);
  });

  it("검증 오류 · 던짐도 실패 상태를 켠다", async () => {
    h.record.mockResolvedValue({ validationErrors: { id: ["bad"] } });
    await click(true);
    expect(h.setFailed).toHaveBeenCalledWith(true);
    h.setFailed.mockClear();
    vi.resetModules();
    h.record.mockRejectedValue(new Error("network"));
    await click(true);
    expect(h.setFailed).toHaveBeenCalledWith(true);
  });

  it("실패하면 합치기 시각을 비워 곧바로 다시 눌러도 다시 기록한다", async () => {
    h.record.mockResolvedValue({ serverError: "x" });
    const { PrintBar } = await import("@/app/print/_frame/PrintBar");
    const press = async () => {
      const tree = PrintBar({ kind: "quote", id: ID, autoPrint: false, failureToast: true, closeHref: "/" });
      findAll(tree).find((node) => node.props.variant === "primary")?.props.onClick?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    };
    await press();
    await press();
    expect(h.record).toHaveBeenCalledTimes(2);
  });

  it("성공하면 실패 상태를 켜지 않고, 5초 안의 두 번째 누름은 합친다", async () => {
    h.record.mockResolvedValue({});
    const { PrintBar } = await import("@/app/print/_frame/PrintBar");
    const press = async () => {
      findAll(PrintBar({ kind: "quote", id: ID, autoPrint: false, failureToast: true, closeHref: "/" })).find((node) => node.props.variant === "primary")?.props.onClick?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    };
    await press();
    await press();
    expect(h.setFailed).not.toHaveBeenCalledWith(true);
    expect(h.record).toHaveBeenCalledTimes(1);
  });

  it("failureToast가 꺼져 있으면(세 서류) 실패해도 상태를 켜지 않는다", async () => {
    h.record.mockResolvedValue({ serverError: "x" });
    await click(false);
    expect(h.setFailed).not.toHaveBeenCalledWith(true);
  });
});
