import { useMemo, useState } from 'react';
import { Loader2, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { QaseDefect, QaseProject, QaseRun, Workspace } from '../types/qase';
import { useAllRuns } from '../hooks/useRuns';
import { useAllDefects } from '../hooks/useDefects';

interface Props {
  projects: QaseProject[];
  workspace: Workspace;
}

const WEEKS_BACK = 12;

// ─── Helpers ──────────────────────────────────────────────────────────────────────────────

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d;
}

function weekStart(date: Date): Date {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (day - 1));
  return d;
}

function weekKey(date: Date): string {
  return weekStart(date).toISOString().slice(0, 10);
}

function weekLabel(key: string): string {
  const start = new Date(key + 'T00:00:00Z');
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${fmt(start)} – ${fmt(end)}`;
}

function lastWeekKeys(n: number): string[] {
  const keys: string[] = [];
  const base = weekStart(new Date());
  for (let i = 0; i < n; i++) {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() - i * 7);
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys; // newest first
}

function formatDuration(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} d`;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

// ─── Execution trend ──────────────────────────────────────────────────────────────────────

interface TrendRow {
  key: string;
  label: string;
  runs: number;
  cases: number;
  passed: number;
  failed: number;
  blocked: number;
  passRate: number | null;
  casesDelta: number | null;
  passDelta: number | null;
}

function buildTrend(runs: QaseRun[]): TrendRow[] {
  const keys = lastWeekKeys(WEEKS_BACK).reverse(); // oldest first for delta calc
  const byWeek = new Map<string, QaseRun[]>();
  for (const r of runs) {
    const d = parseDate(r.start_time);
    if (!d) continue;
    const k = weekKey(d);
    byWeek.set(k, [...(byWeek.get(k) ?? []), r]);
  }

  const rows: TrendRow[] = [];
  let prev: TrendRow | null = null;
  for (const k of keys) {
    const wr = byWeek.get(k) ?? [];
    const cases = wr.reduce((s, r) => s + r.stats.total, 0);
    const passed = wr.reduce((s, r) => s + r.stats.passed, 0);
    const failed = wr.reduce((s, r) => s + r.stats.failed, 0);
    const blocked = wr.reduce((s, r) => s + r.stats.blocked, 0);
    const passRate = cases > 0 ? (passed / cases) * 100 : null;
    const row: TrendRow = {
      key: k,
      label: weekLabel(k),
      runs: wr.length,
      cases,
      passed,
      failed,
      blocked,
      passRate,
      casesDelta: prev && prev.cases > 0 ? ((cases - prev.cases) / prev.cases) * 100 : null,
      passDelta: prev && prev.passRate !== null && passRate !== null ? passRate - prev.passRate : null,
    };
    rows.push(row);
    prev = row;
  }
  return rows.reverse(); // newest first
}

function Delta({ value, suffix, invert = false }: { value: number | null; suffix: string; invert?: boolean }) {
  if (value === null) return <span className="text-gray-300">—</span>;
  if (Math.abs(value) < 0.05) {
    return <span className="inline-flex items-center gap-0.5 text-gray-400"><Minus size={11} /> 0{suffix}</span>;
  }
  const up = value > 0;
  const good = invert ? !up : up;
  return (
    <span className={`inline-flex items-center gap-0.5 font-medium ${good ? 'text-green-600' : 'text-red-500'}`}>
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {up ? '+' : ''}{value.toFixed(1)}{suffix}
    </span>
  );
}

function ExecutionTrendTable({ runs }: { runs: QaseRun[] }) {
  const rows = useMemo(() => buildTrend(runs), [runs]);
  const maxCases = Math.max(1, ...rows.map((r) => r.cases));

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-200">
            <th className="text-left font-medium px-4 py-2.5">Week</th>
            <th className="text-right font-medium px-3 py-2.5">Runs</th>
            <th className="text-right font-medium px-3 py-2.5">Cases executed</th>
            <th className="text-right font-medium px-3 py-2.5">Δ vs prev</th>
            <th className="text-right font-medium px-3 py-2.5">Passed</th>
            <th className="text-right font-medium px-3 py-2.5">Failed</th>
            <th className="text-right font-medium px-3 py-2.5">Blocked</th>
            <th className="text-right font-medium px-3 py-2.5">Pass rate</th>
            <th className="text-right font-medium px-3 py-2.5">Δ pass rate</th>
            <th className="font-medium px-4 py-2.5 w-40">Volume</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => {
            const color = r.passRate === null ? 'text-gray-300'
              : r.passRate >= 90 ? 'text-green-600'
              : r.passRate >= 70 ? 'text-yellow-600'
              : 'text-red-500';
            return (
              <tr key={r.key} className={r.runs === 0 ? 'text-gray-300' : 'text-gray-700'}>
                <td className="px-4 py-2.5 font-medium whitespace-nowrap">{r.label}</td>
                <td className="px-3 py-2.5 text-right">{r.runs}</td>
                <td className="px-3 py-2.5 text-right">{r.cases.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-right text-xs"><Delta value={r.casesDelta} suffix="%" /></td>
                <td className="px-3 py-2.5 text-right">{r.passed.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-right text-red-500">{r.failed > 0 ? r.failed.toLocaleString() : '—'}</td>
                <td className="px-3 py-2.5 text-right text-orange-500">{r.blocked > 0 ? r.blocked.toLocaleString() : '—'}</td>
                <td className={`px-3 py-2.5 text-right font-semibold ${color}`}>
                  {r.passRate === null ? '—' : `${r.passRate.toFixed(1)}%`}
                </td>
                <td className="px-3 py-2.5 text-right text-xs"><Delta value={r.passDelta} suffix="pp" /></td>
                <td className="px-4 py-2.5">
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-violet-400" style={{ width: `${(r.cases / maxCases) * 100}%` }} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Defect MTTR ──────────────────────────────────────────────────────────────────────────

interface ResolvedDefect {
  defect: QaseDefect;
  created: Date;
  resolvedAt: Date;
  hours: number;
}

function resolveDefects(defects: QaseDefect[]): ResolvedDefect[] {
  const out: ResolvedDefect[] = [];
  for (const d of defects) {
    if (d.status !== 'resolved') continue;
    const created = parseDate(d.created_at);
    const resolvedAt = parseDate(d.resolved) ?? parseDate(d.updated_at);
    if (!created || !resolvedAt) continue;
    const hours = (resolvedAt.getTime() - created.getTime()) / 3600000;
    if (hours < 0) continue;
    out.push({ defect: d, created, resolvedAt, hours });
  }
  return out;
}

function severityLabel(d: QaseDefect): string {
  if (d.severity === null || d.severity === undefined || d.severity === '') return 'Unspecified';
  const s = String(d.severity);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 px-4 py-3 flex flex-col gap-1">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-xl font-bold text-gray-900">{value}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  );
}

function DefectMttr({ defects }: { defects: QaseDefect[] }) {
  const resolved = useMemo(() => resolveDefects(defects), [defects]);
  const hours = resolved.map((r) => r.hours);
  const openCount = defects.filter((d) => d.status === 'open' || d.status === 'in_progress').length;

  const weekly = useMemo(() => {
    const keys = lastWeekKeys(WEEKS_BACK);
    return keys.map((k) => {
      const opened = defects.filter((d) => {
        const c = parseDate(d.created_at);
        return c && weekKey(c) === k;
      }).length;
      const closed = resolved.filter((r) => weekKey(r.resolvedAt) === k);
      return {
        key: k,
        label: weekLabel(k),
        opened,
        resolved: closed.length,
        mttr: mean(closed.map((c) => c.hours)),
        median: median(closed.map((c) => c.hours)),
      };
    });
  }, [defects, resolved]);

  const bySeverity = useMemo(() => {
    const map = new Map<string, { total: number; hours: number[] }>();
    for (const d of defects) {
      const key = severityLabel(d);
      const entry = map.get(key) ?? { total: 0, hours: [] };
      entry.total += 1;
      map.set(key, entry);
    }
    for (const r of resolved) {
      map.get(severityLabel(r.defect))?.hours.push(r.hours);
    }
    return [...map.entries()]
      .map(([name, v]) => ({ name, total: v.total, resolved: v.hours.length, mttr: mean(v.hours), median: median(v.hours) }))
      .sort((a, b) => b.total - a.total);
  }, [defects, resolved]);

  const oldestOpen = useMemo(() => {
    const now = Date.now();
    return defects
      .filter((d) => d.status === 'open' || d.status === 'in_progress')
      .map((d) => ({ d, created: parseDate(d.created_at) }))
      .filter((x): x is { d: QaseDefect; created: Date } => x.created !== null)
      .map((x) => ({ ...x, ageHours: (now - x.created.getTime()) / 3600000 }))
      .sort((a, b) => b.ageHours - a.ageHours)
      .slice(0, 5);
  }, [defects]);

  if (defects.length === 0) {
    return <p className="text-center text-gray-400 py-8 text-sm">No defects found for this project.</p>;
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatTile label="MTTR (mean)" value={formatDuration(mean(hours))} sub={`${resolved.length} resolved defects`} />
        <StatTile label="MTTR (median)" value={formatDuration(median(hours))} sub="less sensitive to outliers" />
        <StatTile label="MTTR (p90)" value={formatDuration(percentile(hours, 90))} sub="90% resolved faster than this" />
        <StatTile label="Open defects" value={openCount.toLocaleString()} sub={`of ${defects.length.toLocaleString()} total`} />
        <StatTile
          label="Resolution rate"
          value={`${((resolved.length / defects.length) * 100).toFixed(0)}%`}
          sub="resolved / total"
        />
      </div>

      <div>
        <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">MTTR by week of resolution</p>
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-200">
                <th className="text-left font-medium px-4 py-2.5">Week</th>
                <th className="text-right font-medium px-3 py-2.5">Opened</th>
                <th className="text-right font-medium px-3 py-2.5">Resolved</th>
                <th className="text-right font-medium px-3 py-2.5">MTTR (mean)</th>
                <th className="text-right font-medium px-4 py-2.5">MTTR (median)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {weekly.map((w) => (
                <tr key={w.key} className="text-gray-700">
                  <td className="px-4 py-2.5 font-medium whitespace-nowrap">{w.label}</td>
                  <td className="px-3 py-2.5 text-right">{w.opened || '—'}</td>
                  <td className="px-3 py-2.5 text-right">{w.resolved || '—'}</td>
                  <td className="px-3 py-2.5 text-right font-semibold">{formatDuration(w.mttr)}</td>
                  <td className="px-4 py-2.5 text-right">{formatDuration(w.median)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">By severity</p>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-200">
                  <th className="text-left font-medium px-4 py-2.5">Severity</th>
                  <th className="text-right font-medium px-3 py-2.5">Total</th>
                  <th className="text-right font-medium px-3 py-2.5">Resolved</th>
                  <th className="text-right font-medium px-3 py-2.5">MTTR</th>
                  <th className="text-right font-medium px-4 py-2.5">Median</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {bySeverity.map((s) => (
                  <tr key={s.name} className="text-gray-700">
                    <td className="px-4 py-2.5 font-medium">{s.name}</td>
                    <td className="px-3 py-2.5 text-right">{s.total}</td>
                    <td className="px-3 py-2.5 text-right">{s.resolved}</td>
                    <td className="px-3 py-2.5 text-right font-semibold">{formatDuration(s.mttr)}</td>
                    <td className="px-4 py-2.5 text-right">{formatDuration(s.median)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Oldest open defects</p>
          {oldestOpen.length === 0 ? (
            <p className="text-sm text-gray-400 py-3">No open defects.</p>
          ) : (
            <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
              {oldestOpen.map(({ d, ageHours }) => (
                <div key={d.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="text-xs font-mono text-gray-400">#{d.id}</span>
                  <span className="flex-1 min-w-0 truncate text-gray-700" title={d.title}>{d.title}</span>
                  <span className="text-xs font-semibold text-red-500 flex-shrink-0">{formatDuration(ageHours)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-400">
        MTTR = time from defect creation to resolution (resolved date, or last update when not provided). MTTD is not
        shown: Qase does not record when a bug was introduced.
      </p>
    </div>
  );
}

// ─── Per-project section ──────────────────────────────────────────────────────────────────

function ProjectTrendsSection({ project, token }: { project: QaseProject; token: string }) {
  const totalRuns = project.counts.runs.total;
  const runsQuery = useAllRuns(token, project.code, '', totalRuns, totalRuns > 0);
  const defectsQuery = useAllDefects(token, project.code, true);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Test execution trend over time</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Last {WEEKS_BACK} weeks, by run start date. Based on the most recent 500 runs.
          </p>
        </div>
        {runsQuery.isLoading ? (
          <div className="flex items-center gap-2 py-8 justify-center text-gray-400 text-sm">
            <Loader2 size={16} className="animate-spin" /> Loading runs…
          </div>
        ) : (
          <ExecutionTrendTable runs={runsQuery.data ?? []} />
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Mean time to resolve defects (MTTR)</h3>
          <p className="text-xs text-gray-400 mt-0.5">How long defects stay open before being resolved.</p>
        </div>
        {defectsQuery.isLoading ? (
          <div className="flex items-center gap-2 py-8 justify-center text-gray-400 text-sm">
            <Loader2 size={16} className="animate-spin" /> Loading defects…
          </div>
        ) : (
          <DefectMttr defects={defectsQuery.data ?? []} />
        )}
      </section>
    </div>
  );
}

// ─── Root export ──────────────────────────────────────────────────────────────────────────

export function TrendsReport({ projects, workspace }: Props) {
  const [selectedCode, setSelectedCode] = useState<string>(projects[0]?.code ?? '');
  const selected = projects.find((p) => p.code === selectedCode) ?? projects[0];

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Trends &amp; Defect Resolution</h2>
        <p className="text-sm text-gray-400 mt-0.5">
          Weekly test execution trend and mean time to resolve defects.
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

      {selected && <ProjectTrendsSection key={selected.code} project={selected} token={workspace.token} />}
    </div>
  );
}
