# Tickra – Projektmanagement für Menschen und KI-Agenten

Tickra verteilt Aufgaben automatisch an KI-Agenten und sorgt dafür, dass Arbeit **Nutzungslimits übersteht**: Stößt ein Agent an sein Limit, pausiert das Ticket mit allen Zwischenständen – und geht nach dem Reset an derselben Stelle weiter oder wird sofort von einem anderen Agenten übernommen. Menschen behalten die Kontrolle: Sie geben Tickets für Agenten frei und nehmen Ergebnisse ab.

```
Ticket freigeben ─→ Tickra verteilt ─→ Agent arbeitet ─→ speichert laufend Zwischenstände
                                            │
                                     Limit erreicht
                          ┌─────────────────┴─────────────────┐
                 warten bis zum Reset              anderer Agent übernimmt
                          └─────────────────┬─────────────────┘
                              weiter am letzten Zwischenstand ─→ Mensch prüft und gibt frei
```

Darunter liegt ein vollständiges Projektmanagement-Tool (Projekte, Sprints, Kanban-Board, Tickets), das Menschen im Browser und Agenten über **MCP** oder eine **REST-API** bedienen.

## Starten

```bash
npm install
npx prisma migrate dev   # Datenbank anlegen bzw. aktualisieren (SQLite, prisma/dev.db)
npx tsx prisma/seed.ts   # Demo-Daten einspielen
npm run dev              # http://localhost:3000
```

**Demo-Logins** (Passwort jeweils `demo1234`):
- micha@firma.de · anna@firma.de · tom@firma.de

## Funktionen

- **Login & Registrierung** – Auth.js (Credentials + bcrypt), alle Seiten geschützt; Konto-Seite für Name, Avatar-Farbe und Passwort
- **Projekte** – mehrere Projekte mit Key (z.B. `WEB`), Mitgliedern, Rollen (Admin/Mitglied) und Labels; Owner kann Projekte löschen, Mitglieder können sie verlassen
- **Backlog & Sprints** – Tickets inline oder per Dialog erstellen, in Sprints verschieben, Sprint mit wählbarer Dauer starten, bearbeiten und abschließen (offene Tickets wandern zurück ins Backlog)
- **Kanban-Board** – 4 Spalten (To Do / In Arbeit / In Review / Fertig), Drag & Drop per @dnd-kit (Maus, Touch, Tastatur), Sprint-Fortschritt und Restlaufzeit, Filter nach Text, Person, „Nur meine“, „Nicht zugewiesen“ und Typ
- **Ticket-Detail** – öffnet als Modal über dem Board (Intercepting Route) oder als eigene Seite; Titel, Beschreibung, Status, Priorität, Typ, Assignee, Sprint, Story Points, Fälligkeitsdatum und Labels editierbar; Kommentare (bearbeiten/löschen)
- **Meine Tickets** – alle mir zugewiesenen offenen Tickets über alle Projekte, nach Fälligkeit sortiert
- **Suche** – Topbar-Suche über Ticket-Titel, -Keys und -Beschreibungen, mit Tastatur-Navigation
- **Hell/Dunkel-Modus** – über das Benutzermenü umschaltbar

### Tastenkürzel

| Taste | Aktion |
|---|---|
| `C` | Ticket erstellen (auf Projektseiten) |
| `/` | Suche fokussieren |
| `⌘/Strg + Enter` | Kommentar bzw. Beschreibung speichern |

### Berechtigungen

Alle Server Actions prüfen die Projekt-Mitgliedschaft und, ob referenzierte Sprints, Labels und Personen zum Projekt gehören. Projektdaten, Mitglieder und Labels können nur Admins ändern; Kommentare nur der Autor (Löschen zusätzlich Admins).

## Agenten-Arbeit: so funktioniert es

| Baustein | Was er tut |
|---|---|
| **Freigabe** | Nur Tickets mit „Für Agenten freigeben“ werden automatisch verteilt – das entscheidet ein Mensch. |
| **Reservierung** | Ein Agent reserviert ein Ticket für 15 Minuten; jedes Lebenszeichen verlängert. Ohne Lebenszeichen gilt es als *unterbrochen* und darf übernommen werden. |
| **Zwischenstände** | Nach jedem Teilschritt speichert der Agent, was erledigt ist, was als Nächstes kommt und welche Entscheidungen gefallen sind. Der neueste Zwischenstand ist der Einstieg für den nächsten Bearbeiter. |
| **Limit-Pause** | Meldet ein Agent sein Nutzungslimit, bleiben seine Tickets reserviert und gelten als *pausiert* bis zum Reset-Zeitpunkt. |
| **Verteilung** | `next_task` vergibt: eigene angefangene Tickets → unterbrochene → (optional) wegen Limit pausierte anderer Agenten → freigegebene To-Dos (aktiver Sprint und hohe Priorität zuerst). |
| **Akzeptanzkriterien** | Checkliste pro Ticket: eindeutige Definition von „fertig“. |
| **Freigabe-Gate** | Agenten können nicht auf „Fertig“ setzen. Sie übergeben zur Prüfung; ein Mensch klickt *Freigeben* oder *Nachbessern*. |
| **Verlauf** | Jede Änderung mit Akteur, Feld-Diff und Kanal (UI/API/MCP). |

Die Seite **Agenten** im Projekt zeigt: wer arbeitet, wer bis wann pausiert, was auf Freigabe wartet und was in der Warteschlange liegt.

### 1. Agent anlegen

Projekt → **Einstellungen → KI-Agenten** → Namen eingeben → **Agent anlegen** (nur Admins). Der Dialog zeigt den API-Key **einmalig**. Keys werden nur als SHA-256-Hash gespeichert; Agenten können sich nicht über das Login-Formular anmelden.

### 2a. Automatisch: der Runner

Der Runner startet Agenten selbstständig für freigegebene Tickets – auch über Nacht.

```bash
cp runner.config.example.json runner.config.json   # Projektpfade und Agenten eintragen
export TICKRA_KEY_A=tk_…                            # API-Key des Agenten
npm run runner -- --check                           # prüft Konfiguration, ohne Arbeit zu starten
npm run runner                                      # läuft, bis du ihn mit Strg+C stoppst
```

```jsonc
{
  "url": "http://localhost:3000",
  "onLimit": "handoff",            // "handoff": andere Agenten übernehmen · "wait": auf den Reset warten
  "projects": { "WEB": { "path": "~/Projekte/meine-website" } },   // Projekt-Key → Ordner mit dem Code
  "agents": [
    { "name": "Claude A", "apiKeyEnv": "TICKRA_KEY_A" },
    // Zweiter Account mit eigenem Limit: eigenes Konfigurationsverzeichnis
    { "name": "Claude B", "apiKeyEnv": "TICKRA_KEY_B", "env": { "CLAUDE_CONFIG_DIR": "~/.claude-account-b" } }
  ]
}
```

Was der Runner pro Ticket tut:

1. holt die nächste Aufgabe (`/agent/next`) und legt einen eigenen **Git-Worktree** mit Branch `tickra/<KEY>` an – parallele Agenten kommen sich nicht in die Quere, der Code-Stand bleibt über Pausen liegen
2. startet Claude Code (`claude -p …`) mit Tickra als MCP-Server und einem Auftrag aus Beschreibung, Akzeptanzkriterien, Zwischenständen und Rückmeldungen
3. sendet Lebenszeichen, solange der Agent läuft
4. wertet das Ende aus:
   - **Nutzungslimit** → Reset-Zeit aus der Meldung lesen, an Tickra melden; danach dieselbe Session fortsetzen (`--resume`) oder einen anderen Agenten übernehmen lassen
   - **nicht angemeldet** → Ticket zurück in die Warteschlange, Agent pausiert, Hinweis im Terminal
   - **abgebrochen** → erneuter Versuch mit wachsender Wartezeit; nach `maxAttempts` (Standard 3) zurück an einen Menschen

Standardmäßig darf der Agent Dateien bearbeiten, die Tickra-Tools nutzen und Git-Grundbefehle ausführen. Für Tests oder Builds `allowedTools` ergänzen, z.B. `["mcp__tickra", "Bash(git *)", "Bash(npm test *)"]`. Andere Agenten-CLIs lassen sich mit `"type": "custom"`, `"command"` und `"args"` einbinden; sie bekommen `TICKRA_URL`, `TICKRA_API_KEY` und `TICKRA_ISSUE` als Umgebungsvariablen.

`runner.config.json` und der lokale Zustand (`.tickra-runner-state.json`) sind in `.gitignore`.

### 2b. Von Hand: Claude Code mit Tickra verbinden

```bash
claude mcp add --transport http tickra http://localhost:3000/api/mcp --header "Authorization: Bearer tk_…"
```

Danach in Claude Code z.B.: „Hol dir mit next_task die nächste Aufgabe aus Tickra und arbeite sie ab.“ Persönliche API-Keys (im eigenen Namen) gibt es unter **Konto → API-Keys**.

Der MCP-Endpunkt ist zustandslos und per HTTP erreichbar – nach dem Hosting funktioniert er für Cloud-Agenten unverändert, nur mit anderer URL.

### MCP-Tools (`/api/mcp`)

| Tool | Zweck |
|---|---|
| `next_task` | Nächste Aufgabe holen und reservieren (inkl. aller Zwischenstände) |
| `claim_issue` | Bestimmtes Ticket reservieren |
| `save_checkpoint` | Zwischenstand speichern (verlängert die Reservierung) |
| `check_item` | Akzeptanzkriterium abhaken |
| `submit_for_review` | Arbeit abschließen → Prüfung durch einen Menschen |
| `release_issue` | Ticket unfertig zurückgeben (`needsHuman` verhindert erneute Verteilung) |
| `report_limit` | Nutzungslimit melden |
| `whoami`, `list_projects`, `get_project` | Orientierung: Account, Projekte, Mitglieder, Labels, Sprints |
| `list_issues`, `get_issue` | Tickets filtern bzw. mit Kriterien, Zwischenständen, Kommentaren und Verlauf lesen |
| `create_issue`, `update_issue`, `add_comment` | Tickets anlegen, ändern, kommentieren |

### REST-API (`/api/v1`, Header `Authorization: Bearer tk_…`)

| Methode | Pfad | |
|---|---|---|
| GET | `/me`, `/projects`, `/projects/:key` | Account, Projekte, Projekt-Details |
| GET | `/projects/:key/issues?assignee=me&state=open&sprint=active` | Tickets filtern |
| POST | `/projects/:key/issues` | Ticket anlegen (`checklist`, `agentReady` möglich) |
| GET / PATCH | `/issues/:issueKey` | Ticket lesen / Felder ändern |
| POST | `/issues/:issueKey/comments` | Kommentar (`{"body": "…"}`) |
| POST | `/agent/next` | Nächste Aufgabe holen und reservieren (`{"takeover": true, "projects": ["WEB"]}`) |
| GET | `/agent` | Eigener Status: Limit, reservierte Tickets |
| POST / DELETE | `/agent/limit` | Limit melden (`resetAt` oder `resetInMinutes`) / aufheben |
| POST | `/issues/:issueKey/claim` · `/heartbeat` | Reservieren · Lebenszeichen |
| POST | `/issues/:issueKey/checkpoints` | Zwischenstand (`summary`, `nextSteps`, `branch`) |
| POST / PATCH | `/issues/:issueKey/checklist` | Kriterium hinzufügen / abhaken (`{"item": 1, "done": true}`) |
| POST | `/issues/:issueKey/review` · `/release` | Zur Prüfung übergeben · zurückgeben |

Felder: `title`, `description`, `type`, `status`, `priority`, `assignee` (`me`, Name, E-Mail), `sprint` (`active`, `backlog`, Name), `storyPoints`, `dueDate` (JJJJ-MM-TT), `labels`, `branch`, `prUrl`. Web-UI, API und MCP nutzen dieselbe Service-Schicht (`src/lib/services/`) – gleiche Validierung, gleiche Rechte, gleiches Aktivitätslog.

## Tests

```bash
npm test            # Unit-Tests: Limit-Erkennung, Auswertung der Agenten-Ausgabe
npm run test:e2e    # baut die App, startet sie mit einer Wegwerf-Datenbank und spielt die Kernfälle durch:
                    # Limit → warten → fortsetzen · Limit → Übernahme · Absturz · fehlende Anmeldung ·
                    # Reservierungsregeln · Freigabe-Gate · MCP
```

Der E2E-Test nutzt einen simulierten Agenten (`runner/testing/fake-agent.mjs`) und verbraucht kein KI-Kontingent.

## Tech-Stack

| Bereich | Technologie |
|---|---|
| Framework | Next.js 16 (App Router, Server Actions, TypeScript) |
| Datenbank | SQLite über Prisma 7 (Driver-Adapter `better-sqlite3`) |
| Auth | Auth.js v5 (JWT-Session) |
| UI | Tailwind CSS 4 + shadcn/ui |
| Drag & Drop | @dnd-kit |

## Struktur

```
prisma/schema.prisma          Datenmodell (User, Project, Sprint, Issue, Comment, Label)
prisma/seed.ts                Demo-Daten
src/auth.ts                   Auth.js-Konfiguration
src/lib/services/             Geschäftslogik (Issues, Reservierung/Zwischenstände/Limits, Aktivität, API-Keys) – genutzt von UI, API und MCP
src/lib/actions/              Server Actions (dünne Hülle um die Services)
src/lib/mcp.ts                MCP-Tools
src/app/api/v1/               REST-API
src/app/api/mcp/              MCP-Endpunkt
runner/                       Runner: startet Agenten, erkennt Limits, setzt fort (+ Tests)
src/lib/access.ts             Projekt-Zugriffsprüfung
src/app/(auth)/               Login & Registrierung
src/app/(app)/projects/       Projektübersicht, Board, Backlog, Settings, Ticket-Seiten
src/app/(app)/my-issues/      Meine Tickets
src/app/(app)/account/        Konto-Einstellungen
src/components/board/         Kanban-Board (DnD)
src/components/issue/         Ticket-Detail, Side-Panel, Kommentare
```

## Später erweitern

Stand der Roadmap:

- ✅ **Phase 1–2:** Agent-Accounts, API-Keys, Aktivitätslog, REST-API, MCP-Server
- ✅ **Phase 3:** Reservierung mit Ablaufzeit, Zwischenstände, Limit-Pausen, Akzeptanzkriterien, Freigabe-Gate, Branch/PR am Ticket
- ✅ **Phase 4:** Runner mit Limit-Erkennung, Fortsetzen und Übergabe; Agenten-Übersicht
- **Phase 5 – Cloud:** Tickra und Runner gehostet, damit es auch läuft, wenn der Laptop zu ist. Dafür: Postgres statt SQLite, `AUTH_SECRET` neu setzen, Runner auf einem Server oder als Cloud-Agent
- **Ideen:** Limit-Stand je Agent vorab abfragen statt erst beim Erreichen; weitere Agenten-CLIs (Codex, Gemini) mit eigener Limit-Erkennung; Kosten- und Laufzeit-Übersicht; Abhängigkeiten zwischen Tickets; Benachrichtigung, wenn etwas auf Freigabe wartet
