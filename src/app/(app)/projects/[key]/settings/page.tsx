import { requireProjectAccess } from "@/lib/access";
import { UserAvatar } from "@/components/user-avatar";
import {
  AddMemberForm,
  CreateLabelForm,
  DeleteLabelButton,
  DeleteProjectButton,
  LeaveProjectButton,
  MemberRoleSelect,
  ProjectDetailsForm,
  RemoveMemberButton,
} from "@/components/settings-forms";
import { LabelBadge } from "@/components/issue-badges";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4 border-t py-8 first:border-t-0 first:pt-0 md:grid-cols-[200px_1fr]">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </section>
  );
}

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const { user, project, isAdmin } = await requireProjectAccess(key);
  const isOwner = project.ownerId === user.id;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <h1 className="text-lg font-semibold tracking-tight">Einstellungen</h1>
        <p className="text-sm text-muted-foreground">
          {project.name} · <span className="font-mono">{project.key}</span>
          {!isAdmin && " · Nur Admins können Einstellungen ändern."}
        </p>
      </div>

      {isAdmin && (
        <Section title="Projekt" description="Name und Beschreibung. Der Key kann nicht geändert werden.">
          <ProjectDetailsForm projectKey={project.key} name={project.name} description={project.description} />
        </Section>
      )}

      <Section title="Mitglieder" description="Wer Zugriff auf dieses Projekt hat.">
        <ul className="divide-y rounded-lg border">
          {project.members.map((member) => (
            <li key={member.userId} className="flex items-center gap-3 px-3 py-2">
              <UserAvatar name={member.user.name} color={member.user.avatarColor} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {member.user.name}
                  {member.userId === user.id && <span className="font-normal text-muted-foreground"> (du)</span>}
                </div>
                <div className="truncate text-xs text-muted-foreground">{member.user.email}</div>
              </div>
              {member.userId === project.ownerId ? (
                <span className="text-xs text-muted-foreground">Owner</span>
              ) : isAdmin ? (
                <>
                  <MemberRoleSelect projectKey={project.key} userId={member.userId} role={member.role} />
                  <RemoveMemberButton projectKey={project.key} userId={member.userId} name={member.user.name} />
                </>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {member.role === "ADMIN" ? "Admin" : "Mitglied"}
                </span>
              )}
            </li>
          ))}
        </ul>
        {isAdmin && <AddMemberForm projectKey={project.key} />}
      </Section>

      <Section title="Labels" description="Zum Kategorisieren von Tickets.">
        <div className="flex flex-wrap gap-2">
          {project.labels.length === 0 && (
            <span className="text-sm text-muted-foreground">Noch keine Labels.</span>
          )}
          {project.labels.map((label) => (
            <span key={label.id} className="inline-flex items-center gap-1">
              <LabelBadge name={label.name} color={label.color} />
              {isAdmin && <DeleteLabelButton projectKey={project.key} labelId={label.id} name={label.name} />}
            </span>
          ))}
        </div>
        {isAdmin && <CreateLabelForm projectKey={project.key} />}
      </Section>

      <Section
        title="Gefahrenzone"
        description={isOwner ? "Endgültige Aktionen für dieses Projekt." : "Dein Zugang zu diesem Projekt."}
      >
        <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">
            {isOwner
              ? "Löscht das Projekt mit allen Tickets, Sprints und Kommentaren."
              : "Du verlierst den Zugriff; deine zugewiesenen Tickets werden freigegeben."}
          </p>
          {isOwner ? (
            <DeleteProjectButton projectKey={project.key} name={project.name} />
          ) : (
            <LeaveProjectButton projectKey={project.key} />
          )}
        </div>
      </Section>
    </div>
  );
}
