package com.handpose.app.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * SynaptiHand Design System
 *
 * Color palette aligned with the official SynaptiHand brand identity.
 * Colors extracted from Logo.png and Logo-Apk Icon.png
 *
 * Brand Colors:
 * - Cyan: #4DC9E6 (primary accent, gradients, highlights)
 * - Teal: #1E90B5 (primary brand color)
 * - Navy: #1B3A5F (text, dark elements)
 * - Blue: #3498DB (interactive elements)
 */
object SynaptiHandTheme {

    // ============================================
    // Brand Colors (from logo)
    // ============================================

    /** Primary brand color - SynaptiHand Teal */
    val Primary = Color(0xFF1E90B5)

    /** Accent color - SynaptiHand Cyan */
    val PrimaryLight = Color(0xFF4DC9E6)

    /** Hover state for primary elements */
    val PrimaryHover = Color(0xFF1A7FA0)

    /** Light variant for backgrounds and highlights */
    val PrimarySubtle = Color(0xFFE6F7FB)

    /** Navy - for dark text and headers */
    val Navy = Color(0xFF1B3A5F)

    /** Blue - for interactive elements */
    val Blue = Color(0xFF3498DB)

    // ============================================
    // Node Colors (from neural network in logo)
    // ============================================

    /** Dark node color */
    val NodeDark = Color(0xFF1A2744)

    /** Light node/connector color */
    val NodeLight = Color(0xFF50A0D0)

    // ============================================
    // Semantic Colors
    // ============================================

    /** Success color - green for medical clarity */
    val Success = Color(0xFF00C48C)

    /** Success variant for backgrounds */
    val SuccessLight = Color(0xFFE6FFF5)

    /** Warning color */
    val Warning = Color(0xFFF5A623)

    /** Warning background */
    val WarningLight = Color(0xFFFFF8E6)

    /** Error/danger color */
    val Error = Color(0xFFEE0000)

    /** Error background */
    val ErrorLight = Color(0xFFFFF0F0)

    /** Info color - uses brand cyan */
    val Info = PrimaryLight

    /** Info background */
    val InfoLight = Color(0xFFE6F7FB)

    // ============================================
    // Background Colors (Light Theme)
    // ============================================

    /** Main background */
    val Background = Color(0xFFFFFFFF)

    /** Secondary background for cards and surfaces */
    val Surface = Color(0xFFFAFAFA)

    /** Elevated surface (cards, dialogs) */
    val SurfaceElevated = Color(0xFFFFFFFF)

    /** Subtle surface for sections */
    val SurfaceSubtle = Color(0xFFF5F5F5)

    // ============================================
    // Text Colors
    // ============================================

    /** Primary text color - Navy for brand consistency */
    val TextPrimary = Navy

    /** Secondary text color */
    val TextSecondary = Color(0xFF666666)

    /** Tertiary/muted text */
    val TextTertiary = Color(0xFF999999)

    /** Placeholder text */
    val TextPlaceholder = Color(0xFFB0B0B0)

    /** Disabled text */
    val TextDisabled = Color(0xFFCCCCCC)

    /** Text on primary color backgrounds */
    val TextOnPrimary = Color(0xFFFFFFFF)

    // ============================================
    // Border & Divider Colors
    // ============================================

    /** Default border color */
    val Border = Color(0xFFE5E5E5)

    /** Subtle border for internal dividers */
    val BorderSubtle = Color(0xFFF0F0F0)

    /** Strong border for focused elements */
    val BorderStrong = Color(0xFFD0D0D0)

    /** Focused border color - uses brand teal */
    val BorderFocused = Primary

    // ============================================
    // Component-Specific Colors
    // ============================================

    /** Icon default color */
    val IconDefault = Color(0xFF666666)

    /** Icon muted color */
    val IconMuted = Color(0xFF999999)

    /** Button secondary background */
    val ButtonSecondary = Color(0xFFF5F5F5)

    /** Button secondary hover */
    val ButtonSecondaryHover = Color(0xFFE8E8E8)

    /** Input field background */
    val InputBackground = Color(0xFFFFFFFF)

    /** Input field disabled background */
    val InputDisabled = Color(0xFFF5F5F5)

    // ============================================
    // Status Colors (for recordings, processes)
    // ============================================

    /** Processing/pending status - warning orange */
    val StatusProcessing = Warning

    /** Completed/success status - green */
    val StatusCompleted = Success

    /** Failed/error status */
    val StatusFailed = Error

    /** Idle/inactive status */
    val StatusIdle = TextTertiary

    // ============================================
    // Camera Screen Specific
    // ============================================

    /** Camera overlay background - semi-transparent */
    val CameraOverlay = Color(0x99000000)

    /** Camera overlay dark - more opaque for panels */
    val CameraOverlayDark = Color(0xCC000000)

    /** Recording indicator - red dot */
    val RecordingActive = Color(0xFFFF0000)

    /** Recording button border */
    val RecordingButtonBorder = Color(0xFFFFFFFF)

    /** Text on camera overlay (white for visibility) */
    val TextOnOverlay = Color(0xFFFFFFFF)

    /** Secondary text on camera overlay */
    val TextOnOverlaySecondary = Color(0xB3FFFFFF)

    /** Badge background on camera overlay - uses navy */
    val OverlayBadgeBackground = Navy

    // ============================================
    // Gradient Colors (for special UI elements)
    // ============================================

    /** Gradient start - Cyan */
    val GradientStart = PrimaryLight

    /** Gradient end - Teal */
    val GradientEnd = Primary

    // ============================================
    // Hand Overlay Colors (for landmark visualization)
    // ============================================

    /** Left hand landmark color */
    val HandLeftColor = Color(0xFF4DC9E6)  // Cyan

    /** Right hand landmark color */
    val HandRightColor = Color(0xFF3498DB)  // Blue

    /** Landmark connector line color */
    val LandmarkConnector = Color(0xFF1B3A5F)  // Navy

    // ============================================
    // Spacing & Radius Constants
    // ============================================

    object Spacing {
        const val xs = 4
        const val sm = 8
        const val md = 12
        const val lg = 16
        const val xl = 24
        const val xxl = 32
    }

    object Radius {
        const val sm = 4
        const val md = 8
        const val lg = 12
        const val xl = 16
        const val full = 999
    }
}
