/**
 * Windows CMake 3.22.1 / Ninja 1.10 cannot mkdir the long object paths that
 * react-native-worklets and reanimated generate. They also pin
 * `cmake.version = "3.22.1"`, which overwrites the Gradle override.
 *
 * This script (postinstall + prebuild):
 *   1. Pins those libraries to CMake 3.31.6 (Ninja 1.12+).
 *   2. Writes android/local.properties cmake.dir when the native project exists.
 *   3. Replaces the SDK's CMake 3.22.1 ninja.exe with 1.12.1 so cached AGP
 *      tasks that still invoke 3.22.1 ninja can create long paths.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CMAKE_VERSION = '3.31.6';
const PIN = 'version = System.getenv("CMAKE_VERSION") ?: "3.22.1"';
const REPLACEMENT = `version = System.getenv("CMAKE_VERSION") ?: "${CMAKE_VERSION}"`;

const PACKAGES = [
  'react-native-worklets',
  'react-native-reanimated',
];

function sdkRoot() {
  return process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '';
}

function patchPinnedCmakeVersion() {
  for (const pkg of PACKAGES) {
    const gradle = path.join(ROOT, 'node_modules', pkg, 'android', 'build.gradle');
    if (!fs.existsSync(gradle)) continue;
    const src = fs.readFileSync(gradle, 'utf8');
    if (!src.includes(PIN)) continue;
    fs.writeFileSync(gradle, src.replaceAll(PIN, REPLACEMENT));
    console.log(`[fix-windows-cmake] ${pkg}: cmake.version -> ${CMAKE_VERSION}`);
  }
}

function escapeLocalPropertiesPath(p) {
  return p.replace(/\\/g, '\\\\').replace(/:/g, '\\:');
}

function writeCmakeDir(androidRoot) {
  const sdk = sdkRoot();
  if (!sdk || !androidRoot || !fs.existsSync(androidRoot)) return;

  const cmakeDir = path.join(sdk, 'cmake', CMAKE_VERSION);
  if (!fs.existsSync(path.join(cmakeDir, 'bin', 'cmake.exe'))) {
    console.warn(
      `[fix-windows-cmake] CMake ${CMAKE_VERSION} not found at ${cmakeDir}. ` +
        'Install it from Android Studio → SDK Tools → CMake (Show Package Details).',
    );
    return;
  }

  const localProps = path.join(androidRoot, 'local.properties');
  let contents = fs.existsSync(localProps) ? fs.readFileSync(localProps, 'utf8') : '';
  if (!contents.includes('sdk.dir=')) {
    contents += `${contents.endsWith('\n') || contents.length === 0 ? '' : '\n'}sdk.dir=${escapeLocalPropertiesPath(sdk)}\n`;
  }
  const cmakeLine = `cmake.dir=${escapeLocalPropertiesPath(cmakeDir)}`;
  if (/^cmake\.dir=/m.test(contents)) {
    contents = contents.replace(/^cmake\.dir=.*$/m, cmakeLine);
  } else {
    contents = `${contents.trimEnd()}\n${cmakeLine}\n`;
  }
  fs.writeFileSync(localProps, contents);
  console.log(`[fix-windows-cmake] Wrote cmake.dir=${cmakeDir}`);
}

function replaceSdkNinja() {
  const sdk = sdkRoot();
  if (!sdk) return;
  const oldNinja = path.join(sdk, 'cmake', '3.22.1', 'bin', 'ninja.exe');
  const newNinja = path.join(sdk, 'cmake', CMAKE_VERSION, 'bin', 'ninja.exe');
  if (!fs.existsSync(oldNinja) || !fs.existsSync(newNinja)) return;

  let current = '';
  try {
    current = execFileSync(oldNinja, ['--version'], { encoding: 'utf8' }).trim();
  } catch {
    return;
  }
  if (current.startsWith('1.12')) return;

  const backup = path.join(sdk, 'cmake', '3.22.1', 'bin', 'ninja-1.10.2.exe');
  if (!fs.existsSync(backup)) {
    fs.copyFileSync(oldNinja, backup);
  }
  fs.copyFileSync(newNinja, oldNinja);
  console.log('[fix-windows-cmake] Replaced CMake 3.22.1 ninja.exe with 1.12.1 (backup: ninja-1.10.2.exe)');
}

function main(androidRoot) {
  if (process.platform !== 'win32') return;
  patchPinnedCmakeVersion();
  writeCmakeDir(androidRoot || path.join(ROOT, 'android'));
  replaceSdkNinja();
}

module.exports = main;

if (require.main === module) {
  main();
}
