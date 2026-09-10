/**
 * Re-applies onnxruntime Android patches during prebuild so a clean native
 * project still gets 16 KB page-size alignment and Gradle 9 / autolink fixes.
 */
const { withDangerousMod } = require('expo/config-plugins');

module.exports = function withOnnxruntimeAndroidFixes(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      require('../scripts/fix-onnxruntime-autolink.js');
      return config;
    },
  ]);
};
