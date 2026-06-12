# Tickra – Jira-Klon (lokaler Prototyp)

Projektmanagement-Tool im Stil von Jira: Projekte, Sprints, Kanban-Board mit Drag & Drop, Tickets mit Kommentaren, Labels und Benutzerkonten.

## Starten

```bash
npm install
npx prisma migrate dev   # Datenbank anlegen (SQLite, prisma/dev.db)
npx tsx prisma/seed.ts   # Demo-Daten einspielen
npm run dev              # http://localhost:3000
```

**Demo-Logins** (Passwort jeweils `demo1234`):
- micha@firma.de · anna@firma.de · tom@firma.de

## Funktionen

- **Login & Registrierung** – Auth.js (Credentials + bcrypt), alle Seiten geschützt
- **Projekte** – mehrere Projekte mit Key (z.B. `WEB`), Mitgliedern und Labels
- **Backlog & Sprints** – Tickets inline erstellen, in Sprints verschieben, Sprint starten/abschließen (offene Tickets wandern zurück ins Backlog)
- **Kanban-Board** – 4 Spalten (To Do / In Arbeit / In Review / Fertig), Drag & Drop per @dnd-kit, Filter nach zugewiesener Person
- **Ticket-Detail** – öffnet als Modal über dem Board (Intercepting Route) oder als eigene Seite; Titel, Beschreibung, Status, Priorität, Typ, Assignee und Labels editierbar; Kommentar-Thread
- **Suche** – Topbar-Suche über Ticket-Titel und -Keys

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
src/components/board/         Kanban-Board (DnD)
src/components/issue/         Ticket-Detail, Side-Panel, Kommentare
```

## Später erweitern

Hosting + Mehrbenutzer-Betrieb: Prisma-Datasource auf Postgres umstellen, `AUTH_SECRET` neu setzen, deployen (z.B. Vercel + Neon). Echtzeit-Sync, Berichte/Burndown und Datei-Anhänge sind bewusst noch nicht enthalten.
