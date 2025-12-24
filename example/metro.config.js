const path = require('path');
const exclusionList = require('metro-config/src/defaults/exclusionList');
const escape = require('escape-string-regexp');
const { getDefaultConfig } = require('expo/metro-config');

const pak = require('../package.json');
const root = path.resolve(__dirname, '..');

const modules = Object.keys({
  ...pak.peerDependencies,
});

const config = getDefaultConfig(__dirname);

/**
 * Allow Metro to see the library source
 */
config.watchFolders = [root];

/**
 * Prevent Metro from resolving deps from repo root
 */
config.resolver.disableHierarchicalLookup = true;
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];

/**
 * Ensure single versions of peerDependencies
 */
config.resolver.blockList = exclusionList(
  modules.map(
    (m) => new RegExp(`^${escape(path.join(root, 'node_modules', m))}\\/.*$`)
  )
);

config.resolver.extraNodeModules = {
  ...modules.reduce((acc, name) => {
    acc[name] = path.join(__dirname, 'node_modules', name);
    return acc;
  }, {}),

  // 👇 Alias the library itself to src
  '@openspacelabs/react-native-zoomable-view': path.resolve(root, 'src'),
};

/**
 * 🔑 REQUIRED for assets when aliasing src/
 */
config.transformer.assetRegistryPath = require.resolve(
  'react-native/Libraries/Image/AssetRegistry'
);

module.exports = config;
