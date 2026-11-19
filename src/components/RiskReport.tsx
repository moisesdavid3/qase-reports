import { useMemo, useState } from 'react';
import { Loader2, ShieldCheck, AlertTriangle } from 'lucide-react';
import type { QaseDefect, QaseProject, QaseRun, Workspace } from '../types/qase';
import { useAllRuns } from '../hooks/useRuns';
import { useAllDefects } from '../hooks/useDefects';
import { useJiraIssues } from '../hooks/useJiraIssues';
import { ExternalIssueLink } from './ExternalIssueLink';
import { CopyButton } from './CopyButton';

interface Props {
  projects: QaseProject[];
  workspace: Workspace;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────────────────

interface DateRange { from: string; to: string }

function toInputDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseLocal(s: string, endOfDay = false): Date {
  const [y, m, d] = s.split('-').map(Number);
  return endOfDay ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d);
}

function lastDays(days: number): DateRange {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - (days - 1));
  return { from: toInputDate(from), to: toInputDate(to) };
}

function fmtDay(s: string): string {
  return parseLocal(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const HIGH = new Set(['blocker', 'critical']);

function severityRank(s: string | null): number {
  switch (s) {
    case 'blocker': return 0;
    case 'critical': return 1;
    case 'major': return 2;
    case 'normal': return 3;
    case 'minor': return 4;
    case 'trivial': return 5;
    default: return 6;
  }
}

function severityClass(s: string | null): string {
  if (s && HIGH.has(s)) return 'bg-red-100 text-red-700';
  if (s === 'major') return 'bg-orange-100 text-orange-700';
  return 'bg-gray-100 text-gray-600';
}

const isOpenDefect = (d: QaseDefect) => d.status === 'open' || d.status === 'in_progress';
const isRealDefect = (d: QaseDefect) => d.status !== 'invalid';

function jiraKeyOf(d: QaseDefect): string | null {
  if (!d.external_data) return null;
  try {
    const obj = JSON.parse(d.external_data) as Record<string, { key?: string }>;
    for (const v of Object.values(obj)) if (v?.key) return v.key;
  } catch {
    return null;
  }
  return null;
}

function executedOf(r: QaseRun): number {
  return r.stats.passed + r.stats.failed + r.stats.blocked + r.stats.skipped;
}

// ─── Feature risk model ───────────────────────────────────────────────────────────────────

type RiskStatus = 'attention' | 'testing' | 'watch' | 'mitigated';

interface FeatureRisk {
  key: string;
  issue: QaseRun['external_issue'];
  runs: number;
  executed: number;
  passed: number;
  failed: number;
  passRate: number | null;
  firstRate: number | null;
  latestRate: number | null;
  recovered: boolean;
  activeDays: number;
  inProgress: boolean;
  found: number;
  high: number;
  resolved: number;
  open: number;
  status: RiskStatus;
}

const STATUS_META: Record<RiskStatus, { label: string; cls: string; order: number }> = {
  attention: { label: 'Residual risk', cls: 'bg-red-100 text-red-700', order: 0 },
  testing: { label: 'In testing', cls: 'bg-violet-100 text-violet-700', order: 1 },
  watch: { label: 'Monitor', cls: 'bg-yellow-100 text-yellow-700', order: 2 },
  mitigated: { label: 'Mitigated', cls: 'bg-green-100 text-green-700', order: 3 },
};

function buildFeatureRisks(runs: QaseRun[], defects: QaseDefect[]): FeatureRisk[] {
  const byIssue = new Map<string, QaseRun[]>();
  const issueOfRun = new Map<number, string>();
  for (const r of runs) {
    const id = r.external_issue?.id?.trim();
    if (!id) continue;
    byIssue.set(id, [...(byIssue.get(id) ?? []), r]);
    issueOfRun.set(r.id, id);
  }

  const defectsByIssue = new Map<string, QaseDefect[]>();
  for (const d of defects) {
    const ids = new Set(d.runs.map((rid) => issueOfRun.get(rid)).filter((x): x is string => !!x));
    for (const id of ids) defectsByIssue.set(id, [...(defectsByIssue.get(id) ?? []), d]);
  }

  return [...byIssue.entries()]
    .map(([key, fruns]) => {
      const sum = (f: (r: QaseRun) => number) => fruns.reduce((s, r) => s + f(r), 0);
      const executed = sum(executedOf);
      const passed = sum((r) => r.stats.passed);
      const passRate = executed > 0 ? (passed / executed) * 100 : null;
      const fd = (defectsByIssue.get(key) ?? []).filter(isRealDefect);
      const open = fd.filter(isOpenDefect).length;
      const inProgress = fruns.some((r) => r.status_text === 'in_progress' || r.end_time === null);

      const byDay = new Map<string, { passed: number; executed: number }>();
      for (const r of fruns) {
        if (!r.start_time || executedOf(r) === 0) continue;
        const k = toInputDate(new Date(r.start_time));
        const e = byDay.get(k) ?? { passed: 0, executed: 0 };
        e.passed += r.stats.passed;
        e.executed += executedOf(r);
        byDay.set(k, e);
      }
      const rates = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, e]) => (e.passed / e.executed) * 100);
      const firstRate = rates.length > 0 ? rates[0] : null;
      const latestRate = rates.length > 0 ? rates[rates.length - 1] : null;
      const recovered = rates.length > 1 && firstRate !== null && latestRate !== null && firstRate < 90 && latestRate >= 90;

      let status: RiskStatus;
      if (open > 0 || (latestRate !== null && latestRate < 70)) status = 'attention';
      else if (inProgress) status = 'testing';
      else if (latestRate !== null && latestRate >= 90) status = 'mitigated';
      else status = 'watch';

      return {
        key,
        issue: fruns.find((r) => r.external_issue)?.external_issue,
        runs: fruns.length,
        executed,
        passed,
        failed: sum((r) => r.stats.failed),
        passRate,
        firstRate,
        latestRate,
        recovered,
        activeDays: rates.length,
        inProgress,
        found: fd.length,
        high: fd.filter((d) => d.severity && HIGH.has(d.severity)).length,
        resolved: fd.filter((d) => d.status === 'resolved').length,
        open,
        status,
      };
    })
    .sort((a, b) => STATUS_META[a.status].order - STATUS_META[b.status].order || b.open - a.open || b.executed - a.executed);
}

// ─── UI pieces ────────────────────────────────────────────────────────────────────────────

function Tile({ label, value, sub, tone = 'text-gray-900' }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 px-4 py-3 flex flex-col gap-1">
      <span className="text-xs text-gray-400">{label}</span>
      <span className={`text-xl font-bold ${tone}`}>{value}</span>
      <span className="text-xs text-gray-400">{sub}</span>
    </div>
  );
}

function SeverityChip({ severity }: { severity: string | null }) {
  return <span className={`text-xs px-1.5 py-0.5 rounded font-medium capitalize ${severityClass(severity)}`}>{severity ?? 'n/a'}</span>;
}

function ProjectRisk({ project, token }: { project: QaseProject; token: string }) {
  const [range, setRange] = useState<DateRange>(() => lastDays(30));
  const totalRuns = project.counts.runs.total;
  const runsQuery = useAllRuns(token, project.code, '', totalRuns, totalRuns > 0);
  const defectsQuery = useAllDefects(token, project.code, true);

  const start = parseLocal(range.from);
  const end = parseLocal(range.to, true);
  const rangeInvalid = isNaN(start.getTime()) || isNaN(end.getTime()) || end < start;

  const model = useMemo(() => {
    if (rangeInvalid || !runsQuery.data || !defectsQuery.data) return null;
    const inRange = (t: string | null) => !!t && new Date(t) >= start && new Date(t) <= end;

    const runs = runsQuery.data.filter((r) => inRange(r.start_time));
    const runIds = new Set(runs.map((r) => r.id));
    const real = defectsQuery.data.filter(isRealDefect);

    // Detected in the period: created in range, or raised from a run executed in range.
    const detected = real.filter((d) => inRange(d.created_at) || d.runs.some((id) => runIds.has(id)));
    const resolved = detected.filter((d) => d.status === 'resolved');
    const stillOpen = detected.filter(isOpenDefect);
    const backlog = real.filter(isOpenDefect);
    const features = buildFeatureRisks(runs, detected);

    const executed = runs.reduce((s, r) => s + executedOf(r), 0);
    const passed = runs.reduce((s, r) => s + r.stats.passed, 0);
    const failed = runs.reduce((s, r) => s + r.stats.failed, 0);
    const high = (list: QaseDefect[]) => list.filter((d) => d.severity && HIGH.has(d.severity)).length;
    const major = (list: QaseDefect[]) => list.filter((d) => d.severity === 'major').length;

    return {
      runs, features, detected, resolved, stillOpen, backlog, executed, passed, failed,
      passRate: executed > 0 ? (passed / executed) * 100 : null,
      highFound: high(detected), majorFound: major(detected),
      highOpen: high(stillOpen), highBacklog: high(backlog),
      mitigatedFeatures: features.filter((f) => f.status === 'mitigated').length,
      recoveredFeatures: features.filter((f) => f.recovered).length,
      featuresWithFailures: features.filter((f) => f.failed > 0).length,
    };
  }, [runsQuery.data, defectsQuery.data, range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps

  const issueKeys = useMemo(() => {
    const keys = new Set<string>();
    model?.features.forEach((f) => keys.add(f.key));
    return [...keys];
  }, [model]);
  const jira = useJiraIssues(issueKeys).data ?? {};

  const featureOfRun = useMemo(() => {
    const m = new Map<number, string>();
    (runsQuery.data ?? []).forEach((r) => { if (r.external_issue?.id) m.set(r.id, r.external_issue.id); });
    return m;
  }, [runsQuery.data]);

  const summary = useMemo(() => {
    if (!model) return '';
    const m = model;
    const pct = m.detected.length > 0 ? Math.round((m.resolved.length / m.detected.length) * 100) : 0;
    const lines = [
      `Risk mitigation summary · ${project.title} · ${fmtDay(range.from)} – ${fmtDay(range.to)}`,
      `• QE executed ${m.runs.length} test runs (${m.executed.toLocaleString()} cases, ${m.passRate === null ? 'n/a' : m.passRate.toFixed(0) + '%'} pass rate) covering ${m.features.length} features / user stories.`,
      `• Testing caught ${m.failed.toLocaleString()} failed cases across ${m.featuresWithFailures} features; ${m.recoveredFeatures} of them recovered to a 90%+ pass rate in their latest run.`,
      m.detected.length > 0
        ? `• ${m.detected.length} Qase defects detected (${m.highFound} critical/blocker, ${m.majorFound} major); ${m.resolved.length} (${pct}%) already resolved.`
        : '• No Qase defects were logged in this period; failures are reflected in the run results.',
      `• ${m.mitigatedFeatures} of ${m.features.length} features are fully mitigated (latest run 90%+, no open defects).`,
    ];
    const attention = m.features.filter((f) => f.status === 'attention').slice(0, 5).map((f) => f.key);
    lines.push(
      m.stillOpen.length > 0 || attention.length > 0
        ? `• Residual risk: ${m.stillOpen.length} open defects from this period (${m.highOpen} critical/blocker)${attention.length > 0 ? `; features needing attention: ${attention.join(', ')}` : ''}.`
        : '• No residual risk identified for this period.',
    );
    return lines.join('\n');
  }, [model, project.title, range.from, range.to]);

  const loading = runsQuery.isLoading || defectsQuery.isLoading;

  const openList = useMemo(
    () => (model?.backlog ?? [])
      .slice()
      .sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .slice(0, 15),
    [model],
  );
  const caughtList = useMemo(
    () => (model?.resolved ?? [])
      .filter((d) => d.severity && (HIGH.has(d.severity) || d.severity === 'major'))
      .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
      .slice(0, 10),
    [model],
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-xs text-gray-400 font-medium flex items-center gap-1.5">
          From
          <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700" />
        </label>
        <label className="text-xs text-gray-400 font-medium flex items-center gap-1.5">
          To
          <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700" />
        </label>
        {[7, 14, 30, 90].map((d) => (
          <button key={d} onClick={() => setRange(lastDays(d))}
            className="px-2.5 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100">
            Last {d}d
          </button>
        ))}
      </div>

      {rangeInvalid && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">The end date must be on or after the start date.</p>}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-16 text-gray-400 text-sm">
          <Loader2 size={18} className="animate-spin" /> Loading runs and defects…
        </div>
      )}

      {model && (
        <>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide flex items-center gap-1.5">
                <ShieldCheck size={13} /> Executive summary
              </p>
              <CopyButton text={summary} className="text-emerald-700 bg-white border-emerald-200 hover:bg-emerald-100" />
            </div>
            <p className="text-sm font-semibold text-gray-900 mb-1">{summary.split('\n')[0]}</p>
            <ul className="list-disc pl-4 space-y-1 text-sm text-gray-700">
              {summary.split('\n').slice(1).map((l) => <li key={l}>{l.replace(/^• /, '')}</li>)}
            </ul>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Tile label="Failed cases caught" value={model.failed.toLocaleString()} sub={`in ${model.featuresWithFailures} features · ${model.executed.toLocaleString()} executed`} />
            <Tile label="Features recovered" value={`${model.recoveredFeatures}`} sub="from <90% to 90%+ pass rate" tone="text-green-600" />
            <Tile label="Features mitigated" value={`${model.mitigatedFeatures}/${model.features.length}`} sub="latest run 90%+, no open defects" tone="text-green-600" />
            <Tile label="Qase defects" value={model.detected.length.toLocaleString()} sub={`${model.resolved.length} resolved · ${model.highFound} critical/blocker`} />
            <Tile label="Open defects (residual)" value={model.stillOpen.length.toLocaleString()} sub={`${model.backlog.length} open overall`} tone={model.stillOpen.length > 0 ? 'text-red-500' : 'text-gray-900'} />
          </div>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">Risk by feature / user story</h3>
            {model.features.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">No test runs with an External Issue in this range.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-200">
                      <th className="text-left font-medium px-4 py-2.5">Feature</th>
                      <th className="text-left font-medium px-3 py-2.5">Status</th>
                      <th className="text-right font-medium px-3 py-2.5">Runs</th>
                      <th className="text-right font-medium px-3 py-2.5">Executed</th>
                      <th className="text-right font-medium px-3 py-2.5">Pass rate</th>
                      <th className="text-right font-medium px-3 py-2.5">First → latest day</th>
                      <th className="text-right font-medium px-3 py-2.5">Failed cases</th>
                      <th className="text-right font-medium px-3 py-2.5">Defects found</th>
                      <th className="text-right font-medium px-3 py-2.5">Resolved</th>
                      <th className="text-right font-medium px-4 py-2.5">Open</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {model.features.map((f) => (
                      <tr key={f.key} className="text-gray-700">
                        <td className="px-4 py-2 max-w-md">
                          <div className="flex items-center gap-2">
                            <ExternalIssueLink issue={f.issue} />
                            <span className="truncate text-xs text-gray-600" title={jira[f.key]?.summary}>{jira[f.key]?.summary}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_META[f.status].cls}`}>{STATUS_META[f.status].label}</span>
                        </td>
                        <td className="px-3 py-2 text-right">{f.runs}</td>
                        <td className="px-3 py-2 text-right">{f.executed.toLocaleString()}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${f.passRate === null ? 'text-gray-300' : f.passRate >= 90 ? 'text-green-600' : f.passRate >= 70 ? 'text-yellow-600' : 'text-red-500'}`}>
                          {f.passRate === null ? '—' : `${f.passRate.toFixed(0)}%`}
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-gray-500 whitespace-nowrap">
                          {f.firstRate === null || f.latestRate === null || f.activeDays < 2
                            ? '—'
                            : `${f.firstRate.toFixed(0)}% → ${f.latestRate.toFixed(0)}%`}
                        </td>
                        <td className="px-3 py-2 text-right text-red-500">{f.failed || <span className="text-gray-300">0</span>}</td>
                        <td className="px-3 py-2 text-right">
                          {f.found || <span className="text-gray-300">0</span>}
                          {f.high > 0 && <span className="ml-1 text-xs text-red-500">({f.high} high)</span>}
                        </td>
                        <td className="px-3 py-2 text-right text-green-600">{f.resolved || <span className="text-gray-300">0</span>}</td>
                        <td className="px-4 py-2 text-right text-red-500 font-medium">{f.open || <span className="text-gray-300 font-normal">0</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-green-600" /> Serious risks caught and resolved
              </h3>
              <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
                {caughtList.length === 0 && <p className="text-sm text-gray-400 px-4 py-4">No critical/major defects were resolved in this range.</p>}
                {caughtList.map((d) => (
                  <DefectRow key={d.id} d={d} feature={d.runs.map((r) => featureOfRun.get(r)).find(Boolean)} />
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-red-500" /> Residual risk: open defects
                <span className="text-xs font-normal text-gray-400">{model.backlog.length} open in total, {model.highBacklog} critical/blocker</span>
              </h3>
              <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
                {openList.length === 0 && <p className="text-sm text-gray-400 px-4 py-4">No open defects.</p>}
                {openList.map((d) => (
                  <DefectRow key={d.id} d={d} feature={d.runs.map((r) => featureOfRun.get(r)).find(Boolean)} showAge />
                ))}
              </div>
            </section>
          </div>

          <p className="text-xs text-gray-400">
            Defects count as detected when created in the range or raised from a run started in it; invalid defects are excluded. A feature is Mitigated when its latest run has a 90%+ pass rate and it has no open defects; Residual risk when it has open defects or its latest run is below 70%. Runs are limited to the most recent 500.
          </p>
        </>
      )}
    </div>
  );
}

function DefectRow({ d, feature, showAge = false }: { d: QaseDefect; feature?: string; showAge?: boolean }) {
  const key = jiraKeyOf(d);
  const age = Math.max(0, Math.floor((Date.now() - new Date(d.created_at).getTime()) / 86400000));
  return (
    <div className="px-4 py-2.5 flex items-start gap-2">
      <SeverityChip severity={d.severity} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-800 leading-snug truncate" title={d.title}>{d.title}</p>
        <p className="text-xs text-gray-400">
          {[feature, key, showAge ? `${age}d open` : null].filter(Boolean).join(' · ')}
        </p>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────────────────

export function RiskReport({ projects, workspace }: Props) {
  const [selectedCode, setSelectedCode] = useState<string>(projects[0]?.code ?? '');
  const selected = projects.find((p) => p.code === selectedCode) ?? projects[0];

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <ShieldCheck size={15} className="text-emerald-600" /> Risk mitigation report
        </h2>
        <p className="text-sm text-gray-400 mt-0.5">
          What QE detected and closed before release, and what risk remains. Combines test runs, features (Jira External Issue) and Qase defects.
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

      {selected && <ProjectRisk key={selected.code} project={selected} token={workspace.token} />}
    </div>
  );
}
