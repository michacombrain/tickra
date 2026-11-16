import assert from "node:assert/strict";
import { test } from "node:test";
import { failureSummary, isAuthFailure } from "./output";

const authFailed = [
  '{"type":"system","subtype":"init"}',
  '{"type":"assistant","message":{"content":[{"type":"text","text":"Failed to authenticate: OAuth session expired and could not be refreshed"}]},"error":"authentication_failed"}',
  '{"type":"result","subtype":"success","is_error":true,"result":"Failed to authenticate: OAuth session expired and could not be refreshed","terminal_reason":"api_error"}',
].join("\n");

test("Anmeldefehler von Claude Code wird erkannt", () => {
  assert.equal(isAuthFailure(authFailed, ""), true);
  assert.equal(failureSummary(authFailed, ""), "Failed to authenticate: OAuth session expired and could not be refreshed");
});

test("erfolgreicher Lauf, der über Anmeldung schreibt, ist kein Anmeldefehler", () => {
  const stdout = '{"type":"result","subtype":"success","is_error":false,"result":"Login-Seite gebaut. Bei \\"not logged in\\" wird umgeleitet."}';
  assert.equal(isAuthFailure(stdout, ""), false);
});

test("Anmeldefehler in stderr (andere CLIs)", () => {
  assert.equal(isAuthFailure("", "Error: Not logged in. Please run /login"), true);
  assert.equal(isAuthFailure("", "TypeError: x is undefined"), false);
});

test("Fehlerbeschreibung nimmt stderr, wenn kein Ergebnis-Ereignis da ist", () => {
  assert.equal(failureSummary("", "Segmentation fault\n"), "Segmentation fault");
  assert.equal(failureSummary("", ""), "(keine Ausgabe)");
});

test("lange Ausgabe wird auf das Ende gekürzt", () => {
  const summary = failureSummary("", "x".repeat(2000), 100);
  assert.equal(summary.length, 101);
  assert.ok(summary.startsWith("…"));
});
