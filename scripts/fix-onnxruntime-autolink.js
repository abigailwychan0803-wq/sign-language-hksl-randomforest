/**
 * Workarounds for onnxruntime-react-native on Expo SDK 56 / RN 0.85.
 *
 * 1) Remove stale `unimodule.json` so community autolinking registers
 *    OnnxruntimePackage (microsoft/onnxruntime#29004). Without this,
 *    `import 'onnxruntime-react-native'` throws at startup.
 *
 * 2) Patch android/build.gradle for Gradle 9: VersionNumber was removed from
 *    the public API (microsoft/onnxruntime#27385, unreleased in 1.24.3).
 *
 * 3) Align libonnxruntimejsi.so to 16 KB page sizes (Android 15+). 1.24.3 does
 *    not include microsoft/onnxruntime#27523, so the JSI .so fails the LOAD
 *    segment check on 16 KB emulators and the process is killed after the
 *    system compatibility dialog.
 *
 * Runs on every `npm install` (postinstall) and again during prebuild.
 */
const fs = require('fs');
const path = require('path');

const pkgDir = path.join(__dirname, '..', 'node_modules', 'onnxruntime-react-native');
const PAGE_SIZE_FLAG = '-Wl,-z,max-page-size=16384';
const FLEXIBLE_PAGE_SIZES = '-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON';
const CMAKE_LINK_SNIPPET = `
# 16KB page sizes for Android 15+ (microsoft/onnxruntime#27523; missing from 1.24.3).
if(ANDROID)
  target_link_options(onnxruntimejsi PRIVATE "${PAGE_SIZE_FLAG}")
endif()
`;

// 1) Remove the stale unimodule.json so RN community autolinking registers the
//    native package (see microsoft/onnxruntime#29004).
try {
  const unimodule = path.join(pkgDir, 'unimodule.json');
  if (fs.existsSync(unimodule)) {
    fs.rmSync(unimodule);
    console.log('[fix-onnxruntime-autolink] Removed stale unimodule.json so autolinking can register OnnxruntimePackage.');
  }
} catch (err) {
  console.warn('[fix-onnxruntime-autolink] Could not remove unimodule.json:', err.message);
}

try {
  const gradleFile = path.join(pkgDir, 'android', 'build.gradle');
  if (fs.existsSync(gradleFile)) {
    let contents = fs.readFileSync(gradleFile, 'utf8');
    let changed = false;

    // 2) Gradle 9 VersionNumber (microsoft/onnxruntime#27385).
    if (contents.includes('VersionNumber.parse')) {
      const helper =
        "def onnxRnVer = { String v -> def p = v.replaceAll('[^0-9.].*\\$', '').tokenize('.'); return ((p.size() > 0 ? (p[0] as int) : 0) * 1000 + (p.size() > 1 ? (p[1] as int) : 0)) }\n  ";
      contents = contents.replace(
        'if (VersionNumber.parse(REACT_NATIVE_VERSION) < VersionNumber.parse("0.71")) {',
        () => helper + 'if (onnxRnVer(REACT_NATIVE_VERSION) < onnxRnVer("0.71")) {',
      );
      changed = true;
      console.log('[fix-onnxruntime-autolink] Patched android/build.gradle to remove Gradle 9 VersionNumber usage.');
    }

    // 3a) Ask the NDK to emit 16 KB-aligned ELF LOAD segments.
    if (!contents.includes('ANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES')) {
      contents = contents.replaceAll(
        '"-DUSE_NNAPI=${!useQnn}"',
        `"${'-DUSE_NNAPI=${!useQnn}'}",\n            "${FLEXIBLE_PAGE_SIZES}"`,
      );
      changed = true;
      console.log('[fix-onnxruntime-autolink] Added ANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES to CMake arguments.');
    }

    if (changed) {
      fs.writeFileSync(gradleFile, contents);
    }
  }
} catch (err) {
  console.warn('[fix-onnxruntime-autolink] Could not patch android/build.gradle:', err.message);
}

// 3b) Linker flag on the JSI shared library (the .so named in the 16 KB dialog).
try {
  const cmakeFile = path.join(pkgDir, 'android', 'CMakeLists.txt');
  if (fs.existsSync(cmakeFile)) {
    let contents = fs.readFileSync(cmakeFile, 'utf8');
    if (!contents.includes('max-page-size=16384')) {
      const anchor = 'find_library(log-lib log)';
      if (!contents.includes(anchor)) {
        throw new Error(`Could not find CMakeLists.txt anchor: ${anchor}`);
      }
      contents = contents.replace(anchor, `${CMAKE_LINK_SNIPPET}\n${anchor}`);
      fs.writeFileSync(cmakeFile, contents);
      console.log('[fix-onnxruntime-autolink] Patched CMakeLists.txt for 16 KB page-size alignment.');
    }
  }
} catch (err) {
  console.warn('[fix-onnxruntime-autolink] Could not patch CMakeLists.txt:', err.message);
}
