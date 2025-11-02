import React, { useState, useEffect } from 'react';
import { FileTreePanel } from './components/FileTreePanel';
import { CodeEditorPanel } from './components/CodeEditorPanel';
import { AIAssistantPanel } from './components/AIAssistantPanel';
import { Toolbar } from './components/Toolbar';
import { AuthProvider } from './contexts/AuthContext';
import { ProjectProvider } from './contexts/ProjectContext';

function App() {
  const [leftPanelWidth, setLeftPanelWidth] = useState(300);
  const [rightPanelWidth, setRightPanelWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);

  const handleLeftResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(200, Math.min(500, e.clientX));
      setLeftPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleRightResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(300, Math.min(600, window.innerWidth - e.clientX));
      setRightPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <AuthProvider>
      <ProjectProvider>
        <div className="h-screen bg-gray-900 text-white flex flex-col">
          <Toolbar />
          
          <div className="flex-1 flex overflow-hidden">
            {/* Left Panel - File Explorer */}
            <div 
              className="bg-gray-800 border-r border-gray-700 overflow-hidden"
              style={{ width: leftPanelWidth }}
            >
              <FileTreePanel />
            </div>

            {/* Left Resizer */}
            <div
              className="w-1 bg-gray-700 hover:bg-blue-500 cursor-col-resize transition-colors"
              onMouseDown={handleLeftResize}
            />

            {/* Center Panel - Code Editor */}
            <div className="flex-1 bg-gray-900 overflow-hidden">
              <CodeEditorPanel />
            </div>

            {/* Right Resizer */}
            <div
              className="w-1 bg-gray-700 hover:bg-blue-500 cursor-col-resize transition-colors"
              onMouseDown={handleRightResize}
            />

            {/* Right Panel - AI Assistant */}
            <div 
              className="bg-gray-800 border-l border-gray-700 overflow-hidden"
              style={{ width: rightPanelWidth }}
            >
              <AIAssistantPanel />
            </div>
          </div>
        </div>
      </ProjectProvider>
    </AuthProvider>
  );
}

export default App;