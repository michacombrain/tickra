/** Wertet die Ausgabe eines beendeten Agenten-Prozesses aus (ohne App-Imports, separat testbar). */

type ResultEvent = { type?: string; is_error?: boolean; result?: unknown; error?: unknown };

/** Letztes "result"-Ereignis einer stream-json-Ausgabe (Claude Code), falls vorhanden. */
function lastResult(stdout: string): ResultEvent | null {
  const lines = stdout.split("\n");
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim();
    if (!line.startsWith("{")) continue;
    try {
      const event = JSON.parse(line) as ResultEvent;
      if (event.type === "result") return event;
    } catch {
      // unvollständige Zeile überspringen
    }
  }
  return null;
}

/** Kurze, lesbare Fehlerbeschreibung statt roher JSON-Enden. */
export function failureSummary(stdout: string, stderr: string, max = 600) {
  const result = lastResult(stdout);
  const text =
    result?.is_error && typeof result.result === "string" && result.result.trim()
      ? result.result
      : stderr.trim() || (result && typeof result.result === "string" ? result.result : "") || stdout.trim();
  const clean = text.trim() || "(keine Ausgabe)";
  return clean.length > max ? `…${clean.slice(-max)}` : clean;
}

const AUTH_PATTERN =
  /failed to authenticate|authentication[_ ]failed|not logged in|please (run )?\/?log ?in|oauth (session|token)[^\n]{0,30}(expired|invalid)|invalid api key|unauthorized/i;

/**
 * Der Agent konnte sich bei seinem Anbieter nicht anmelden. Das ist kein Problem des Tickets –
 * erneute Versuche helfen nicht, ein Mensch muss den Agenten neu anmelden.
 */
export function isAuthFailure(stdout: string, stderr: string) {
  const result = lastResult(stdout);
  if (result) return !!result.is_error && AUTH_PATTERN.test(String(result.result ?? ""));
  return AUTH_PATTERN.test(stderr) || AUTH_PATTERN.test(stdout.slice(-2000));
}
