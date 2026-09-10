# Camera Signs (Expo)

On-device sign recognition: the front camera, MediaPipe hand landmarks, and two ONNX RandomForest models. Pick **Model 1** or **Model 2** from the dropdown on the camera screen.

This is a native Android/iOS app. It does **not** run in Expo Go or on web — `onnxruntime-react-native` and the MediaPipe frame-processor plugins need a development build.

## Models

| Dropdown | Signs |
| --- | --- |
| Model 1 | love, more, A–E, calmdown, car |
| Model 2 | friend, hello, help, iloveyou, please, pray, stop, yes |

ONNX files live in `assets/model/`:

- `handshape_classifier_model1.onnx` + `sign_labels_model1.json`
- `handshape_classifier_model2.onnx` + `sign_labels_model2.json`

They are produced by the sibling Python project, not converted inside this app.

## Produce / refresh the ONNX models

From `sign-language-randomforest`:

```bash
uv sync --extra train --extra onnx
uv run -m src.capture_dataset_from_images --no-preview
uv run -m src.train_onnx_sign_classifier
```

That copies both ONNX models and their label sidecars into `assets/model/`. Rebuild the native app after replacing the files.

## Run the app

```bash
npm install
npx expo run:android
# or
npx expo run:ios
```

`npx expo start` can attach to an existing development build; it will not provide the native modules on its own.

The camera stream is capped at 720p / 30 fps. Face Landmarker is off (`mouth_dist` uses the default 3.0). After changing native plugins, rebuild:

```bash
npx expo prebuild --clean
npx expo run:android
```

## Android 16 KB page size

`onnxruntime-react-native` 1.24.3 builds `libonnxruntimejsi.so` with 4 KB ELF alignment. On an Android 15+ **16 KB page size** emulator that library fails the LOAD-segment check: you get the system “isn't 16 KB compatible” dialog, then the app is killed.

`scripts/fix-onnxruntime-autolink.js` (postinstall + prebuild) adds `-Wl,-z,max-page-size=16384` so the JSI library is rebuilt aligned. After pulling this change, rebuild native code (the previous `.so` is cached):

```bash
npx expo prebuild --clean
npx expo run:android
```

A 4 KB page-size system image (not “Google APIs 16KB page size”) also avoids the dialog while developing.

## Expo SDK

Use the versioned docs for **SDK 56**: https://docs.expo.dev/versions/v56.0.0/
