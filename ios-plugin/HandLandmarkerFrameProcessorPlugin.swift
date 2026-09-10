//
//  HandLandmarkerFrameProcessorPlugin.swift
//
//  iOS parity for expo-vision-camera-v4-mediapipe (which is Android-only).
//
//  Registers a Vision Camera v4 Frame Processor Plugin under the SAME name as
//  the Android plugin ("handLandmarker") and returns the SAME result shape:
//
//    {
//      "hands": [[{ "x": Double, "y": Double, "z": Double }, ... 21]],
//      "handednessLabels": ["Left", "Right"],
//      "mouth": { "x": Double, "y": Double }   // face index 13 only
//    }
//
//  so src/sign/* in JS works unchanged across platforms.
//
//  This file is injected into the iOS project by plugins/with-ios-hand-landmarker.js.
//

import Foundation
import VisionCamera
import MediaPipeTasksVision

@objc(HandLandmarkerFrameProcessorPlugin)
public class HandLandmarkerFrameProcessorPlugin: FrameProcessorPlugin {

  private var handLandmarker: HandLandmarker?
  private var faceLandmarker: FaceLandmarker?
  private let enableFace: Bool
  private let numHands: Int
  private let minDetection: Double
  private let minPresence: Double
  private let minTracking: Double
  private var didSetup = false
  private var frameIndex: Int = 0

  public override init(proxy: VisionCameraProxyHolder, options: [AnyHashable: Any]! = [:]) {
    // Mirror the Android plugin defaults / app.json options.
    self.numHands = (options?["numHands"] as? Int) ?? 2
    self.minDetection = (options?["minDetectionConfidence"] as? Double) ?? 0.5
    self.minPresence = (options?["minPresenceConfidence"] as? Double) ?? 0.5
    self.minTracking = (options?["minTrackingConfidence"] as? Double) ?? 0.5
    self.enableFace = (options?["enableFace"] as? Bool) ?? false

    super.init(proxy: proxy, options: options)
    // GPU delegate must be created on the same thread that runs detect().
  }

  private func modelPath(_ name: String) -> String? {
    return Bundle.main.path(forResource: name, ofType: "task")
  }

  private func setupHandLandmarker(numHands: Int,
                                   minDetection: Double,
                                   minPresence: Double,
                                   minTracking: Double) {
    guard let path = modelPath("hand_landmarker") else {
      print("[HandLandmarker] hand_landmarker.task not found in bundle")
      return
    }
    let options = HandLandmarkerOptions()
    options.baseOptions.modelAssetPath = path
    options.baseOptions.delegate = .GPU
    options.runningMode = .video
    options.numHands = numHands
    options.minHandDetectionConfidence = Float(minDetection)
    options.minHandPresenceConfidence = Float(minPresence)
    options.minTrackingConfidence = Float(minTracking)
    do {
      handLandmarker = try HandLandmarker(options: options)
    } catch {
      options.baseOptions.delegate = .CPU
      do {
        handLandmarker = try HandLandmarker(options: options)
      } catch {
        print("[HandLandmarker] failed to create HandLandmarker: \(error)")
      }
    }
  }

  private func setupFaceLandmarker() {
    guard let path = modelPath("face_landmarker") else {
      print("[HandLandmarker] face_landmarker.task not found in bundle")
      return
    }
    let options = FaceLandmarkerOptions()
    options.baseOptions.modelAssetPath = path
    options.baseOptions.delegate = .GPU
    options.runningMode = .video
    options.numFaces = 1
    do {
      faceLandmarker = try FaceLandmarker(options: options)
    } catch {
      options.baseOptions.delegate = .CPU
      do {
        faceLandmarker = try FaceLandmarker(options: options)
      } catch {
        print("[HandLandmarker] failed to create FaceLandmarker: \(error)")
      }
    }
  }

  public override func callback(_ frame: Frame, withArguments arguments: [AnyHashable: Any]?) -> Any? {
    if !didSetup {
      didSetup = true
      setupHandLandmarker(numHands: numHands,
                          minDetection: minDetection,
                          minPresence: minPresence,
                          minTracking: minTracking)
      if enableFace {
        setupFaceLandmarker()
      }
    }

    guard let handLandmarker = handLandmarker else {
      return ["error": "HandLandmarker not initialized", "hands": []]
    }

    let orientation = frame.orientation
    frameIndex += 1
    let timestampMs = frameIndex * 33 // ~30fps monotonic timestamp for .video mode

    do {
      let image = try MPImage(sampleBuffer: frame.buffer, orientation: orientation)

      let handResult = try handLandmarker.detect(videoFrame: image, timestampInMilliseconds: timestampMs)

      var handsOut: [[[String: Double]]] = []
      for hand in handResult.landmarks {
        var points: [[String: Double]] = []
        for lm in hand {
          points.append(["x": Double(lm.x), "y": Double(lm.y), "z": Double(lm.z)])
        }
        handsOut.append(points)
      }

      var handednessLabels: [String] = []
      for categories in handResult.handedness {
        let name = categories.first?.categoryName ?? ""
        handednessLabels.append(name)
      }

      var result: [String: Any] = [
        "hands": handsOut,
        "handednessLabels": handednessLabels,
      ]

      if enableFace, let faceLandmarker = faceLandmarker {
        let faceResult = try faceLandmarker.detect(videoFrame: image, timestampInMilliseconds: timestampMs)
        if let face = faceResult.faceLandmarks.first, face.count > 13 {
          let mouth = face[13]
          result["mouth"] = ["x": Double(mouth.x), "y": Double(mouth.y)]
        }
      }

      return result
    } catch {
      return ["error": "detection failed: \(error)", "hands": []]
    }
  }
}
