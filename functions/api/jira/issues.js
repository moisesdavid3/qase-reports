import { handleJiraIssues } from '../../_lib/jira.js';

export function onRequestGet(context) {
  return handleJiraIssues(context.request, context.env);
}
