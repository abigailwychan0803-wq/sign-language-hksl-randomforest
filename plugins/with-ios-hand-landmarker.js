/**
 * Local Expo config plugin: iOS parity for the MediaPipe hand/face landmarker.
 *
 * expo-vision-camera-v4-mediapipe is Android-only, so on iOS we ship our own
 * Vision Camera v4 Frame Processor Plugin (Swift + ObjC) that registers under
 * the same name ("handLandmarker") and returns the same result shape. This
 * plugin, during `expo prebuild`:
 *   1. Copies ios-plugin/*.swift|*.m into the iOS app target (rewriting the
 *      Swift umbrella-header module name to match the generated project).
 *   2. Copies the MediaPipe .task models in as bundle resources.
 *   3. Registers the source/resource files in the Xcode project.
 *   4. Adds the `MediaPipeTasksVision` CocoaPod.
 *
 * NOTE: This is Windows-authored and must be validated by building the iOS app
 * in Xcode on macOS.
 */
const {
  withXcodeProject,
  withDangerousMod,
  withPodfile,
  IOSConfig,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SOURCE_FILES = [
  'HandLandmarkerFrameProcessorPlugin.swift',
  'HandLandmarkerFrameProcessorPlugin.m',
];
const TASK_FILES = ['hand_landmarker.task', 'face_landmarker.task'];
const POD_LINE = "  pod 'MediaPipeTasksVision'";

function moduleNameFor(projectName) {
  return projectName.replace(/[^a-zA-Z0-9]/g, '_');
}

const withCopiedFiles = (config) =>
  withDangerousMod(config, [
    'ios',
    async (config) => {
      const { projectRoot, platformProjectRoot, projectName } = config.modRequest;
      const destDir = path.join(platformProjectRoot, projectName);
      const moduleName = moduleNameFor(projectName);

      for (const file of SOURCE_FILES) {
        const src = path.join(projectRoot, 'ios-plugin', file);
        let contents = fs.readFileSync(src, 'utf8');
        // Rewrite the placeholder Swift module name to the real one.
        contents = contents.replace(/camera_signs/g, moduleName);
        fs.writeFileSync(path.join(destDir, file), contents);
      }

      for (const file of TASK_FILES) {
        const src = path.join(projectRoot, 'assets', file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(destDir, file));
        } else {
          console.warn(`[with-ios-hand-landmarker] Missing model: ${src}`);
        }
      }

      return config;
    },
  ]);

const withXcodeReferences = (config) =>
  withXcodeProject(config, (config) => {
    const project = config.modResults;
    const { projectName } = config.modRequest;

    const target = project.getFirstTarget().uuid;
    let groupKey = project.findPBXGroupKey({ name: projectName });
    if (!groupKey) {
      groupKey = project.getFirstProject().firstProject.mainGroup;
    }

    for (const file of SOURCE_FILES) {
      const relPath = `${projectName}/${file}`;
      if (!project.hasFile(relPath)) {
        project.addSourceFile(relPath, { target }, groupKey);
      }
    }

    // Expo templates omit a PBX "Resources" group; xcode's addResourceFile
    // crashes on null when that group is missing. Create it first, then use
    // Expo's helper which wires the file into the Resources build phase.
    IOSConfig.XcodeUtils.ensureGroupRecursively(project, 'Resources');
    for (const file of TASK_FILES) {
      const relPath = `${projectName}/${file}`;
      if (!project.hasFile(relPath)) {
        IOSConfig.XcodeUtils.addResourceFileToGroup({
          filepath: relPath,
          groupName: 'Resources',
          project,
          isBuildFile: true,
          verbose: false,
        });
      }
    }

    return config;
  });

const withMediaPipePod = (config) =>
  withPodfile(config, (config) => {
    let contents = config.modResults.contents;
    if (!contents.includes('MediaPipeTasksVision')) {
      contents = contents.replace(/(target\s+['"][^'"]+['"]\s+do\s*\n)/, `$1${POD_LINE}\n`);
      config.modResults.contents = contents;
    }
    return config;
  });

module.exports = (config) => withMediaPipePod(withXcodeReferences(withCopiedFiles(config)));