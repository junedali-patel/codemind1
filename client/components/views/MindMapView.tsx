'use client';

import { useState, useEffect } from 'react';
import { Network, FileCode, FolderTree, Braces, Database, Code2, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';

interface MindMapNode {
  id: string;
  label: string;
  type: 'folder' | 'file' | 'function' | 'class' | 'component';
  children?: MindMapNode[];
  x?: number;
  y?: number;
}

export default function MindMapView() {
  const [selectedView, setSelectedView] = useState<'tree' | 'radial' | 'hierarchical'>('tree');
  const [zoom, setZoom] = useState(100);

  // Sample data - this would be generated from actual repository analysis
  const sampleData: MindMapNode = {
    id: 'root',
    label: 'Project',
    type: 'folder',
    children: [
      {
        id: 'components',
        label: 'components',
        type: 'folder',
        children: [
          { id: 'header', label: 'Header.tsx', type: 'component' },
          { id: 'sidebar', label: 'Sidebar.tsx', type: 'component' },
          { id: 'footer', label: 'Footer.tsx', type: 'component' }
        ]
      },
      {
        id: 'utils',
        label: 'utils',
        type: 'folder',
        children: [
          { id: 'api', label: 'api.ts', type: 'file' },
          { id: 'helpers', label: 'helpers.ts', type: 'file' }
        ]
      },
      {
        id: 'pages',
        label: 'pages',
        type: 'folder',
        children: [
          { id: 'home', label: 'index.tsx', type: 'component' },
          { id: 'about', label: 'about.tsx', type: 'component' }
        ]
      }
    ]
  };

  const getNodeIcon = (type: string) => {
    switch (type) {
      case 'folder': return <FolderTree size={16} className="text-[#dcb67a]" />;
      case 'file': return <FileCode size={16} className="text-[#519aba]" />;
      case 'function': return <Braces size={16} className="text-[#dcdcaa]" />;
      case 'class': return <Code2 size={16} className="text-[#4ec9b0]" />;
      case 'component': return <Database size={16} className="text-[#c586c0]" />;
      default: return <FileCode size={16} className="text-[#858585]" />;
    }
  };

  const renderTreeNode = (node: MindMapNode, level: number = 0) => (
    <div key={node.id} style={{ marginLeft: level * 24 }}>
      <div className="flex items-center gap-2 py-2 px-3 hover:bg-[#2a2a2a] rounded-md cursor-pointer group transition-colors">
        {getNodeIcon(node.type)}
        <span className="text-sm text-[#cccccc] group-hover:text-white">
          {node.label}
        </span>
        {node.children && (
          <span className="text-xs text-[#858585] ml-auto">
            {node.children.length}
          </span>
        )}
      </div>
      {node.children && (
        <div className="ml-2">
          {node.children.map(child => renderTreeNode(child, level + 1))}
        </div>
      )}
    </div>
  );

  const renderRadialView = (node: MindMapNode) => (
    <div className="flex items-center justify-center h-full p-8">
      <div className="relative w-full h-full max-w-3xl max-h-3xl">
        {/* Center node */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
          <div className="bg-[#007acc] text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2">
            <Network size={20} />
            <span className="font-medium">{node.label}</span>
          </div>
        </div>
        
        {/* Child nodes in circle */}
        {node.children?.map((child, index) => {
          const angle = (index * 360) / (node.children?.length || 1);
          const radius = 150;
          const x = Math.cos((angle * Math.PI) / 180) * radius;
          const y = Math.sin((angle * Math.PI) / 180) * radius;
          
          return (
            <div
              key={child.id}
              className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
              style={{ transform: `translate(${x}px, ${y}px)` }}
            >
              <div className="bg-[#2d2d2d] hover:bg-[#3e3e3e] text-[#cccccc] px-4 py-2 rounded-md shadow-md flex items-center gap-2 cursor-pointer transition-colors">
                {getNodeIcon(child.type)}
                <span className="text-sm">{child.label}</span>
              </div>
              {/* Connection line */}
              <svg className="absolute top-0 left-0 w-full h-full pointer-events-none" style={{ zIndex: -1 }}>
                <line
                  x1="50%"
                  y1="50%"
                  x2={`calc(50% - ${x}px)`}
                  y2={`calc(50% - ${y}px)`}
                  stroke="#454545"
                  strokeWidth="1"
                  strokeDasharray="4"
                />
              </svg>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-[#1e1e1e]">
      {/* Toolbar */}
      <div className="h-12 bg-[#2d2d2d] border-b border-[#1e1e1e] px-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Network size={18} className="text-[#007acc]" />
          <span className="text-sm font-medium text-[#cccccc]">Code Mind Map</span>
        </div>
        
        <div className="flex items-center gap-2">
          {/* View Selector */}
          <div className="flex bg-[#1e1e1e] rounded-md overflow-hidden">
            <button
              onClick={() => setSelectedView('tree')}
              className={`px-3 py-1 text-xs transition-colors ${
                selectedView === 'tree'
                  ? 'bg-[#007acc] text-white'
                  : 'text-[#858585] hover:text-[#cccccc]'
              }`}
            >
              Tree
            </button>
            <button
              onClick={() => setSelectedView('radial')}
              className={`px-3 py-1 text-xs transition-colors ${
                selectedView === 'radial'
                  ? 'bg-[#007acc] text-white'
                  : 'text-[#858585] hover:text-[#cccccc]'
              }`}
            >
              Radial
            </button>
            <button
              onClick={() => setSelectedView('hierarchical')}
              className={`px-3 py-1 text-xs transition-colors ${
                selectedView === 'hierarchical'
                  ? 'bg-[#007acc] text-white'
                  : 'text-[#858585] hover:text-[#cccccc]'
              }`}
            >
              Hierarchical
            </button>
          </div>

          {/* Zoom Controls */}
          <div className="flex items-center gap-1 ml-2">
            <button
              onClick={() => setZoom(Math.max(50, zoom - 10))}
              className="p-1 hover:bg-[#3e3e3e] rounded text-[#858585] hover:text-white"
              title="Zoom Out"
            >
              <ZoomOut size={16} />
            </button>
            <span className="text-xs text-[#858585] min-w-[45px] text-center">
              {zoom}%
            </span>
            <button
              onClick={() => setZoom(Math.min(200, zoom + 10))}
              className="p-1 hover:bg-[#3e3e3e] rounded text-[#858585] hover:text-white"
              title="Zoom In"
            >
              <ZoomIn size={16} />
            </button>
          </div>

          <button
            className="p-1.5 hover:bg-[#3e3e3e] rounded text-[#858585] hover:text-white ml-2"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div 
        className="flex-1 overflow-auto p-4"
        style={{ zoom: `${zoom}%` }}
      >
        {selectedView === 'tree' && (
          <div className="space-y-1">
            {renderTreeNode(sampleData)}
          </div>
        )}
        
        {selectedView === 'radial' && renderRadialView(sampleData)}
        
        {selectedView === 'hierarchical' && (
          <div className="text-center py-12 text-[#858585]">
            <Network size={48} className="mx-auto mb-4 opacity-50" />
            <p className="text-sm">Hierarchical view coming soon...</p>
            <p className="text-xs mt-2">This will show a top-down dependency graph</p>
          </div>
        )}
      </div>

      {/* Info Footer */}
      <div className="h-8 bg-[#2d2d2d] border-t border-[#1e1e1e] px-4 flex items-center justify-between text-xs text-[#858585]">
        <span>Total Nodes: {countNodes(sampleData)}</span>
        <span>View: {selectedView.charAt(0).toUpperCase() + selectedView.slice(1)}</span>
      </div>
    </div>
  );
}

// Helper function to count nodes
function countNodes(node: MindMapNode): number {
  let count = 1;
  if (node.children) {
    node.children.forEach(child => {
      count += countNodes(child);
    });
  }
  return count;
}
