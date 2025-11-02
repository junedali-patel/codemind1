'use client';

import { useState } from 'react';
import { Palette, Monitor, Type, Zap, Bell, Shield, Check } from 'lucide-react';
import { themes, ThemeName } from '@/lib/theme';

export default function SettingsView() {
  const [selectedTheme, setSelectedTheme] = useState<ThemeName>('darkPlus');
  const [fontSize, setFontSize] = useState(14);
  const [notifications, setNotifications] = useState(true);

  const themeOptions: { value: ThemeName; label: string; preview: string[] }[] = [
    { value: 'darkPlus', label: 'Dark+ (default dark)', preview: ['#1e1e1e', '#007acc', '#cccccc'] },
    { value: 'monokai', label: 'Monokai', preview: ['#272822', '#66d9ef', '#f8f8f2'] },
    { value: 'githubDark', label: 'GitHub Dark', preview: ['#0d1117', '#1f6feb', '#e6edf3'] },
    { value: 'oneDark', label: 'One Dark Pro', preview: ['#282c34', '#61afef', '#abb2bf'] },
    { value: 'dracula', label: 'Dracula', preview: ['#282a36', '#bd93f9', '#f8f8f2'] },
  ];

  return (
    <div className="p-4 space-y-6">
      {/* Theme Settings */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Palette size={18} className="text-[#007acc]" />
          <h3 className="text-sm font-semibold text-[#cccccc] uppercase tracking-wider">
            Color Theme
          </h3>
        </div>
        
        <div className="space-y-2">
          {themeOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setSelectedTheme(option.value)}
              className={`w-full flex items-center justify-between p-3 rounded-md transition-colors ${
                selectedTheme === option.value
                  ? 'bg-[#007acc] text-white'
                  : 'bg-[#2d2d2d] text-[#cccccc] hover:bg-[#3e3e3e]'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="flex gap-1">
                  {option.preview.map((color, index) => (
                    <div
                      key={index}
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <span className="text-sm">{option.label}</span>
              </div>
              {selectedTheme === option.value && (
                <Check size={16} />
              )}
            </button>
          ))}
        </div>
      </section>

      {/* Editor Settings */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Type size={18} className="text-[#007acc]" />
          <h3 className="text-sm font-semibold text-[#cccccc] uppercase tracking-wider">
            Editor
          </h3>
        </div>
        
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm text-[#cccccc]">Font Size</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFontSize(Math.max(10, fontSize - 1))}
                className="w-8 h-8 flex items-center justify-center bg-[#2d2d2d] hover:bg-[#3e3e3e] rounded text-[#cccccc]"
              >
                -
              </button>
              <span className="text-sm text-[#cccccc] min-w-[40px] text-center">
                {fontSize}px
              </span>
              <button
                onClick={() => setFontSize(Math.min(24, fontSize + 1))}
                className="w-8 h-8 flex items-center justify-center bg-[#2d2d2d] hover:bg-[#3e3e3e] rounded text-[#cccccc]"
              >
                +
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm text-[#cccccc]">Line Numbers</label>
            <div className="relative inline-block w-12 h-6">
              <input
                type="checkbox"
                defaultChecked
                className="sr-only peer"
              />
              <div className="w-12 h-6 bg-[#3e3e3e] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#007acc]"></div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm text-[#cccccc]">Minimap</label>
            <div className="relative inline-block w-12 h-6">
              <input
                type="checkbox"
                defaultChecked
                className="sr-only peer"
              />
              <div className="w-12 h-6 bg-[#3e3e3e] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#007acc]"></div>
            </div>
          </div>
        </div>
      </section>

      {/* AI Settings */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Zap size={18} className="text-[#007acc]" />
          <h3 className="text-sm font-semibold text-[#cccccc] uppercase tracking-wider">
            AI Assistant
          </h3>
        </div>
        
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm text-[#cccccc]">Auto-suggestions</label>
            <div className="relative inline-block w-12 h-6">
              <input
                type="checkbox"
                defaultChecked
                className="sr-only peer"
              />
              <div className="w-12 h-6 bg-[#3e3e3e] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#007acc]"></div>
            </div>
          </div>

          <div className="bg-[#2d2d2d] p-3 rounded-md">
            <p className="text-xs text-[#858585]">
              Server URL: <span className="text-[#cccccc]">http://localhost:4000</span>
            </p>
          </div>
        </div>
      </section>

      {/* Notifications */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Bell size={18} className="text-[#007acc]" />
          <h3 className="text-sm font-semibold text-[#cccccc] uppercase tracking-wider">
            Notifications
          </h3>
        </div>
        
        <div className="flex items-center justify-between">
          <label className="text-sm text-[#cccccc]">Enable notifications</label>
          <div className="relative inline-block w-12 h-6">
            <input
              type="checkbox"
              checked={notifications}
              onChange={(e) => setNotifications(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-12 h-6 bg-[#3e3e3e] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#007acc]"></div>
          </div>
        </div>
      </section>

      {/* Security */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Shield size={18} className="text-[#007acc]" />
          <h3 className="text-sm font-semibold text-[#cccccc] uppercase tracking-wider">
            Security
          </h3>
        </div>
        
        <div className="bg-[#2d2d2d] p-3 rounded-md space-y-2">
          <p className="text-xs text-[#858585]">
            GitHub Token: <span className="text-green-400">● Connected</span>
          </p>
          <button className="text-xs text-[#007acc] hover:underline">
            Disconnect GitHub
          </button>
        </div>
      </section>

      {/* Info */}
      <section className="pt-4 border-t border-[#2b2b2b]">
        <div className="text-xs text-[#858585] space-y-1">
          <div className="flex justify-between">
            <span>Version:</span>
            <span className="text-[#cccccc]">1.0.0</span>
          </div>
          <div className="flex justify-between">
            <span>Environment:</span>
            <span className="text-[#cccccc]">Development</span>
          </div>
          <div className="flex justify-between">
            <span>Node:</span>
            <span className="text-[#cccccc]">v20.0.0</span>
          </div>
        </div>
      </section>
    </div>
  );
}
