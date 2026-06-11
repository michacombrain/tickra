import { IssueDetail } from "@/components/issue/issue-detail";
import { IssueModal } from "@/components/issue/issue-modal";

export default async function IssueModalPage({
  params,
}: {
  params: Promise<{ key: string; issueKey: string }>;
}) {
  const { key, issueKey } = await params;
  return (
    <IssueModal>
      <IssueDetail projectKey={key} issueKey={issueKey} />
    </IssueModal>
  );
}
