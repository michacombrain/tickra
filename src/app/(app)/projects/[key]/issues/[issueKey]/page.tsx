import { IssueDetail } from "@/components/issue/issue-detail";

export default async function IssuePage({
  params,
}: {
  params: Promise<{ key: string; issueKey: string }>;
}) {
  const { key, issueKey } = await params;
  return (
    <div className="mx-auto max-w-4xl">
      <IssueDetail projectKey={key} issueKey={issueKey} />
    </div>
  );
}
