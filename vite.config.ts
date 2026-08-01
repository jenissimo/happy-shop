import { copyFileSync, existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { editorProjectBridge } from './src/bridge/projectBridge.ts'
import pkg from './package.json' with { type: 'json' }

const githubPages = process.env.GITHUB_PAGES === 'true'
const base = githubPages ? `/${pkg.name}/` : '/'

function cssPublicBaseRewrite(): Plugin {
  return {
    name: 'css-public-base-rewrite',
    transform(code, id) {
      if (base === '/' || !id.endsWith('.css')) return
      return code.replace(/url\((['"]?)\//g, `url($1${base}`)
    },
  }
}

const rootDir = fileURLToPath(new URL('.', import.meta.url))

function githubPagesSpaFallback(): Plugin {
  return {
    name: 'github-pages-spa-fallback',
    closeBundle() {
      if (!githubPages) return
      const indexPath = resolve(rootDir, 'dist/index.html')
      const fallbackPath = resolve(rootDir, 'dist/404.html')
      if (existsSync(indexPath)) {
        copyFileSync(indexPath, fallbackPath)
      }
      writeFileSync(resolve(rootDir, 'dist/.nojekyll'), '')
    },
  }
}

export default defineConfig({
  base,
  plugins: [
    react(),
    editorProjectBridge(),
    cssPublicBaseRewrite(),
    githubPagesSpaFallback(),
  ],
  server: {
    watch: {
      ignored: ['**/node_modules/**', '**/.happy-shop/workspace.json'],
    },
  },
})
