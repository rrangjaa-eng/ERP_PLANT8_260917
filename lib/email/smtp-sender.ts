import MailComposer from "nodemailer/lib/mail-composer";
import SMTPConnection, { type SMTPConnectionOptions } from "nodemailer/lib/smtp-connection";
import type { EmailSender, SendOutcome, SmtpConfig } from "@/lib/email/sender";

// nodemailer 저수준 SMTPConnection 어댑터. 고수준 transport는 어느 단계에서 끊겼는지
// 돌려주지 않아 쓰지 않는다(D-4216). 호출마다 짧은 연결 하나 — 풀·재연결 없음.

// 587 STARTTLS 필수. 세 시간 제한은 유휴 한도일 뿐 — 한 통의 상한은 호출자의 signal이다.
export function smtpConnectionOptions(config: SmtpConfig): SMTPConnectionOptions {
  return {
    host: config.host,
    port: 587,
    secure: false,
    requireTLS: true,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  };
}

export function emailErrorCode(err: unknown): string {
  void err;
  return "";
}

export function createSmtpSender(
  config: SmtpConfig,
  deps: { connectionOptions?: Partial<SMTPConnectionOptions> } = {},
): EmailSender {
  return {
    send(message, { signal }) {
      void signal;
      return new Promise<SendOutcome>((resolve) => {
        const connection = new SMTPConnection({ ...smtpConnectionOptions(config), ...deps.connectionOptions });

        // 결과는 한 번만 정한다 — 콜백·error·end 중 먼저 온 것.
        let settled = false;
        const settle = (outcome: SendOutcome) => {
          if (settled) return;
          settled = true;
          resolve(outcome);
        };
        const fail = () => {
          settle({ outcome: "rejected", code: "UNKNOWN" });
          connection.close();
        };

        connection.on("error", fail);
        connection.on("end", fail);

        connection.connect((connectError) => {
          if (connectError) return fail();
          connection.login({ user: config.user, pass: config.password }, (loginError) => {
            if (loginError) return fail();
            const composer = new MailComposer({
              from: config.from,
              to: message.to,
              subject: message.subject,
              text: message.text,
            });
            composer
              .compile()
              .build()
              .then((raw) => {
                connection.send({ from: config.from, to: [message.to] }, raw, (sendError) => {
                  if (sendError) return fail();
                  settle({ outcome: "sent" });
                  connection.quit();
                });
              }, fail);
          });
        });
      });
    },
  };
}
