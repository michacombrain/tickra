/** Baut den Arbeitsauftrag für einen Agenten aus dem Ticket und seinen Zwischenständen. */

export type Task = {
  key: string;
  title: string;
  description: string | null;
  type: string;
  priority: string;
  branch: string | null;
  checklist: { text: string; done: boolean }[];
  checkpoints: {
    kind: string;
    author: { name: string };
    summary: string;
    nextSteps: string | null;
    sessionId: string | null;
    createdAt: string;
  }[];
  comments: { author: { name: string; kind: string }; body: string; createdAt: string }[];
};

export function buildPrompt(
  task: Task,
  context: { resumed: boolean; takenOverFrom: string | null; branch: string | null; worktree: boolean }
) {
  const lines: string[] = [
    `Du arbeitest am Tickra-Ticket ${task.key}: ${task.title}`,
    "",
    "## Beschreibung",
    task.description?.trim() || "(keine Beschreibung)",
  ];

  if (task.checklist.length) {
    lines.push("", "## Akzeptanzkriterien");
    task.checklist.forEach((item, index) => lines.push(`${index + 1}. [${item.done ? "x" : " "}] ${item.text}`));
  }

  if (task.checkpoints.length) {
    lines.push(
      "",
      "## Bisheriger Stand (neuester Zwischenstand zuerst)",
      context.takenOverFrom
        ? `Du übernimmst dieses Ticket von ${context.takenOverFrom}. Setze dort an, wo die Arbeit unterbrochen wurde – fang NICHT von vorne an.`
        : "An diesem Ticket wurde bereits gearbeitet. Setze am letzten Stand an – fang NICHT von vorne an."
    );
    for (const checkpoint of task.checkpoints.slice(0, 4)) {
      lines.push("", `### ${checkpoint.author.name}, ${checkpoint.createdAt} (${checkpoint.kind})`, checkpoint.summary);
      if (checkpoint.nextSteps) lines.push("Nächste Schritte:", checkpoint.nextSteps);
    }
  }

  // Rückmeldungen von Menschen (z.B. nach "Nachbessern") sind verbindlich
  const feedback = task.comments.filter((comment) => comment.author.kind !== "AGENT").slice(-5);
  if (feedback.length) {
    lines.push("", "## Rückmeldungen aus dem Team");
    for (const comment of feedback) lines.push(`- ${comment.author.name}: ${comment.body}`);
  }

  lines.push("", "## Regeln");
  if (context.branch) {
    lines.push(
      context.worktree
        ? `- Du befindest dich in einem eigenen Git-Worktree auf dem Branch \`${context.branch}\`. Arbeite nur hier.`
        : `- Arbeite auf dem Branch \`${context.branch}\`.`,
      "- Committe nach jedem sinnvollen Teilschritt (kleine Commits). Uncommittete Arbeit kann bei einer Unterbrechung verloren gehen."
    );
  }
  lines.push(
    `- Speichere nach JEDEM Teilschritt einen Zwischenstand mit dem Tickra-Tool save_checkpoint (issue="${task.key}"): was erledigt ist, welche Entscheidungen du getroffen hast und was als Nächstes kommt. Du kannst jederzeit ohne Vorwarnung unterbrochen werden.`,
    "- Hake erfüllte Akzeptanzkriterien mit check_item ab.",
    "- Wenn alles erledigt und getestet ist: submit_for_review mit einer Zusammenfassung. Setze das Ticket nicht selbst auf DONE.",
    "- Wenn du nicht weiterkommst (unklare Anforderung, fehlender Zugang): release_issue mit Begründung und needsHuman=true.",
    "- Bleib beim Umfang dieses Tickets. Fällt dir weitere Arbeit auf, lege mit create_issue ein neues Ticket an."
  );
  return lines.join("\n");
}

export function buildResumePrompt(task: Task) {
  return [
    `Du wurdest bei der Arbeit an ${task.key} unterbrochen (Nutzungslimit oder Neustart). Es kann jetzt weitergehen.`,
    `Prüfe mit git status und dem Tickra-Tool get_issue (issue="${task.key}") den aktuellen Stand und setze die Arbeit fort.`,
    "Speichere weiterhin nach jedem Teilschritt einen Zwischenstand mit save_checkpoint und schließe mit submit_for_review ab.",
  ].join("\n");
}
