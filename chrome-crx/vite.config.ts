import { defineConfig, type Plugin } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import rawManifest from './manifest.json';

// ─── Manifest transformation for multi-browser builds ─────────────────────────
// BUILD_TARGET env var: 'chrome' (default) or 'edge'
// Transforms manifest.json BEFORE @crxjs/vite-plugin sees it, so the plugin
// always works with the correct manifest for the target platform.

function transformManifest(target: 'chrome' | 'edge'): typeof rawManifest {
  // Deep clone to avoid mutating the original import
  const manifest = JSON.parse(JSON.stringify(rawManifest));

  if (target === 'edge') {
    // Edge Add-ons generates its own extension ID — remove Chrome Store key
    delete (manifest as Record<string, unknown>).key;
    // Edge has its own auto-update mechanism
    delete (manifest as Record<string, unknown>).update_url;
    // minimum_chrome_version is valid for Edge (Chromium-based) — no rename needed
    // Update description to be browser-generic
    manifest.description = manifest.description.replace('in Chrome', 'in Edge');
  }

  return manifest;
}

const rawBuildTarget = process.env.BUILD_TARGET || 'chrome';
if (!['chrome', 'edge'].includes(rawBuildTarget)) {
  throw new Error(`Invalid BUILD_TARGET: "${rawBuildTarget}". Must be "chrome" or "edge".`);
}
const buildTarget = rawBuildTarget as 'chrome' | 'edge';
const manifest = transformManifest(buildTarget);

/**
 * Copies runtime-fetched i18n catalogs to dist/.
 * Static HTML/vendor files now live in public/ and are copied by Vite.
 */
function copyI18nCatalogs(): Plugin {
  return {
    name: 'copy-i18n-catalogs',
    writeBundle() {
      const outDir = resolve(__dirname, 'dist');
      const outI18nDir = resolve(outDir, 'i18n');
      if (!existsSync(outI18nDir)) {
        mkdirSync(outI18nDir, { recursive: true });
      }

      // Copy i18n message catalogs used by IntlMessageLoaderProvider (loaded via fetch at runtime).
      const i18nDir = resolve(__dirname, 'i18n');
      if (existsSync(i18nDir)) {
        for (const file of readdirSync(i18nDir)) {
          if (!file.endsWith('.json')) continue;
          const src = resolve(i18nDir, file);
          const dest = resolve(outI18nDir, file);
          if (existsSync(src)) {
            copyFileSync(src, dest);
          }
        }
      }
    }
  };
}

/**
 * @crxjs/vite-plugin wraps content scripts in an IIFE. With sourcemaps enabled
 * under the current Vite/Rolldown build, the wrapper trailer can be emitted on
 * the same line as the sourceMappingURL comment, which comments it out and
 * leaves the content script syntactically invalid.
 */
function fixContentScriptSourceMapTrailer(): Plugin {
  return {
    name: 'fix-content-script-sourcemap-trailer',
    writeBundle() {
      const outDir = resolve(__dirname, 'dist');
      const visit = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const file = resolve(dir, entry.name);
          if (entry.isDirectory()) {
            visit(file);
            continue;
          }
          if (!entry.isFile() || !file.endsWith('.js')) continue;

          const source = readFileSync(file, 'utf8');
          const fixed = source.replace(
            /\/\/# sourceMappingURL=([^\n]+\.js\.map)\}\)\(\)\s*$/u,
            '})();\n//# sourceMappingURL=$1'
          );
          if (fixed !== source) {
            writeFileSync(file, fixed);
          }
        }
      };

      if (existsSync(outDir)) {
        visit(outDir);
      }
    }
  };
}

export default defineConfig({
  plugins: [
    crx({ manifest }),
    react(),
    tailwindcss(),
    copyI18nCatalogs(),
    fixContentScriptSourceMapTrailer()
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@components': resolve(__dirname, 'src/components')
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // Extra HTML pages that are not listed in manifest.json
        sidepanel: resolve(__dirname, 'sidepanel.html'),
        offscreen: resolve(__dirname, 'offscreen.html')
      },
      output: {
        entryFileNames: (chunkInfo) => {
          // Content scripts and service worker go to root level
          const noHashEntries = [
            'content-script',
            'accessibility-tree',
            'agent-visual-indicator',
            'service-worker-loader'
          ];
          if (noHashEntries.includes(chunkInfo.name)) {
            return '[name].js';
          }
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    },
    // Content scripts need to be self-contained
    target: 'chrome116',
    minify: false,
    sourcemap: true
  }
});
