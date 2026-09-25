import { useState, useMemo } from 'react';
import {
  Loader2, ChevronDown, TrendingUp, TrendingDown, Minus,
  CheckCircle2, XCircle, AlertCircle, Clock, Users, Play, BarChart2,
} from 'lucide-react';
import type { QaseProject, QaseRun, QaseUser, Workspace } from '../types/qase';
import { useAllRuns } from '../hooks/useRuns';
import { useUsers } from '../hooks/useUsers';

interface Props {
  projects: QaseProject[];
  workspace: Workspace;
}

interface WeekData {
  weekKey: string;
  label: string;
  isCurrentWeek: boolean;
  runs: QaseRun[];
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  invalid: number;
  passRate: number;
  delta: number | null;
  analysis: string;
  topAreas: string[];
}

// ─── ISO week helpers (duplicated from AutomationReport to keep files independent) ────────

function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function weekLabel(weekKey: string): string {
  const [year, w] = weekKey.split('-W');
  const jan4 = new Date(Date.UTC(Number(year), 0, 4));
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1) + (Number(w) - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${fmt(monday)} – ${fmt(sunday)}, ${year}`;
}

// ─── Derive "areas" from run titles (common prefixes / keywords) ─────────────────────────

function extractAreas(runs: QaseRun[]): string[] {
  const titles = runs.map((r) => r.title.trim());
  // Split on common separators and take the first segment as the "area"
  const segments = titles.map((t) => t.split(/[-–|:]/)[0].trim()).filter(Boolean);
  const freq = new Map<string, number>();
  for (const s of segments) freq.set(s, (freq.get(s) ?? 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);
}

// ─── Analysis text ────────────────────────────────────────────────────────────────────────

function generateWeekAnalysis({
  runs,
  passRate,
  delta,
  total,
  failed,
  blocked,
  skipped,
  isCurrentWeek,
}: {
  runs: QaseRun[];
  passRate: number;
  delta: number | null;
  total: number;
  failed: number;
  blocked: number;
  skipped: number;
  isCurrentWeek: boolean;
}): string {
  if (runs.length === 0) return 'No test runs recorded this week.';

  const parts: string[] = [];
  if (isCurrentWeek) parts.push('(Week in progress.) ');

  if (delta === null) {
    parts.push(`Baseline week: ${passRate.toFixed(1)}% pass rate across ${runs.length} run${runs.length !== 1 ? 's' : ''} and ${total.toLocaleString()} test cases.`);
  } else if (delta > 5) {
    parts.push(`Significant improvement (+${delta.toFixed(1)}pp). Pass rate at ${passRate.toFixed(1)}% across ${runs.length} run${runs.length !== 1 ? 's' : ''}.`);
  } else if (delta > 1) {
    parts.push(`Steady improvement (+${delta.toFixed(1)}pp). Pass rate ${passRate.toFixed(1)}% from ${runs.length} run${runs.length !== 1 ? 's' : ''}.`);
  } else if (Math.abs(delta) <= 1) {
    parts.push(`Stable week — pass rate held at ${passRate.toFixed(1)}% across ${runs.length} run${runs.length !== 1 ? 's' : ''}.`);
  } else if (delta > -5) {
    parts.push(`Slight regression (${delta.toFixed(1)}pp). Pass rate at ${passRate.toFixed(1)}% across ${runs.length} run${runs.length !== 1 ? 's' : ''}.`);
  } else {
    parts.push(`Notable regression (${delta.toFixed(1)}pp). Pass rate dropped to ${passRate.toFixed(1)}%.`);
  }

  if (failed > 0) {
    const pct = ((failed / total) * 100).toFixed(1);
    parts.push(` ${failed.toLocaleString()} cases failed (${pct}%).`);
  }
  if (blocked > 0 && blocked / total > 0.04) {
    parts.push(` ${blocked.toLocaleString()} cases blocked — investigate blockers.`);
  }
  if (skipped > 0 && skipped / total > 0.10) {
    parts.push(` High skip rate (${((skipped / total) * 100).toFixed(0)}%) — review skip rationale.`);
  }

  const lowPassRuns = runs.filter(
    (r) => r.stats.total > 0 && r.stats.passed / r.stats.total < 0.7,
  );
  if (lowPassRuns.length > 0) {
    parts.push(` ${lowPassRuns.length} run${lowPassRuns.length !== 1 ? 's' : ''} below 70% pass rate.`);
  }

  return parts.join('');
}

// ─── Build weekly dataset ─────────────────────────────────────────────────────────────────

function buildWeeklyData(runs: QaseRun[], weeksBack = 20): WeekData[] {
  const byWeek = new Map<string, QaseRun[]>();
  for (const run of runs) {
    if (!run.start_time) continue;
    const key = isoWeekKey(new Date(run.start_time));
    const list = byWeek.get(key) ?? [];
    list.push(run);
    byWeek.set(key, list);
  }

  const now = new Date();
  const currentKey = isoWeekKey(now);
  const weekKeys: string[] = [];
  for (let i = weeksBack - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i * 7);
    weekKeys.push(isoWeekKey(d));
  }

  const result: WeekData[] = [];
  let prevPassRate: number | null = null;

  for (const key of weekKeys) {
    if (key > currentKey) continue;
    const weekRuns = byWeek.get(key) ?? [];
    const totals = weekRuns.reduce(
      (acc, r) => ({
        total: acc.total + r.stats.total,
        passed: acc.passed + r.stats.passed,
        failed: acc.failed + r.stats.failed,
        blocked: acc.blocked + r.stats.blocked,
        skipped: acc.skipped + r.stats.skipped,
        invalid: acc.invalid + r.stats.invalid,
      }),
      { total: 0, passed: 0, failed: 0, blocked: 0, skipped: 0, invalid: 0 },
    );

    const passRate = totals.total > 0 ? (totals.passed / totals.total) * 100 : 0;
    const delta = prevPassRate !== null && totals.total > 0 ? passRate - prevPassRate : null;

    result.push({
      weekKey: key,
      label: weekLabel(key),
      isCurrentWeek: key === currentKey,
      runs: weekRuns,
      ...totals,
      passRate,
      delta,
      analysis: generateWeekAnalysis({
        runs: weekRuns,
        passRate,
        delta,
        total: totals.total,
        failed: totals.failed,
        blocked: totals.blocked,
        skipped: totals.skipped,
        isCurrentWeek: key === currentKey,
      }),
      topAreas: extractAreas(weekRuns),
    });

    if (totals.total > 0) prevPassRate = passRate;
  }

  return result.reverse(); // newest first
}

// ─── Sub-components ───────────────────────────────────────────────────────────────────────

function PassRateBar({ passed, failed, blocked, skipped, invalid, total }: {
  passed: number; failed: number; blocked: number; skipped: number; invalid: number; total: number;
}) {
  if (total === 0) return null;
  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;
  return (
    <div>
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden flex">
        <div className="bg-green-500 h-full" style={{ width: pct(passed) }} />
        <div className="bg-red-400 h-full" style={{ width: pct(failed) }} />
        <div className="bg-orange-400 h-full" style={{ width: pct(blocked) }} />
        <div className="bg-gray-300 h-full" style={{ width: pct(skipped) }} />
        <div className="bg-yellow-400 h-full" style={{ width: pct(invalid) }} />
      </div>
      <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-400">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Passed {passed.toLocaleString()}</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> Failed {failed.toLocaleString()}</span>
        {blocked > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block" /> Blocked {blocked.toLocaleString()}</span>}
        {skipped > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" /> Skipped {skipped.toLocaleString()}</span>}
        {invalid > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> Invalid {invalid.toLocaleString()}</span>}
      </div>
    </div>
  );
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  if (Math.abs(delta) < 0.1) return (
    <span className="flex items-center gap-0.5 text-xs text-gray-400"><Minus size={11} /> 0.0pp</span>
  );
  const positive = delta > 0;
  return (
    <span className={`flex items-center gap-0.5 text-xs font-medium ${positive ? 'text-green-600' : 'text-red-500'}`}>
      {positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {positive ? '+' : ''}{delta.toFixed(1)}pp
    </span>
  );
}

function RunRow({ run, users }: { run: QaseRun; users: QaseUser[] }) {
  const passRate = run.stats.total > 0 ? (run.stats.passed / run.stats.total) * 100 : null;
  const author = users.find((u) => u.id === run.user_id);
  const color = passRate === null ? 'text-gray-400'
    : passRate >= 90 ? 'text-green-600'
    : passRate >= 70 ? 'text-yellow-600'
    : 'text-red-500';
  const Icon = passRate === null ? Clock
    : passRate >= 90 ? CheckCircle2
    : passRate >= 70 ? AlertCircle
    : XCircle;
  const iconColor = passRate === null ? 'text-gray-300'
    : passRate >= 90 ? 'text-green-500'
    : passRate >= 70 ? 'text-yellow-500'
    : 'text-red-400';

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <Icon size={15} className={`mt-0.5 flex-shrink-0 ${iconColor}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-800 leading-snug truncate" title={run.title}>{run.title}</p>
        {author && <p className="text-xs text-gray-400 mt-0.5">by {author.name}</p>}
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 text-right">
        {passRate !== null && (
          <span className={`text-sm font-semibold ${color}`}>{passRate.toFixed(0)}%</span>
        )}
        <span className="text-xs text-gray-400">{run.stats.total.toLocaleString()} cases</span>
        {run.stats.failed > 0 && (
          <span className="text-xs text-red-500">{run.stats.failed} failed</span>
        )}
        {run.stats.blocked > 0 && (
          <span className="text-xs text-orange-500">{run.stats.blocked} blocked</span>
        )}
      </div>
    </div>
  );
}

function AuthorStats({ runs, users }: { runs: QaseRun[]; users: QaseUser[] }) {
  const byAuthor = new Map<number, { runCount: number; caseCount: number }>();
  for (const r of runs) {
    const entry = byAuthor.get(r.user_id) ?? { runCount: 0, caseCount: 0 };
    entry.runCount += 1;
    entry.caseCount += r.stats.total;
    byAuthor.set(r.user_id, entry);
  }
  const sorted = [...byAuthor.entries()]
    .sort((a, b) => b[1].caseCount - a[1].caseCount)
    .slice(0, 5);
  if (sorted.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide flex items-center gap-1"><Users size={11} /> Authors this week</p>
      <div className="flex flex-wrap gap-2">
        {sorted.map(([uid, stats]) => {
          const user = users.find((u) => u.id === uid);
          return (
            <span key={uid} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 rounded-full text-xs text-gray-700">
              <span className="font-medium">{user?.name ?? `User #${uid}`}</span>
              <span className="text-gray-400">{stats.runCount} run{stats.runCount !== 1 ? 's' : ''} · {stats.caseCount.toLocaleString()} cases</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function FailingRunsHighlight({ runs, users }: { runs: QaseRun[]; users: QaseUser[] }) {
  const failing = runs
    .filter((r) => r.stats.total > 0 && r.stats.passed / r.stats.total < 0.7)
    .sort((a, b) => (a.stats.passed / a.stats.total) - (b.stats.passed / b.stats.total))
    .slice(0, 5);

  if (failing.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-medium text-red-500 mb-2 uppercase tracking-wide flex items-center gap-1">
        <XCircle size={11} /> Runs below 70% pass rate
      </p>
      <div className="space-y-1.5">
        {failing.map((r) => {
          const passRate = (r.stats.passed / r.stats.total) * 100;
          const author = users.find((u) => u.id === r.user_id);
          return (
            <div key={r.id} className="flex items-center gap-2 text-sm">
              <span className="text-red-500 font-semibold text-xs w-10 text-right">{passRate.toFixed(0)}%</span>
              <div className="flex-1 min-w-0">
                <span className="text-gray-700 truncate block" title={r.title}>{r.title}</span>
                {author && <span className="text-xs text-gray-400">by {author.name}</span>}
              </div>
              <span className="text-xs text-red-400 flex-shrink-0">{r.stats.failed} failed</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekSection({ week, users }: { week: WeekData; users: QaseUser[] }) {
  const [open, setOpen] = useState(false);

  const passRateColor = week.total === 0 ? 'text-gray-400'
    : week.passRate >= 90 ? 'text-green-600'
    : week.passRate >= 70 ? 'text-yellow-600'
    : 'text-red-500';

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      {/* Week header — always visible */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left px-5 py-4 bg-gray-50 hover:bg-gray-100 transition-colors flex items-start gap-4"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm">{week.label}</span>
            {week.isCurrentWeek && (
              <span className="text-xs bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full font-medium">In progress</span>
            )}
          </div>
          {week.total > 0 && (
            <div className="mt-2 flex items-center gap-4 flex-wrap">
              <span className={`text-xl font-bold ${passRateColor}`}>{week.passRate.toFixed(1)}%</span>
              <DeltaBadge delta={week.delta} />
              <span className="text-xs text-gray-400">{week.runs.length} run{week.runs.length !== 1 ? 's' : ''}</span>
              <span className="text-xs text-gray-400">{week.total.toLocaleString()} cases</span>
              {week.failed > 0 && <span className="text-xs text-red-400">{week.failed.toLocaleString()} failed</span>}
              {week.blocked > 0 && <span className="text-xs text-orange-400">{week.blocked.toLocaleString()} blocked</span>}
            </div>
          )}
          {week.total === 0 && <p className="text-xs text-gray-400 mt-1">No runs recorded</p>}
        </div>
        <ChevronDown
          size={16}
          className={`flex-shrink-0 text-gray-400 transition-transform mt-1 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && week.total > 0 && (
        <div className="divide-y divide-gray-100">
          {/* Pass rate bar */}
          <div className="px-5 py-4">
            <PassRateBar
              passed={week.passed}
              failed={week.failed}
              blocked={week.blocked}
              skipped={week.skipped}
              invalid={week.invalid}
              total={week.total}
            />
          </div>

          {/* Analysis */}
          <div className="px-5 py-3 bg-blue-50 border-l-4 border-blue-300">
            <p className="text-xs text-blue-700 leading-relaxed">{week.analysis}</p>
          </div>

          {/* Areas covered */}
          {week.topAreas.length > 0 && (
            <div className="px-5 py-3">
              <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide flex items-center gap-1">
                <BarChart2 size={11} /> Areas covered
              </p>
              <div className="flex flex-wrap gap-1.5">
                {week.topAreas.map((area) => (
                  <span key={area} className="px-2 py-0.5 bg-violet-50 text-violet-700 rounded-full text-xs">{area}</span>
                ))}
              </div>
            </div>
          )}

          {/* Failing runs highlight */}
          {week.runs.some((r) => r.stats.total > 0 && r.stats.passed / r.stats.total < 0.7) && (
            <div className="px-5 py-3">
              <FailingRunsHighlight runs={week.runs} users={users} />
            </div>
          )}

          {/* Author stats */}
          {week.runs.length > 0 && (
            <div className="px-5 py-3">
              <AuthorStats runs={week.runs} users={users} />
            </div>
          )}

          {/* All runs */}
          <div className="px-5 py-3">
            <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide flex items-center gap-1">
              <Play size={11} /> All runs ({week.runs.length})
            </p>
            <div>
              {week.runs
                .slice()
                .sort((a, b) => {
                  if (!a.start_time) return 1;
                  if (!b.start_time) return -1;
                  return new Date(b.start_time).getTime() - new Date(a.start_time).getTime();
                })
                .map((r) => (
                  <RunRow key={r.id} run={r} users={users} />
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Summary stats bar ────────────────────────────────────────────────────────────────────

function SummaryStats({ weeks }: { weeks: WeekData[] }) {
  const activeWeeks = weeks.filter((w) => w.total > 0);
  if (activeWeeks.length === 0) return null;

  const totalRuns = activeWeeks.reduce((s, w) => s + w.runs.length, 0);
  const totalCases = activeWeeks.reduce((s, w) => s + w.total, 0);
  const totalFailed = activeWeeks.reduce((s, w) => s + w.failed, 0);
  const avgPassRate = activeWeeks.reduce((s, w) => s + w.passRate, 0) / activeWeeks.length;

  const withDelta = activeWeeks.filter((w) => w.delta !== null);
  const trend = withDelta.length > 0
    ? withDelta.reduce((s, w) => s + w.delta!, 0) / withDelta.length
    : null;

  return (
    <div className="grid grid-cols-4 gap-4">
      {[
        { label: 'Total runs', value: totalRuns.toLocaleString(), sub: `last ${activeWeeks.length} weeks`, icon: <Play size={14} /> },
        { label: 'Total cases executed', value: totalCases.toLocaleString(), sub: 'across all runs', icon: <CheckCircle2 size={14} /> },
        { label: 'Avg pass rate', value: `${avgPassRate.toFixed(1)}%`, sub: trend !== null ? `${trend > 0 ? '↑' : trend < 0 ? '↓' : '→'} avg ${Math.abs(trend).toFixed(1)}pp/week` : 'no trend data', icon: <BarChart2 size={14} /> },
        { label: 'Total failed', value: totalFailed.toLocaleString(), sub: `${totalCases > 0 ? ((totalFailed / totalCases) * 100).toFixed(1) : 0}% of all cases`, icon: <XCircle size={14} /> },
      ].map(({ label, value, sub, icon }) => (
        <div key={label} className="rounded-xl border border-gray-200 px-4 py-3 flex flex-col gap-1">
          <span className="text-xs text-gray-400 flex items-center gap-1">{icon} {label}</span>
          <span className="text-xl font-bold text-gray-900">{value}</span>
          <span className="text-xs text-gray-400">{sub}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Per-project section ──────────────────────────────────────────────────────────────────

function ProjectWeeklySection({ project, token }: { project: QaseProject; token: string }) {
  const total = project.counts.runs.total;
  const runsQuery = useAllRuns(token, project.code, '', total, total > 0);
  const usersQuery = useUsers(token);

  const users = usersQuery.data?.result.entities ?? [];
  const isLoading = runsQuery.isLoading;
  const isFetching = runsQuery.isFetching && !runsQuery.isLoading;

  const weeks = useMemo(() => {
    if (!runsQuery.data) return [];
    return buildWeeklyData(runsQuery.data, 20);
  }, [runsQuery.data]);

  const activeWeeks = weeks.filter((w) => w.total > 0);

  return (
    <div className="space-y-4">
      {isFetching && (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Loader2 size={12} className="animate-spin" /> Updating…
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-gray-400 text-sm">
          <Loader2 size={18} className="animate-spin" /> Loading runs…
        </div>
      )}

      {!isLoading && activeWeeks.length === 0 && (
        <p className="text-center text-gray-400 py-12 text-sm">No test runs with start dates found for this project.</p>
      )}

      {!isLoading && activeWeeks.length > 0 && (
        <>
          <SummaryStats weeks={weeks} />
          <div className="space-y-3">
            {weeks.map((week) => (
              <WeekSection key={week.weekKey} week={week} users={users} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Root export ──────────────────────────────────────────────────────────────────────────

export function WeeklyRunReport({ projects, workspace }: Props) {
  const [selectedCode, setSelectedCode] = useState<string>(projects[0]?.code ?? '');
  const selected = projects.find((p) => p.code === selectedCode) ?? projects[0];

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Weekly Test Run Report</h2>
        <p className="text-sm text-gray-400 mt-0.5">
          Per-week breakdown of test execution — pass rates, failure trends, areas covered, and author activity.
          Based on run start dates, most recent 500 runs.
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

      {selected && (
        <ProjectWeeklySection
          key={selected.code}
          project={selected}
          token={workspace.token}
        />
      )}
    </div>
  );
}
