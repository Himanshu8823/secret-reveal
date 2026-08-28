module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      // jsxImportSource: 'nativewind' lets <View className="..."> work.
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    // No manual `@babel/plugin-proposal-*` plugins. babel-preset-expo@54.0.12
    // (SDK 54 lane) already handles class-properties, private-methods and
    // private-property-in-object transforms internally under the hermes-stable
    // profile. The previous manual copies were a workaround for a
    // babel-preset-expo@57 mismatch (Preset was on SDK 57 lane but project is
    // SDK 54) — fixed by downgrading the preset, so the workarounds are now
    // redundant and add risk of `loose: true` mode conflicting with how
    // event-target-shim and AbortController polyfills define prototype
    // properties.
  };
};