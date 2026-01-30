package com.handpose.app.data

import android.content.Context
import androidx.work.ListenableWorker
import androidx.work.WorkerParameters
import androidx.work.testing.TestListenableWorkerBuilder
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertThat
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.hamcrest.CoreMatchers.`is`
import androidx.test.core.app.ApplicationProvider
import androidx.work.workDataOf
import java.io.File
import java.util.concurrent.Executor
import java.util.concurrent.Executors

@RunWith(RobolectricTestRunner::class)
@Config(manifest = Config.NONE)
class UploadWorkerTest {
    private lateinit var context: Context
    private val mockClient: okhttp3.OkHttpClient = org.mockito.Mockito.mock(okhttp3.OkHttpClient::class.java)

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
    }

    @Test
    fun testDoWork_fail_when_file_missing() {
        // Create a custom factory to handle the dependency injection manually for the test
        val workerFactory = object : androidx.work.WorkerFactory() {
            override fun createWorker(
                appContext: Context,
                workerClassName: String,
                workerParameters: WorkerParameters
            ): ListenableWorker? {
                return if (workerClassName == UploadWorker::class.java.name) {
                    UploadWorker(appContext, workerParameters, mockClient)
                } else {
                    null
                }
            }
        }

        val worker = TestListenableWorkerBuilder<UploadWorker>(context)
            .setWorkerFactory(workerFactory)
            .setInputData(workDataOf(UploadWorker.KEY_FILE_PATH to "non_existent_file", UploadWorker.KEY_UPLOAD_URL to "http://example.com"))
            .build()
        
        runBlocking {
            val result = worker.doWork()
            assertThat(result, `is`(ListenableWorker.Result.failure()))
        }
    }

    @Test
    fun testDoWork_success_when_upload_succeeds() {
        // Setup a temporary file
        val tempFile = File.createTempFile("test_image", ".jpg")
        tempFile.writeText("test content")

        // Mock OkHttp behavior
        val mockCall = org.mockito.Mockito.mock(okhttp3.Call::class.java)
        val mockResponse = okhttp3.Response.Builder()
            .request(okhttp3.Request.Builder().url("http://example.com").build())
            .protocol(okhttp3.Protocol.HTTP_1_1)
            .code(200)
            .message("OK")
            .body(okhttp3.ResponseBody.create(null, "Success"))
            .build()

        org.mockito.kotlin.whenever(mockClient.newCall(org.mockito.kotlin.any())).thenReturn(mockCall)
        org.mockito.kotlin.whenever(mockCall.execute()).thenReturn(mockResponse)

        val workerFactory = object : androidx.work.WorkerFactory() {
            override fun createWorker(
                appContext: Context,
                workerClassName: String,
                workerParameters: WorkerParameters
            ): ListenableWorker? {
                return UploadWorker(appContext, workerParameters, mockClient)
            }
        }

        val worker = TestListenableWorkerBuilder<UploadWorker>(context)
            .setWorkerFactory(workerFactory)
            .setInputData(workDataOf(UploadWorker.KEY_FILE_PATH to tempFile.absolutePath, UploadWorker.KEY_UPLOAD_URL to "http://example.com"))
            .build()

        runBlocking {
            val result = worker.doWork()
            assertThat(result, `is`(ListenableWorker.Result.success()))
        }

        // Cleanup
        tempFile.delete()
    }
}
