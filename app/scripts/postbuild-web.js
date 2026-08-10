#!/usr/bin/env node
/**
 * Completa lo que `expo export --platform web` no genera en el SDK 51
 * clásico (sin expo-router): el ícono de "Agregar a pantalla de inicio"
 * de iOS y el manifest de PWA para Android/Chrome.
 *
 * Se corre después de cada `npx expo export --platform web ...`.
 */
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', 'dist');
const ASSETS = path.join(__dirname, '..', 'assets');

fs.copyFileSync(
  path.join(ASSETS, 'apple-touch-icon.png'),
  path.join(DIST, 'apple-touch-icon.png')
);
fs.copyFileSync(path.join(ASSETS, 'icon.png'), path.join(DIST, 'icon-512.png'));

fs.writeFileSync(
  path.join(DIST, 'manifest.json'),
  JSON.stringify(
    {
      name: 'TapptScan',
      short_name: 'TapptScan',
      start_url: '/',
      display: 'standalone',
      background_color: '#F8FAFC',
      theme_color: '#18B875',
      icons: [{ src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }],
    },
    null,
    2
  )
);

const indexPath = path.join(DIST, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

const etiquetas = [
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
  '<link rel="manifest" href="/manifest.json">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
  '<meta name="apple-mobile-web-app-title" content="TapptScan">',
].join('\n');

if (!html.includes('apple-touch-icon')) {
  html = html.replace('</head>', `${etiquetas}\n</head>`);
  fs.writeFileSync(indexPath, html);
}

console.log('postbuild-web: apple-touch-icon, manifest.json y meta tags agregados a dist/');
