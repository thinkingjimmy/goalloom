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

module.exports = config
