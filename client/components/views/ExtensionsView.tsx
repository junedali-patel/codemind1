'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Download, Loader2, Play, Power, PowerOff, RefreshCw, Search, Trash2 } from '@/lib/icons';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

type MarketplaceSource = 'all' | 'openvsx' | 'vscode';

interface MarketplaceExtension {
  id: string;
  extensionId?: string;
  source?: string;
  publisher?: string;
  name?: string;
  displayName?: string;
  version?: string;
  description?: string;
  iconUrl?: string;
  downloadUrl?: string;
}

interface InstalledExtension {
  id: string;
  source: string;
  displayName: string;
  publisher: string;
  version: string;
  description: string;
  iconUrl?: string;
  enabled: boolean;
  status: string;
  updateAvailable?: boolean;
}

interface ExtensionsViewProps {
  workspaceSessionId?: string;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const payload = (await response.json()) as { error?: string; details?: string; message?: string };
      message = payload.details || payload.error || payload.message || message;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

function normalizeMarketplaceExtension(extension: MarketplaceExtension): MarketplaceExtension {
  return {
    ...extension,
    id: extension.id || extension.extensionId || '',
    displayName: extension.displayName || extension.name || extension.id || 'Unknown Extension',
    publisher: extension.publisher || 'unknown',
    version: extension.version || '0.0.0',
    description: extension.description || '',
    source: extension.source || 'unknown',
  };
}

export default function ExtensionsView({ workspaceSessionId = '' }: ExtensionsViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [marketplaceSource, setMarketplaceSource] = useState<MarketplaceSource>('all');
  const [marketplaceLoading, setMarketplaceLoading] = useState(false);
  const [marketplaceWarnings, setMarketplaceWarnings] = useState<string[]>([]);
  const [marketplaceItems, setMarketplaceItems] = useState<MarketplaceExtension[]>([]);

  const [installedLoading, setInstalledLoading] = useState(false);
  const [installedItems, setInstalledItems] = useState<InstalledExtension[]>([]);
  const [hostBusy, setHostBusy] = useState(false);
  const [hostRunning, setHostRunning] = useState(false);
  const [error, setError] = useState('');

  const loadInstalled = useCallback(async () => {
    setInstalledLoading(true);
    try {
      const payload = await requestJson<{ extensions: InstalledExtension[] }>(`${API_BASE_URL}/api/extensions/installed`);
      setInstalledItems(payload.extensions || []);
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Failed to load installed extensions'));
    } finally {
      setInstalledLoading(false);
    }
  }, []);

  const searchMarketplace = useCallback(async () => {
    setMarketplaceLoading(true);
    setMarketplaceWarnings([]);
    setError('');

    try {
      const params = new URLSearchParams({
        query: searchQuery.trim(),
        source: marketplaceSource,
        page: '1',
      });
      const payload = await requestJson<{
        extensions: MarketplaceExtension[];
        warnings?: string[];
      }>(`${API_BASE_URL}/api/extensions/marketplace?${params.toString()}`);

      setMarketplaceItems((payload.extensions || []).map(normalizeMarketplaceExtension));
      setMarketplaceWarnings(payload.warnings || []);
    } catch (searchError) {
      setError(getErrorMessage(searchError, 'Failed to search extension marketplace'));
    } finally {
      setMarketplaceLoading(false);
    }
  }, [marketplaceSource, searchQuery]);

  useEffect(() => {
    void loadInstalled();
    void searchMarketplace();
  }, [loadInstalled, searchMarketplace]);

  const installedById = useMemo(() => {
    const map = new Map<string, InstalledExtension>();
    for (const extension of installedItems) {
      map.set(extension.id, extension);
    }
    return map;
  }, [installedItems]);

  const installExtension = useCallback(async (extension: MarketplaceExtension) => {
    const extensionId = extension.id;
    if (!extensionId) return;
    try {
      setError('');
      await requestJson<{ success: boolean }>(`${API_BASE_URL}/api/extensions/install`, {
        method: 'POST',
        body: JSON.stringify({
          extensionId,
          source: extension.source,
          displayName: extension.displayName,
          publisher: extension.publisher,
          version: extension.version,
          description: extension.description,
          iconUrl: extension.iconUrl,
          downloadUrl: extension.downloadUrl,
        }),
      });
      await loadInstalled();
    } catch (installError) {
      setError(getErrorMessage(installError, `Failed to install ${extension.displayName}`));
    }
  }, [loadInstalled]);

  const uninstallExtension = useCallback(async (extensionId: string) => {
    try {
      setError('');
      await requestJson<{ success: boolean }>(`${API_BASE_URL}/api/extensions/${encodeURIComponent(extensionId)}`, {
        method: 'DELETE',
      });
      await loadInstalled();
    } catch (uninstallError) {
      setError(getErrorMessage(uninstallError, `Failed to uninstall ${extensionId}`));
    }
  }, [loadInstalled]);

  const setExtensionEnabled = useCallback(async (extensionId: string, enabled: boolean) => {
    const action = enabled ? 'enable' : 'disable';
    try {
      setError('');
      await requestJson<{ success: boolean }>(
        `${API_BASE_URL}/api/extensions/${encodeURIComponent(extensionId)}/${action}`,
        {
          method: 'POST',
        }
      );
      await loadInstalled();
    } catch (toggleError) {
      setError(getErrorMessage(toggleError, `Failed to ${action} ${extensionId}`));
    }
  }, [loadInstalled]);

  const updateExtension = useCallback(async (extensionId: string) => {
    try {
      setError('');
      await requestJson<{ success: boolean }>(`${API_BASE_URL}/api/extensions/${encodeURIComponent(extensionId)}/update`, {
        method: 'POST',
      });
      await loadInstalled();
    } catch (updateError) {
      setError(getErrorMessage(updateError, `Failed to update ${extensionId}`));
    }
  }, [loadInstalled]);

  const startHost = useCallback(async () => {
    if (!workspaceSessionId) {
      setError('Open a workspace before starting extension host.');
      return;
    }

    setHostBusy(true);
    setError('');
    try {
      await requestJson<{ success: boolean }>(`${API_BASE_URL}/api/extensions/host/start`, {
        method: 'POST',
        body: JSON.stringify({ workspaceSessionId }),
      });
      setHostRunning(true);
    } catch (hostError) {
      setError(getErrorMessage(hostError, 'Failed to start extension host'));
    } finally {
      setHostBusy(false);
    }
  }, [workspaceSessionId]);

  const stopHost = useCallback(async () => {
    if (!workspaceSessionId) return;

    setHostBusy(true);
    setError('');
    try {
      await requestJson<{ success: boolean }>(`${API_BASE_URL}/api/extensions/host/stop`, {
        method: 'POST',
        body: JSON.stringify({ workspaceSessionId }),
      });
      setHostRunning(false);
    } catch (hostError) {
      setError(getErrorMessage(hostError, 'Failed to stop extension host'));
    } finally {
      setHostBusy(false);
    }
  }, [workspaceSessionId]);

  const onSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void searchMarketplace();
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-2 border-b border-[var(--cm-border)] space-y-2 bg-[rgba(12,18,28,0.94)]">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-100">Extensions</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void startHost()}
              disabled={hostBusy || hostRunning}
              className="h-6 px-2 rounded text-[10px] font-semibold cm-btn-ghost disabled:opacity-50 flex items-center gap-1"
              title="Start extension host"
            >
              <Play size={12} />
              Start Host
            </button>
            <button
              onClick={() => void stopHost()}
              disabled={hostBusy || !hostRunning}
              className="h-6 px-2 rounded text-[10px] font-semibold cm-btn-ghost disabled:opacity-50 flex items-center gap-1"
              title="Stop extension host"
            >
              <PowerOff size={12} />
              Stop Host
            </button>
          </div>
        </div>

        <form onSubmit={onSearchSubmit} className="space-y-2">
          <div className="flex gap-2">
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search extensions"
              className="h-7 flex-1 rounded border border-[var(--cm-border)] bg-[rgba(10,15,23,0.88)] px-2.5 text-[11px] text-slate-100 focus:outline-none focus:border-[var(--cm-primary)]"
            />
            <button
              type="submit"
              disabled={marketplaceLoading}
              className="h-7 px-2.5 rounded cm-btn-primary text-[11px] font-semibold disabled:opacity-50 flex items-center gap-1"
            >
              {marketplaceLoading ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
              Search
            </button>
          </div>

          <select
            value={marketplaceSource}
            onChange={(event) => setMarketplaceSource(event.target.value as MarketplaceSource)}
            className="h-7 w-full rounded border border-[var(--cm-border)] bg-[rgba(10,15,23,0.88)] px-2 text-[11px] text-slate-100"
          >
            <option value="all">All Sources</option>
            <option value="openvsx">Open VSX</option>
            <option value="vscode">VS Code</option>
          </select>
        </form>

        {error && (
          <div className="rounded border border-red-400/40 bg-red-500/10 p-2 text-[11px] text-red-200 flex items-start gap-2">
            <AlertCircle size={12} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {marketplaceWarnings.length > 0 && (
          <div className="rounded border border-amber-400/40 bg-amber-500/10 p-2 text-[11px] text-amber-200 space-y-1">
            {marketplaceWarnings.map((warning) => (
              <div key={warning}>{warning}</div>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-2 border-b border-[var(--cm-border)]">
          <h4 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--cm-text-muted)] mb-2">Installed</h4>
          {installedLoading ? (
            <div className="text-[11px] text-[var(--cm-text-muted)] flex items-center gap-2">
              <Loader2 size={12} className="animate-spin" />
              Loading installed extensions...
            </div>
          ) : installedItems.length === 0 ? (
            <div className="text-[11px] text-[var(--cm-text-muted)]">No installed extensions yet.</div>
          ) : (
            <div className="space-y-1.5">
              {installedItems.map((extension) => (
                <div key={extension.id} className="rounded border border-[var(--cm-border)] bg-[rgba(8,12,20,0.78)] p-2">
                  <div className="text-[12px] text-slate-100">{extension.displayName}</div>
                  <div className="text-[11px] text-[var(--cm-text-muted)]">
                    {extension.id} • {extension.version}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {extension.enabled ? (
                      <button
                        onClick={() => void setExtensionEnabled(extension.id, false)}
                        className="h-6 px-2 rounded text-[10px] cm-btn-ghost flex items-center gap-1"
                      >
                        <PowerOff size={11} />
                        Disable
                      </button>
                    ) : (
                      <button
                        onClick={() => void setExtensionEnabled(extension.id, true)}
                        className="h-6 px-2 rounded text-[10px] cm-btn-ghost flex items-center gap-1"
                      >
                        <Power size={11} />
                        Enable
                      </button>
                    )}
                    <button
                      onClick={() => void updateExtension(extension.id)}
                      className="h-6 px-2 rounded text-[10px] cm-btn-ghost flex items-center gap-1"
                    >
                      <RefreshCw size={11} />
                      Update
                    </button>
                    <button
                      onClick={() => void uninstallExtension(extension.id)}
                      className="h-6 px-2 rounded text-[10px] text-red-200 hover:bg-red-500/10 flex items-center gap-1"
                    >
                      <Trash2 size={11} />
                      Uninstall
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-2">
          <h4 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--cm-text-muted)] mb-2">Marketplace</h4>
          {marketplaceLoading ? (
            <div className="text-[11px] text-[var(--cm-text-muted)] flex items-center gap-2">
              <Loader2 size={12} className="animate-spin" />
              Searching marketplace...
            </div>
          ) : marketplaceItems.length === 0 ? (
            <div className="text-[11px] text-[var(--cm-text-muted)]">No marketplace results.</div>
          ) : (
            <div className="space-y-1.5">
              {marketplaceItems.map((extension) => {
                const installed = installedById.get(extension.id);
                return (
                  <div key={extension.id} className="rounded border border-[var(--cm-border)] bg-[rgba(8,12,20,0.78)] p-2">
                    <div className="text-[12px] text-slate-100">{extension.displayName}</div>
                    <div className="text-[11px] text-[var(--cm-text-muted)]">
                      {extension.id} • {extension.version}
                    </div>
                    {extension.description && (
                      <div className="text-[11px] text-[var(--cm-text-muted)] mt-1 line-clamp-2">
                        {extension.description}
                      </div>
                    )}
                    <div className="mt-1.5">
                      {installed ? (
                        <span className="inline-flex h-6 items-center px-2 rounded text-[10px] border border-emerald-400/40 text-emerald-200 bg-emerald-500/10">
                          Installed
                        </span>
                      ) : (
                        <button
                          onClick={() => void installExtension(extension)}
                          className="h-6 px-2 rounded text-[10px] cm-btn-primary flex items-center gap-1"
                        >
                          <Download size={11} />
                          Install
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
