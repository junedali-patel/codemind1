import type { NextPageContext } from 'next';

type ErrorProps = {
  statusCode?: number;
};

function ErrorPage({ statusCode }: ErrorProps) {
  return (
    <main className="min-h-screen cm-shell flex items-center justify-center p-6">
      <div className="cm-card rounded-2xl p-8 text-center max-w-md w-full">
        <h1 className="text-4xl font-bold text-[var(--cm-primary)] mb-2">
          {statusCode || 500}
        </h1>
        <p className="text-sm text-[var(--cm-text)] mb-1">Something went wrong.</p>
        <p className="text-xs text-[var(--cm-text-muted)]">
          Please refresh the page or try again in a moment.
        </p>
      </div>
    </main>
  );
}

ErrorPage.getInitialProps = ({ res, err }: NextPageContext): ErrorProps => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};

export default ErrorPage;
