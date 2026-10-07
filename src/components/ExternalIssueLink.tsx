import { ExternalLink } from 'lucide-react';
import type { QaseExternalIssue } from '../types/qase';

export function ExternalIssueLink({ issue }: { issue: QaseExternalIssue | null | undefined }) {
  if (!issue?.id) return null;
  const chip = 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-medium';
  if (issue.link && /^https?:\/\//i.test(issue.link)) {
    return (
      <a
        href={issue.link}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={`${chip} hover:bg-blue-100`}
        title={`Open ${issue.id} (${issue.type})`}
      >
        {issue.id}
        <ExternalLink size={10} />
      </a>
    );
  }
  return <span className={chip} title={issue.type}>{issue.id}</span>;
}
