// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Bundle the ONNX model (and MediaPipe .task models, if referenced) as assets so
// they can be resolved via expo-asset at runtime.
config.resolver.assetExts.push('onnx', 'task');

module.exports = config;
