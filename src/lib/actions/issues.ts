"use server";

import { requireProjectAccess } from "@/lib/access";
import type { ServiceContext, ServiceResult } from "@/lib/services/context";
import * as issues from "@/lib/services/issues";

export type FormState = { error?: string } | undefined;

async function uiContext(projectKey: string): Promise<ServiceContext> {
  const { user, project, isAdmin } = await requireProjectAccess(projectKey);
  return { user, project, isAdmin, via: "UI" };
}

function toFormState(result: ServiceResult<unknown>): FormState {
  return result.ok ? undefined : { error: result.error };
}

/** UI-Formulare arbeiten mit IDs (assigneeId/sprintId) – der Service nimmt assignee/sprint. */
function mapUiFields(input: Record<string, unknown>) {
  const { assigneeId, sprintId, ...rest } = input;
  return {
    ...rest,
    ...(assigneeId !== undefined ? { assignee: assigneeId } : {}),
    ...(sprintId !== undefined ? { sprint: sprintId } : {}),
  };
}

export async function createIssueAction(
  projectKey: string,
  input: Record<string, unknown>
): Promise<{ error?: string; key?: string }> {
  const result = await issues.createIssue(await uiContext(projectKey), mapUiFields(input));
  return result.ok ? { key: result.data.key } : { error: result.error };
}

export async function updateIssueAction(
  projectKey: string,
  issueKey: string,
  input: Record<string, unknown>
): Promise<FormState> {
  return toFormState(await issues.updateIssue(await uiContext(projectKey), issueKey, mapUiFields(input)));
}

/** Verschiebt ein Ticket auf dem Board (Statuswechsel + neue Position). */
export async function moveIssueAction(
  projectKey: string,
  issueKey: string,
  status: string,
  order: number
): Promise<FormState> {
  return toFormState(await issues.moveIssue(await uiContext(projectKey), issueKey, status, order));
}

export async function deleteIssueAction(projectKey: string, issueKey: string): Promise<FormState> {
  return toFormState(await issues.deleteIssue(await uiContext(projectKey), issueKey));
}

export async function toggleIssueLabelAction(
  projectKey: string,
  issueKey: string,
  labelId: string
): Promise<FormState> {
  return toFormState(await issues.toggleIssueLabel(await uiContext(projectKey), issueKey, labelId));
}

export async function addCommentAction(
  projectKey: string,
  issueKey: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  return toFormState(await issues.addComment(await uiContext(projectKey), issueKey, formData.get("body") ?? ""));
}

export async function updateCommentAction(
  projectKey: string,
  commentId: string,
  body: string
): Promise<FormState> {
  return toFormState(await issues.updateComment(await uiContext(projectKey), commentId, body));
}

export async function deleteCommentAction(projectKey: string, commentId: string): Promise<FormState> {
  return toFormState(await issues.deleteComment(await uiContext(projectKey), commentId));
}
