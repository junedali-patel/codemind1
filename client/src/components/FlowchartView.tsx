import React, { useState, useEffect } from 'react';
import { GitBranch, Download, Maximize } from 'lucide-react';
import { useProject } from '../contexts/ProjectContext';

export const FlowchartView: React.FC = () => {
  const { activeFile } = useProject();
  const [flowchartData, setFlowchartData] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (activeFile) {
      generateFlowchart();
    }
  }, [activeFile]);

  const generateFlowchart = async () => {
    if (!activeFile?.content) return;

    setIsLoading(true);
    
    // Simulate flowchart generation
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Generate Mermaid flowchart syntax
    const mermaidCode = `
graph TD
    A[Start] --> B{Is file loaded?}
    B -->|Yes| C[Parse code structure]
    B -->|No| D[Show error]
    C --> E[Extract functions]
    E --> F[Identify control flow]
    F --> G[Generate diagram]
    G --> H[Display result]
    D --> I[End]
    H --> I
`;

    setFlowchartData(mermaidCode);
    setIsLoading(false);
  };

  const downloadFlowchart = () => {
    const element = document.createElement('a');
    const file = new Blob([flowchartData], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `${activeFile?.name || 'flowchart'}.mmd`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  if (!activeFile) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <div className="text-center">
          <GitBranch size={48} className="mx-auto mb-4" />
          <p>No file selected</p>
          <p className="text-sm mt-2">Open a file to generate flowchart</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-700 flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center">
          <GitBranch size={16} className="mr-2 text-blue-400" />
          Code Flowchart
        </h4>
        
        <div className="flex space-x-2">
          <button
            onClick={downloadFlowchart}
            disabled={!flowchartData}
            className="p-2 hover:bg-gray-600 disabled:opacity-50 rounded transition-colors"
            title="Download flowchart"
          >
            <Download size={14} />
          </button>
          
          <button
            onClick={generateFlowchart}
            disabled={isLoading}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 rounded text-xs transition-colors"
          >
            {isLoading ? 'Generating...' : 'Regenerate'}
          </button>
        </div>
      </div>

      {/* Flowchart Content */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
              <p className="text-gray-400">Analyzing code structure...</p>
            </div>
          </div>
        ) : flowchartData ? (
          <div className="bg-white rounded-lg p-6 h-full">
            {/* Placeholder for Mermaid diagram */}
            <div className="w-full h-full flex items-center justify-center bg-gray-50 rounded border-2 border-dashed border-gray-300">
              <div className="text-center">
                <GitBranch size={64} className="mx-auto mb-4 text-gray-400" />
                <p className="text-gray-600 mb-2">Flowchart Preview</p>
                <p className="text-sm text-gray-500">
                  Mermaid diagram would render here
                </p>
                <div className="mt-4 p-4 bg-gray-100 rounded text-left">
                  <pre className="text-xs text-gray-700 whitespace-pre-wrap">
                    {flowchartData}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <GitBranch size={48} className="mx-auto mb-4" />
              <p>Click "Generate" to create a flowchart</p>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="p-4 border-t border-gray-700 bg-gray-800">
        <h5 className="text-xs font-semibold mb-2 text-gray-300">Legend</h5>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-blue-400 rounded"></div>
            <span className="text-gray-400">Function</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-yellow-400 rounded-sm"></div>
            <span className="text-gray-400">Decision</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-green-400 rounded-full"></div>
            <span className="text-gray-400">Start/End</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-purple-400"></div>
            <span className="text-gray-400">Process</span>
          </div>
        </div>
      </div>
    </div>
  );
};