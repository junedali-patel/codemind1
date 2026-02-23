'use client';

import { Palette, Volume2, Bell, Eye } from '@/lib/icons';
import { useState } from 'react';

function Toggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`h-6 w-11 rounded-full border transition-all relative ${
        active
          ? 'bg-[var(--cm-primary)]/80 border-[var(--cm-primary)]'
          : 'bg-[rgba(148,163,184,0.2)] border-[var(--cm-border-soft)]'
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
          active ? 'translate-x-6' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--cm-border)] bg-[rgba(2,6,23,0.35)] px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-xs text-[var(--cm-text)]">{label}</p>
        <p className="text-[11px] text-[var(--cm-text-muted)] truncate">{description}</p>
      </div>
      {children}
    </div>
  );
}

export default function SettingsView() {
  const [theme, setTheme] = useState('dark');
  const [fontSize, setFontSize] = useState(12);
  const [notifications, setNotifications] = useState(true);
  const [minimap, setMinimap] = useState(true);
  const [sound, setSound] = useState(true);
  const [wordWrap, setWordWrap] = useState(true);
  const [lineNumbers, setLineNumbers] = useState(true);

  return (
    <div className="h-full cm-sidebar overflow-y-auto p-3 space-y-4">
      <section className="space-y-2.5">
        <h3 className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-[var(--cm-primary)] font-semibold">
          <Palette size={13} />
          Appearance
        </h3>
        <SettingRow label="Theme" description="Choose color scheme">
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            className="h-8 rounded-md bg-[rgba(15,23,42,0.8)] border border-[var(--cm-border-soft)] text-xs text-[var(--cm-text)] px-2"
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="auto">Auto</option>
          </select>
        </SettingRow>
        <SettingRow label="Font Size" description="Editor font size in pixels">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={10}
              max={18}
              value={fontSize}
              onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
              className="w-24 accent-[var(--cm-primary)]"
            />
            <span className="w-10 text-right text-[11px] text-[var(--cm-text-muted)] cm-mono">{fontSize}px</span>
          </div>
        </SettingRow>
        <SettingRow label="Minimap" description="Show code minimap">
          <Toggle active={minimap} onToggle={() => setMinimap(!minimap)} />
        </SettingRow>
      </section>

      <section className="space-y-2.5">
        <h3 className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-[var(--cm-primary)] font-semibold">
          <Bell size={13} />
          Notifications
        </h3>
        <SettingRow label="Enable Notifications" description="Show desktop notifications">
          <Toggle active={notifications} onToggle={() => setNotifications(!notifications)} />
        </SettingRow>
      </section>

      <section className="space-y-2.5">
        <h3 className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-[var(--cm-primary)] font-semibold">
          <Volume2 size={13} />
          Sound
        </h3>
        <SettingRow label="Sound Effects" description="Play UI sounds">
          <Toggle active={sound} onToggle={() => setSound(!sound)} />
        </SettingRow>
      </section>

      <section className="space-y-2.5">
        <h3 className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-[var(--cm-primary)] font-semibold">
          <Eye size={13} />
          Editor
        </h3>
        <SettingRow label="Word Wrap" description="Wrap long lines">
          <Toggle active={wordWrap} onToggle={() => setWordWrap(!wordWrap)} />
        </SettingRow>
        <SettingRow label="Line Numbers" description="Show line numbers">
          <Toggle active={lineNumbers} onToggle={() => setLineNumbers(!lineNumbers)} />
        </SettingRow>
      </section>
    </div>
  );
}
