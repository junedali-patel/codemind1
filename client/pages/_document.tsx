import { Head, Html, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en" className="codemind-theme dark" suppressHydrationWarning>
      <Head />
      <body className="codemind-theme antialiased min-h-screen" suppressHydrationWarning>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
