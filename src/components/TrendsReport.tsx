import { useMemo, useState } from 'react';
import { Loader2, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { QaseProject, QaseRun, Workspace } from '../types/qase';
import { useAllRuns } from '../hooks/useRuns';

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

function Delta({ value, suffix }: { value: number | null; suffix: string }) {
  if (value === null) return <span className="text-gray-300">—</span>;
  if (Math.abs(value) < 0.05) {
    return <span className="inline-flex items-center gap-0.5 text-gray-400"><Minus size={11} /> 0{suffix}</span>;
  }
  const up = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 font-medium ${up ? 'text-green-600' : 'text-red-500'}`}>
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {up ? '+' : ''}{value.toFixed(1)}{suffix}
    </span>
  );
}

function ExecutionTrendTable({ runs }: { runs: QaseRun[] }) {
  const rows = useMemo(() => buildTrend(runs), [runs]);

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
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Per-project section ──────────────────────────────────────────────────────────────────

function ProjectTrendsSection({ project, token }: { project: QaseProject; token: string }) {
  const totalRuns = project.counts.runs.total;
  const runsQuery = useAllRuns(token, project.code, '', totalRuns, totalRuns > 0);

  return (
    <div>
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
        <h2 className="text-base font-semibold text-gray-900">Test Execution Trends</h2>
        <p className="text-sm text-gray-400 mt-0.5">
          Week-by-week test execution volume and pass rate.
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
