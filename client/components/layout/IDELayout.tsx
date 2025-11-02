'use client';

import { useState, ReactNode } from 'react';
import ActivityBar from './ActivityBar';
import Sidebar from './Sidebar';
import StatusBar from './StatusBar';
import Panel from './Panel';
import EditorTabs, { EditorTab } from './EditorTabs';
import AIChatView from '../views/AIChatView';
import ExplorerView, { FileNode } from '../views/ExplorerView';
import SearchView from '../views/SearchView';
import GitView from '../views/GitView';
import MindMapView from '../views/MindMapView';
import SettingsView from '../views/SettingsView';

interface IDELayoutProps {
  children?: ReactNode;
  files?: FileNode[];
  expandedDirs?: Record<string, boolean>;
  onFileClick?: (file: FileNode) => void;
  onDirToggle?: (path: string) => void;
  selectedFile?: FileNode | null;
  tabs?: EditorTab[];
  activeTabId?: string;
  onTabClick?: (tabId: string) => void;
  onTabClose?: (tabId: string) => void;
  statusBarProps?: {
    line?: number;
    column?: number;
    language?: string;
    branch?: string;
    aiStatus?: 'idle' | 'processing' | 'ready';
  };
}

export default function IDELayout({
  children,
  files = [],
  expandedDirs = {},
  onFileClick = () => {},
  onDirToggle = () => {},
  selectedFile = null,
  tabs = [],
  activeTabId = '',
  onTabClick = () => {},
  onTabClose = () => {},
  statusBarProps = {}
}: IDELayoutProps) {
  const [activeView, setActiveView] = useState<string>('explorer');
  const [showPanel, setShowPanel] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);

  const renderSidebarContent = () => {
    switch (activeView) {
      case 'explorer':
        return (
          <ExplorerView
            files={files}
            expandedDirs={expandedDirs}
            onFileClick={onFileClick}
            onDirToggle={onDirToggle}
            selectedFile={selectedFile}
          />
        );
      case 'search':
        return <SearchView />;
      case 'git':
        return <GitView />;
      case 'mindmap':
        return <MindMapView />;
      case 'ai':
        return <AIChatView />;
      case 'extensions':
        return (
          <div className="p-3 text-sm text-[#858585]">
            <div className="text-center py-8">
              Extensions view coming soon
            </div>
          </div>
        );
      case 'settings':
        return <SettingsView />;
      default:
        return null;
    }
  };

  const getSidebarTitle = () => {
    switch (activeView) {
      case 'explorer':
        return 'Explorer';
      case 'search':
        return 'Search';
      case 'git':
        return 'Source Control';
      case 'mindmap':
        return 'Mind Map';
      case 'ai':
        return 'AI Assistant';
      case 'extensions':
        return 'Extensions';
      case 'settings':
        return 'Settings';
      default:
        return '';
    }
  };

  return (
    <div className="h-screen flex flex-col bg-[#1e1e1e] text-[#cccccc]">
      <div className="flex-1 flex overflow-hidden">
        <ActivityBar activeView={activeView} onViewChange={setActiveView} />
        
        {showSidebar && (
          <Sidebar
            title={getSidebarTitle()}
            width={activeView === 'mindmap' ? 400 : activeView === 'ai' ? 350 : 250}
            onClose={() => setShowSidebar(false)}
          >
            {renderSidebarContent()}
          </Sidebar>
        )}

        <div className="flex-1 flex flex-col overflow-hidden">
          {tabs.length > 0 && (
            <EditorTabs
              tabs={tabs}
              activeTabId={activeTabId}
              onTabClick={onTabClick}
              onTabClose={onTabClose}
            />
          )}

          <div className="flex-1 overflow-hidden bg-[#1e1e1e]">
            {children}
          </div>

          {showPanel && (
            <Panel onClose={() => setShowPanel(false)} />
          )}
        </div>
      </div>

      <StatusBar {...statusBarProps} />
    </div>
  );
}
