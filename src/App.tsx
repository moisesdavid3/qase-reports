import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectSelector } from './components/ProjectSelector';
import { ReportView } from './components/ReportView';
import { WORKSPACES } from './types/qase';
import type { Workspace, QaseProject } from './types/qase';

const queryClient = new QueryClient();

function AppContent() {
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [reportProjects, setReportProjects] = useState<QaseProject[]>([]);
  const [view, setView] = useState<'select' | 'report'>('select');
  const [workspace, setWorkspace] = useState<Workspace>(WORKSPACES[0]);

  function handleBuildReport(projects: QaseProject[]) {
    setReportProjects(projects);
    setView('report');
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col p-4">
      <div className="w-full bg-white rounded-2xl shadow-sm border border-gray-200 min-h-[95vh] flex flex-col">
        {view === 'select' ? (
          <ProjectSelector
            selectedCodes={selectedCodes}
            onSelectionChange={setSelectedCodes}
            onBuildReport={handleBuildReport}
            workspace={workspace}
            onWorkspaceChange={setWorkspace}
          />
        ) : (
          <ReportView
            projects={reportProjects}
            workspace={workspace}
            onBack={() => setView('select')}
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
