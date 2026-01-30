package com.handpose.app

import android.app.Application
import android.util.Log
import com.handpose.app.config.AppConfig
import com.handpose.app.config.ConfigManager
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject

@HiltAndroidApp
class HandPoseApplication : Application(), androidx.work.Configuration.Provider {

    @Inject
    lateinit var workerFactory: androidx.hilt.work.HiltWorkerFactory

    @Inject
    lateinit var configManager: ConfigManager

    override val workManagerConfiguration: androidx.work.Configuration
        get() {
            if (this::workerFactory.isInitialized) {
                return androidx.work.Configuration.Builder()
                    .setWorkerFactory(workerFactory)
                    .build()
            } else {
                // Fallback to avoid crash on startup if WM initializes too early
                Log.w(TAG, "WorkerFactory not yet initialized, using default configuration.")
                return androidx.work.Configuration.Builder().build()
            }
        }

    override fun onCreate() {
        super.onCreate()

        // Initialize ConfigManager (the new unified configuration system)
        configManager.init()
        Log.i(TAG, "ConfigManager initialized - Server: ${configManager.getCurrentEnvironmentName()}")
        Log.d(TAG, "Base URL: ${configManager.getBaseUrl()}")

        // Backward compatibility: wire up deprecated AppConfig
        @Suppress("DEPRECATION")
        AppConfig.setConfigManager(configManager)
        AppConfig.init(this)

        // Set up crash handler for logging
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            Log.e(TAG, "Uncaught exception in thread ${thread.name}", throwable)

            // Let the system handle the crash after logging
            android.os.Process.killProcess(android.os.Process.myPid())
            System.exit(10)
        }
    }

    companion object {
        private const val TAG = "HandPoseApplication"
    }
}
