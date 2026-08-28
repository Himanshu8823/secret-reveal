const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const finalConfig = withNativeWind(config, { input: './global.css' });

// NativeWind v4 and its dep react-native-css-interop@0.1.22 ship a subpath
// import ("react-native-css-interop/jsx-runtime") backed only by a folder-
// local package.json that points to "../dist/runtime/jsx-runtime" — no
// `exports` field, no top-level jsx-runtime.js. Metro 0.83's modern
// resolver refuses to follow this legacy shim and reports "Unable to
// resolve ... from app/_layout.tsx". We pin both subpath imports to the
// real files so resolution succeeds.
const path = require('path');
const cssInteropRoot = path.dirname(
  require.resolve('react-native-css-interop/package.json')
);

const previousResolveRequest = finalConfig.resolver.resolveRequest;
finalConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react-native-css-interop/jsx-runtime') {
    return {
      filePath: path.join(cssInteropRoot, 'dist/runtime/jsx-runtime.js'),
      type: 'sourceFile',
    };
  }
  if (moduleName === 'react-native-css-interop/jsx-dev-runtime') {
    return {
      filePath: path.join(cssInteropRoot, 'dist/runtime/jsx-dev-runtime.js'),
      type: 'sourceFile',
    };
  }
  if (previousResolveRequest) {
    return previousResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

// Expo's getDefaultConfig installs its own premodule list containing
// react-native/Libraries/Core/InitializeCore (which polyfills fetch, Request,
// Response, AbortController, AbortSignal, FormData, Blob, URL, ...),
// expo/src/winter and @expo/metro-runtime. We must APPEND to that list, never
// replace it — replacing it drops InitializeCore and leaves the app with no
// browser globals at all.
const expoGetPremodules = config.serializer.getModulesRunBeforeMainModule;

finalConfig.serializer.getModulesRunBeforeMainModule = (entryFilePath) => [
  ...(expoGetPremodules ? expoGetPremodules(entryFilePath) : []),
  require.resolve('./polyfills'),
];

module.exports = finalConfig;