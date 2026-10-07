import { useState, useMemo } from 'react';
import {
  Loader2, ChevronDown, TrendingUp, TrendingDown, Minus,
  CheckCircle2, XCircle, AlertCircle, Clock, Users, Play, BarChart2, Layers,
} from 'lucide-react';
import type { QaseProject, QaseRun, QaseResult, QaseUser, Workspace } from '../types/qase';
import { useAllRuns } from '../hooks/useRuns';
import { useUsers } from '../hooks/useUsers';
import { usePeriodResults } from '../hooks/useResults';
import { ExternalIssueLink } from './ExternalIssueLink';
import { useProjectCaseMap } from '../hooks/useSuites';
import { useAllMilestones } from '../hooks/useMilestones';

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
}

interface SuiteStat {
  name: string;
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  passRate: number;
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

// ─── Suite stats from results ─────────────────────────────────────────────────────────────

function buildSuiteStats(results: QaseResult[], caseToSuite: Map<number, string>): SuiteStat[] {
  const map = new Map<string, { total: number; passed: number; failed: number; blocked: number; skipped: number }>();
  for (const r of results) {
    const name = r.case?.suite_title?.trim() || caseToSuite.get(r.case_id) || '(No suite)';
    const entry = map.get(name) ?? { total: 0, passed: 0, failed: 0, blocked: 0, skipped: 0 };
    entry.total += 1;
    const s = r.status.toLowerCase();
    if (s === 'passed') entry.passed += 1;
    else if (s === 'failed') entry.failed += 1;
    else if (s === 'blocked') entry.blocked += 1;
    else if (s === 'skipped' || s === 'invalid') entry.skipped += 1;
    map.set(name, entry);
  }
  return [...map.entries()]
    .map(([name, s]) => ({
      name,
      ...s,
      passRate: s.total > 0 ? (s.passed / s.total) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

// ─── Detailed suite-aware narrative ──────────────────────────────────────────────────────

function generateDetailedAnalysis(week: WeekData, suites: SuiteStat[]): string {
  if (suites.length === 0 || week.total === 0) return '';

  const parts: string[] = [];
  const totalResults = suites.reduce((s, x) => s + x.total, 0);

  // Coverage breadth
  const suiteNames = suites.slice(0, 5).map((s) => `"${s.name}"`);
  const moreCount = suites.length > 5 ? suites.length - 5 : 0;
  const suiteList = moreCount > 0
    ? `${suiteNames.join(', ')}, and ${moreCount} more suite${moreCount !== 1 ? 's' : ''}`
    : suiteNames.join(suiteNames.length > 1 ? ', and ' : '');
  parts.push(
    `This period covered ${suites.length} suite${suites.length !== 1 ? 's' : ''} across ${totalResults.toLocaleString()} test case execution${totalResults !== 1 ? 's' : ''} in ${week.runs.length} run${week.runs.length !== 1 ? 's' : ''}: ${suiteList}.`,
  );

  // Best performing suites
  const topSuites = suites.filter((s) => s.total >= 3 && s.passRate === 100);
  if (topSuites.length > 0) {
    const names = topSuites.slice(0, 3).map((s) => `"${s.name}" (${s.total} cases)`).join(', ');
    parts.push(`Full coverage with 100% pass rate in ${names}.`);
  }

  // Worst-performing suites (by pass rate, min 3 cases)
  const failingSuites = suites
    .filter((s) => s.total >= 3 && s.passRate < 70)
    .sort((a, b) => a.passRate - b.passRate)
    .slice(0, 3);
  if (failingSuites.length > 0) {
    const details = failingSuites.map((s) => {
      const pct = s.passRate.toFixed(0);
      return `"${s.name}" (${pct}% pass, ${s.failed} failed${s.blocked > 0 ? `, ${s.blocked} blocked` : ''})`;
    }).join('; ');
    parts.push(`Areas needing attention: ${details}.`);
  }

  // Suites with blocks
  const blockedSuites = suites.filter((s) => s.blocked > 0).sort((a, b) => b.blocked - a.blocked).slice(0, 3);
  if (blockedSuites.length > 0) {
    const detail = blockedSuites.map((s) => `"${s.name}" (${s.blocked} blocked)`).join(', ');
    parts.push(`Blocked test cases detected in ${detail} — dependencies or environment issues may be blocking progress.`);
  }

  // Skipped
  const totalSkipped = suites.reduce((s, x) => s + x.skipped, 0);
  const skipRate = totalResults > 0 ? totalSkipped / totalResults : 0;
  if (skipRate > 0.1) {
    const skippedSuites = suites.filter((s) => s.skipped > 0).sort((a, b) => b.skipped - a.skipped).slice(0, 2);
    const detail = skippedSuites.map((s) => `"${s.name}" (${s.skipped})`).join(', ');
    parts.push(`${(skipRate * 100).toFixed(0)}% of cases were skipped or invalid, mainly in ${detail}. Review whether these are intentional exclusions.`);
  }

  // Most tested suite
  const mostTested = suites[0];
  if (mostTested && mostTested.total > totalResults * 0.3) {
    parts.push(`"${mostTested.name}" was the most exercised area, accounting for ${((mostTested.total / totalResults) * 100).toFixed(0)}% of all cases executed this period.`);
  }

  // Overall suite health summary
  const healthySuites = suites.filter((s) => s.passRate >= 90).length;
  const criticalSuites = suites.filter((s) => s.passRate < 70 && s.total >= 3).length;
  if (suites.length >= 3) {
    parts.push(
      `Suite health: ${healthySuites} of ${suites.length} suites at ≥90% pass rate${criticalSuites > 0 ? `, ${criticalSuites} suite${criticalSuites !== 1 ? 's' : ''} below 70% requiring follow-up` : ''}.`,
    );
  }

  return parts.join(' ');
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

// ─── Build dataset (weekly or bi-weekly) ─────────────────────────────────────────────────

// Returns the monday Date for a given ISO week key
function mondayOfWeek(weekKey: string): Date {
  const [year, w] = weekKey.split('-W');
  const jan4 = new Date(Date.UTC(Number(year), 0, 4));
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1) + (Number(w) - 1) * 7);
  return monday;
}

function periodLabel(weekKeys: string[]): string {
  if (weekKeys.length === 1) return weekLabel(weekKeys[0]);
  const start = mondayOfWeek(weekKeys[0]);
  const endMonday = mondayOfWeek(weekKeys[weekKeys.length - 1]);
  const endSunday = new Date(endMonday);
  endSunday.setUTCDate(endMonday.getUTCDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const year = endSunday.getUTCFullYear();
  return `${fmt(start)} – ${fmt(endSunday)}, ${year}`;
}

type Granularity = 'weekly' | 'biweekly';

function buildWeeklyData(runs: QaseRun[], granularity: Granularity = 'weekly', periodsBack = 20): WeekData[] {
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

  // Build flat list of ISO week keys going back far enough
  const step = granularity === 'biweekly' ? 2 : 1;
  const weeksNeeded = periodsBack * step;
  const allWeekKeys: string[] = [];
  for (let i = weeksNeeded - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i * 7);
    allWeekKeys.push(isoWeekKey(d));
  }

  // Group into periods (1 or 2 weeks each)
  const periods: string[][] = [];
  for (let i = 0; i < allWeekKeys.length; i += step) {
    periods.push(allWeekKeys.slice(i, i + step));
  }

  const result: WeekData[] = [];
  let prevPassRate: number | null = null;

  for (const periodWeeks of periods) {
    const lastKey = periodWeeks[periodWeeks.length - 1];
    if (lastKey > currentKey) continue;

    const periodRuns = periodWeeks.flatMap((k) => byWeek.get(k) ?? []);
    const isCurrentPeriod = periodWeeks.includes(currentKey);

    const totals = periodRuns.reduce(
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
      weekKey: periodWeeks[0],
      label: periodLabel(periodWeeks),
      isCurrentWeek: isCurrentPeriod,
      runs: periodRuns,
      ...totals,
      passRate,
      delta,
      analysis: generateWeekAnalysis({
        runs: periodRuns,
        passRate,
        delta,
        total: totals.total,
        failed: totals.failed,
        blocked: totals.blocked,
        skipped: totals.skipped,
        isCurrentWeek: isCurrentPeriod,
      }),
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
        <div className="flex items-center gap-2 mt-0.5">
          {author && <span className="text-xs text-gray-400">by {author.name}</span>}
          <ExternalIssueLink issue={run.external_issue} />
        </div>
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

function SuiteCoverage({ suites, isLoading }: { suites: SuiteStat[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
        <Loader2 size={12} className="animate-spin" /> Loading suite coverage…
      </div>
    );
  }
  if (suites.length === 0) return null;

  const top = suites.slice(0, 15);
  const hasFailed = top.some((s) => s.failed > 0);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-400 border-b border-gray-100">
              <th className="text-left pb-2 font-medium pr-4">Suite / Area</th>
              <th className="text-right pb-2 font-medium px-2 w-16">Cases</th>
              <th className="text-right pb-2 font-medium px-2 w-16">Pass %</th>
              {hasFailed && <th className="text-right pb-2 font-medium px-2 w-16 text-red-400">Failed</th>}
              {top.some((s) => s.blocked > 0) && <th className="text-right pb-2 font-medium px-2 w-16 text-orange-400">Blocked</th>}
              <th className="pb-2 w-32 pl-4">Distribution</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {top.map((suite) => {
              const passColor = suite.passRate >= 90 ? 'text-green-600'
                : suite.passRate >= 70 ? 'text-yellow-600'
                : 'text-red-500';
              const pct = (n: number) => suite.total > 0 ? (n / suite.total) * 100 : 0;
              return (
                <tr key={suite.name} className="group">
                  <td className="py-2 pr-4 text-gray-700 font-medium max-w-xs">
                    <span className="truncate block" title={suite.name}>{suite.name}</span>
                  </td>
                  <td className="py-2 px-2 text-right text-gray-500">{suite.total.toLocaleString()}</td>
                  <td className={`py-2 px-2 text-right font-semibold ${passColor}`}>
                    {suite.total > 0 ? `${suite.passRate.toFixed(0)}%` : '—'}
                  </td>
                  {hasFailed && (
                    <td className="py-2 px-2 text-right text-red-500">
                      {suite.failed > 0 ? suite.failed.toLocaleString() : <span className="text-gray-200">—</span>}
                    </td>
                  )}
                  {top.some((s) => s.blocked > 0) && (
                    <td className="py-2 px-2 text-right text-orange-500">
                      {suite.blocked > 0 ? suite.blocked.toLocaleString() : <span className="text-gray-200">—</span>}
                    </td>
                  )}
                  <td className="py-2 pl-4">
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden flex w-28">
                      <div className="bg-green-500 h-full" style={{ width: `${pct(suite.passed)}%` }} />
                      <div className="bg-red-400 h-full" style={{ width: `${pct(suite.failed)}%` }} />
                      <div className="bg-orange-400 h-full" style={{ width: `${pct(suite.blocked)}%` }} />
                      <div className="bg-gray-300 h-full" style={{ width: `${pct(suite.skipped)}%` }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {suites.length > 15 && (
        <p className="text-xs text-gray-400">…and {suites.length - 15} more suites</p>
      )}
    </div>
  );
}

function WeekSection({
  week,
  users,
  token,
  projectCode,
  caseToSuite,
}: {
  week: WeekData;
  users: QaseUser[];
  token: string;
  projectCode: string;
  caseToSuite: Map<number, string>;
}) {
  const [open, setOpen] = useState(false);

  const resultsQuery = usePeriodResults(token, projectCode, week.runs, open && week.runs.length > 0);
  const suiteStats = useMemo(
    () => (resultsQuery.data ? buildSuiteStats(resultsQuery.data, caseToSuite) : []),
    [resultsQuery.data, caseToSuite],
  );

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

          {/* Analysis — general stats-based summary */}
          <div className="px-5 py-3 bg-blue-50 border-l-4 border-blue-300">
            <p className="text-xs font-semibold text-blue-600 mb-1 uppercase tracking-wide">Summary</p>
            <p className="text-xs text-blue-700 leading-relaxed">{week.analysis}</p>
          </div>

          {/* Detailed suite-aware narrative — shown once results are loaded */}
          {resultsQuery.isLoading && (
            <div className="px-5 py-3 bg-indigo-50 border-l-4 border-indigo-200">
              <div className="flex items-center gap-2 text-xs text-indigo-400">
                <Loader2 size={11} className="animate-spin" /> Building detailed report…
              </div>
            </div>
          )}
          {!resultsQuery.isLoading && suiteStats.length > 0 && (() => {
            const narrative = generateDetailedAnalysis(week, suiteStats);
            return narrative ? (
              <div className="px-5 py-3 bg-indigo-50 border-l-4 border-indigo-300">
                <p className="text-xs font-semibold text-indigo-600 mb-1 uppercase tracking-wide">Detailed Analysis</p>
                <p className="text-xs text-indigo-800 leading-relaxed">{narrative}</p>
              </div>
            ) : null;
          })()}

          {/* Areas covered — suite breakdown from actual test results */}
          <div className="px-5 py-3">
            <p className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wide flex items-center gap-1.5">
              <Layers size={11} /> Areas covered
              {resultsQuery.isFetching && <Loader2 size={10} className="animate-spin text-gray-300" />}
              {resultsQuery.data && (
                <span className="font-normal normal-case text-gray-400 ml-1">
                  {resultsQuery.data.length.toLocaleString()} results · {suiteStats.length} suite{suiteStats.length !== 1 ? 's' : ''}
                </span>
              )}
            </p>
            <SuiteCoverage suites={suiteStats} isLoading={resultsQuery.isLoading} />
          </div>

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
        { label: 'Total runs', value: totalRuns.toLocaleString(), sub: `last ${activeWeeks.length} periods`, icon: <Play size={14} /> },
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

function ProjectWeeklySection({
  project,
  token,
  granularity,
}: {
  project: QaseProject;
  token: string;
  granularity: Granularity;
}) {
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<number | null>(null);

  const totalRuns = project.counts.runs.total;
  const totalCases = project.counts.cases;
  const runsQuery = useAllRuns(token, project.code, '', totalRuns, totalRuns > 0);
  const usersQuery = useUsers(token);
  const caseMapQuery = useProjectCaseMap(token, project.code, totalCases, totalCases > 0);
  const milestonesQuery = useAllMilestones(token, project.code, true);

  const users = usersQuery.data?.result.entities ?? [];
  const caseToSuite: Map<number, string> = caseMapQuery.data ?? new Map();
  const milestones = useMemo(
    () => [...(milestonesQuery.data ?? [])].sort((a, b) => {
      const da = new Date(a.due_date ?? a.created_at).getTime();
      const db = new Date(b.due_date ?? b.created_at).getTime();
      return db - da; // most recent first
    }),
    [milestonesQuery.data],
  );
  const isLoading = runsQuery.isLoading;
  const isFetching = runsQuery.isFetching && !runsQuery.isLoading;

  const weeks = useMemo(() => {
    if (!runsQuery.data) return [];
    const milestoneTitle = milestones.find((m) => m.id === selectedMilestoneId)?.title;
    const runs = milestoneTitle !== undefined
      ? runsQuery.data.filter((r) => r.milestone?.title === milestoneTitle)
      : runsQuery.data;
    if (milestoneTitle === undefined) return buildWeeklyData(runs, granularity, 20);

    // A milestone can span older runs than the default window: widen the range to cover them.
    const starts = runs.map((r) => (r.start_time ? new Date(r.start_time).getTime() : NaN)).filter((t) => !isNaN(t));
    if (starts.length === 0) return [];
    const weeksSpan = Math.ceil((Date.now() - Math.min(...starts)) / (7 * 86400000)) + 1;
    const step = granularity === 'biweekly' ? 2 : 1;
    const periodsBack = Math.min(Math.max(20, Math.ceil(weeksSpan / step)), 150);
    return buildWeeklyData(runs, granularity, periodsBack).filter((w) => w.runs.length > 0);
  }, [runsQuery.data, granularity, selectedMilestoneId, milestones]);

  const activeWeeks = weeks.filter((w) => w.total > 0);

  return (
    <div className="space-y-4">
      {/* Milestone filter */}
      {milestones.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 font-medium flex-shrink-0">Milestone:</span>
          <select
            value={selectedMilestoneId ?? ''}
            onChange={(e) => setSelectedMilestoneId(e.target.value === '' ? null : Number(e.target.value))}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent cursor-pointer"
          >
            <option value="">All runs</option>
            {milestones.map((m) => (
              <option key={m.id} value={m.id}>{m.title}</option>
            ))}
          </select>
        </div>
      )}

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
        <p className="text-center text-gray-400 py-12 text-sm">
          {selectedMilestoneId !== null
            ? 'No test runs found for the selected milestone.'
            : 'No test runs with start dates found for this project.'}
        </p>
      )}

      {!isLoading && activeWeeks.length > 0 && (
        <>
          <SummaryStats weeks={weeks} />
          <div className="space-y-3">
            {weeks.map((week) => (
              <WeekSection
                key={week.weekKey}
                week={week}
                users={users}
                token={token}
                projectCode={project.code}
                caseToSuite={caseToSuite}
              />
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
  const [granularity, setGranularity] = useState<Granularity>('weekly');
  const selected = projects.find((p) => p.code === selectedCode) ?? projects[0];

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Weekly Test Run Report</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Per-period breakdown of test execution — pass rates, failure trends, areas covered, and author activity.
            Based on run start dates, most recent 500 runs.
          </p>
        </div>
        {/* Granularity toggle */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 flex-shrink-0">
          <button
            onClick={() => setGranularity('weekly')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${granularity === 'weekly' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Weekly
          </button>
          <button
            onClick={() => setGranularity('biweekly')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${granularity === 'biweekly' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Bi-weekly
          </button>
        </div>
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
          granularity={granularity}
        />
      )}
    </div>
  );
}
