import Link from "next/link";
import { requireProjectAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { ISSUE_PRIORITIES, IssuePriority, IssueType } from "@/lib/constants";
import { relativeTime } from "@/lib/format";
import { claimedBySelect, workState } from "@/lib/services/claim";
import { PriorityIcon, TypeIcon } from "@/components/issue-badges";
import { UserAvatar } from "@/components/user-avatar";
import { describeWork, WorkIcon } from "@/components/issue/work-status";
import { ClearLimitButton, ReviewButtons } from "@/components/agents/agent-buttons";

const timeFormat = new Intl.DateTimeFormat("de-DE", { weekday: "short", hour: "2-digit", minute: "2-digit" });

function Section({ title, hint, count, children }: { title: string; hint: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
        <span className="hidden text-xs text-muted-foreground sm:inline">· {hint}</span>
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">{children}</p>;
}

export default async function AgentsPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const { project, isAdmin } = await requireProjectAccess(key);
  const now = new Date();

  const agentIds = project.members.filter((m) => m.user.kind === "AGENT").map((m) => m.userId);
  const [agents, issues] = await Promise.all([
    db.user.findMany({
      where: { id: { in: agentIds } },
      select: {
        id: true,
        name: true,
        avatarColor: true,
        limitedUntil: true,
        limitNote: true,
        apiKeys: { where: { revokedAt: null }, select: { lastUsedAt: true } },
      },
      orderBy: { name: "asc" },
    }),
    db.issue.findMany({
      where: {
        projectId: project.id,
        status: { not: "DONE" },
        OR: [{ agentReady: true }, { claimedById: { not: null } }, { status: "IN_REVIEW" }],
      },
      include: {
        claimedBy: claimedBySelect,
        assignee: { select: { name: true, avatarColor: true, kind: true } },
        sprint: { select: { name: true, status: true } },
        checkpoints: { orderBy: { createdAt: "desc" }, take: 1, select: { summary: true, createdAt: true } },
        _count: { select: { checklist: true } },
        checklist: { where: { done: true }, select: { id: true } },
      },
      orderBy: { order: "asc" },
    }),
  ]);

  const withWork = issues.map((issue) => ({ issue, work: workState(issue, now) }));
  const active = withWork.filter(({ work, issue }) => work.state !== "FREE" && issue.status !== "IN_REVIEW");
  const review = withWork.filter(({ issue }) => issue.status === "IN_REVIEW");
  const rank = (priority: string) => (ISSUE_PRIORITIES as readonly string[]).indexOf(priority);
  const queue = withWork
    .filter(({ work, issue }) => work.state === "FREE" && issue.agentReady && issue.status === "TODO")
    .sort(
      (a, b) =>
        Number(b.issue.sprint?.status === "ACTIVE") - Number(a.issue.sprint?.status === "ACTIVE") ||
        rank(a.issue.priority) - rank(b.issue.priority) ||
        a.issue.order - b.issue.order
    );

  type Row = (typeof withWork)[number];
  const IssueRow = ({ issue, work, position, children }: Row & { position?: number; children?: React.ReactNode }) => (
    <li className="flex items-center gap-3 px-3 py-2">
      {position !== undefined && (
        <span className="w-4 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{position}</span>
      )}
      <WorkIcon work={work} />
      <TypeIcon type={issue.type as IssueType} className="size-3.5" />
      <span className="w-16 shrink-0 font-mono text-[11px] text-muted-foreground">{issue.key}</span>
      <div className="min-w-0 flex-1">
        <Link href={`/projects/${project.key}/issues/${issue.key}`} className="block truncate text-sm hover:underline">
          {issue.title}
        </Link>
        {work.state !== "FREE" && (
          <div className="truncate text-xs text-muted-foreground" suppressHydrationWarning>
            {describeWork(work)}
            {issue.checkpoints[0] && ` · letzter Zwischenstand ${relativeTime(issue.checkpoints[0].createdAt)}`}
          </div>
        )}
        {work.state === "FREE" && issue.checkpoints[0] && (
          <div className="truncate text-xs text-muted-foreground">{issue.checkpoints[0].summary}</div>
        )}
      </div>
      {issue._count.checklist > 0 && (
        <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:inline" title="Akzeptanzkriterien">
          {issue.checklist.length}/{issue._count.checklist}
        </span>
      )}
      {issue.sprint && (
        <span className="hidden shrink-0 text-xs text-muted-foreground lg:inline">{issue.sprint.name}</span>
      )}
      <PriorityIcon priority={issue.priority as IssuePriority} className="size-3.5" />
      {children}
    </li>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Agenten</h1>
        <p className="text-sm text-muted-foreground">
          Freigegebene Tickets werden automatisch verteilt. Erreicht ein Agent sein Nutzungslimit, pausiert die Arbeit
          und geht später am letzten Zwischenstand weiter.
        </p>
      </div>

      {agents.length === 0 ? (
        <Empty>
          Noch keine Agenten.{" "}
          <Link href={`/projects/${project.key}/settings`} className="underline underline-offset-4">
            In den Einstellungen anlegen
          </Link>
        </Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {agents.map((agent) => {
            const limited = agent.limitedUntil && agent.limitedUntil > now;
            const working = active.filter(({ work }) => work.by?.id === agent.id && work.state === "RUNNING");
            const lastUsed = agent.apiKeys
              .map((k) => k.lastUsedAt)
              .filter((d): d is Date => d !== null)
              .sort((a, b) => b.getTime() - a.getTime())[0];
            return (
              <div key={agent.id} className="rounded-xl border p-4">
                <div className="flex items-center gap-2.5">
                  <UserAvatar name={agent.name} color={agent.avatarColor} kind="AGENT" className="size-8" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{agent.name}</div>
                    <div className="truncate text-xs text-muted-foreground" suppressHydrationWarning>
                      {lastUsed ? `zuletzt aktiv ${relativeTime(lastUsed)}` : "noch nie verbunden"}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium">
                    {limited ? "Pausiert" : working.length ? "Arbeitet" : "Frei"}
                  </span>
                </div>
                <div className="mt-3 text-sm">
                  {limited ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground" suppressHydrationWarning>
                        Nutzungslimit – weiter ab{" "}
                        <span className="font-medium text-foreground">{timeFormat.format(agent.limitedUntil!)}</span>
                      </span>
                      {isAdmin && <ClearLimitButton projectKey={project.key} agentId={agent.id} />}
                    </div>
                  ) : working.length ? (
                    working.map(({ issue }) => (
                      <Link
                        key={issue.key}
                        href={`/projects/${project.key}/issues/${issue.key}`}
                        className="block truncate hover:underline"
                      >
                        <span className="font-mono text-xs text-muted-foreground">{issue.key}</span> {issue.title}
                      </Link>
                    ))
                  ) : (
                    <span className="text-muted-foreground">Wartet auf Aufgaben</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Section title="Wartet auf deine Freigabe" hint="Agenten können Tickets nicht selbst abschließen" count={review.length}>
        {review.length === 0 ? (
          <Empty>Nichts zu prüfen.</Empty>
        ) : (
          <ul className="divide-y rounded-xl border">
            {review.map((row) => (
              <IssueRow key={row.issue.key} {...row}>
                <ReviewButtons projectKey={project.key} issueKey={row.issue.key} />
              </IssueRow>
            ))}
          </ul>
        )}
      </Section>

      <Section title="In Arbeit" hint="läuft, pausiert oder unterbrochen" count={active.length}>
        {active.length === 0 ? (
          <Empty>Gerade arbeitet kein Agent.</Empty>
        ) : (
          <ul className="divide-y rounded-xl border">
            {active.map((row) => (
              <IssueRow key={row.issue.key} {...row} />
            ))}
          </ul>
        )}
      </Section>

      <Section title="Warteschlange" hint="aktiver Sprint zuerst, dann nach Priorität" count={queue.length}>
        {queue.length === 0 ? (
          <Empty>
            Leer. Öffne ein Ticket und aktiviere „Für Agenten freigeben“, damit es automatisch verteilt wird.
          </Empty>
        ) : (
          <ul className="divide-y rounded-xl border">
            {queue.map((row, index) => (
              <IssueRow key={row.issue.key} {...row} position={index + 1} />
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
