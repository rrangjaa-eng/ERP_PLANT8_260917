// 한 줄 JSON 로그. Cloud Logging이 severity·message를 특수 필드로 파싱한다.
// next import 없음(01-05가 CLI 번들에 포함한다).

type LogSeverity = "INFO" | "WARNING" | "ERROR";

function write(severity: LogSeverity, event: string, fields?: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      severity,
      message: event,
      time: new Date().toISOString(),
      event,
      ...fields,
    }),
  );
}

export const log = {
  info(event: string, fields?: Record<string, unknown>): void {
    write("INFO", event, fields);
  },
  warn(event: string, fields?: Record<string, unknown>): void {
    write("WARNING", event, fields);
  },
  error(event: string, fields?: Record<string, unknown>): void {
    write("ERROR", event, fields);
  },
};
