module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // react-native-vision-camera frame processors require the worklets-core
    // Babel plugin to compile `useFrameProcessor` worklets. The reanimated /
    // react-native-worklets plugin is added automatically by babel-preset-expo.
    plugins: [['react-native-worklets-core/plugin']],
  };
};
