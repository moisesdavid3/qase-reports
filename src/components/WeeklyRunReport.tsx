import { useState, useMemo } from 'react';
import {
  Loader2, ChevronDown, TrendingUp, TrendingDown, Minus,
  CheckCircle2, XCircle, AlertCircle, Clock, Users, Play, BarChart2, Layers, Copy, Check,
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

// ─── Detailed suite-aware analysis ───────────────────────────────────────────────────────

interface SuiteSection {
  name: string;
  passRate: number;
  tone: 'good' | 'warn' | 'bad';
  bullets: string[];
}

interface DetailedAnalysisData {
  overview: string[];
  suites: SuiteSection[];
  hiddenSuites: number;
}

const MAX_SUITE_SECTIONS = 10;

function buildDetailedAnalysis(runCount: number, suites: SuiteStat[]): DetailedAnalysisData | null {
  if (suites.length === 0) return null;
  const totalResults = suites.reduce((s, x) => s + x.total, 0);
  const plural = (n: number, w: string) => `${n.toLocaleString()} ${w}${n !== 1 ? 's' : ''}`;

  const overview: string[] = [
    `Coverage: ${plural(suites.length, 'suite')}, ${plural(totalResults, 'test case execution')} across ${plural(runCount, 'run')}.`,
  ];
  const mostTested = suites[0];
  if (mostTested.total > totalResults * 0.3) {
    overview.push(`Most exercised area: "${mostTested.name}" (${((mostTested.total / totalResults) * 100).toFixed(0)}% of all executions).`);
  }
  if (suites.length >= 3) {
    const healthy = suites.filter((s) => s.passRate >= 90).length;
    const critical = suites.filter((s) => s.passRate < 70 && s.total >= 3).length;
    overview.push(
      `Suite health: ${healthy} of ${suites.length} at 90%+ pass rate${critical > 0 ? `; ${critical} below 70% need follow-up` : ''}.`,
    );
  }
  const totalSkipped = suites.reduce((s, x) => s + x.skipped, 0);
  if (totalResults > 0 && totalSkipped / totalResults > 0.1) {
    overview.push(`${((totalSkipped / totalResults) * 100).toFixed(0)}% of executions were skipped or invalid; confirm these exclusions are intentional.`);
  }

  const sections: SuiteSection[] = suites.slice(0, MAX_SUITE_SECTIONS).map((s) => {
    const bullets = [
      `${plural(s.total, 'execution')}: ${s.passed.toLocaleString()} passed, ${s.failed.toLocaleString()} failed${s.blocked > 0 ? `, ${s.blocked.toLocaleString()} blocked` : ''}${s.skipped > 0 ? `, ${s.skipped.toLocaleString()} skipped` : ''}.`,
    ];
    let tone: SuiteSection['tone'] = 'warn';
    if (s.total >= 3 && s.passRate === 100) {
      tone = 'good';
      bullets.push('Full coverage with a 100% pass rate.');
    } else if (s.passRate >= 90) {
      tone = 'good';
      bullets.push('Healthy: no follow-up needed.');
    } else if (s.passRate < 70 && s.total >= 3) {
      tone = 'bad';
      bullets.push(`Needs attention: ${s.failed.toLocaleString()} failures drive the ${s.passRate.toFixed(0)}% pass rate.`);
    }
    if (s.blocked > 0) bullets.push('Blocked cases suggest a dependency or environment issue.');
    return { name: s.name, passRate: s.passRate, tone, bullets };
  });

  return { overview, suites: sections, hiddenSuites: Math.max(0, suites.length - MAX_SUITE_SECTIONS) };
}

// ─── Test run digest ─────────────────────────────────────────────────────────────────────

interface DigestGroup {
  name: string;
  runs: number;
  cases: number;
  passed: number;
  firstDay: Date;
  lastDay: Date;
  issues: string[];
  authors: string[];
  suites: string[];
}

// Strips the Jira key prefix and the auto-generated "<id>-<ddmmyyyy>-<yyyy-mm-dd>" suffix so runs of the same kind group together.
function normalizeRunTitle(title: string): string {
  const clean = title
    .replace(/\s*\d+-\d{8}-\d{4}-\d{2}-\d{2}\s*$/, '')
    .replace(/\s*[-–]?\s*\d{4}-\d{2}-\d{2}\s*$/, '')
    .replace(/^[A-Z][A-Z0-9]+-\d+\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean || title;
}

function buildDigest(runs: QaseRun[], users: QaseUser[], results: QaseResult[] | undefined, caseToSuite: Map<number, string>): DigestGroup[] {
  const suitesByRun = new Map<number, Map<string, number>>();
  for (const r of results ?? []) {
    const name = r.case?.suite_title?.trim() || caseToSuite.get(r.case_id);
    if (!name) continue;
    const m = suitesByRun.get(r.run_id) ?? new Map<string, number>();
    m.set(name, (m.get(name) ?? 0) + 1);
    suitesByRun.set(r.run_id, m);
  }

  const groups = new Map<string, { runs: QaseRun[]; suites: Map<string, number> }>();
  for (const r of runs) {
    const key = normalizeRunTitle(r.title);
    const g = groups.get(key) ?? { runs: [], suites: new Map<string, number>() };
    g.runs.push(r);
    for (const [n, c] of suitesByRun.get(r.id) ?? []) g.suites.set(n, (g.suites.get(n) ?? 0) + c);
    groups.set(key, g);
  }

  return [...groups.entries()]
    .map(([name, g]) => {
      const times = g.runs.map((r) => new Date(r.start_time as string).getTime());
      const issues = [...new Set(g.runs.map((r) => r.external_issue?.id).filter((x): x is string => !!x))];
      const authors = [...new Set(g.runs.map((r) => users.find((u) => u.id === r.user_id)?.name).filter((x): x is string => !!x))];
      return {
        name,
        runs: g.runs.length,
        cases: g.runs.reduce((s, r) => s + r.stats.total, 0),
        passed: g.runs.reduce((s, r) => s + r.stats.passed, 0),
        firstDay: new Date(Math.min(...times)),
        lastDay: new Date(Math.max(...times)),
        issues,
        authors,
        suites: [...g.suites.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n),
      };
    })
    .sort((a, b) => b.cases - a.cases);
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

type Granularity = 'weekly' | 'biweekly' | 'custom';

interface DateRange {
  from: string; // YYYY-MM-DD (local)
  to: string;
}

function parseLocalDate(s: string, endOfDay = false): Date {
  const [y, m, d] = s.split('-').map(Number);
  return endOfDay ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d, 0, 0, 0, 0);
}

function toInputDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function lastDaysRange(days: number): DateRange {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - (days - 1));
  return { from: toInputDate(from), to: toInputDate(to) };
}

function sumStats(runs: QaseRun[]) {
  return runs.reduce(
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
}

function runsBetween(runs: QaseRun[], start: Date, end: Date): QaseRun[] {
  return runs.filter((r) => {
    if (!r.start_time) return false;
    const t = new Date(r.start_time).getTime();
    return t >= start.getTime() && t <= end.getTime();
  });
}

// A single period covering the user's range; delta is measured against the equally long range just before it.
function buildCustomData(runs: QaseRun[], range: DateRange): WeekData[] {
  const start = parseLocalDate(range.from);
  const end = parseLocalDate(range.to, true);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return [];

  const periodRuns = runsBetween(runs, start, end);
  const totals = sumStats(periodRuns);
  const passRate = totals.total > 0 ? (totals.passed / totals.total) * 100 : 0;

  const spanMs = end.getTime() - start.getTime() + 1;
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(start.getTime() - spanMs);
  const prevTotals = sumStats(runsBetween(runs, prevStart, prevEnd));
  const delta = totals.total > 0 && prevTotals.total > 0
    ? passRate - (prevTotals.passed / prevTotals.total) * 100
    : null;

  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const now = Date.now();
  const isCurrent = start.getTime() <= now && now <= end.getTime();

  return [{
    weekKey: `custom-${range.from}-${range.to}`,
    label: `${fmt(start)} – ${fmt(end)}`,
    isCurrentWeek: isCurrent,
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
      isCurrentWeek: isCurrent,
    })
      .replace('(Week in progress.)', '(Period in progress.)')
      .replace('Baseline week', 'Baseline period')
      .replace('Stable week', 'Stable period')
      .replace('recorded this week', 'recorded in this period')
      .replace(/^(Significant improvement|Steady improvement|Slight regression|Notable regression) \(([^)]*)pp\)/, '$1 ($2pp vs previous period)'),
  }];
}

function buildWeeklyData(runs: QaseRun[], granularity: 'weekly' | 'biweekly' = 'weekly', periodsBack = 20): WeekData[] {
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

function DetailedAnalysis({ data }: { data: DetailedAnalysisData }) {
  const toneClass = { good: 'text-green-600', warn: 'text-yellow-600', bad: 'text-red-500' };
  return (
    <div className="px-5 py-3 bg-indigo-50 border-l-4 border-indigo-300 space-y-3">
      <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">Detailed Analysis</p>
      <ul className="list-disc pl-4 space-y-1 text-xs text-indigo-900 leading-relaxed">
        {data.overview.map((b) => <li key={b}>{b}</li>)}
      </ul>
      <div className="grid gap-2 md:grid-cols-2">
        {data.suites.map((s) => (
          <div key={s.name} className="rounded-lg bg-white/70 border border-indigo-100 px-3 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs font-semibold text-gray-800 truncate" title={s.name}>{s.name}</p>
              <span className={`text-xs font-bold flex-shrink-0 ${toneClass[s.tone]}`}>{s.passRate.toFixed(0)}%</span>
            </div>
            <ul className="list-disc pl-4 mt-1 space-y-0.5 text-xs text-gray-600">
              {s.bullets.map((b) => <li key={b}>{b}</li>)}
            </ul>
          </div>
        ))}
      </div>
      {data.hiddenSuites > 0 && (
        <p className="text-xs text-indigo-500">…and {data.hiddenSuites} more suite{data.hiddenSuites !== 1 ? 's' : ''} (see Areas covered).</p>
      )}
    </div>
  );
}

function RunsDigest({ groups, runCount, loadingSuites }: { groups: DigestGroup[]; runCount: number; loadingSuites: boolean }) {
  if (groups.length === 0) return null;
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const top = groups.slice(0, 12);
  const focus = groups.slice(0, 3).map((g) => `"${g.name}"`).join(', ');
  return (
    <div className="px-5 py-3 bg-emerald-50 border-l-4 border-emerald-300 space-y-2">
      <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide flex items-center gap-1.5">
        Test runs digest
        {loadingSuites && <Loader2 size={10} className="animate-spin text-emerald-400" />}
      </p>
      <p className="text-xs text-emerald-900">
        {runCount} run{runCount !== 1 ? 's' : ''} grouped into {groups.length} distinct testing effort{groups.length !== 1 ? 's' : ''}. Main focus: {focus}.
      </p>
      <ul className="list-disc pl-4 space-y-1.5 text-xs text-gray-700">
        {top.map((g) => (
          <li key={g.name}>
            <span className="font-semibold text-gray-900">{g.name}</span>
            <span className="text-gray-500">
              {' '}— {g.runs} run{g.runs !== 1 ? 's' : ''}, {g.cases.toLocaleString()} cases, {g.cases > 0 ? ((g.passed / g.cases) * 100).toFixed(0) : 0}% pass,{' '}
              {g.firstDay.toDateString() === g.lastDay.toDateString() ? fmt(g.firstDay) : `${fmt(g.firstDay)}–${fmt(g.lastDay)}`}
              {g.issues.length > 0 && <> · {g.issues.join(', ')}</>}
              {g.authors.length > 0 && <> · {g.authors.join(', ')}</>}
            </span>
            {g.suites.length > 0 && (
              <div className="text-gray-500">Covered: {g.suites.join(', ')}</div>
            )}
          </li>
        ))}
      </ul>
      {groups.length > top.length && (
        <p className="text-xs text-emerald-600">…and {groups.length - top.length} more.</p>
      )}
    </div>
  );
}

function buildSlideSummary(
  label: string,
  kept: { total: number; passRate: number; failed: number },
  runCount: number,
  totalRuns: number,
  digest: DigestGroup[],
  suites: SuiteStat[],
): { title: string; bullets: string[]; note: string } {
  const bullets = [
    `${runCount} test run${runCount !== 1 ? 's' : ''} · ${kept.total.toLocaleString()} cases executed · ${kept.passRate.toFixed(0)}% pass rate`,
  ];
  if (digest.length > 0) {
    bullets.push(`Testing focus: ${digest.slice(0, 4).map((g) => g.name).join('; ')}`);
  }
  if (suites.length > 0) {
    bullets.push(`Areas covered: ${suites.length} suites, most tested ${suites.slice(0, 3).map((x) => x.name).join(', ')}`);
    const weak = suites.filter((x) => x.total >= 3 && x.passRate < 70).slice(0, 3);
    bullets.push(
      weak.length > 0
        ? `Needs follow-up: ${weak.map((x) => `${x.name} (${x.passRate.toFixed(0)}%)`).join(', ')}`
        : 'No suites below 70% pass rate',
    );
  }
  return {
    title: `QE test execution · ${label}`,
    bullets,
    note: `Based on runs with ${MIN_PASS_RATE}%+ pass rate (${runCount} of ${totalRuns}).`,
  };
}

function SlideSummary({ title, bullets, note }: { title: string; bullets: string[]; note: string }) {
  const [copied, setCopied] = useState(false);
  const text = `${title}\n${bullets.map((b) => `• ${b}`).join('\n')}\n${note}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (!ok) {
        window.prompt('Copy the summary:', text);
        return;
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="px-5 py-3 bg-amber-50 border-l-4 border-amber-300">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Slide summary</p>
        <button
          onClick={copy}
          className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-700 bg-white border border-amber-200 rounded-md hover:bg-amber-100 transition-colors"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="text-sm font-semibold text-gray-900">{title}</p>
      <ul className="list-disc pl-4 mt-1 space-y-0.5 text-xs text-gray-700">
        {bullets.map((b) => <li key={b}>{b}</li>)}
      </ul>
      <p className="text-[11px] text-gray-400 mt-1.5">{note}</p>
    </div>
  );
}

const MIN_PASS_RATE = 70;

function meetsPassRate(r: QaseRun): boolean {
  return r.stats.total > 0 && (r.stats.passed / r.stats.total) * 100 >= MIN_PASS_RATE;
}

function dayKey(r: QaseRun): string {
  return toInputDate(new Date(r.start_time as string));
}

function dayLabel(key: string): string {
  return parseLocalDate(key).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function generateKeptSummary(kept: QaseRun[], all: QaseRun[], t: ReturnType<typeof sumStats>, passRate: number): string {
  const parts = [
    `Based on the ${kept.length} of ${all.length} run${all.length !== 1 ? 's' : ''} with ${MIN_PASS_RATE}%+ pass rate: ${t.total.toLocaleString()} cases executed, ${passRate.toFixed(1)}% pass rate.`,
  ];
  if (t.failed > 0) parts.push(`${t.failed.toLocaleString()} cases failed (${((t.failed / t.total) * 100).toFixed(1)}%).`);
  if (t.blocked > 0) parts.push(`${t.blocked.toLocaleString()} cases blocked.`);
  if (t.skipped > 0 && t.skipped / t.total > 0.1) parts.push(`High skip rate (${((t.skipped / t.total) * 100).toFixed(0)}%).`);
  return parts.join(' ');
}

function WeekSection({
  week,
  users,
  token,
  projectCode,
  caseToSuite,
  defaultOpen = false,
}: {
  defaultOpen?: boolean;
  week: WeekData;
  users: QaseUser[];
  token: string;
  projectCode: string;
  caseToSuite: Map<number, string>;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const keptRuns = useMemo(() => week.runs.filter(meetsPassRate), [week.runs]);
  const kept = useMemo(() => {
    const t = sumStats(keptRuns);
    const passRate = t.total > 0 ? (t.passed / t.total) * 100 : 0;
    return { ...t, passRate, analysis: generateKeptSummary(keptRuns, week.runs, t, passRate) };
  }, [keptRuns, week.runs]);

  const resultsQuery = usePeriodResults(token, projectCode, keptRuns, open && keptRuns.length > 0);
  const suiteStats = useMemo(
    () => (resultsQuery.data ? buildSuiteStats(resultsQuery.data, caseToSuite) : []),
    [resultsQuery.data, caseToSuite],
  );

  const analysis = useMemo(() => buildDetailedAnalysis(keptRuns.length, suiteStats), [keptRuns.length, suiteStats]);
  const digest = useMemo(
    () => buildDigest(keptRuns, users, resultsQuery.data, caseToSuite),
    [keptRuns, users, resultsQuery.data, caseToSuite],
  );

  const slide = useMemo(
    () => buildSlideSummary(week.label, kept, keptRuns.length, week.runs.length, digest, suiteStats),
    [week.label, kept, keptRuns.length, week.runs.length, digest, suiteStats],
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

      {open && week.total > 0 && keptRuns.length === 0 && (
        <p className="px-5 py-4 text-xs text-gray-400">
          None of the {week.runs.length} run{week.runs.length !== 1 ? 's' : ''} in this period reached {MIN_PASS_RATE}% pass rate.
        </p>
      )}

      {open && week.total > 0 && keptRuns.length > 0 && (
        <div className="divide-y divide-gray-100">
          <p className="px-5 py-2 text-xs text-gray-400 bg-white">
            Showing only runs with {MIN_PASS_RATE}%+ pass rate ({keptRuns.length} of {week.runs.length}). Everything below is calculated from these runs.
          </p>

          {/* Pass rate bar */}
          <div className="px-5 py-4">
            <PassRateBar
              passed={kept.passed}
              failed={kept.failed}
              blocked={kept.blocked}
              skipped={kept.skipped}
              invalid={kept.invalid}
              total={kept.total}
            />
          </div>

          <div className="px-5 py-3 bg-blue-50 border-l-4 border-blue-300">
            <p className="text-xs font-semibold text-blue-600 mb-1 uppercase tracking-wide">Summary</p>
            <p className="text-xs text-blue-700 leading-relaxed">{kept.analysis}</p>
          </div>

          <SlideSummary {...slide} />

          {resultsQuery.isLoading && (
            <div className="px-5 py-3 bg-indigo-50 border-l-4 border-indigo-200">
              <div className="flex items-center gap-2 text-xs text-indigo-400">
                <Loader2 size={11} className="animate-spin" /> Building detailed report…
              </div>
            </div>
          )}
          {!resultsQuery.isLoading && analysis && <DetailedAnalysis data={analysis} />}

          <RunsDigest groups={digest} runCount={keptRuns.length} loadingSuites={resultsQuery.isLoading} />

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

          <div className="px-5 py-3">
            <AuthorStats runs={keptRuns} users={users} />
          </div>

          {/* Runs with pass rate >= 70%, grouped by day */}
          <div className="px-5 py-3">
            <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide flex items-center gap-1">
              <Play size={11} /> Runs with {MIN_PASS_RATE}%+ pass rate ({keptRuns.length})
            </p>
            <div className="space-y-3">
              {[...keptRuns
                .reduce((m, r) => {
                  const k = dayKey(r);
                  m.set(k, [...(m.get(k) ?? []), r]);
                  return m;
                }, new Map<string, QaseRun[]>())
                .entries()]
                .sort((a, b) => (a[0] < b[0] ? 1 : -1))
                .map(([day, dayRuns]) => (
                  <div key={day}>
                    <p className="text-xs font-semibold text-gray-600 mb-0.5">
                      {dayLabel(day)} <span className="font-normal text-gray-400">· {dayRuns.length} run{dayRuns.length !== 1 ? 's' : ''}</span>
                    </p>
                    {dayRuns
                      .slice()
                      .sort((a, b) => new Date(b.start_time as string).getTime() - new Date(a.start_time as string).getTime())
                      .map((r) => (
                        <RunRow key={r.id} run={r} users={users} />
                      ))}
                  </div>
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
        { label: 'Total runs', value: totalRuns.toLocaleString(), sub: activeWeeks.length === 1 ? 'in the selected period' : `last ${activeWeeks.length} periods`, icon: <Play size={14} /> },
        { label: 'Total cases executed', value: totalCases.toLocaleString(), sub: 'across all runs', icon: <CheckCircle2 size={14} /> },
        { label: 'Avg pass rate', value: `${avgPassRate.toFixed(1)}%`, sub: activeWeeks.length === 1 ? (activeWeeks[0].delta !== null ? `${activeWeeks[0].delta > 0 ? '↑' : activeWeeks[0].delta < 0 ? '↓' : '→'} ${Math.abs(activeWeeks[0].delta).toFixed(1)}pp vs previous period` : 'no previous period data') : trend !== null ? `${trend > 0 ? '↑' : trend < 0 ? '↓' : '→'} avg ${Math.abs(trend).toFixed(1)}pp/week` : 'no trend data', icon: <BarChart2 size={14} /> },
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
  customRange,
}: {
  project: QaseProject;
  token: string;
  granularity: Granularity;
  customRange: DateRange;
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
    if (granularity === 'custom') return buildCustomData(runs, customRange);
    if (milestoneTitle === undefined) return buildWeeklyData(runs, granularity, 20);

    // A milestone can span older runs than the default window: widen the range to cover them.
    const starts = runs.map((r) => (r.start_time ? new Date(r.start_time).getTime() : NaN)).filter((t) => !isNaN(t));
    if (starts.length === 0) return [];
    const weeksSpan = Math.ceil((Date.now() - Math.min(...starts)) / (7 * 86400000)) + 1;
    const step = granularity === 'biweekly' ? 2 : 1;
    const periodsBack = Math.min(Math.max(20, Math.ceil(weeksSpan / step)), 150);
    return buildWeeklyData(runs, granularity, periodsBack).filter((w) => w.runs.length > 0);
  }, [runsQuery.data, granularity, selectedMilestoneId, milestones, customRange]);

  const activeWeeks = weeks.filter((w) => w.total > 0);

  const rangeInvalid = granularity === 'custom' && parseLocalDate(customRange.to, true) < parseLocalDate(customRange.from);
  const oldestLoaded = useMemo(() => {
    const ts = (runsQuery.data ?? []).map((r) => (r.start_time ? new Date(r.start_time).getTime() : NaN)).filter((t) => !isNaN(t));
    return ts.length ? Math.min(...ts) : null;
  }, [runsQuery.data]);
  const rangeTruncated = granularity === 'custom' && !rangeInvalid && oldestLoaded !== null
    && totalRuns > (runsQuery.data?.length ?? 0) && parseLocalDate(customRange.from).getTime() < oldestLoaded;

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

      {rangeInvalid && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          The end date must be on or after the start date.
        </p>
      )}
      {rangeTruncated && oldestLoaded !== null && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Only the most recent {runsQuery.data?.length} runs are loaded (back to {new Date(oldestLoaded).toLocaleDateString()}),
          so the part of the range before that date may be incomplete.
        </p>
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
          {granularity === 'custom'
            ? 'No test runs started within the selected date range.'
            : selectedMilestoneId !== null
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
                defaultOpen={granularity === 'custom'}
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
  const [customRange, setCustomRange] = useState<DateRange>(() => lastDaysRange(30));
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
          <button
            onClick={() => setGranularity('custom')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${granularity === 'custom' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Custom
          </button>
        </div>
      </div>

      {granularity === 'custom' && (
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-xs text-gray-400 font-medium">
            From
            <input
              type="date"
              value={customRange.from}
              max={customRange.to || undefined}
              onChange={(e) => e.target.value && setCustomRange((r) => ({ ...r, from: e.target.value }))}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-400 font-medium">
            To
            <input
              type="date"
              value={customRange.to}
              min={customRange.from || undefined}
              onChange={(e) => e.target.value && setCustomRange((r) => ({ ...r, to: e.target.value }))}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
          </label>
          <div className="flex items-center gap-1">
            {[7, 14, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setCustomRange(lastDaysRange(d))}
                className="px-2.5 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Last {d}d
              </button>
            ))}
          </div>
        </div>
      )}

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
          customRange={customRange}
        />
      )}
    </div>
  );
}
