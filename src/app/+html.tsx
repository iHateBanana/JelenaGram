import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1"
        />
        <title>JelenaGram</title>
        <meta name="application-name" content="JelenaGram" />
        <meta name="apple-mobile-web-app-title" content="JelenaGram" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="theme-color" content="#EDE2EF" />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="icon" href="/favicon.png" />
        <link rel="manifest" href="/manifest.json" />
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body { background-color: #EDE2EF; overscroll-behavior: none; -webkit-text-size-adjust: 100%; }
              body { -webkit-tap-highlight-color: transparent; -webkit-font-smoothing: antialiased; }
              input, textarea { font-size: 16px !important; }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
