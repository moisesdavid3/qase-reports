const KEY_RE = /^[A-Z][A-Z0-9_]{1,19}-\d{1,9}$/;
const MAX_KEYS = 50;

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  });
}

// Looks up Jira issue titles server-side so the Atlassian credentials never reach the browser.
export async function handleJiraIssues(request, env, fetchImpl = fetch) {
  const { JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN } = env;
  if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {
    return json({ error: 'Jira is not configured' }, 503);
  }

  const raw = new URL(request.url).searchParams.get('keys') ?? '';
  const keys = [...new Set(raw.split(',').map((k) => k.trim().toUpperCase()).filter(Boolean))];
  if (keys.length === 0) return json({ issues: {} });
  if (keys.length > MAX_KEYS || !keys.every((k) => KEY_RE.test(k))) {
    return json({ error: 'Invalid keys' }, 400);
  }

  const params = new URLSearchParams({
    jql: `key in (${keys.join(',')})`,
    fields: 'summary,issuetype,status',
    maxResults: String(MAX_KEYS),
  });
  const base = JIRA_BASE_URL.replace(/\/+$/, '');
  const res = await fetchImpl(`${base}/rest/api/3/search/jql?${params}`, {
    headers: {
      Authorization: `Basic ${btoa(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`)}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) return json({ error: `Jira responded ${res.status}` }, 502);

  const data = await res.json();
  const issues = {};
  for (const i of data.issues ?? []) {
    issues[i.key] = {
      summary: i.fields?.summary ?? '',
      type: i.fields?.issuetype?.name ?? '',
      status: i.fields?.status?.name ?? '',
    };
  }
  return json({ issues }, 200, { 'Cache-Control': 'private, max-age=300' });
}
