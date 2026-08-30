module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      // jsxImportSource: 'nativewind' lets <View className="..."> work.
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    // No manual class-property plugins. We tried both `loose: true` and
    // `loose: false` here and both crash React Native 0.81.5:
    //   - `loose: true` emits `this.X = 0` which fails on RN's `Event`
    //     class whose `Event.prototype.X` is non-writable.
    //   - `loose: false` emits `Object.defineProperty(this, 'X', ...)`
    //     which fails on RN's `VirtualizedList` (and other internal
    //     classes) whose prototype properties are non-configurable.
    //
    // The right fix is to make the four RN prototype properties
    // (`Event.NONE`, `Event.CAPTURING_PHASE`, `Event.AT_TARGET`,
    // `Event.BUBBLING_PHASE`) writable from app code, since the babel
    // loose output is fine for everything else. That is done in
    // `polyfills.js` after the RN core bundle loads.
    plugins: ['react-native-reanimated/plugin'],
  };
};