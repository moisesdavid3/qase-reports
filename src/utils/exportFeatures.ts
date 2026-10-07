import * as XLSX from 'xlsx';
import type { QaseRun, QaseUser } from '../types/qase';
import type { FeatureGroup } from '../components/FeaturesReport';

type Row = Record<string, string | number>;

// Prevent spreadsheet formula injection from run titles / issue ids.
function safe(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

function pct(passed: number, executed: number): string {
  return executed > 0 ? `${((passed / executed) * 100).toFixed(1)}%` : '—';
}

function fmt(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : '';
}

function featureRows(groups: FeatureGroup[]): Row[] {
  return groups.map((g) => ({
    'External Issue': safe(g.key),
    'Jira Link': g.issue?.link ?? '',
    'Status': g.open ? 'In progress' : 'Completed',
    'Runs': g.runs.length,
    'Environments': g.environments.join(', '),
    'First Run': fmt(g.firstStart),
    'Last Run': fmt(g.lastStart),
    'Total Cases': g.total,
    'Executed': g.executed,
    'Passed': g.passed,
    'Failed': g.failed,
    'Blocked': g.blocked,
    'Untested': g.untested,
    'Pass Rate': pct(g.passed, g.executed),
    'Summary': g.report,
  }));
}

function runRows(groups: FeatureGroup[], ungrouped: QaseRun[], users: QaseUser[]): Row[] {
  const toRow = (r: QaseRun, feature: string, link: string): Row => {
    const executed = r.stats.passed + r.stats.failed + r.stats.blocked + r.stats.skipped;
    return {
      'External Issue': safe(feature),
      'Jira Link': link,
      'Run': safe(r.title),
      'Run Status': r.status_text,
      'Environment': r.environment?.title ?? '',
      'Author': users.find((u) => u.id === r.user_id)?.name ?? '',
      'Date': r.start_time ? r.start_time.slice(0, 10) : '',
      'Total': r.stats.total,
      'Executed': executed,
      'Passed': r.stats.passed,
      'Failed': r.stats.failed,
      'Blocked': r.stats.blocked,
      'Untested': r.stats.untested,
      'Pass Rate': pct(r.stats.passed, executed),
    };
  };
  return [
    ...groups.flatMap((g) => g.runs.map((r) => toRow(r, g.key, g.issue?.link ?? ''))),
    ...ungrouped.map((r) => toRow(r, '(No External Issue)', '')),
  ];
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportFeaturesCSV(groups: FeatureGroup[], ungrouped: QaseRun[], users: QaseUser[], filename: string) {
  const rows = runRows(groups, ungrouped, users);
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))];
  download(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' }), `${filename}.csv`);
}

export function exportFeaturesXLSX(groups: FeatureGroup[], ungrouped: QaseRun[], users: QaseUser[], filename: string) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(featureRows(groups)), 'Features');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(runRows(groups, ungrouped, users)), 'Test Runs');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
