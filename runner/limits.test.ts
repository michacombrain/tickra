import assert from "node:assert/strict";
import { test } from "node:test";
import { detectLimit, limitSignalLines, parseResetTime } from "./limits";

// Montag, 16.11.2026, 14:00 lokale Zeit
const now = new Date(2026, 10, 16, 14, 0, 0);

test("Unix-Zeitstempel nach Pipe", () => {
  const hit = detectLimit(["Claude AI usage limit reached|1794844800"], now);
  assert.ok(hit);
  assert.equal(hit.resetAt?.getTime(), 1794844800_000);
});

test("Uhrzeit mit pm → heute, wenn noch nicht vorbei", () => {
  const hit = detectLimit(["You've hit your session limit · resets 6pm (Europe/Berlin)"], now);
  assert.equal(hit?.resetAt?.getTime(), new Date(2026, 10, 16, 18, 0).getTime());
});

test("Uhrzeit bereits vorbei → morgen", () => {
  const reset = parseResetTime("5-hour limit reached ∙ resets 3am", now);
  assert.equal(reset?.getTime(), new Date(2026, 10, 17, 3, 0).getTime());
});

test("12am und 12pm", () => {
  assert.equal(parseResetTime("resets 12am", now)?.getHours(), 0);
  assert.equal(parseResetTime("resets at 12:30pm", now)?.getHours(), 12);
});

test("24-Stunden-Format", () => {
  const reset = parseResetTime("Usage limit reached. Your limit will reset at 15:30", now);
  assert.equal(reset?.getTime(), new Date(2026, 10, 16, 15, 30).getTime());
});

test("Datum mit Monat (Wochenlimit)", () => {
  const reset = parseResetTime("Weekly limit reached · resets Nov 19, 9am", now);
  assert.equal(reset?.getTime(), new Date(2026, 10, 19, 9, 0).getTime());
});

test("Datum im nächsten Jahr", () => {
  const reset = parseResetTime("weekly limit reached, resets Jan 2 at 8am", new Date(2026, 11, 30, 10, 0));
  assert.equal(reset?.getFullYear(), 2027);
});

test("relative Angabe", () => {
  assert.equal(
    parseResetTime("Rate limit exceeded. Try again in 1 hour 30 minutes.", now)?.getTime(),
    now.getTime() + 90 * 60_000
  );
  assert.equal(parseResetTime("quota exceeded, resets in 45m", now)?.getTime(), now.getTime() + 45 * 60_000);
});

test("resetsAt in JSON-Ereignis", () => {
  const hit = detectLimit(['{"type":"rate_limit_event","status":"rate limit reached","resetsAt":1794844800}'], now);
  assert.equal(hit?.resetAt?.getTime(), 1794844800_000);
});

test("Limit ohne Zeitangabe → Treffer ohne Zeitpunkt", () => {
  const hit = detectLimit(["Error: usage limit reached"], now);
  assert.ok(hit);
  assert.equal(hit.resetAt, null);
});

test("normale Ausgabe ist kein Limit", () => {
  assert.equal(detectLimit(["Tests laufen durch", "limit = 10 Einträge pro Seite", "Rate limiter implementiert"], now), null);
});

test("Agenten-Text über Limits löst bei stream-json nichts aus", () => {
  const stdout = [
    '{"type":"assistant","message":{"content":[{"type":"text","text":"Wenn das usage limit reached ist, resets 3pm."}]}}',
    '{"type":"result","subtype":"success","is_error":false,"result":"Fertig. Das usage limit reached Handling ist eingebaut."}',
  ].join("\n");
  assert.equal(detectLimit(limitSignalLines(stdout, "")), null);
});

test("fehlgeschlagenes Ergebnis in stream-json zählt", () => {
  const stdout = '{"type":"result","subtype":"error_during_execution","is_error":true,"result":"Claude AI usage limit reached|1794844800"}';
  const hit = detectLimit(limitSignalLines(stdout, ""));
  assert.equal(hit?.resetAt?.getTime(), 1794844800_000);
});

test("stderr zählt immer", () => {
  assert.ok(detectLimit(limitSignalLines("", "You have hit your usage limit. resets 9pm")));
});
