import { useMemo } from 'react';
import { Loader2, AlertCircle, TrendingUp, TrendingDown, Minus, Bot, Wrench, Clock } from 'lucide-react';
import type { QaseProject, Workspace, QaseCase } from '../types/qase';
import { useCasesTotal, useAllCases } from '../hooks/useCases';

interface Props {
  projects: QaseProject[];
  workspace: Workspace;
}

interface WeekRow {
  weekKey: string;   // e.g. "2024-W38"
  label: string;     // e.g. "Sep 16 – Sep 22, 2024"
  newTotal: number;
  newAuto: number;
  cumTotal: number;
  cumAuto: number;
  ratio: number;
  delta: number | null;
  analysis: string;
}

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

function buildWeeklyRows(cases: QaseCase[], weeksBack = 20): WeekRow[] {
  const byWeek = new Map<string, { total: number; auto: number }>();
  for (const c of cases) {
    const key = isoWeekKey(new Date(c.created_at));
    const entry = byWeek.get(key) ?? { total: 0, auto: 0 };
    entry.total += 1;
    if (c.automation === 2) entry.auto += 1;
    byWeek.set(key, entry);
  }

  const sortedKeys = [...byWeek.keys()].sort();
  const now = new Date();
  const currentKey = isoWeekKey(now);
  const allKeys: string[] = [];
  for (let i = weeksBack - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i * 7);
    allKeys.push(isoWeekKey(d));
  }

  // Compute cumulative totals up to first displayed week
  let cumTotal = 0;
  let cumAuto = 0;
  for (const key of sortedKeys) {
    if (key >= allKeys[0]) break;
    const entry = byWeek.get(key)!;
    cumTotal += entry.total;
    cumAuto += entry.auto;
  }

  const rows: WeekRow[] = [];
  let prevRatio: number | null = null;

  for (const key of allKeys) {
    if (key > currentKey) continue;
    const entry = byWeek.get(key) ?? { total: 0, auto: 0 };
    cumTotal += entry.total;
    cumAuto += entry.auto;
    const ratio = cumTotal > 0 ? (cumAuto / cumTotal) * 100 : 0;
    const delta = prevRatio !== null ? ratio - prevRatio : null;

    const analysis = generateAnalysis({
      newTotal: entry.total,
      newAuto: entry.auto,
      ratio,
      delta,
      isCurrentWeek: key === currentKey,
    });

    rows.push({
      weekKey: key,
      label: weekLabel(key),
      newTotal: entry.total,
      newAuto: entry.auto,
      cumTotal,
      cumAuto,
      ratio,
      delta,
      analysis,
    });

    prevRatio = ratio;
  }

  return rows;
}

function generateAnalysis({
  newTotal,
  newAuto,
  ratio,
  delta,
  isCurrentWeek,
}: {
  newTotal: number;
  newAuto: number;
  ratio: number;
  delta: number | null;
  isCurrentWeek: boolean;
}): string {
  if (newTotal === 0) {
    return delta !== null && Math.abs(delta) < 0.01
      ? 'No new cases added. Ratio held steady.'
      : 'No new cases added this week.';
  }

  const autoRate = newTotal > 0 ? Math.round((newAuto / newTotal) * 100) : 0;
  const parts: string[] = [];

  if (isCurrentWeek) parts.push('(Week in progress) ');

  if (delta === null) {
    parts.push(`Starting point: ${newAuto} of ${newTotal} new cases automated (${autoRate}%).`);
  } else if (delta > 2) {
    parts.push(`Strong gain of +${delta.toFixed(1)}%. `);
    parts.push(`${newAuto} of ${newTotal} new cases were automated — great momentum.`);
  } else if (delta > 0.3) {
    parts.push(`Steady improvement (+${delta.toFixed(1)}%). `);
    parts.push(`${newAuto} of ${newTotal} new cases automated.`);
  } else if (Math.abs(delta) <= 0.3) {
    if (newAuto === 0) {
      parts.push(`${newTotal} new cases added, none automated. Ratio stable due to consistent baseline.`);
    } else {
      parts.push(`Stable week — ratio nearly unchanged. ${newAuto} of ${newTotal} new cases automated.`);
    }
  } else if (delta > -1) {
    parts.push(`Slight decline (${delta.toFixed(1)}%). `);
    parts.push(`${newTotal - newAuto} of ${newTotal} new cases were manual.`);
  } else {
    parts.push(`Notable regression (${delta.toFixed(1)}%). `);
    parts.push(`${newTotal - newAuto} of ${newTotal} new cases added were manual — automation coverage diluted.`);
  }

  if (ratio >= 80) parts.push(' Excellent coverage.');
  else if (ratio >= 60) parts.push(' Good coverage overall.');
  else if (ratio < 20) parts.push(' Automation coverage needs attention.');

  return parts.join('');
}

function RatioBadge({ ratio }: { ratio: number }) {
  const color =
    ratio >= 80 ? 'bg-green-100 text-green-700' :
    ratio >= 60 ? 'bg-blue-100 text-blue-700' :
    ratio >= 40 ? 'bg-yellow-100 text-yellow-700' :
    'bg-red-100 text-red-600';
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
      {ratio.toFixed(1)}%
    </span>
  );
}

function DeltaCell({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-gray-300 text-xs">—</span>;
  if (Math.abs(delta) < 0.05) return (
    <span className="flex items-center gap-0.5 text-gray-400 text-xs justify-end">
      <Minus size={11} />0.0%
    </span>
  );
  const positive = delta > 0;
  return (
    <span className={`flex items-center gap-0.5 text-xs font-medium justify-end ${positive ? 'text-green-600' : 'text-red-500'}`}>
      {positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {positive ? '+' : ''}{delta.toFixed(2)}%
    </span>
  );
}

function ProjectAutomationSection({
  project,
  token,
}: {
  project: QaseProject;
  token: string;
}) {
  const totalQuery = useCasesTotal(token, project.code, true);
  const total = totalQuery.data?.result.total ?? 0;
  const casesQuery = useAllCases(token, project.code, total, total > 0);

  const { rows, summary } = useMemo(() => {
    const cases = casesQuery.data ?? [];
    if (cases.length === 0) return { rows: [], summary: null };

    const automated = cases.filter((c) => c.automation === 2).length;
    const toBeAuto = cases.filter((c) => c.automation === 1).length;
    const manual = cases.filter((c) => c.automation === 0).length;
    const ratio = total > 0 ? (automated / total) * 100 : 0;

    return {
      rows: buildWeeklyRows(cases, 20),
      summary: { automated, toBeAuto, manual, ratio, total: cases.length },
    };
  }, [casesQuery.data, total]);

  const isLoading = totalQuery.isLoading || casesQuery.isLoading;
  const isFetching = casesQuery.isFetching;

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
        <span className="font-mono text-xs bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-semibold">{project.code}</span>
        <span className="font-medium text-gray-900 text-sm">{project.title}</span>
        {isFetching && !isLoading && <Loader2 size={12} className="animate-spin text-violet-400 ml-auto" />}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-10 text-gray-400 text-sm">
          <Loader2 size={16} className="animate-spin" /> Loading cases…
        </div>
      )}

      {!isLoading && summary && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-4 px-5 py-4 border-b border-gray-100">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-400 uppercase tracking-wide">Automation Ratio</span>
              <span className={`text-2xl font-bold ${summary.ratio >= 60 ? 'text-green-600' : summary.ratio >= 30 ? 'text-yellow-600' : 'text-red-500'}`}>
                {summary.ratio.toFixed(1)}%
              </span>
              <span className="text-xs text-gray-400">{summary.automated.toLocaleString()} of {summary.total.toLocaleString()} cases</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-400 uppercase tracking-wide flex items-center gap-1"><Bot size={11} /> Automated</span>
              <span className="text-xl font-semibold text-green-600">{summary.automated.toLocaleString()}</span>
              <span className="text-xs text-gray-400">{((summary.automated / summary.total) * 100).toFixed(1)}% of total</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-400 uppercase tracking-wide flex items-center gap-1"><Clock size={11} /> To Be Automated</span>
              <span className="text-xl font-semibold text-yellow-600">{summary.toBeAuto.toLocaleString()}</span>
              <span className="text-xs text-gray-400">{((summary.toBeAuto / summary.total) * 100).toFixed(1)}% of total</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-400 uppercase tracking-wide flex items-center gap-1"><Wrench size={11} /> Manual</span>
              <span className="text-xl font-semibold text-gray-600">{summary.manual.toLocaleString()}</span>
              <span className="text-xs text-gray-400">{((summary.manual / summary.total) * 100).toFixed(1)}% of total</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="px-5 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs text-gray-400">Coverage breakdown</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex">
              <div
                className="bg-green-500 h-full transition-all"
                style={{ width: `${(summary.automated / summary.total) * 100}%` }}
              />
              <div
                className="bg-yellow-400 h-full transition-all"
                style={{ width: `${(summary.toBeAuto / summary.total) * 100}%` }}
              />
            </div>
            <div className="flex gap-4 mt-1.5 text-xs text-gray-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Automated</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> To Be Automated</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-200 inline-block" /> Manual</span>
            </div>
          </div>

          {/* Weekly table */}
          {rows.length > 0 && (
            <div>
              <table className="w-full text-sm table-fixed">
                <colgroup>
                  <col className="w-44" />
                  <col className="w-20" />
                  <col className="w-20" />
                  <col className="w-20" />
                  <col className="w-20" />
                  <col className="w-24" />
                  <col className="w-24" />
                  <col />
                </colgroup>
                <thead>
                  <tr className="bg-gray-50 border-t border-gray-200 text-xs uppercase tracking-wide text-gray-400">
                    <th className="text-left px-4 py-2.5 font-medium">Week</th>
                    <th className="text-right px-3 py-2.5 font-medium">New Cases</th>
                    <th className="text-right px-3 py-2.5 font-medium text-green-600">New Auto</th>
                    <th className="text-right px-3 py-2.5 font-medium">Total</th>
                    <th className="text-right px-3 py-2.5 font-medium text-green-600">Automated</th>
                    <th className="text-right px-3 py-2.5 font-medium">Ratio</th>
                    <th className="text-right px-3 py-2.5 font-medium">Delta</th>
                    <th className="text-left px-4 py-2.5 font-medium">Analysis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[...rows].reverse().map((row) => (
                    <tr key={row.weekKey} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 text-xs text-gray-600 whitespace-nowrap">{row.label}</td>
                      <td className="px-3 py-2.5 text-right text-gray-700">{row.newTotal || <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2.5 text-right text-green-600 font-medium">
                        {row.newAuto > 0 ? row.newAuto : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-700">{row.cumTotal.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right text-green-600 font-medium">{row.cumAuto.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right"><RatioBadge ratio={row.ratio} /></td>
                      <td className="px-3 py-2.5"><DeltaCell delta={row.delta} /></td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 leading-relaxed">{row.analysis}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function AutomationReport({ projects, workspace }: Props) {
  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Automation Ratio Report</h2>
        <p className="text-sm text-gray-400 mt-0.5">
          Weekly cumulative automation coverage — based on case creation dates and current automation status.
          Delta shows week-over-week change in ratio.
        </p>
      </div>
      {projects.map((project) => (
        <ProjectAutomationSection
          key={project.code}
          project={project}
          token={workspace.token}
        />
      ))}
    </div>
  );
}
