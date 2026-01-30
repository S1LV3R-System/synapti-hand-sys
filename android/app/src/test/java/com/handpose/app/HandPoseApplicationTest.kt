package com.handpose.app

import androidx.test.core.app.ApplicationProvider
import androidx.work.Configuration
import androidx.work.WorkManager
import org.junit.Assert.assertNotNull
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import dagger.hilt.android.testing.HiltTestApplication
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import javax.inject.Inject

@HiltAndroidTest
@RunWith(RobolectricTestRunner::class)
@Config(application = HiltTestApplication::class)
class HandPoseApplicationTest {

    @get:Rule
    var hiltRule = HiltAndroidRule(this)

    @Inject
    lateinit var workerFactory: androidx.hilt.work.HiltWorkerFactory

    @Before
    fun init() {
        hiltRule.inject()
    }

    @Test
    fun testHiltWorkerFactoryIsInjected() {
        // This confirms that Hilt is capable of providing the WorkerFactory we need
        assertNotNull(workerFactory)
    }
}
