const path = require('path');
const { getDefaultConfig } = require('@expo/metro-config');

const pak = require('../package.json');
const root = path.resolve(__dirname, '..');
const peers = new Set(Object.keys(pak.peerDependencies || {}));

const config = getDefaultConfig(__dirname);

// Watch lib source so edits to ../src/ trigger HMR.
config.watchFolders = [root];

// Alias the lib import to its source.
config.resolver.extraNodeModules = {
  '@openspacelabs/react-native-zoomable-view': path.resolve(root, 'src'),
};

// Force every peer (and any subpath of it) to resolve from example/
// node_modules, even when imported from ../src/. Without this, files in
// ../src/ resolve peers against root/node_modules, producing a second
// copy of React/Reanimated/RNGH in the bundle — RN startup crashes with
// "TypeError: property is not writable" before any user code runs.
//
// `resolveRequest` runs BEFORE hierarchical lookup; `extraNodeModules`
// runs after, so the latter can't dedupe peers. By re-issuing the resolve
// with `originModulePath` pointed at example/, hierarchical lookup walks
// up from example/ and lands on example/node_modules/<peer> every time.
// Non-peer imports (Reanimated's worklets-version validator pulling
// semver/functions/...) fall through to default resolution.
const peerAnchor = path.join(__dirname, 'node_modules', '__peer_anchor__');
const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const head = moduleName.startsWith('@')
    ? moduleName.split('/').slice(0, 2).join('/')
    : moduleName.split('/')[0];
  if (peers.has(head)) {
    return context.resolveRequest(
      { ...context, originModulePath: peerAnchor },
      moduleName,
      platform
    );
  }
  return upstreamResolveRequest
    ? upstreamResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

// Aliasing the lib outside example/node_modules loses Metro's default
// asset-registry path — pin it explicitly.
config.transformer.assetRegistryPath = require.resolve(
  'react-native/Libraries/Image/AssetRegistry'
);

module.exports = config;
