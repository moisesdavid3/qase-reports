import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectSelector } from './components/ProjectSelector';
import { ReportView } from './components/ReportView';
import { WORKSPACES } from './types/qase';
import type { Workspace, QaseProject } from './types/qase';

const queryClient = new QueryClient();

const STORAGE_KEY = 'qase_app_state';

interface PersistedState {
  view: 'select' | 'report';
  selectedCodes: string[];
  workspaceId: string;
  reportProjects: QaseProject[];
}

function loadState(): PersistedState {
  const defaults: PersistedState = { view: 'select', selectedCodes: [], workspaceId: WORKSPACES[0].id, reportProjects: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as PersistedState;
    // Validate shape — if anything looks wrong, reset to defaults
    if (
      typeof parsed !== 'object' ||
      !Array.isArray(parsed.selectedCodes) ||
      !Array.isArray(parsed.reportProjects)
    ) {
      localStorage.removeItem(STORAGE_KEY);
      return defaults;
    }
    return parsed;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return defaults;
  }
}

function saveState(state: PersistedState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

function AppContent() {
  const initial = loadState();
  const initialWorkspace = WORKSPACES.find((w) => w.id === initial.workspaceId) ?? WORKSPACES[0];

  const [selectedCodes, setSelectedCodes] = useState<string[]>(initial.selectedCodes);
  const [view, setView] = useState<'select' | 'report'>(initial.view);
  const [workspace, setWorkspace] = useState<Workspace>(initialWorkspace);
  const [reportProjects, setReportProjects] = useState<QaseProject[]>(initial.reportProjects);

  // Persist state whenever it changes.
  useEffect(() => {
    saveState({ view, selectedCodes, workspaceId: workspace.id, reportProjects });
  }, [view, selectedCodes, workspace.id, reportProjects]);

  function handleBuildReport(projects: QaseProject[]) {
    setReportProjects(projects);
    setView('report');
  }

  function handleBack() {
    setView('select');
  }

  function handleWorkspaceChange(ws: Workspace) {
    setWorkspace(ws);
    setSelectedCodes([]);
    setReportProjects([]);
    setView('select');
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col p-4">
      <div className="w-full bg-white rounded-2xl shadow-sm border border-gray-200 min-h-[95vh] flex flex-col">
        {view === 'report' && reportProjects.length > 0 ? (
          <ReportView
            projects={reportProjects}
            workspace={workspace}
            onBack={handleBack}
          />
        ) : (
          <ProjectSelector
            selectedCodes={selectedCodes}
            onSelectionChange={setSelectedCodes}
            onBuildReport={handleBuildReport}
            workspace={workspace}
            onWorkspaceChange={handleWorkspaceChange}
          />
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}
