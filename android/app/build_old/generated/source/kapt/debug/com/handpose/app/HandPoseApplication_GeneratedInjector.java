package com.handpose.app;

import dagger.hilt.InstallIn;
import dagger.hilt.codegen.OriginatingElement;
import dagger.hilt.components.SingletonComponent;
import dagger.hilt.internal.GeneratedEntryPoint;

@OriginatingElement(
    topLevelClass = HandPoseApplication.class
)
@GeneratedEntryPoint
@InstallIn(SingletonComponent.class)
public interface HandPoseApplication_GeneratedInjector {
  void injectHandPoseApplication(HandPoseApplication handPoseApplication);
}
