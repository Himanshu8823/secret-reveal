const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const finalConfig = withNativeWind(config, {
  input: './global.css',
  // Renamed to .cjs so jiti inside `withNativeWind` can load it without
  // resolving the TS source from `src/theme/` through `index.ts`. The
  // literals in tailwind.config.cjs mirror the values in src/theme/*.
  configPath: './tailwind.config.cjs',
});

// NativeWind v4 and its dep react-native-css-interop@0.1.22 ship a subpath
// import ("react-native-css-interop/jsx-runtime") backed only by a folder-
// local package.json that points to "../dist/runtime/jsx-runtime" — no
// `exports` field, no top-level jsx-runtime.js. Metro 0.83's modern
// resolver refuses to follow this legacy shim and reports "Unable to
// resolve ... from app/_layout.tsx". We pin both subpath imports to the
// real files so resolution succeeds.
//
// We resolve the package's install location via a relative glob through
// the pnpm `.pnpm/` tree rather than `require.resolve('.../package.json')`,
// because the latter relies on Node subpath resolution which the package's
// own (missing) `exports` field breaks on Windows + Node 24.
const path = require('path');
const fs = require('fs');
const cssInteropCandidates = fs
  .readdirSync(path.join(__dirname, 'node_modules/.pnpm'))
  .filter((d) => d.startsWith('react-native-css-interop@'))
  .map((d) =>
    path.join(
      __dirname,
      'node_modules/.pnpm',
      d,
      'node_modules/react-native-css-interop',
    ),
  )
  .filter((p) => fs.existsSync(p));
if (cssInteropCandidates.length === 0) {
  throw new Error(
    'metro.config.js: cannot find react-native-css-interop under node_modules/.pnpm — re-run `pnpm install`',
  );
}
const cssInteropRoot = cssInteropCandidates[0];

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