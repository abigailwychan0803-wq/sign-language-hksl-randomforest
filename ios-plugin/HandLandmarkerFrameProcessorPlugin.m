//
//  HandLandmarkerFrameProcessorPlugin.m
//
//  Registers the Swift Frame Processor Plugin with Vision Camera under the name
//  "handLandmarker" (matching the Android plugin) at app launch.
//

#import <Foundation/Foundation.h>
#import <VisionCamera/FrameProcessorPlugin.h>
#import <VisionCamera/FrameProcessorPluginRegistry.h>

// Forward-declare the Swift class (exposed via the generated -Swift.h umbrella).
#if __has_include("camera_signs-Swift.h")
#import "camera_signs-Swift.h"
#else
#import <camera_signs/camera_signs-Swift.h>
#endif

@interface HandLandmarkerFrameProcessorPlugin (FrameProcessorPluginLoader)
@end

@implementation HandLandmarkerFrameProcessorPlugin (FrameProcessorPluginLoader)

+ (void)load {
  [FrameProcessorPluginRegistry addFrameProcessorPlugin:@"handLandmarker"
                                        withInitializer:^FrameProcessorPlugin* _Nonnull(VisionCameraProxyHolder* _Nonnull proxy,
                                                                                        NSDictionary* _Nullable options) {
    return [[HandLandmarkerFrameProcessorPlugin alloc] initWithProxy:proxy withOptions:options];
  }];
}

@end
