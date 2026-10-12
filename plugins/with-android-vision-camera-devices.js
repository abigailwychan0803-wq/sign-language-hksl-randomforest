/**
 * Re-applies the VisionCamera Android empty-devices race patch during prebuild.
 * See scripts/fix-vision-camera-devices.js.
 */
const { withDangerousMod } = require('expo/config-plugins');

module.exports = function withAndroidVisionCameraDevices(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      require('../scripts/fix-vision-camera-devices.js');
      return config;
    },
  ]);
};
