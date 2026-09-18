import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { log } from "@/lib/log";

describe("lib/log", () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("info는 severity INFO인 한 줄 JSON을 쓴다", () => {
    log.info("x", { a: 1 });

    expect(spy).toHaveBeenCalledTimes(1);
    const line = spy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(line);

    expect(parsed.severity).toBe("INFO");
    expect(parsed.message).toBe("x");
    expect(parsed.event).toBe("x");
    expect(parsed.a).toBe(1);
    expect(typeof parsed.time).toBe("string");
    expect(new Date(parsed.time).toISOString()).toBe(parsed.time);
  });

  it("warn은 severity WARNING을 쓴다", () => {
    log.warn("y");
    const parsed = JSON.parse(spy.mock.calls[0]?.[0] as string);
    expect(parsed.severity).toBe("WARNING");
  });

  it("error는 severity ERROR를 쓴다", () => {
    log.error("z");
    const parsed = JSON.parse(spy.mock.calls[0]?.[0] as string);
    expect(parsed.severity).toBe("ERROR");
  });
});
