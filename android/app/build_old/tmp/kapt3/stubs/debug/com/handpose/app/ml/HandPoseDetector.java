package com.handpose.app.ml;

@javax.inject.Singleton
@kotlin.Metadata(mv = {1, 9, 0}, k = 1, xi = 48, d1 = {"\u0000J\n\u0002\u0018\u0002\n\u0002\u0010\u0000\n\u0000\n\u0002\u0018\u0002\n\u0002\b\u0002\n\u0002\u0018\u0002\n\u0000\n\u0002\u0010\u0002\n\u0002\b\u0002\n\u0002\u0018\u0002\n\u0000\n\u0002\u0010\t\n\u0002\b\u0002\n\u0002\u0018\u0002\n\u0002\b\u0002\n\u0002\u0018\u0002\n\u0002\u0018\u0002\n\u0002\b\u0002\n\u0002\u0018\u0002\n\u0002\b\u0004\b\u0007\u0018\u0000 \u001a2\u00020\u0001:\u0001\u001aB\u000f\b\u0007\u0012\u0006\u0010\u0002\u001a\u00020\u0003\u00a2\u0006\u0002\u0010\u0004J\u0006\u0010\u0007\u001a\u00020\bJ\u0016\u0010\t\u001a\u00020\b2\u0006\u0010\n\u001a\u00020\u000b2\u0006\u0010\f\u001a\u00020\rJ\u0018\u0010\u000e\u001a\u00020\b2\u0006\u0010\u000f\u001a\u00020\u00102\u0006\u0010\f\u001a\u00020\rH\u0002J\u0014\u0010\u0011\u001a\u00020\b2\n\u0010\u0012\u001a\u00060\u0013j\u0002`\u0014H\u0002J\u0018\u0010\u0015\u001a\u00020\b2\u0006\u0010\u0016\u001a\u00020\u00172\u0006\u0010\u0018\u001a\u00020\u0010H\u0002J\b\u0010\u0019\u001a\u00020\bH\u0002R\u000e\u0010\u0002\u001a\u00020\u0003X\u0082\u0004\u00a2\u0006\u0002\n\u0000R\u0010\u0010\u0005\u001a\u0004\u0018\u00010\u0006X\u0082\u000e\u00a2\u0006\u0002\n\u0000\u00a8\u0006\u001b"}, d2 = {"Lcom/handpose/app/ml/HandPoseDetector;", "", "context", "Landroid/content/Context;", "(Landroid/content/Context;)V", "handLandmarker", "Lcom/google/mediapipe/tasks/vision/handlandmarker/HandLandmarker;", "close", "", "detect", "bitmap", "Landroid/graphics/Bitmap;", "frameTime", "", "detectAsync", "mpImage", "Lcom/google/mediapipe/framework/image/MPImage;", "returnLivestreamError", "error", "Ljava/lang/RuntimeException;", "Lkotlin/RuntimeException;", "returnLivestreamResult", "result", "Lcom/google/mediapipe/tasks/vision/handlandmarker/HandLandmarkerResult;", "input", "setupHandLandmarker", "Companion", "app_debug"})
public final class HandPoseDetector {
    @org.jetbrains.annotations.NotNull
    private final android.content.Context context = null;
    @org.jetbrains.annotations.Nullable
    private com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarker handLandmarker;
    @org.jetbrains.annotations.NotNull
    private static final java.lang.String TAG = "HandPoseDetector";
    @org.jetbrains.annotations.NotNull
    public static final com.handpose.app.ml.HandPoseDetector.Companion Companion = null;
    
    @javax.inject.Inject
    public HandPoseDetector(@org.jetbrains.annotations.NotNull
    android.content.Context context) {
        super();
    }
    
    private final void setupHandLandmarker() {
    }
    
    public final void detect(@org.jetbrains.annotations.NotNull
    android.graphics.Bitmap bitmap, long frameTime) {
    }
    
    private final void detectAsync(com.google.mediapipe.framework.image.MPImage mpImage, long frameTime) {
    }
    
    private final void returnLivestreamResult(com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarkerResult result, com.google.mediapipe.framework.image.MPImage input) {
    }
    
    private final void returnLivestreamError(java.lang.RuntimeException error) {
    }
    
    public final void close() {
    }
    
    @kotlin.Metadata(mv = {1, 9, 0}, k = 1, xi = 48, d1 = {"\u0000\u0012\n\u0002\u0018\u0002\n\u0002\u0010\u0000\n\u0002\b\u0002\n\u0002\u0010\u000e\n\u0000\b\u0086\u0003\u0018\u00002\u00020\u0001B\u0007\b\u0002\u00a2\u0006\u0002\u0010\u0002R\u000e\u0010\u0003\u001a\u00020\u0004X\u0082T\u00a2\u0006\u0002\n\u0000\u00a8\u0006\u0005"}, d2 = {"Lcom/handpose/app/ml/HandPoseDetector$Companion;", "", "()V", "TAG", "", "app_debug"})
    public static final class Companion {
        
        private Companion() {
            super();
        }
    }
}