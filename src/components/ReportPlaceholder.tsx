import { BarChart2, ArrowLeft } from 'lucide-react';

interface Props {
  selectedCodes: string[];
  onBack: () => void;
}

export function ReportPlaceholder({ selectedCodes, onBack }: Props) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {selectedCodes.length} project{selectedCodes.length !== 1 ? 's' : ''} selected:{' '}
            {selectedCodes.join(', ')}
          </p>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center text-center px-8 text-gray-400">
        <BarChart2 size={48} className="mb-4 text-violet-200" />
        <p className="font-medium text-gray-600">Report view coming soon</p>
        <p className="text-sm mt-1">
          Test run data, pass rates, and trends will appear here.
        </p>
      </div>
    </div>
  );
}
