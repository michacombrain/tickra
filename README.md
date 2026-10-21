# Tickra – Jira-Klon (lokaler Prototyp)

Projektmanagement-Tool im Stil von Jira: Projekte, Sprints, Kanban-Board mit Drag & Drop, Tickets mit Kommentaren, Labels und Benutzerkonten.

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
src/lib/actions/              Server Actions (auth, projects, issues, sprints)
src/lib/access.ts             Projekt-Zugriffsprüfung
src/app/(auth)/               Login & Registrierung
src/app/(app)/projects/       Projektübersicht, Board, Backlog, Settings, Ticket-Seiten
src/app/(app)/my-issues/      Meine Tickets
src/app/(app)/account/        Konto-Einstellungen
src/components/board/         Kanban-Board (DnD)
src/components/issue/         Ticket-Detail, Side-Panel, Kommentare
```

## Später erweitern

Hosting + Mehrbenutzer-Betrieb: Prisma-Datasource auf Postgres umstellen, `AUTH_SECRET` neu setzen, deployen (z.B. Vercel + Neon). Echtzeit-Sync, Berichte/Burndown, Aktivitätsverlauf und Datei-Anhänge sind bewusst noch nicht enthalten.
