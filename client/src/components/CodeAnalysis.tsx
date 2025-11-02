import React, { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, Info, Zap, FileText } from 'lucide-react';
import { useProject } from '../contexts/ProjectContext';

interface AnalysisResult {
  type: 'error' | 'warning' | 'info' | 'suggestion';
  message: string;
  line?: number;
  column?: number;
  severity: 'high' | 'medium' | 'low';
}

export const CodeAnalysis: React.FC = () => {
  const { activeFile } = useProject();
  const [analysis, setAnalysis] = useState<AnalysisResult[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [metrics, setMetrics] = useState({
    complexity: 0,
    maintainability: 0,
    testability: 0,
    performance: 0,
  });

  useEffect(() => {
    if (activeFile) {
      analyzeCode();
    }
  }, [activeFile]);

  const analyzeCode = async () => {
    if (!activeFile?.content) return;

    setIsAnalyzing(true);
    
    // Simulate analysis (replace with actual static analysis)
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const mockAnalysis: AnalysisResult[] = [
      {
        type: 'warning',
        message: 'Unused variable detected',
        line: 5,
        column: 10,
        severity: 'medium'
      },
      {
        type: 'suggestion',
        message: 'Consider using const instead of let for immutable variables',
        line: 12,
        severity: 'low'
      },
      {
        type: 'info',
        message: 'This function could benefit from JSDoc comments',
        line: 20,
        severity: 'low'
      }
    ];

    setAnalysis(mockAnalysis);
    setMetrics({
      complexity: Math.floor(Math.random() * 100),
      maintainability: Math.floor(Math.random() * 100),
      testability: Math.floor(Math.random() * 100),
      performance: Math.floor(Math.random() * 100),
    });
    
    setIsAnalyzing(false);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'error':
        return <AlertTriangle size={16} className="text-red-400" />;
      case 'warning':
        return <AlertTriangle size={16} className="text-yellow-400" />;
      case 'suggestion':
        return <Zap size={16} className="text-blue-400" />;
      default:
        return <Info size={16} className="text-gray-400" />;
    }
  };

  const getMetricColor = (value: number) => {
    if (value >= 80) return 'text-green-400';
    if (value >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  if (!activeFile) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <div className="text-center">
          <FileText size={48} className="mx-auto mb-4" />
          <p>No file selected</p>
          <p className="text-sm mt-2">Open a file to see code analysis</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-6">
      {/* Code Metrics */}
      <div className="bg-gray-700 rounded-lg p-4">
        <h4 className="text-sm font-semibold mb-3 flex items-center">
          <CheckCircle size={16} className="mr-2 text-green-400" />
          Code Metrics
        </h4>
        
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(metrics).map(([key, value]) => (
            <div key={key} className="bg-gray-800 rounded p-3">
              <div className="text-xs text-gray-400 capitalize">{key}</div>
              <div className={`text-lg font-bold ${getMetricColor(value)}`}>
                {value}%
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Analysis Results */}
      <div className="bg-gray-700 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold flex items-center">
            <AlertTriangle size={16} className="mr-2 text-yellow-400" />
            Analysis Results
          </h4>
          
          <button
            onClick={analyzeCode}
            disabled={isAnalyzing}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 rounded text-xs transition-colors"
          >
            {isAnalyzing ? 'Analyzing...' : 'Re-analyze'}
          </button>
        </div>

        {isAnalyzing ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
          </div>
        ) : (
          <div className="space-y-3">
            {analysis.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <CheckCircle size={32} className="mx-auto mb-2 text-green-400" />
                <p>No issues found!</p>
              </div>
            ) : (
              analysis.map((item, index) => (
                <div key={index} className="bg-gray-800 rounded p-3">
                  <div className="flex items-start space-x-2">
                    {getIcon(item.type)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{item.message}</p>
                      {item.line && (
                        <p className="text-xs text-gray-400 mt-1">
                          Line {item.line}{item.column && `, Column ${item.column}`}
                        </p>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${
                      item.severity === 'high' ? 'bg-red-600' :
                      item.severity === 'medium' ? 'bg-yellow-600' : 'bg-blue-600'
                    }`}>
                      {item.severity}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Quick Fixes */}
      <div className="bg-gray-700 rounded-lg p-4">
        <h4 className="text-sm font-semibold mb-3 flex items-center">
          <Zap size={16} className="mr-2 text-blue-400" />
          Quick Fixes
        </h4>
        
        <div className="space-y-2">
          <button className="w-full text-left p-3 bg-gray-800 hover:bg-gray-600 rounded transition-colors">
            <div className="text-sm">Format Document</div>
            <div className="text-xs text-gray-400">Auto-format your code</div>
          </button>
          
          <button className="w-full text-left p-3 bg-gray-800 hover:bg-gray-600 rounded transition-colors">
            <div className="text-sm">Add Missing Imports</div>
            <div className="text-xs text-gray-400">Automatically import dependencies</div>
          </button>
          
          <button className="w-full text-left p-3 bg-gray-800 hover:bg-gray-600 rounded transition-colors">
            <div className="text-sm">Generate Tests</div>
            <div className="text-xs text-gray-400">Create unit tests for this file</div>
          </button>
        </div>
      </div>
    </div>
  );
};