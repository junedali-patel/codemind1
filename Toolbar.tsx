import React from 'react';
import { Github, Play, Settings, Save, Download } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useProject } from '../contexts/ProjectContext';

export const Toolbar: React.FC = () => {
  const { user, signInWithGitHub, signOut } = useAuth();
  const { currentProject, saveProject, runCode } = useProject();

  return (
    <div className="h-12 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-4">
      <div className="flex items-center space-x-4">
        <div className="text-lg font-bold text-blue-400">CodeMind.AI</div>
        
        {currentProject && (
          <div className="flex items-center space-x-2 text-sm text-gray-300">
            <span>/</span>
            <span>{currentProject.name}</span>
          </div>
        )}
      </div>

      <div className="flex items-center space-x-2">
        {currentProject && (
          <>
            <button
              onClick={runCode}
              className="flex items-center space-x-1 px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-sm transition-colors"
            >
              <Play size={14} />
              <span>Run</span>
            </button>
            
            <button
              onClick={saveProject}
              className="flex items-center space-x-1 px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-sm transition-colors"
            >
              <Save size={14} />
              <span>Save</span>
            </button>
          </>
        )}

        <button className="p-2 hover:bg-gray-700 rounded transition-colors">
          <Settings size={16} />
        </button>

        {user ? (
          <div className="flex items-center space-x-2">
            <img 
              src={user.photoURL || ''} 
              alt="Profile" 
              className="w-6 h-6 rounded-full"
            />
            <span className="text-sm">{user.displayName}</span>
            <button 
              onClick={signOut}
              className="text-xs text-gray-400 hover:text-white"
            >
              Sign Out
            </button>
          </div>
        ) : (
          <button
            onClick={signInWithGitHub}
            className="flex items-center space-x-1 px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
          >
            <Github size={14} />
            <span>Sign In</span>
          </button>
        )}
      </div>
    </div>
  );
};