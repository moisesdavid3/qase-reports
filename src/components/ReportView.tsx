import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, CheckSquare, Layers, Milestone, Play, Bug,
  ChevronDown, Loader2, AlertCircle, Search, ChevronLeft, ChevronRight, X, Download, Bot, CalendarDays, Activity,
} from 'lucide-react';
import type { QaseProject, Workspace } from '../types/qase';
import { useRuns, useRunsTotal, useAllRuns, PAGE_SIZE } from '../hooks/useRuns';
import { useUsers } from '../hooks/useUsers';
import { exportCSV, exportXLSX } from '../utils/exportRuns';
import { AutomationReport } from './AutomationReport';
import { WeeklyRunReport } from './WeeklyRunReport';
import { TrendsReport } from './TrendsReport';
import { FeaturesReport } from './FeaturesReport';
import { ExternalIssueLink } from './ExternalIssueLink';

interface Props {
  projects: QaseProject[];
  workspace: Workspace;
  onBack: () => void;
}

type Tab = 'overview' | 'automation' | 'weekly' | 'trends' | 'features';

export function ReportView({ projects, workspace, onBack }: Props) {
  const [tab, setTab] = useState<Tab>('overview');

  const totals = {
    cases: projects.reduce((s, p) => s + p.counts.cases, 0),
    suites: projects.reduce((s, p) => s + p.counts.suites, 0),
    milestones: projects.reduce((s, p) => s + p.counts.milestones, 0),
    runsTotal: projects.reduce((s, p) => s + p.counts.runs.total, 0),
    runsActive: projects.reduce((s, p) => s + p.counts.runs.active, 0),
    defectsTotal: projects.reduce((s, p) => s + p.counts.defects.total, 0),
    defectsOpen: projects.reduce((s, p) => s + p.counts.defects.open, 0),
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-700 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {workspace.label} · {projects.length} project{projects.length !== 1 ? 's' : ''}
          </p>
        </div>
        {/* Tab bar */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => setTab('overview')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'overview' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Overview
          </button>
          <button
            onClick={() => setTab('automation')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'automation' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Bot size={13} />
            Automation
          </button>
          <button
            onClick={() => setTab('weekly')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'weekly' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <CalendarDays size={13} />
            Weekly
          </button>
          <button
            onClick={() => setTab('trends')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'trends' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Activity size={13} />
            Trends
          </button>
          <button
            onClick={() => setTab('features')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'features' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Layers size={13} />
            Features
          </button>
        </div>
      </div>

      {tab === 'automation' && (
        <AutomationReport projects={projects} workspace={workspace} />
      )}

      {tab === 'weekly' && (
        <WeeklyRunReport projects={projects} workspace={workspace} />
      )}

      {tab === 'trends' && (
        <TrendsReport projects={projects} workspace={workspace} />
      )}

      {tab === 'features' && (
        <FeaturesReport projects={projects} workspace={workspace} />
      )}

      {tab === 'overview' && (
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard icon={<CheckSquare size={16} />} label="Total Cases" value={totals.cases} color="violet" />
          <SummaryCard icon={<Play size={16} />} label="Total Runs" value={totals.runsTotal} sub={`${totals.runsActive} active`} color="blue" />
          <SummaryCard icon={<Bug size={16} />} label="Total Defects" value={totals.defectsTotal} sub={`${totals.defectsOpen} open`} color="red" />
          <SummaryCard icon={<Layers size={16} />} label="Total Suites" value={totals.suites} color="gray" />
        </div>

        {/* Projects overview table */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Projects overview</h2>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">Project</th>
                  <th className="text-right px-4 py-3 font-medium">
                    <span className="flex items-center justify-end gap-1"><CheckSquare size={12} /> Cases</span>
                  </th>
                  <th className="text-right px-4 py-3 font-medium">
                    <span className="flex items-center justify-end gap-1"><Layers size={12} /> Suites</span>
                  </th>
                  <th className="text-right px-4 py-3 font-medium">
                    <span className="flex items-center justify-end gap-1"><Milestone size={12} /> Milestones</span>
                  </th>
                  <th className="text-right px-4 py-3 font-medium">
                    <span className="flex items-center justify-end gap-1"><Play size={12} /> Runs</span>
                  </th>
                  <th className="text-right px-4 py-3 font-medium">Active Runs</th>
                  <th className="text-right px-4 py-3 font-medium">
                    <span className="flex items-center justify-end gap-1"><Bug size={12} /> Defects</span>
                  </th>
                  <th className="text-right px-4 py-3 font-medium">Open Defects</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {projects.map((p) => (
                  <tr key={p.code} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-semibold">
                          {p.code}
                        </span>
                        <span className="font-medium text-gray-900 truncate max-w-[180px]">{p.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{p.counts.cases.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{p.counts.suites.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{p.counts.milestones.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{p.counts.runs.total.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      {p.counts.runs.active > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                          {p.counts.runs.active}
                        </span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{p.counts.defects.total.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      {p.counts.defects.open > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          {p.counts.defects.open}
                        </span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold text-gray-700 border-t-2 border-gray-200">
                  <td className="px-4 py-3 text-xs uppercase tracking-wide text-gray-500">Totals</td>
                  <td className="px-4 py-3 text-right">{totals.cases.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">{totals.suites.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">{totals.milestones.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">{totals.runsTotal.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">{totals.runsActive.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">{totals.defectsTotal.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">{totals.defectsOpen.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Per-project run details */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Test runs by project</h2>
          <div className="space-y-3">
            {projects.map((p) => (
              <ProjectRunsSection key={p.code} project={p} token={workspace.token} />
            ))}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

function ProjectRunsSection({ project, token }: { project: QaseProject; token: string }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [userFilter, setUserFilter] = useState<number | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const userDropdownTriggerRef = useRef<HTMLButtonElement>(null);
  const userDropdownPortalRef = useRef<HTMLDivElement>(null);

  function openUserDropdown() {
    const rect = userDropdownTriggerRef.current?.getBoundingClientRect();
    if (rect) {
      setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 224) });
    }
    setUserDropdownOpen(true);
  }

  useEffect(() => {
    if (!userDropdownOpen) return;

    function updatePos() {
      const rect = userDropdownTriggerRef.current?.getBoundingClientRect();
      if (rect) {
        setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 224) });
      }
    }

    function handleClickOutside(e: MouseEvent) {
      if (
        userDropdownTriggerRef.current &&
        !userDropdownTriggerRef.current.contains(e.target as Node)
      ) {
        // Check if click is inside the fixed dropdown portal
        if (userDropdownPortalRef.current && userDropdownPortalRef.current.contains(e.target as Node)) return;
        setUserDropdownOpen(false);
        setUserSearch('');
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [userDropdownOpen]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data: usersData } = useUsers(token);
  const users = usersData?.result.entities ?? [];

  const { data: probeData } = useRunsTotal(token, project.code, search);
  const total = probeData?.result.filtered ?? 0;

  const hasClientFilter = userFilter !== null || !!dateFrom || !!dateTo;

  const noFilterQuery = useRuns(token, project.code, page, search, total);
  const allRunsQuery = useAllRuns(token, project.code, search, total, hasClientFilter);

  const isLoading = hasClientFilter ? allRunsQuery.isLoading : noFilterQuery.isLoading;
  const isFetching = hasClientFilter ? allRunsQuery.isFetching : noFilterQuery.isFetching;
  const isError   = hasClientFilter ? allRunsQuery.isError   : noFilterQuery.isError;

  const sortDesc = (arr: import('../types/qase').QaseRun[]) =>
    [...arr].sort((a, b) => {
      const da = a.start_time ? new Date(a.start_time).getTime() : 0;
      const db = b.start_time ? new Date(b.start_time).getTime() : 0;
      return db - da;
    });

  let displayRuns: import('../types/qase').QaseRun[] = [];
  let totalPages = 1;
  let rangeLabel = '';

  if (!hasClientFilter) {
    const raw = noFilterQuery.data?.result.entities ?? [];
    displayRuns = sortDesc(raw);
    totalPages = Math.ceil(total / PAGE_SIZE);
    const from = (page - 1) * PAGE_SIZE + 1;
    const to = Math.min(page * PAGE_SIZE, total);
    rangeLabel = total > 0 ? `${from}–${to} of ${total} runs` : 'No runs';
  } else {
    const fromMs = dateFrom ? new Date(dateFrom).getTime() : null;
    const toMs   = dateTo   ? new Date(dateTo + 'T23:59:59').getTime() : null;
    const allRuns = allRunsQuery.data ?? [];

    const matched = sortDesc(allRuns).filter((r) => {
      if (userFilter !== null && r.user_id !== userFilter) return false;
      if (fromMs !== null || toMs !== null) {
        const t = r.start_time ? new Date(r.start_time).getTime() : null;
        if (t === null) return false;
        if (fromMs !== null && t < fromMs) return false;
        if (toMs   !== null && t > toMs)   return false;
      }
      return true;
    });

    const uFrom = (page - 1) * PAGE_SIZE;
    displayRuns = matched.slice(uFrom, uFrom + PAGE_SIZE);
    totalPages = Math.ceil(matched.length / PAGE_SIZE) || 1;
    rangeLabel = matched.length > 0
      ? `${uFrom + 1}–${Math.min(uFrom + PAGE_SIZE, matched.length)} of ${matched.length} matched`
      : 'No runs match your filters';
  }

  function applySearch() { setSearch(searchInput.trim()); setPage(1); }

  function clearFilters() {
    setSearchInput(''); setSearch(''); setUserFilter(null);
    setDateFrom(''); setDateTo(''); setPage(1);
  }

  const hasActiveFilters = !!search || hasClientFilter;

  return (
    <div className="rounded-xl border border-gray-200">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left rounded-xl"
      >
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-semibold">
            {project.code}
          </span>
          <span className="font-medium text-gray-900 text-sm">{project.title}</span>
          <span className="text-xs text-gray-400">({project.counts.runs.total} runs)</span>
        </div>
        <ChevronDown size={16} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div>
          {/* Filters bar */}
          <div className="px-4 py-3 border-t border-gray-100 bg-white flex flex-wrap gap-2 items-center">
            {/* Name search */}
            <div className="relative flex-1 min-w-[160px]">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applySearch()}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
              />
            </div>
            <button
              onClick={applySearch}
              className="px-3 py-1.5 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
            >
              Search
            </button>

            {/* User filter */}
            <div className="relative">
              <button
                ref={userDropdownTriggerRef}
                onClick={() => {
                  if (userDropdownOpen) {
                    setUserDropdownOpen(false);
                    setUserSearch('');
                  } else {
                    openUserDropdown();
                  }
                }}
                className="flex items-center gap-2 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-400 min-w-[140px] justify-between"
              >
                <span className="truncate max-w-[140px]">
                  {userFilter !== null ? (users.find((u) => u.id === userFilter)?.name ?? 'User') : 'All users'}
                </span>
                <ChevronDown size={13} className={`flex-shrink-0 text-gray-400 transition-transform ${userDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {userDropdownOpen && dropdownPos && createPortal(
                <div
                  ref={userDropdownPortalRef}
                  style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width, zIndex: 9999 }}
                  className="bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
                >
                  <div className="p-2 border-b border-gray-100">
                    <div className="relative">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search users…"
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        autoFocus
                        className="w-full pl-7 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400"
                      />
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    <button
                      onClick={() => { setUserFilter(null); setPage(1); setUserDropdownOpen(false); setUserSearch(''); }}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${userFilter === null ? 'bg-violet-50 text-violet-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}
                    >
                      All users
                    </button>
                    {users
                      .filter((u) => u.name.toLowerCase().includes(userSearch.toLowerCase()))
                      .map((u) => (
                        <button
                          key={u.id}
                          onClick={() => { setUserFilter(u.id); setPage(1); setUserDropdownOpen(false); setUserSearch(''); }}
                          className={`w-full text-left px-3 py-2 text-sm transition-colors ${userFilter === u.id ? 'bg-violet-50 text-violet-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}
                        >
                          {u.name}
                        </button>
                      ))
                    }
                    {users.filter((u) => u.name.toLowerCase().includes(userSearch.toLowerCase())).length === 0 && (
                      <p className="text-center text-gray-400 text-xs py-3">No users found</p>
                    )}
                  </div>
                </div>,
                document.body
              )}
            </div>

            {/* Date range */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400 whitespace-nowrap">From</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-gray-700"
              />
              <span className="text-xs text-gray-400">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-gray-700"
              />
            </div>

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X size={13} /> Clear
              </button>
            )}
            {isFetching && !isLoading && (
              <Loader2 size={14} className="animate-spin text-gray-400" />
            )}

            {/* Export buttons — always on the right */}
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => exportCSV(displayRuns, users, `${project.code}-runs`)}
                disabled={displayRuns.length === 0}
                title="Download CSV"
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Download size={13} /> CSV
              </button>
              <button
                onClick={() => exportXLSX(displayRuns, users, `${project.code}-runs`)}
                disabled={displayRuns.length === 0}
                title="Download XLSX"
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-white bg-green-600 border border-green-600 rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Download size={13} /> XLSX
              </button>
            </div>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-8 text-gray-400 gap-2">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-sm">Loading runs…</span>
            </div>
          )}
          {isError && (
            <div className="flex items-center gap-3 p-4 text-red-600 text-sm">
              <AlertCircle size={16} />
              <span>Failed to load runs for {project.code}</span>
            </div>
          )}
          {!isLoading && !isError && displayRuns.length === 0 && (
            <p className="text-center text-gray-400 py-6 text-sm">No runs match your filters.</p>
          )}

          {!isLoading && !isError && displayRuns.length > 0 && (
            <div>
              <table className="w-full text-sm table-fixed">
                <colgroup>
                  <col />
                  <col className="w-28" />
                  <col className="w-36" />
                  <col className="w-14" />
                  <col className="w-16" />
                  <col className="w-14" />
                  <col className="w-16" />
                  <col className="w-16" />
                  <col className="w-14" />
                  <col className="w-20" />
                </colgroup>
                <thead>
                  <tr className="border-t border-gray-200 bg-white text-xs uppercase tracking-wide text-gray-400">
                    <th className="text-left px-3 py-2.5 font-medium">Run</th>
                    <th className="text-left px-2 py-2.5 font-medium">Status</th>
                    <th className="text-left px-2 py-2.5 font-medium">Author</th>
                    <th className="text-right px-2 py-2.5 font-medium">Total</th>
                    <th className="text-right px-2 py-2.5 font-medium text-green-600">Passed</th>
                    <th className="text-right px-2 py-2.5 font-medium text-red-500">Failed</th>
                    <th className="text-right px-2 py-2.5 font-medium text-yellow-600">Blocked</th>
                    <th className="text-right px-2 py-2.5 font-medium text-gray-400">Skipped</th>
                    <th className="text-right px-2 py-2.5 font-medium text-purple-500">Invalid</th>
                    <th className="text-right px-2 py-2.5 font-medium">Pass Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {displayRuns.map((run) => {
                    const executed = run.stats.passed + run.stats.failed + run.stats.blocked + run.stats.skipped;
                    const passRate = executed > 0 ? Math.round((run.stats.passed / executed) * 100) : null;
                    const author = users.find((u) => u.id === run.user_id);
                    return (
                      <tr key={run.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-2.5 min-w-0">
                          <div className="font-medium text-gray-900 truncate">{run.title}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {run.start_time && (
                              <span className="text-xs text-gray-400">
                                {new Date(run.start_time).toLocaleDateString()}
                              </span>
                            )}
                            <ExternalIssueLink issue={run.external_issue} />
                          </div>
                        </td>
                        <td className="px-2 py-2.5"><StatusBadge status={run.status_text} /></td>
                        <td className="px-2 py-2.5 text-sm text-gray-600 truncate">
                          {author?.name ?? <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-2 py-2.5 text-right font-medium text-gray-700">{run.stats.total}</td>
                        <td className="px-2 py-2.5 text-right text-green-600 font-medium">{run.stats.passed}</td>
                        <td className="px-2 py-2.5 text-right">
                          {run.stats.failed > 0 ? <span className="text-red-500 font-medium">{run.stats.failed}</span> : <span className="text-gray-300">0</span>}
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          {run.stats.blocked > 0 ? <span className="text-yellow-600 font-medium">{run.stats.blocked}</span> : <span className="text-gray-300">0</span>}
                        </td>
                        <td className="px-2 py-2.5 text-right text-gray-400">{run.stats.skipped}</td>
                        <td className="px-2 py-2.5 text-right">
                          {run.stats.invalid > 0 ? <span className="text-purple-500 font-medium">{run.stats.invalid}</span> : <span className="text-gray-300">0</span>}
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          {passRate !== null ? (
                            <span className={['font-semibold', passRate >= 90 ? 'text-green-600' : passRate >= 70 ? 'text-yellow-600' : 'text-red-500'].join(' ')}>
                              {passRate}%
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50 rounded-b-xl">
                <span className="text-xs text-gray-500">{rangeLabel}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-xs text-gray-600 px-2">{`${page} / ${totalPages || 1}`}</span>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page >= totalPages}
                    className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const statusStyles: Record<string, string> = {
  passed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  aborted: 'bg-gray-100 text-gray-500',
  active: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-sky-100 text-sky-600',
};

const statusLabels: Record<string, string> = {
  in_progress: 'In Progress',
};

function StatusBadge({ status }: { status: string }) {
  const style = statusStyles[status] ?? 'bg-gray-100 text-gray-500';
  const label = statusLabels[status] ?? status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}

interface SummaryCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub?: string;
  color: 'violet' | 'blue' | 'red' | 'gray';
}

const colorMap = {
  violet: 'bg-violet-50 text-violet-600',
  blue: 'bg-blue-50 text-blue-600',
  red: 'bg-red-50 text-red-600',
  gray: 'bg-gray-100 text-gray-500',
};

function SummaryCard({ icon, label, value, sub, color }: SummaryCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <div className={`inline-flex p-2 rounded-lg mb-3 ${colorMap[color]}`}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}
