'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function WorkspaceSessionPage() {
  const params = useParams();
  const router = useRouter();
  const { sessionId } = params as { sessionId: string };

  useEffect(() => {
    if (!sessionId) return;
    router.replace(`/repo/workspace/session?sessionId=${encodeURIComponent(sessionId)}`);
  }, [router, sessionId]);

  return (
    <div className="h-screen w-full cm-shell flex items-center justify-center">
      <div className="text-center">
        <div
          className="w-10 h-10 mx-auto mb-3 rounded-full border-2 border-[var(--cm-border)] border-t-[var(--cm-primary)] animate-spin"
          aria-hidden="true"
        />
        <p className="text-sm text-[var(--cm-text-muted)]">Opening workspace...</p>
      </div>
    </div>
  );
}
