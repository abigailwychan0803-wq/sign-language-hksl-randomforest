/**
 * tasks-vision 0.10.21 has no x86_64 JNI library. An x86_64 emulator then either
 * fails to load libmediapipe_tasks_vision_jni.so, or (if the app is forced to
 * arm64) dies with SIGSEGV inside ARM translation while creating HandLandmarker.
 *
 * 1.1.0 depends on tasks-core, which ships libmediapipe_tasks_jni.so for
 * x86_64. Keep that version across prebuild; the MediaPipe config plugin
 * hardcodes 0.10.21.
 */
const { createRunOncePlugin, withAppBuildGradle, withSettingsGradle, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MEDIAPIPE = 'com.google.mediapipe:tasks-vision:1.1.0';
const GRADLE_FILE = 'mediapipe-arm64.gradle';
const APPLY_LINE = 'apply from: new File(settingsDir, "mediapipe-arm64.gradle")';

function withAndroidMediapipeAbi(config) {
  config = withAppBuildGradle(config, (config) => {
    config.modResults.contents = config.modResults.contents.replace(
      /com\.google\.mediapipe:tasks-vision:[0-9.]+/g,
      MEDIAPIPE,
    );
    return config;
  });

  config = withSettingsGradle(config, (config) => {
    config.modResults.contents = config.modResults.contents
      .replace(`\n${APPLY_LINE}\n`, '\n')
      .replace(APPLY_LINE, '');
    return config;
  });

  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const dest = path.join(config.modRequest.platformProjectRoot, GRADLE_FILE);
      if (fs.existsSync(dest)) {
        fs.unlinkSync(dest);
      }
      return config;
    },
  ]);

  return config;
}

module.exports = createRunOncePlugin(withAndroidMediapipeAbi, 'with-android-mediapipe-abi', '2.0.0');
