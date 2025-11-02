import React, { useState } from 'react';
import { Send, MessageSquare, Code, BarChart3, GitBranch, Sparkles } from 'lucide-react';
import { ChatInterface } from './ChatInterface';
import { CodeAnalysis } from './CodeAnalysis';
import { FlowchartView } from './FlowchartView';
import { MindMapView } from './MindMapView';

type TabType = 'chat' | 'analysis' | 'flowchart' | 'mindmap';

export const AIAssistantPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('chat');

  const tabs = [
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'analysis', label: 'Analysis', icon: Code },
    { id: 'flowchart', label: 'Flow', icon: GitBranch },
    { id: 'mindmap', label: 'Mind Map', icon: BarChart3 },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'chat':
        return <ChatInterface />;
      case 'analysis':
        return <CodeAnalysis />;
      case 'flowchart':
        return <FlowchartView />;
      case 'mindmap':
        return <MindMapView />;
      default:
        return <ChatInterface />;
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-gray-700 flex items-center space-x-2">
        <Sparkles size={20} className="text-blue-400" />
        <h3 className="text-sm font-semibold text-gray-300">AI Assistant</h3>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-700">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`flex-1 flex items-center justify-center space-x-1 py-2 text-xs transition-colors ${
                activeTab === tab.id
                  ? 'bg-gray-700 text-white border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-white hover:bg-gray-750'
              }`}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {renderTabContent()}
      </div>
    </div>
  );
};