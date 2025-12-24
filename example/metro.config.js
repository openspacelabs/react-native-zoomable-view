const path = require("path");
const escape = require("escape-string-regexp");
const { getDefaultConfig } = require("@expo/metro-config"); // or require("expo/metro-config")

const pak = require("../package.json");
const root = path.resolve(__dirname, "..");

const modules = Object.keys(pak.peerDependencies ?? {});
const config = getDefaultConfig(__dirname);

// 1) Allow Metro to see the library source (outside example/)
config.watchFolders = [root];

// 2) Prefer resolving deps from example/node_modules (avoid hoisted duplicates)
config.resolver.disableHierarchicalLookup = true;
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];

// 3) Ensure single versions of peerDependencies (block root/node_modules/<peer>)
const peerBlockList = modules.map(
  (m) =>
    new RegExp(
      `^${escape(path.join(root, "node_modules", m))}(?:\\/.*)?$`
    )
);

// Metro accepts an array of regexes here (no need for exclusionList)
config.resolver.blockList = [
  ...(config.resolver.blockList ?? []),
  ...peerBlockList,
];

// 4) Force peers to resolve from example/node_modules
config.resolver.extraNodeModules = {
  ...modules.reduce((acc, name) => {
    acc[name] = path.join(__dirname, "node_modules", name);
    return acc;
  }, {}),

  // Alias the library itself to src
  "@openspacelabs/react-native-zoomable-view": path.resolve(root, "src"),
};

// 5) Usually not needed if you extend Expo config, but keep if you’re aliasing src
config.transformer.assetRegistryPath = require.resolve(
  "react-native/Libraries/Image/AssetRegistry"
);

module.exports = config;
