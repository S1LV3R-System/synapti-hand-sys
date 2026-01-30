# Android Automatic Refresh Pattern - ALWAYS USE THIS

## CRITICAL DECISION RULE

**NEVER add manual refresh buttons**. Data should ALWAYS refresh automatically using lifecycle awareness.

## Correct Implementation

### 1. Add Lifecycle Imports
```kotlin
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.repeatOnLifecycle
```

### 2. Add Auto-Refresh LaunchedEffect
```kotlin
// Auto-refresh when screen becomes visible
val lifecycleOwner = LocalLifecycleOwner.current
LaunchedEffect(lifecycleOwner) {
    lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
        viewModel.refreshData()  // Replace with actual refresh method
    }
}
```

### 3. How It Works
- `repeatOnLifecycle(Lifecycle.State.RESUMED)` triggers every time the screen becomes visible
- Automatically refreshes when user navigates back to the screen
- No manual user intervention required
- Clean, professional UX

## When User Navigates:
1. Projects → Patient Detail → Camera
2. Camera completes → navigates back → **Patient Detail auto-refreshes**
3. Patient Detail → Projects → **Projects auto-refreshes**

## DO NOT:
- ❌ Add manual refresh buttons/icons
- ❌ Require user to pull-to-refresh
- ❌ Force user to manually trigger updates

## DO:
- ✅ Use lifecycle-aware automatic refresh
- ✅ Refresh when screen becomes visible
- ✅ Make data updates transparent and seamless

## Applied To:
- ProjectDetailScreen.kt (patient lists)
- PatientDetailScreen.kt (recordings)
- Any screen where data may change while user is away
