import React, { useState, useEffect } from 'react';
import { BarChart3, Download, ZoomIn, ZoomOut } from 'lucide-react';
import { useProject } from '../contexts/ProjectContext';

interface MindMapNode {
  id: string;
  label: string;
  children?: MindMapNode[];
  x?: number;
  y?: number;
}

export const MindMapView: React.FC = () => {
  const { activeFile } = useProject();
  const [mindMapData, setMindMapData] = useState<MindMapNode | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [zoom, setZoom] = useState(100);

  useEffect(() => {
    if (activeFile) {
      generateMindMap();
    }
  }, [activeFile]);

  const generateMindMap = async () => {
    if (!activeFile?.content) return;

    setIsLoading(true);
    
    // Simulate mind map generation
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Generate mind map data structure
    const mockMindMap: MindMapNode = {
      id: 'root',
      label: activeFile.name,
      children: [
        {
          id: 'imports',
          label: 'Imports',
          children: [
            { id: 'react', label: 'React' },
            { id: 'utils', label: 'Utilities' }
          ]
        },
        {
          id: 'components',
          label: 'Components',
          children: [
            { id: 'main', label: 'Main Component' },
            { id: 'helpers', label: 'Helper Functions' }
          ]
        },
        {
          id: 'exports',
          label: 'Exports',
          children: [
            { id: 'default', label: 'Default Export' }
          ]
        }
      ]
    };

    setMindMapData(mockMindMap);
    setIsLoading(false);
  };

  const downloadMindMap = () => {
    if (!mindMapData) return;
    
    const element = document.createElement('a');
    const file = new Blob([JSON.stringify(mindMapData, null, 2)], { type: 'application/json' });
    element.href = URL.createObjectURL(file);
    element.download = `${activeFile?.name || 'mindmap'}.json`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const renderMindMapNode = (node: MindMapNode, level: number = 0, parentX: number = 0, parentY: number = 0): React.ReactNode => {
    const x = level === 0 ? 200 : parentX + (level * 150);
    const y = level === 0 ? 200 : parentY + (Math.random() * 100 - 50);
    
    return (
      <g key={node.id} transform={`scale(${zoom / 100})`}>
        {/* Node circle */}
        <circle
          cx={x}
          cy={y}
          r={level === 0 ? 30 : 20}
          fill={level === 0 ? '#3B82F6' : level === 1 ? '#10B981' : '#8B5CF6'}
          stroke="#374151"
          strokeWidth="2"
        />
        
        {/* Node label */}
        <text
          x={x}
          y={y + 5}
          textAnchor="middle"
          fill="white"
          fontSize={level === 0 ? "12" : "10"}
          fontWeight={level === 0 ? "bold" : "normal"}
        >
          {node.label.length > 8 ? node.label.substring(0, 8) + '...' : node.label}
        </text>
        
        {/* Connection lines and child nodes */}
        {node.children?.map((child, index) => {
          const childX = x + 150;
          const childY = y + (index - (node.children!.length - 1) / 2) * 80;
          
          return (
            <g key={child.id}>
              {/* Connection line */}
              <line
                x1={x + (level === 0 ? 30 : 20)}
                y1={y}
                x2={childX - 20}
                y2={childY}
                stroke="#6B7280"
                strokeWidth="2"
              />
              
              {/* Recursive child rendering */}
              {renderMindMapNode(child, level + 1, childX, childY)}
            </g>
          );
        })}
      </g>
    );
  };

  if (!activeFile) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <div className="text-center">
          <BarChart3 size={48} className="mx-auto mb-4" />
          <p>No file selected</p>
          <p className="text-sm mt-2">Open a file to generate mind map</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-700 flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center">
          <BarChart3 size={16} className="mr-2 text-purple-400" />
          Code Mind Map
        </h4>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setZoom(Math.max(50, zoom - 25))}
            className="p-1 hover:bg-gray-600 rounded transition-colors"
            title="Zoom out"
          >
            <ZoomOut size={14} />
          </button>
          
          <span className="text-xs text-gray-400">{zoom}%</span>
          
          <button
            onClick={() => setZoom(Math.min(200, zoom + 25))}
            className="p-1 hover:bg-gray-600 rounded transition-colors"
            title="Zoom in"
          >
            <ZoomIn size={14} />
          </button>
          
          <button
            onClick={downloadMindMap}
            disabled={!mindMapData}
            className="p-2 hover:bg-gray-600 disabled:opacity-50 rounded transition-colors"
            title="Download mind map"
          >
            <Download size={14} />
          </button>
          
          <button
            onClick={generateMindMap}
            disabled={isLoading}
            className="px-3 py-1 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 rounded text-xs transition-colors"
          >
            {isLoading ? 'Generating...' : 'Regenerate'}
          </button>
        </div>
      </div>

      {/* Mind Map Content */}
      <div className="flex-1 overflow-auto bg-gray-900">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-400 mx-auto mb-4"></div>
              <p className="text-gray-400">Generating mind map...</p>
            </div>
          </div>
        ) : mindMapData ? (
          <div className="w-full h-full relative">
            <svg
              width="100%"
              height="100%"
              viewBox="0 0 800 600"
              className="w-full h-full"
            >
              {renderMindMapNode(mindMapData)}
            </svg>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <BarChart3 size={48} className="mx-auto mb-4" />
              <p>Click "Generate" to create a mind map</p>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="p-4 border-t border-gray-700 bg-gray-800">
        <h5 className="text-xs font-semibold mb-2 text-gray-300">Controls</h5>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="text-gray-400">• Zoom: Mouse wheel</div>
          <div className="text-gray-400">• Pan: Click & drag</div>
          <div className="text-gray-400">• Node info: Click node</div>
          <div className="text-gray-400">• Reset view: Double click</div>
        </div>
      </div>
    </div>
  );
};