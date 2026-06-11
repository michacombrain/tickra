import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await bcrypt.hash("demo1234", 10);

  const micha = await prisma.user.upsert({
    where: { email: "micha@firma.de" },
    update: {},
    create: { name: "Micha Hesser", email: "micha@firma.de", passwordHash, avatarColor: "#2563eb" },
  });
  const anna = await prisma.user.upsert({
    where: { email: "anna@firma.de" },
    update: {},
    create: { name: "Anna Schmidt", email: "anna@firma.de", passwordHash, avatarColor: "#16a34a" },
  });
  const tom = await prisma.user.upsert({
    where: { email: "tom@firma.de" },
    update: {},
    create: { name: "Tom Weber", email: "tom@firma.de", passwordHash, avatarColor: "#d97706" },
  });

  const existing = await prisma.project.findUnique({ where: { key: "WEB" } });
  if (existing) {
    console.log("Seed übersprungen – Projekt WEB existiert bereits.");
    return;
  }

  const project = await prisma.project.create({
    data: {
      key: "WEB",
      name: "Website Relaunch",
      description: "Relaunch der Firmenwebsite inkl. neuem Shop und CMS-Migration.",
      ownerId: micha.id,
      members: {
        create: [
          { userId: micha.id, role: "ADMIN" },
          { userId: anna.id, role: "MEMBER" },
          { userId: tom.id, role: "MEMBER" },
        ],
      },
      labels: {
        create: [
          { name: "Frontend", color: "#3b82f6" },
          { name: "Backend", color: "#8b5cf6" },
          { name: "Design", color: "#ec4899" },
          { name: "Dringend", color: "#ef4444" },
        ],
      },
    },
    include: { labels: true },
  });

  const labelByName = Object.fromEntries(project.labels.map((l) => [l.name, l.id]));

  const sprint1 = await prisma.sprint.create({
    data: {
      projectId: project.id,
      name: "Sprint 1",
      goal: "Grundgerüst der neuen Website steht",
      status: "ACTIVE",
      startDate: new Date(Date.now() - 7 * 24 * 3600 * 1000),
      endDate: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    },
  });
  const sprint2 = await prisma.sprint.create({
    data: { projectId: project.id, name: "Sprint 2", goal: "Shop-Integration", status: "PLANNED" },
  });

  type SeedIssue = {
    title: string;
    type: string;
    status: string;
    priority: string;
    sprintId: string | null;
    assigneeId: string | null;
    description?: string;
    labels?: string[];
  };

  const issues: SeedIssue[] = [
    { title: "Navigation: Responsive Menü implementieren", type: "STORY", status: "IN_PROGRESS", priority: "HIGH", sprintId: sprint1.id, assigneeId: micha.id, description: "Das Hauptmenü soll auf Mobile als Burger-Menü erscheinen.\n\n**Akzeptanzkriterien:**\n- Breakpoint bei 768px\n- Animation beim Öffnen\n- Tastatur-navigierbar", labels: ["Frontend"] },
    { title: "Login-Seite stylen", type: "TASK", status: "TODO", priority: "MEDIUM", sprintId: sprint1.id, assigneeId: anna.id, labels: ["Frontend", "Design"] },
    { title: "Bug: Footer überlappt Inhalt auf Safari", type: "BUG", status: "TODO", priority: "HIGHEST", sprintId: sprint1.id, assigneeId: tom.id, description: "Auf Safari 17 überlappt der Footer den Hauptinhalt bei kurzen Seiten.", labels: ["Frontend", "Dringend"] },
    { title: "API-Endpunkt für Produktliste", type: "STORY", status: "IN_REVIEW", priority: "HIGH", sprintId: sprint1.id, assigneeId: micha.id, labels: ["Backend"] },
    { title: "Datenbank-Schema für Bestellungen", type: "TASK", status: "DONE", priority: "HIGH", sprintId: sprint1.id, assigneeId: tom.id, labels: ["Backend"] },
    { title: "Hero-Sektion: Animationen einbauen", type: "TASK", status: "IN_PROGRESS", priority: "LOW", sprintId: sprint1.id, assigneeId: anna.id, labels: ["Design"] },
    { title: "SEO: Meta-Tags für alle Seiten", type: "TASK", status: "TODO", priority: "MEDIUM", sprintId: sprint1.id, assigneeId: null },
    { title: "CI/CD-Pipeline aufsetzen", type: "TASK", status: "DONE", priority: "MEDIUM", sprintId: sprint1.id, assigneeId: micha.id, labels: ["Backend"] },
    { title: "Warenkorb-Funktionalität", type: "STORY", status: "TODO", priority: "HIGHEST", sprintId: sprint2.id, assigneeId: null, description: "Als Kunde möchte ich Produkte in den Warenkorb legen können.", labels: ["Frontend", "Backend"] },
    { title: "Checkout mit Stripe", type: "STORY", status: "TODO", priority: "HIGH", sprintId: sprint2.id, assigneeId: null, labels: ["Backend"] },
    { title: "Produktdetailseite designen", type: "TASK", status: "TODO", priority: "MEDIUM", sprintId: sprint2.id, assigneeId: anna.id, labels: ["Design"] },
    { title: "Newsletter-Anmeldung im Footer", type: "TASK", status: "TODO", priority: "LOWEST", sprintId: null, assigneeId: null },
    { title: "Bug: Umlaute in URLs falsch kodiert", type: "BUG", status: "TODO", priority: "MEDIUM", sprintId: null, assigneeId: null, labels: ["Backend"] },
    { title: "Dark Mode unterstützen", type: "STORY", status: "TODO", priority: "LOW", sprintId: null, assigneeId: null, labels: ["Frontend", "Design"] },
    { title: "Performance: Bilder auf WebP umstellen", type: "TASK", status: "TODO", priority: "LOW", sprintId: null, assigneeId: null },
    { title: "CMS-Migration: Inhalte übertragen", type: "EPIC", status: "TODO", priority: "HIGH", sprintId: null, assigneeId: null, description: "Alle Inhalte aus dem alten CMS in das neue System übertragen." },
  ];

  let counter = 0;
  for (const issue of issues) {
    counter += 1;
    const created = await prisma.issue.create({
      data: {
        key: `WEB-${counter}`,
        title: issue.title,
        description: issue.description ?? null,
        type: issue.type,
        status: issue.status,
        priority: issue.priority,
        order: counter,
        projectId: project.id,
        sprintId: issue.sprintId,
        assigneeId: issue.assigneeId,
        reporterId: micha.id,
      },
    });
    for (const labelName of issue.labels ?? []) {
      await prisma.issueLabel.create({
        data: { issueId: created.id, labelId: labelByName[labelName] },
      });
    }
  }
  await prisma.project.update({ where: { id: project.id }, data: { issueCounter: counter } });

  await prisma.comment.createMany({
    data: [
      {
        issueId: (await prisma.issue.findUnique({ where: { key: "WEB-1" } }))!.id,
        authorId: anna.id,
        body: "Denk dran, dass das Menü auch mit Screenreadern funktionieren muss!",
      },
      {
        issueId: (await prisma.issue.findUnique({ where: { key: "WEB-3" } }))!.id,
        authorId: micha.id,
        body: "Kann ich reproduzieren – liegt vermutlich am position: fixed im Footer.",
      },
    ],
  });

  console.log("Seed abgeschlossen: 3 User, 1 Projekt, 2 Sprints, 16 Tickets.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
