/**
 * Erkennt Nutzungslimit-Meldungen von Agenten-CLIs und liest den Reset-Zeitpunkt aus.
 * Bewusst eigenständig (keine App-Imports), damit es separat testbar bleibt.
 */

export type LimitHit = {
  /** Wann es weitergehen kann – null, wenn die Meldung keinen Zeitpunkt nennt */
  resetAt: Date | null;
  /** Die auslösende Zeile, gekürzt */
  message: string;
};

const LIMIT_PATTERN =
  /(usage|rate|session|weekly|daily|5-hour|hourly)[\s-]+limit[^\n]{0,40}(reached|hit|exceeded)|(hit|reached|exceeded) your [^\n]{0,20}limit|limit (reached|exceeded)|out of (extra )?usage|quota (exceeded|exhausted)/i;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function to24h(hour: number, meridiem?: string) {
  if (!meridiem) return hour;
  const pm = meridiem.toLowerCase() === "pm";
  if (hour === 12) return pm ? 12 : 0;
  return pm ? hour + 12 : hour;
}

/** Liest einen Reset-Zeitpunkt aus einer Limit-Meldung. */
export function parseResetTime(text: string, now = new Date()): Date | null {
  // "…limit reached|1760000000" bzw. "resetsAt": 1760000000 (Unix-Sekunden oder -Millisekunden)
  const epoch = /(?:\||resets?_?at["']?\s*[:=]\s*)(\d{10,13})\b/i.exec(text);
  if (epoch) {
    const value = Number(epoch[1]);
    return new Date(epoch[1].length > 10 ? value : value * 1000);
  }

  // ISO-Zeitpunkt
  const iso = /resets?[^\n]{0,20}?(\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)/i.exec(text);
  if (iso) {
    const date = new Date(iso[1]);
    if (!Number.isNaN(date.getTime())) return date;
  }

  // "resets in 2 hours" / "try again in 45 minutes" / "in 1h 30m"
  const relative = /(?:resets?|again|retry|available)[^\n]{0,15}?\bin\s+((?:\d+\s*(?:hours?|hrs?|h|minutes?|mins?|m)\b[\s,and]*)+)/i.exec(text);
  if (relative) {
    let minutes = 0;
    for (const part of relative[1].matchAll(/(\d+)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/gi)) {
      minutes += Number(part[1]) * (/^h/i.test(part[2]) ? 60 : 1);
    }
    if (minutes > 0) return new Date(now.getTime() + minutes * 60_000);
  }

  // "resets Nov 18, 3pm" / "resets Nov 18 at 3:30pm"
  const dated =
    /resets?\s+(?:on\s+)?([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s*(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(text);
  if (dated && MONTHS.includes(dated[1].toLowerCase())) {
    const date = new Date(now);
    date.setMonth(MONTHS.indexOf(dated[1].toLowerCase()), Number(dated[2]));
    date.setHours(to24h(Number(dated[3]), dated[5]), Number(dated[4] ?? 0), 0, 0);
    // Datum ohne Jahr: liegt es weit in der Vergangenheit, ist nächstes Jahr gemeint
    if (date.getTime() < now.getTime() - 24 * 3600_000) date.setFullYear(date.getFullYear() + 1);
    return date;
  }

  // "resets 3pm" / "reset at 15:30" / "resets at 3:30 PM (Europe/Berlin)" → nächstes Vorkommen dieser Uhrzeit
  const clock = /resets?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i.exec(text);
  if (clock && (clock[2] !== undefined || clock[3] !== undefined)) {
    const hour = to24h(Number(clock[1]), clock[3]);
    const minute = Number(clock[2] ?? 0);
    if (hour <= 23 && minute <= 59) {
      const date = new Date(now);
      date.setHours(hour, minute, 0, 0);
      if (date.getTime() <= now.getTime()) date.setDate(date.getDate() + 1);
      return date;
    }
  }
  return null;
}

/** Prüft Textzeilen auf eine Limit-Meldung. Liefert den ersten Treffer. */
export function detectLimit(lines: string[], now = new Date()): LimitHit | null {
  for (const line of lines) {
    if (!LIMIT_PATTERN.test(line)) continue;
    return { resetAt: parseResetTime(line, now), message: line.trim().slice(0, 300) };
  }
  return null;
}

/**
 * Wählt aus der Ausgabe eines Agenten die Zeilen aus, die als Limit-Signal zählen dürfen.
 * Bei stream-json (Claude Code) nur Ergebnis-/System-Ereignisse – nicht der Text, den der Agent
 * selbst schreibt (sonst würde ein Ticket ÜBER Nutzungslimits fälschlich als Limit gelten).
 */
export function limitSignalLines(stdout: string, stderr: string): string[] {
  const signals: string[] = [];
  for (const raw of stdout.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("{")) {
      try {
        const event = JSON.parse(line) as Record<string, unknown>;
        const type = String(event.type ?? "");
        if (type === "result") {
          if (event.is_error || event.subtype !== "success") signals.push(JSON.stringify(event));
        } else if (/limit|error/i.test(type)) {
          signals.push(JSON.stringify(event));
        }
        continue;
      } catch {
        // keine gültige JSON-Zeile → wie normalen Text behandeln
      }
    }
    signals.push(line);
  }
  signals.push(...stderr.split("\n").filter((line) => line.trim()));
  return signals;
}
