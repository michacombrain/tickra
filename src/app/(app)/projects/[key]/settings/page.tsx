import { requireProjectAccess } from "@/lib/access";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserAvatar } from "@/components/user-avatar";
import { AddMemberForm, CreateLabelForm, DeleteLabelButton, RemoveMemberButton } from "@/components/settings-forms";
import { LabelBadge } from "@/components/issue-badges";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const { project } = await requireProjectAccess(key);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Einstellungen</h1>
        <p className="text-sm text-muted-foreground">
          {project.name} ({project.key})
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mitglieder</CardTitle>
          <CardDescription>Wer Zugriff auf dieses Projekt hat.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="divide-y">
            {project.members.map((member) => (
              <li key={member.userId} className="flex items-center gap-3 py-2">
                <UserAvatar name={member.user.name} color={member.user.avatarColor} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{member.user.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{member.user.email}</div>
                </div>
                <Badge variant={member.role === "ADMIN" ? "default" : "secondary"}>
                  {member.role === "ADMIN" ? "Admin" : "Mitglied"}
                </Badge>
                {member.userId !== project.ownerId && (
                  <RemoveMemberButton projectKey={project.key} userId={member.userId} />
                )}
              </li>
            ))}
          </ul>
          <AddMemberForm projectKey={project.key} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Labels</CardTitle>
          <CardDescription>Labels zum Kategorisieren von Tickets.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {project.labels.length === 0 && (
              <span className="text-sm text-muted-foreground">Noch keine Labels.</span>
            )}
            {project.labels.map((label) => (
              <span key={label.id} className="inline-flex items-center gap-1">
                <LabelBadge name={label.name} color={label.color} />
                <DeleteLabelButton projectKey={project.key} labelId={label.id} />
              </span>
            ))}
          </div>
          <CreateLabelForm projectKey={project.key} />
        </CardContent>
      </Card>
    </div>
  );
}
