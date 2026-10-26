const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')
const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]
config.resolver.extraNodeModules = {
  '@goalloom/contracts': path.resolve(workspaceRoot, 'packages/contracts'),
  '@goalloom/crypto': path.resolve(workspaceRoot, 'packages/crypto'),
  '@goalloom/local-store': path.resolve(workspaceRoot, 'packages/local-store'),
  '@goalloom/schema': path.resolve(workspaceRoot, 'packages/schema'),
  '@goalloom/store-core': path.resolve(workspaceRoot, 'packages/store-core'),
  '@goalloom/sync': path.resolve(workspaceRoot, 'packages/sync'),
}
config.resolver.unstable_enablePackageExports = true
if (!config.resolver.assetExts.includes('wasm')) config.resolver.assetExts.push('wasm')
if (!config.resolver.platforms.includes('web')) config.resolver.platforms.push('web')

if (process.env.GOALLOOM_MOBILE_E2E === '1') {
  if (process.env.GOALLOOM_MOBILE_ENV === 'production') throw Error('E2E cannot target production')
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (platform === 'ios' && context.originModulePath.endsWith('/src/celebration.tsx') && moduleName === './celebration-shape') {
      return { type: 'sourceFile', filePath: path.join(projectRoot, 'tests/celebration-shape.ts') }
    }
    if (platform === 'ios' && context.originModulePath.endsWith('/account/service.ts') && moduleName === './platform') {
      return { type: 'sourceFile', filePath: path.join(projectRoot, 'tests/platform.ts') }
    }
    return context.resolveRequest(context, moduleName, platform)
  }
}
module.exports = config
