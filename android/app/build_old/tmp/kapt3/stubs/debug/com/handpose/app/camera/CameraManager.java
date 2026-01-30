package com.handpose.app.camera;

@javax.inject.Singleton
@kotlin.Metadata(mv = {1, 9, 0}, k = 1, xi = 48, d1 = {"\u0000J\n\u0002\u0018\u0002\n\u0002\u0010\u0000\n\u0000\n\u0002\u0018\u0002\n\u0002\b\u0002\n\u0002\u0018\u0002\n\u0000\n\u0002\u0018\u0002\n\u0000\n\u0002\u0018\u0002\n\u0000\n\u0002\u0018\u0002\n\u0000\n\u0002\u0010\u0002\n\u0000\n\u0002\u0018\u0002\n\u0000\n\u0002\u0018\u0002\n\u0000\n\u0002\u0018\u0002\n\u0000\n\u0002\u0018\u0002\n\u0002\b\u0003\b\u0007\u0018\u0000 \u00182\u00020\u0001:\u0001\u0018B\u000f\b\u0007\u0012\u0006\u0010\u0002\u001a\u00020\u0003\u00a2\u0006\u0002\u0010\u0004J(\u0010\r\u001a\u00020\u000e2\u0006\u0010\u000f\u001a\u00020\u00102\u0006\u0010\u0011\u001a\u00020\u00122\u0006\u0010\u0013\u001a\u00020\u00142\b\b\u0002\u0010\u0015\u001a\u00020\u0016J\u0006\u0010\u0017\u001a\u00020\u000eR\u000e\u0010\u0005\u001a\u00020\u0006X\u0082\u000e\u00a2\u0006\u0002\n\u0000R\u0010\u0010\u0007\u001a\u0004\u0018\u00010\bX\u0082\u000e\u00a2\u0006\u0002\n\u0000R\u000e\u0010\u0002\u001a\u00020\u0003X\u0082\u0004\u00a2\u0006\u0002\n\u0000R\u0010\u0010\t\u001a\u0004\u0018\u00010\nX\u0082\u000e\u00a2\u0006\u0002\n\u0000R\u0010\u0010\u000b\u001a\u0004\u0018\u00010\fX\u0082\u000e\u00a2\u0006\u0002\n\u0000\u00a8\u0006\u0019"}, d2 = {"Lcom/handpose/app/camera/CameraManager;", "", "context", "Landroid/content/Context;", "(Landroid/content/Context;)V", "cameraExecutor", "Ljava/util/concurrent/ExecutorService;", "cameraProvider", "Landroidx/camera/lifecycle/ProcessCameraProvider;", "imageAnalyzer", "Landroidx/camera/core/ImageAnalysis;", "preview", "Landroidx/camera/core/Preview;", "startCamera", "", "lifecycleOwner", "Landroidx/lifecycle/LifecycleOwner;", "previewView", "Landroidx/camera/view/PreviewView;", "analyzer", "Landroidx/camera/core/ImageAnalysis$Analyzer;", "targetResolution", "Landroid/util/Size;", "stopCamera", "Companion", "app_debug"})
public final class CameraManager {
    @org.jetbrains.annotations.NotNull
    private final android.content.Context context = null;
    @org.jetbrains.annotations.Nullable
    private androidx.camera.lifecycle.ProcessCameraProvider cameraProvider;
    @org.jetbrains.annotations.Nullable
    private androidx.camera.core.Preview preview;
    @org.jetbrains.annotations.Nullable
    private androidx.camera.core.ImageAnalysis imageAnalyzer;
    @org.jetbrains.annotations.NotNull
    private java.util.concurrent.ExecutorService cameraExecutor;
    @org.jetbrains.annotations.NotNull
    private static final java.lang.String TAG = "CameraManager";
    @org.jetbrains.annotations.NotNull
    public static final com.handpose.app.camera.CameraManager.Companion Companion = null;
    
    @javax.inject.Inject
    public CameraManager(@org.jetbrains.annotations.NotNull
    android.content.Context context) {
        super();
    }
    
    public final void startCamera(@org.jetbrains.annotations.NotNull
    androidx.lifecycle.LifecycleOwner lifecycleOwner, @org.jetbrains.annotations.NotNull
    androidx.camera.view.PreviewView previewView, @org.jetbrains.annotations.NotNull
    androidx.camera.core.ImageAnalysis.Analyzer analyzer, @org.jetbrains.annotations.NotNull
    android.util.Size targetResolution) {
    }
    
    public final void stopCamera() {
    }
    
    @kotlin.Metadata(mv = {1, 9, 0}, k = 1, xi = 48, d1 = {"\u0000\u0012\n\u0002\u0018\u0002\n\u0002\u0010\u0000\n\u0002\b\u0002\n\u0002\u0010\u000e\n\u0000\b\u0086\u0003\u0018\u00002\u00020\u0001B\u0007\b\u0002\u00a2\u0006\u0002\u0010\u0002R\u000e\u0010\u0003\u001a\u00020\u0004X\u0082T\u00a2\u0006\u0002\n\u0000\u00a8\u0006\u0005"}, d2 = {"Lcom/handpose/app/camera/CameraManager$Companion;", "", "()V", "TAG", "", "app_debug"})
    public static final class Companion {
        
        private Companion() {
            super();
        }
    }
}