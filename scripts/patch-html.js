// Injects iOS home-screen / Safari tags into every exported HTML file.
const fs = require('fs');
const path = require('path');

const HEAD = `<meta name="apple-mobile-web-app-title" content="JelenaGram"/>
<meta name="apple-mobile-web-app-capable" content="yes"/>
<meta name="mobile-web-app-capable" content="yes"/>
<meta name="apple-mobile-web-app-status-bar-style" content="default"/>
<meta name="theme-color" content="#EDE2EF"/>
<meta name="robots" content="noindex, nofollow"/>
<link rel="apple-touch-icon" href="/apple-touch-icon.png"/>
<link rel="icon" href="/favicon.png"/>
<link rel="manifest" href="/manifest.json"/>
<style>html,body{background-color:#EDE2EF;overscroll-behavior:none;-webkit-text-size-adjust:100%}body{-webkit-tap-highlight-color:transparent;-webkit-font-smoothing:antialiased}input,textarea{font-size:16px !important}#root{padding-top:env(safe-area-inset-top);box-sizing:border-box}</style>`;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (p.endsWith('.html')) patch(p);
  }
}

function patch(file) {
  let html = fs.readFileSync(file, 'utf8');
  html = html.replace(/<meta name="viewport"[^>]*>/, '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"/>');
  html = html.replace('</head>', HEAD + '</head>');
  fs.writeFileSync(file, html);
}

walk(path.join(__dirname, '..', 'dist'));
