// Lets Node's native TypeScript stripping resolve the `@shared/*` path alias used by main-process code.
import { registerHooks } from 'node:module'
import { fileURLToPath, URL } from 'node:url'

const shared = new URL('../src/shared/', import.meta.url)

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@shared/')) {
      const url = new URL(specifier.slice('@shared/'.length) + '.ts', shared)
      return nextResolve(fileURLToPath(url), context)
    }
    return nextResolve(specifier, context)
  }
})
