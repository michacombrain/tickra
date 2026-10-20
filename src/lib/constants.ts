export const ISSUE_STATUSES = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const STATUS_LABELS: Record<IssueStatus, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Arbeit",
  IN_REVIEW: "In Review",
  DONE: "Fertig",
};

export const ISSUE_TYPES = ["STORY", "TASK", "BUG", "EPIC"] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

export const TYPE_LABELS: Record<IssueType, string> = {
  STORY: "Story",
  TASK: "Aufgabe",
  BUG: "Bug",
  EPIC: "Epic",
};

export const ISSUE_PRIORITIES = ["HIGHEST", "HIGH", "MEDIUM", "LOW", "LOWEST"] as const;
export type IssuePriority = (typeof ISSUE_PRIORITIES)[number];

export const PRIORITY_LABELS: Record<IssuePriority, string> = {
  HIGHEST: "Sehr hoch",
  HIGH: "Hoch",
  MEDIUM: "Mittel",
  LOW: "Niedrig",
  LOWEST: "Sehr niedrig",
};

export const SPRINT_STATUSES = ["PLANNED", "ACTIVE", "COMPLETED"] as const;
export type SprintStatus = (typeof SPRINT_STATUSES)[number];

export const SPRINT_STATUS_LABELS: Record<SprintStatus, string> = {
  PLANNED: "Geplant",
  ACTIVE: "Aktiv",
  COMPLETED: "Abgeschlossen",
};

export const STORY_POINT_OPTIONS = [1, 2, 3, 5, 8, 13, 21] as const;
