import type { QaseProject } from '../types/qase';
import { CheckSquare, Layers, Play, Bug } from 'lucide-react';

interface Props {
  project: QaseProject;
  selected: boolean;
  onToggle: (code: string) => void;
}

export function ProjectCard({ project, selected, onToggle }: Props) {
  return (
    <button
      onClick={() => onToggle(project.code)}
      className={`w-full text-left rounded-xl border-2 p-5 transition-all cursor-pointer ${
        selected
          ? 'border-violet-500 bg-violet-50 shadow-md'
          : 'border-gray-200 bg-white hover:border-violet-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-xs font-mono font-semibold px-2 py-0.5 rounded ${
                selected ? 'bg-violet-200 text-violet-800' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {project.code}
            </span>
            {selected && (
              <span className="text-xs text-violet-600 font-medium">Selected</span>
            )}
          </div>
          <h3 className="font-semibold text-gray-900 truncate">{project.title}</h3>
          {project.description && (
            <p className="text-sm text-gray-500 mt-1 line-clamp-2">{project.description}</p>
          )}
        </div>
        <div
          className={`w-5 h-5 rounded border-2 flex-shrink-0 mt-0.5 transition-colors ${
            selected ? 'bg-violet-500 border-violet-500' : 'border-gray-300'
          }`}
        >
          {selected && (
            <svg viewBox="0 0 12 12" className="w-full h-full text-white p-0.5">
              <path
                d="M2 6l3 3 5-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Stat icon={<CheckSquare size={13} />} label="Cases" value={project.counts.cases} />
        <Stat icon={<Layers size={13} />} label="Suites" value={project.counts.suites} />
        <Stat icon={<Play size={13} />} label="Runs" value={project.counts.runs.total} />
        <Stat icon={<Bug size={13} />} label="Defects" value={project.counts.defects.total} />
      </div>
    </button>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5 text-sm text-gray-500">
      <span className="text-gray-400">{icon}</span>
      <span>{value.toLocaleString()}</span>
      <span className="text-gray-400">{label}</span>
    </div>
  );
}
