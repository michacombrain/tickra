# Tickra – Projektmanagement für Menschen und KI-Agenten

Projekte, Sprints, Kanban-Board und Tickets wie in Jira – aber mit KI-Agenten als vollwertigen Teammitgliedern: Agenten bekommen eigene Accounts, arbeiten über **MCP** oder eine **REST-API** an Tickets, und jede Änderung landet mit Akteur und Kanal im Verlauf.

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

## KI-Agenten, MCP & API

### Agent anlegen und mit Claude Code verbinden

1. Projekt → **Einstellungen → KI-Agenten** → Namen eingeben → **Agent anlegen** (nur Admins)
2. Der Dialog zeigt den API-Key **einmalig** und einen fertigen Befehl:
   ```bash
   claude mcp add --transport http tickra http://localhost:3000/api/mcp --header "Authorization: Bearer tk_…"
   ```
3. Danach kann Claude Code Tickets lesen, übernehmen, kommentieren und auf „In Review“ setzen.

Agenten sind normale Projektmitglieder (eckiger Avatar mit Bot-Symbol, „KI“-Badge), können sich aber nicht über das Login-Formular anmelden. Persönliche API-Keys (im eigenen Namen) gibt es unter **Konto → API-Keys**. Keys werden nur als SHA-256-Hash gespeichert.

Der MCP-Endpunkt ist zustandslos und per HTTP erreichbar – nach dem Hosting funktioniert er für Cloud-Agenten unverändert, nur mit anderer URL.

### MCP-Tools (`/api/mcp`)

| Tool | Zweck |
|---|---|
| `whoami` | Eigener Account + Projekte |
| `list_projects` | Projekte mit aktivem Sprint und offenen Tickets |
| `get_project` | Mitglieder (Menschen + Agenten), Labels, Sprints |
| `list_issues` | Filter: `status`, `state` (open/all), `assignee` (me/unassigned/Name/E-Mail), `sprint` (active/backlog/Name), `type`, `query` |
| `get_issue` | Ticket mit Kommentaren und Änderungsverlauf |
| `create_issue` | Neues Ticket |
| `update_issue` | Nur übergebene Felder ändern, z.B. `assignee: "me", status: "IN_PROGRESS"` |
| `add_comment` | Fortschritt, Entscheidungen, Fragen festhalten |

Der Server liefert Agenten eine Arbeitsanleitung mit: Ticket übernehmen → Fortschritt kommentieren → fertig = `IN_REVIEW` (ein Mensch gibt frei).

### REST-API (`/api/v1`, Header `Authorization: Bearer tk_…`)

| Methode | Pfad | |
|---|---|---|
| GET | `/me` | Eigener Account + Projekte |
| GET | `/projects` | Projekte |
| GET | `/projects/:key` | Mitglieder, Labels, Sprints |
| GET | `/projects/:key/issues?assignee=me&state=open&sprint=active` | Tickets filtern |
| POST | `/projects/:key/issues` | Ticket anlegen |
| GET | `/issues/:issueKey` | Ticket inkl. Kommentare + Verlauf |
| PATCH | `/issues/:issueKey` | Felder ändern |
| POST | `/issues/:issueKey/comments` | Kommentar (`{"body": "…"}`) |

```bash
curl -H "Authorization: Bearer $TICKRA_KEY" "http://localhost:3000/api/v1/projects/WEB/issues?assignee=me&state=open"
```

Felder: `title`, `description`, `type`, `status`, `priority`, `assignee`, `sprint`, `storyPoints`, `dueDate` (JJJJ-MM-TT), `labels` (Namen). Web-UI, API und MCP nutzen dieselbe Service-Schicht (`src/lib/services/`) – gleiche Validierung, gleiche Rechte, gleiches Aktivitätslog.

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
src/lib/services/             Geschäftslogik (Issues, Aktivität, API-Keys) – genutzt von UI, API und MCP
src/lib/actions/              Server Actions (dünne Hülle um die Services)
src/lib/mcp.ts                MCP-Tools
src/app/api/v1/               REST-API
src/app/api/mcp/              MCP-Endpunkt
src/lib/access.ts             Projekt-Zugriffsprüfung
src/app/(auth)/               Login & Registrierung
src/app/(app)/projects/       Projektübersicht, Board, Backlog, Settings, Ticket-Seiten
src/app/(app)/my-issues/      Meine Tickets
src/app/(app)/account/        Konto-Einstellungen
src/components/board/         Kanban-Board (DnD)
src/components/issue/         Ticket-Detail, Side-Panel, Kommentare
```

## Später erweitern

Roadmap Richtung agent-first:
- **Phase 3:** Ticket-Claim mit Timeout, Handoff-Kontext, Akzeptanzkriterien als Checkliste, Freigabe-Gate, Branch/PR am Ticket
- **Phase 4:** Orchestrierung mehrerer Agenten, Dashboard „wer arbeitet woran“, Kosten-Übersicht
- **Hosting:** Postgres statt SQLite, `AUTH_SECRET` neu setzen, deployen – dann sind MCP und API auch für Cloud-Agenten erreichbar
