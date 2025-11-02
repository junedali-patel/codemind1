'use client';

import { 
  FileText,
  Search,
  GitBranch,
  Settings,
  MessageSquare,
  Network,
  Layers,
  Bug,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ActivityBarProps {
  activeView: string;
  onViewChange: (view: string) => void;
  collapsed?: boolean;
  onCollapse?: () => void;
}

const activities = [
  { id: 'explorer', icon: FileText, label: 'Explorer' },
  { id: 'search', icon: Search, label: 'Search' },
  { id: 'git', icon: GitBranch, label: 'Git' },
  { id: 'debug', icon: Bug, label: 'Debug' },
  { id: 'extensions', icon: Layers, label: 'Extensions' },
  { id: 'ai', icon: MessageSquare, label: 'AI' },
  { id: 'mindmap', icon: Network, label: 'Mind Map' },
];

export default function ActivityBar({
  activeView,
  onViewChange,
  collapsed = false,
  onCollapse
}: ActivityBarProps) {
  return (
    <motion.div 
      className="h-full flex flex-col items-center bg-[#181818] border-r border-gray-800 select-none"
      initial={{ width: 60 }}
      animate={{ width: collapsed ? 60 : 200 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <div className="flex-1 w-full flex flex-col items-center pt-4 space-y-2 px-2">
        {activities.map((activity) => {
          const Icon = activity.icon;
          const isActive = activeView === activity.id;
          return (
            <motion.button
              key={activity.id}
              onClick={() => onViewChange(activity.id)}
              className={`relative flex items-center w-full h-10 rounded-lg transition-all overflow-hidden ${
                isActive
                  ? 'text-white bg-gradient-to-r from-blue-600/30 to-blue-800/20 border-l-4 border-blue-500'
                  : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              aria-label={activity.label}
              title={activity.label}
            >
              <div className="flex items-center w-full px-3">
                <Icon size={18} className="min-w-[24px]" />
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span 
                      className="ml-3 text-sm font-medium whitespace-nowrap"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.15 }}
                    >
                      {activity.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </motion.button>
          );
        })}
      </div>

      <div className="w-full flex flex-col items-center py-4 border-t border-gray-800 space-y-4">
        <motion.button
          onClick={onCollapse}
          className="flex items-center justify-center w-10 h-10 text-gray-400 hover:bg-gray-800 rounded-lg transition-colors"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          aria-label={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </motion.button>

        <motion.button
          className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-blue-800 text-white shadow-lg hover:shadow-blue-500/20 transition-all"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          aria-label="User Settings"
          title="User Settings"
        >
          <span className="text-sm font-semibold">U</span>
        </motion.button>
      </div>

      <motion.button
        onClick={() => onViewChange('settings')}
        className={`w-full py-2 px-3 flex items-center justify-center hover:bg-gray-800/50 rounded-lg transition-colors mb-4 ${
          activeView === 'settings' 
            ? 'text-blue-400 bg-blue-900/20' 
            : 'text-gray-400 hover:text-gray-200'
        }`}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        title="Settings"
      >
        <div className="flex items-center w-full justify-center">
          <Settings size={18} className="min-w-[24px]" />
          <AnimatePresence>
            {!collapsed && (
              <motion.span 
                className="ml-3 text-sm font-medium whitespace-nowrap"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.15 }}
              >
                Settings
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </motion.button>
    </motion.div>
  );
}
