package com.handpose.app.config

import android.content.Context
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mock
import org.mockito.junit.MockitoJUnitRunner

/**
 * Unit tests for ConfigManager - the unified configuration system.
 */
@RunWith(MockitoJUnitRunner::class)
class ConfigManagerTest {

    @Mock
    private lateinit var context: Context

    private lateinit var configManager: ConfigManager

    @Before
    fun setup() {
        configManager = ConfigManager(context)
    }

    @Test
    fun `initialization sets initialized flag`() {
        assertFalse(configManager.isInitialized())
        configManager.init()
        assertTrue(configManager.isInitialized())
    }

    @Test
    fun `server configuration returns production values`() {
        assertEquals("https://app.synaptihand.com", configManager.getCurrentBaseUrl())
        assertEquals("https://app.synaptihand.com", configManager.getBaseUrl())
        assertEquals("app.synaptihand.com", configManager.getServerHost())
        assertTrue(configManager.useHttps())
        assertEquals(443, configManager.getServerPort())
    }

    @Test
    fun `environment name is production`() {
        assertEquals("Production (SynaptiHand)", configManager.getCurrentEnvironmentName())
    }

    @Test
    fun `API endpoints are correct`() {
        assertEquals(
            "https://app.synaptihand.com/api/mobile/upload",
            configManager.getUploadUrl()
        )
        assertEquals(
            "https://app.synaptihand.com/api/mobile/keypoints",
            configManager.getKeypointsUploadUrl()
        )
        assertEquals(
            "https://app.synaptihand.com/api/mobile/video",
            configManager.getVideoUploadUrl()
        )
        assertEquals(
            "https://app.synaptihand.com/api/mobile/session",
            configManager.getSessionStatusUrl()
        )
    }

    @Test
    fun `Supabase configuration is correct`() {
        assertEquals(
            "https://mtodevikkgraisalolkq.supabase.co",
            configManager.getSupabaseUrl()
        )
        assertTrue(configManager.getSupabaseAnonKey().isNotEmpty())
        assertEquals(
            "https://mtodevikkgraisalolkq.supabase.co/rest/v1",
            configManager.getSupabaseRestUrl()
        )
        assertEquals(
            "https://mtodevikkgraisalolkq.supabase.co/auth/v1",
            configManager.getSupabaseAuthUrl()
        )
        assertEquals(
            "wss://mtodevikkgraisalolkq.supabase.co/realtime/v1",
            configManager.getSupabaseRealtimeUrl()
        )
    }

    @Test
    fun `feature flags are correct`() {
        assertFalse(configManager.useParallelUpload())
        assertTrue(configManager.recordWithOverlay())
    }

    @Test
    fun `video configuration is correct`() {
        assertEquals(1280, configManager.getVideoWidth())
        assertEquals(720, configManager.getVideoHeight())
        assertEquals(30, configManager.getVideoFps())
        assertEquals(4_000_000, configManager.getVideoBitrate())
    }

    @Test
    fun `setEnvironment always sets production`() {
        val customEnv = object : ServerEnvironment() {
            override val displayName = "Custom"
            override val baseUrl = "https://custom.com"
            override val useHttps = true
            override val key = "custom"
        }

        configManager.setEnvironment(customEnv)

        // Should still be production
        assertEquals("https://app.synaptihand.com", configManager.getCurrentBaseUrl())
    }

    @Test
    fun `resetToDefault sets production`() {
        configManager.resetToDefault()
        assertEquals("https://app.synaptihand.com", configManager.getCurrentBaseUrl())
    }

    @Test
    fun `currentEnvironment flow emits Production`() {
        val environment = configManager.currentEnvironment.value
        assertEquals(ServerEnvironment.Production, environment)
        assertEquals("Production (SynaptiHand)", environment.displayName)
        assertEquals("https://app.synaptihand.com", environment.baseUrl)
    }
}
