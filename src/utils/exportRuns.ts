import * as XLSX from 'xlsx';
import type { QaseRun, QaseUser } from '../types/qase';

function runsToRows(runs: QaseRun[], users: QaseUser[]) {
  return runs.map((run) => {
    const executed = run.stats.passed + run.stats.failed + run.stats.blocked + run.stats.skipped;
    const passRate = executed > 0 ? `${Math.round((run.stats.passed / executed) * 100)}%` : '—';
    const author = users.find((u) => u.id === run.user_id)?.name ?? '';

    return {
      'Run': run.title,
      'Run Status': run.status_text,
      'Author': author,
      'Date': run.start_time ? new Date(run.start_time).toLocaleDateString() : '',
      'Total': run.stats.total,
      'Passed': run.stats.passed,
      'Failed': run.stats.failed,
      'Blocked': run.stats.blocked,
      'Skipped': run.stats.skipped,
      'Invalid': run.stats.invalid,
      'Pass Rate': passRate,
    };
  });
}

export function exportCSV(runs: QaseRun[], users: QaseUser[], filename: string) {
  const rows = runsToRows(runs, users);
  const headers = Object.keys(rows[0] ?? {});
  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      headers.map((h) => {
        const val = String(r[h as keyof typeof r] ?? '');
        return val.includes(',') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
      }).join(',')
    ),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}.csv`);
}

export function exportXLSX(runs: QaseRun[], users: QaseUser[], filename: string) {
  const rows = runsToRows(runs, users);
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Test Runs');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
