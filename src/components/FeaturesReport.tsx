import { useMemo, useState } from 'react';
import { ChevronDown, Loader2, Search, Layers, ClipboardList, Download } from 'lucide-react';
import type { QaseProject, QaseRun, QaseUser, Workspace } from '../types/qase';
import { useAllRuns } from '../hooks/useRuns';
import { useUsers } from '../hooks/useUsers';
import { useAllMilestones } from '../hooks/useMilestones';
import { ExternalIssueLink } from './ExternalIssueLink';
import { exportFeaturesCSV, exportFeaturesXLSX } from '../utils/exportFeatures';

interface Props {
  projects: QaseProject[];
  workspace: Workspace;
}

// ─── Metrics ──────────────────────────────────────────────────────────────────────────────

function executedOf(r: QaseRun): number {
  return r.stats.passed + r.stats.failed + r.stats.blocked + r.stats.skipped;
}

function passRateOf(passed: number, executed: number): number | null {
  return executed > 0 ? (passed / executed) * 100 : null;
}

function rateColor(rate: number | null): string {
  if (rate === null) return 'text-gray-400';
  if (rate >= 90) return 'text-green-600';
  if (rate >= 70) return 'text-yellow-600';
  return 'text-red-500';
}

function isOpenRun(r: QaseRun): boolean {
  return r.status_text === 'in_progress' || r.end_time === null;
}

export interface FeatureGroup {
  key: string;
  issue: QaseRun['external_issue'];
  runs: QaseRun[];
  total: number;
  executed: number;
  passed: number;
  failed: number;
  blocked: number;
  untested: number;
  passRate: number | null;
  firstStart: Date | null;
  lastStart: Date | null;
  open: boolean;
  environments: string[];
  report: string;
}

function fmtDate(d: Date | null): string {
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}

function buildReport(g: Omit<FeatureGroup, 'report'>): string {
  const n = g.runs.length;
  const parts: string[] = [];
  const envText = g.environments.length > 0 ? ` on ${g.environments.join(', ')}` : '';
  const range = g.firstStart && g.lastStart && g.firstStart.toDateString() !== g.lastStart.toDateString()
    ? `between ${fmtDate(g.firstStart)} and ${fmtDate(g.lastStart)}`
    : `on ${fmtDate(g.lastStart)}`;
  parts.push(`${n} test run${n !== 1 ? 's' : ''}${envText}, ${range}, covering ${g.total.toLocaleString()} test cases.`);

  if (g.passRate === null) {
    parts.push('No cases have been executed yet.');
  } else {
    parts.push(`${g.executed.toLocaleString()} of ${g.total.toLocaleString()} cases executed with a ${g.passRate.toFixed(1)}% pass rate.`);
  }

  if (g.failed > 0) {
    const worst = g.runs
      .filter((r) => r.stats.failed > 0)
      .sort((a, b) => b.stats.failed - a.stats.failed)[0];
    parts.push(`${g.failed.toLocaleString()} case${g.failed !== 1 ? 's' : ''} failed, most in "${worst.title}" (${worst.stats.failed}).`);
  } else if (g.executed > 0) {
    parts.push('No failures recorded.');
  }
  if (g.blocked > 0) parts.push(`${g.blocked.toLocaleString()} blocked.`);

  if (g.open || g.untested > 0) {
    const pending = g.untested;
    parts.push(
      g.open
        ? `Testing still in progress${pending > 0 ? `, ${pending.toLocaleString()} cases pending` : ''}.`
        : `${pending.toLocaleString()} cases left untested.`,
    );
  } else if (g.failed === 0 && (g.passRate ?? 0) >= 95) {
    parts.push('Testing completed and ready from a QA perspective.');
  } else if (g.failed > 0) {
    parts.push('Testing completed with open failures; needs follow-up before sign-off.');
  }
  return parts.join(' ');
}

function groupRuns(runs: QaseRun[]): { groups: FeatureGroup[]; ungrouped: QaseRun[] } {
  const map = new Map<string, QaseRun[]>();
  const ungrouped: QaseRun[] = [];
  for (const r of runs) {
    const id = r.external_issue?.id?.trim();
    if (!id) {
      ungrouped.push(r);
      continue;
    }
    map.set(id, [...(map.get(id) ?? []), r]);
  }

  const groups: FeatureGroup[] = [...map.entries()].map(([key, gruns]) => {
    const sorted = [...gruns].sort(
      (a, b) => new Date(b.start_time ?? 0).getTime() - new Date(a.start_time ?? 0).getTime(),
    );
    const starts = sorted
      .map((r) => (r.start_time ? new Date(r.start_time) : null))
      .filter((d): d is Date => d !== null);
    const sum = (f: (r: QaseRun) => number) => sorted.reduce((s, r) => s + f(r), 0);
    const executed = sum(executedOf);
    const passed = sum((r) => r.stats.passed);
    const base = {
      key,
      issue: sorted.find((r) => r.external_issue)?.external_issue,
      runs: sorted,
      total: sum((r) => r.stats.total),
      executed,
      passed,
      failed: sum((r) => r.stats.failed),
      blocked: sum((r) => r.stats.blocked),
      untested: sum((r) => r.stats.untested),
      passRate: passRateOf(passed, executed),
      firstStart: starts.length ? new Date(Math.min(...starts.map((d) => d.getTime()))) : null,
      lastStart: starts.length ? new Date(Math.max(...starts.map((d) => d.getTime()))) : null,
      open: sorted.some(isOpenRun),
      environments: [...new Set(sorted.map((r) => r.environment?.title).filter((e): e is string => !!e))],
    };
    return { ...base, report: buildReport(base) };
  });

  groups.sort((a, b) => (b.lastStart?.getTime() ?? 0) - (a.lastStart?.getTime() ?? 0));
  return { groups, ungrouped };
}

// ─── UI ───────────────────────────────────────────────────────────────────────────────────

function RunsTable({ runs, users }: { runs: QaseRun[]; users: QaseUser[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-400 border-b border-gray-100">
            <th className="text-left font-medium px-4 py-2">Test run</th>
            <th className="text-left font-medium px-2 py-2">Env</th>
            <th className="text-left font-medium px-2 py-2">Author</th>
            <th className="text-right font-medium px-2 py-2">Cases</th>
            <th className="text-right font-medium px-2 py-2 text-green-600">Passed</th>
            <th className="text-right font-medium px-2 py-2 text-red-500">Failed</th>
            <th className="text-right font-medium px-2 py-2">Untested</th>
            <th className="text-right font-medium px-4 py-2">Pass rate</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {runs.map((r) => {
            const rate = passRateOf(r.stats.passed, executedOf(r));
            const author = users.find((u) => u.id === r.user_id);
            return (
              <tr key={r.id} className="text-gray-700">
                <td className="px-4 py-2 max-w-md">
                  <div className="font-medium truncate" title={r.title}>{r.title}</div>
                  <div className="text-xs text-gray-400">
                    {r.start_time ? new Date(r.start_time).toLocaleDateString() : '—'}
                    {isOpenRun(r) && <span className="ml-2 text-violet-600 font-medium">in progress</span>}
                  </div>
                </td>
                <td className="px-2 py-2 text-xs text-gray-500 whitespace-nowrap">{r.environment?.title ?? '—'}</td>
                <td className="px-2 py-2 text-xs text-gray-500 whitespace-nowrap">{author?.name ?? '—'}</td>
                <td className="px-2 py-2 text-right">{r.stats.total}</td>
                <td className="px-2 py-2 text-right text-green-600">{r.stats.passed}</td>
                <td className="px-2 py-2 text-right text-red-500">{r.stats.failed || <span className="text-gray-300">0</span>}</td>
                <td className="px-2 py-2 text-right text-gray-500">{r.stats.untested || <span className="text-gray-300">0</span>}</td>
                <td className={`px-4 py-2 text-right font-semibold ${rateColor(rate)}`}>
                  {rate === null ? '—' : `${rate.toFixed(0)}%`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FeatureCard({ group, users }: { group: FeatureGroup; users: QaseUser[] }) {
  const [open, setOpen] = useState(false);
  const pct = (n: number) => (group.total > 0 ? `${(n / group.total) * 100}%` : '0%');

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left px-5 py-4 bg-gray-50 hover:bg-gray-100 transition-colors flex items-start gap-4"
      >
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <ExternalIssueLink issue={group.issue} />
            {group.open && (
              <span className="text-xs bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full font-medium">In progress</span>
            )}
            <span className="text-xs text-gray-400">
              {group.runs.length} run{group.runs.length !== 1 ? 's' : ''} · {fmtDate(group.lastStart)}
            </span>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <span className={`text-xl font-bold ${rateColor(group.passRate)}`}>
              {group.passRate === null ? '—' : `${group.passRate.toFixed(1)}%`}
            </span>
            <span className="text-xs text-gray-400">{group.executed.toLocaleString()} / {group.total.toLocaleString()} executed</span>
            {group.failed > 0 && <span className="text-xs text-red-500">{group.failed.toLocaleString()} failed</span>}
            {group.blocked > 0 && <span className="text-xs text-orange-500">{group.blocked.toLocaleString()} blocked</span>}
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden flex max-w-md">
            <div className="bg-green-500" style={{ width: pct(group.passed) }} />
            <div className="bg-red-400" style={{ width: pct(group.failed) }} />
            <div className="bg-orange-400" style={{ width: pct(group.blocked) }} />
          </div>
        </div>
        <ChevronDown size={16} className={`flex-shrink-0 text-gray-400 mt-1 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="divide-y divide-gray-100">
          <div className="px-5 py-3 bg-blue-50 border-l-4 border-blue-300">
            <p className="text-xs font-semibold text-blue-600 mb-1 uppercase tracking-wide">Summary</p>
            <p className="text-xs text-blue-800 leading-relaxed">{group.report}</p>
          </div>
          <RunsTable runs={group.runs} users={users} />
        </div>
      )}
    </div>
  );
}

function ProjectFeaturesSection({ project, token }: { project: QaseProject; token: string }) {
  const [milestoneId, setMilestoneId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [showUngrouped, setShowUngrouped] = useState(false);

  const totalRuns = project.counts.runs.total;
  const runsQuery = useAllRuns(token, project.code, '', totalRuns, totalRuns > 0);
  const usersQuery = useUsers(token);
  const milestonesQuery = useAllMilestones(token, project.code, true);
  const users = usersQuery.data?.result.entities ?? [];

  const milestones = useMemo(
    () => [...(milestonesQuery.data ?? [])].sort((a, b) =>
      new Date(b.due_date ?? b.created_at).getTime() - new Date(a.due_date ?? a.created_at).getTime()),
    [milestonesQuery.data],
  );

  const { groups, ungrouped, runCount } = useMemo(() => {
    let runs = runsQuery.data ?? [];
    const title = milestones.find((m) => m.id === milestoneId)?.title;
    if (title !== undefined) runs = runs.filter((r) => r.milestone?.title === title);
    const q = search.trim().toLowerCase();
    const res = groupRuns(runs);
    const groups = q
      ? res.groups.filter((g) => g.key.toLowerCase().includes(q) || g.runs.some((r) => r.title.toLowerCase().includes(q)))
      : res.groups;
    return { groups, ungrouped: res.ungrouped, runCount: runs.length };
  }, [runsQuery.data, milestoneId, milestones, search]);

  const linkedRuns = groups.reduce((s, g) => s + g.runs.length, 0);
  const totals = groups.reduce(
    (a, g) => ({ executed: a.executed + g.executed, passed: a.passed + g.passed }),
    { executed: 0, passed: 0 },
  );
  const overall = passRateOf(totals.passed, totals.executed);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        {milestones.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-gray-400 font-medium">
            Sprint / milestone:
            <select
              value={milestoneId ?? ''}
              onChange={(e) => setMilestoneId(e.target.value === '' ? null : Number(e.target.value))}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-violet-400"
            >
              <option value="">All runs</option>
              {milestones.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
            </select>
          </label>
        )}
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search issue or run…"
            className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 w-56"
          />
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => exportFeaturesCSV(groups, ungrouped, users, `${project.code}-features`)}
            disabled={groups.length === 0}
            title="Download CSV (one row per run)"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Download size={13} /> CSV
          </button>
          <button
            onClick={() => exportFeaturesXLSX(groups, ungrouped, users, `${project.code}-features`)}
            disabled={groups.length === 0}
            title="Download XLSX (Features + Test Runs sheets)"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-white bg-green-600 border border-green-600 rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Download size={13} /> XLSX
          </button>
        </div>
      </div>

      {runsQuery.isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-gray-400 text-sm">
          <Loader2 size={18} className="animate-spin" /> Loading runs…
        </div>
      )}

      {!runsQuery.isLoading && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Features / user stories', value: groups.length.toLocaleString(), sub: 'with linked test runs' },
              { label: 'Linked runs', value: linkedRuns.toLocaleString(), sub: `of ${runCount.toLocaleString()} runs analysed` },
              { label: 'Overall pass rate', value: overall === null ? '—' : `${overall.toFixed(1)}%`, sub: 'passed / executed' },
              { label: 'Runs without issue', value: ungrouped.length.toLocaleString(), sub: 'no External Issue linked' },
            ].map((t) => (
              <div key={t.label} className="rounded-xl border border-gray-200 px-4 py-3 flex flex-col gap-1">
                <span className="text-xs text-gray-400">{t.label}</span>
                <span className="text-xl font-bold text-gray-900">{t.value}</span>
                <span className="text-xs text-gray-400">{t.sub}</span>
              </div>
            ))}
          </div>

          {groups.length === 0 ? (
            <p className="text-center text-gray-400 py-12 text-sm">
              No test runs with an External Issue found{milestoneId !== null || search ? ' for the current filters' : ''}.
            </p>
          ) : (
            <div className="space-y-3">
              {groups.map((g) => <FeatureCard key={g.key} group={g} users={users} />)}
            </div>
          )}

          {ungrouped.length > 0 && (
            <div className="rounded-xl border border-dashed border-gray-300 overflow-hidden">
              <button
                onClick={() => setShowUngrouped((o) => !o)}
                className="w-full text-left px-5 py-3 flex items-center gap-3 hover:bg-gray-50"
              >
                <ClipboardList size={14} className="text-gray-400" />
                <span className="text-sm font-medium text-gray-600">Runs without External Issue</span>
                <span className="text-xs text-gray-400">{ungrouped.length}</span>
                <ChevronDown size={14} className={`ml-auto text-gray-400 transition-transform ${showUngrouped ? 'rotate-180' : ''}`} />
              </button>
              {showUngrouped && (
                <RunsTable
                  runs={[...ungrouped].sort((a, b) => new Date(b.start_time ?? 0).getTime() - new Date(a.start_time ?? 0).getTime()).slice(0, 100)}
                  users={users}
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function FeaturesReport({ projects, workspace }: Props) {
  const [selectedCode, setSelectedCode] = useState<string>(projects[0]?.code ?? '');
  const selected = projects.find((p) => p.code === selectedCode) ?? projects[0];

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <Layers size={15} className="text-violet-500" /> Test runs by feature / user story
        </h2>
        <p className="text-sm text-gray-400 mt-0.5">
          Runs grouped by their Jira External Issue, with pass rate and a short summary per feature.
          Pass rate = passed / executed cases. Based on the most recent 500 runs.
        </p>
      </div>

      {projects.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {projects.map((p) => (
            <button
              key={p.code}
              onClick={() => setSelectedCode(p.code)}
              className={[
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border',
                selectedCode === p.code
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50',
              ].join(' ')}
            >
              <span className={[
                'font-mono text-xs px-1 py-0.5 rounded',
                selectedCode === p.code ? 'bg-violet-500 text-white' : 'bg-violet-100 text-violet-700',
              ].join(' ')}>{p.code}</span>
              {p.title}
            </button>
          ))}
        </div>
      )}

      {selected && <ProjectFeaturesSection key={selected.code} project={selected} token={workspace.token} />}
    </div>
  );
}
