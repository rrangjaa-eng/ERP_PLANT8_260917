import type { EmailMessage, EmailSender, SendOutcome } from "@/lib/email/sender";

// 테스트 전용 가짜 발송기 — 실제 SMTP에 연결하지 않는다. 받는 사람 주소별로 결과·예외·
// 대기를 주입한다. 대기 중 signal이 중단되면 04.2-15 어댑터와 같게 indeterminate·DEADLINE.
// ignoreSignal이면 신호를 보지 않는다(이메일 단계의 마감 경주 테스트용).
export type FakeEmailSenderOptions = {
  outcomeFor?: ReadonlyMap<string, SendOutcome>;
  throwFor?: ReadonlyMap<string, Error>;
  blockFor?: ReadonlyMap<string, Promise<void>>;
  ignoreSignal?: boolean;
};

export type FakeSendCall = { message: EmailMessage; signal: AbortSignal; abortedAtCall: boolean };

function aborted(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
}

export function createFakeEmailSender(opts?: FakeEmailSenderOptions): {
  sender: EmailSender;
  // outcome이 sent로 끝난 메일만.
  sent: EmailMessage[];
  // send가 불린 모든 호출.
  calls: FakeSendCall[];
} {
  const sent: EmailMessage[] = [];
  const calls: FakeSendCall[] = [];
  const sender: EmailSender = {
    async send(message, { signal }) {
      calls.push({ message, signal, abortedAtCall: signal.aborted });
      const block = opts?.blockFor?.get(message.to);
      if (block) {
        if (opts?.ignoreSignal) {
          await block;
        } else {
          const winner = await Promise.race([block.then(() => "released" as const), aborted(signal).then(() => "aborted" as const)]);
          if (winner === "aborted") return { outcome: "indeterminate", code: "DEADLINE" };
        }
      }
      const error = opts?.throwFor?.get(message.to);
      if (error) throw error;
      const outcome = opts?.outcomeFor?.get(message.to) ?? { outcome: "sent" };
      if (outcome.outcome === "sent") sent.push(message);
      return outcome;
    },
  };
  return { sender, sent, calls };
}
