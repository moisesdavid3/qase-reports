import { useState } from 'react';
import { useProjects } from '../hooks/useProjects';
import { ProjectCard } from './ProjectCard';
import { Search, Loader2, AlertCircle, BarChart2 } from 'lucide-react';

interface Props {
  selectedCodes: string[];
  onSelectionChange: (codes: string[]) => void;
  onBuildReport: () => void;
}

export function ProjectSelector({ selectedCodes, onSelectionChange, onBuildReport }: Props) {
  const [search, setSearch] = useState('');
  const { data, isLoading, isError, error } = useProjects();

  const projects = data?.result.entities ?? [];
  const filtered = projects.filter(
    (p) =>
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.code.toLowerCase().includes(search.toLowerCase())
  );

  function toggleProject(code: string) {
    if (selectedCodes.includes(code)) {
      onSelectionChange(selectedCodes.filter((c) => c !== code));
    } else {
      onSelectionChange([...selectedCodes, code]);
    }
  }

  function selectAll() {
    onSelectionChange(filtered.map((p) => p.code));
  }

  function clearAll() {
    onSelectionChange([]);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-100">
        <h1 className="text-2xl font-bold text-gray-900">Qase Reports</h1>
        <p className="text-sm text-gray-500 mt-1">
          Select one or more projects to build a report
        </p>
      </div>

      {/* Search + actions */}
      <div className="px-6 py-4 border-b border-gray-100 space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
          />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">
            {isLoading ? 'Loading…' : `${filtered.length} project${filtered.length !== 1 ? 's' : ''}`}
          </span>
          <div className="flex gap-3">
            <button
              onClick={selectAll}
              disabled={isLoading || filtered.length === 0}
              className="text-violet-600 hover:text-violet-800 disabled:opacity-40"
            >
              Select all
            </button>
            <span className="text-gray-300">|</span>
            <button
              onClick={clearAll}
              disabled={selectedCodes.length === 0}
              className="text-gray-500 hover:text-gray-700 disabled:opacity-40"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {isLoading && (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 size={24} className="animate-spin mr-2" />
            <span>Fetching projects…</span>
          </div>
        )}

        {isError && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700">
            <AlertCircle size={18} className="flex-shrink-0" />
            <div>
              <p className="font-medium text-sm">Failed to load projects</p>
              <p className="text-xs mt-0.5 text-red-500">
                {(error as Error)?.message ?? 'Check your API token in .env'}
              </p>
            </div>
          </div>
        )}

        {!isLoading && !isError && filtered.length === 0 && (
          <p className="text-center text-gray-400 py-12 text-sm">No projects match your search.</p>
        )}

        {filtered.map((project) => (
          <ProjectCard
            key={project.code}
            project={project}
            selected={selectedCodes.includes(project.code)}
            onToggle={toggleProject}
          />
        ))}
      </div>

      {/* Footer CTA */}
      <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
        <button
          onClick={onBuildReport}
          disabled={selectedCodes.length === 0}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-violet-600 text-white font-medium text-sm hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <BarChart2 size={16} />
          Build Report
          {selectedCodes.length > 0 && (
            <span className="ml-1 bg-violet-500 text-white text-xs px-2 py-0.5 rounded-full">
              {selectedCodes.length}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
