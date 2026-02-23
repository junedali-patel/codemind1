import { redirect } from 'next/navigation';

interface WorkspaceSessionPageProps {
  params: Promise<{
    sessionId: string;
  }>;
}

export default async function WorkspaceSessionPage({ params }: WorkspaceSessionPageProps) {
  const { sessionId } = await params;
  const normalizedSessionId = encodeURIComponent(sessionId || '');
  redirect(`/repo/workspace/session?sessionId=${normalizedSessionId}`);
}
