import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CodeMind.AI - Intelligent IDE',
  description: 'A VS Code-like IDE with integrated AI assistance powered by Ollama',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="codemind-theme dark" suppressHydrationWarning>
      <body className="codemind-theme antialiased min-h-screen" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
