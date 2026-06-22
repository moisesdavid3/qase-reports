import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectSelector } from './components/ProjectSelector';
import { ReportPlaceholder } from './components/ReportPlaceholder';

const queryClient = new QueryClient();

function AppContent() {
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [view, setView] = useState<'select' | 'report'>('select');

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center p-4 pt-10">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-sm border border-gray-200 min-h-[85vh] flex flex-col">
        {view === 'select' ? (
          <ProjectSelector
            selectedCodes={selectedCodes}
            onSelectionChange={setSelectedCodes}
            onBuildReport={() => setView('report')}
          />
        ) : (
          <ReportPlaceholder
            selectedCodes={selectedCodes}
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
