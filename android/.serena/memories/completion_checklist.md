# Task Completion Checklist

## When completing implementation tasks:
1. ✅ Read affected files before making changes
2. ✅ Make targeted, minimal edits (don't refactor surrounding code)
3. ✅ Test compilation with `./gradlew build`
4. ✅ Check for Lint errors
5. ✅ Verify APK builds successfully
6. ✅ Test on device/emulator if possible

## For Android Kotlin code:
- ✅ Follow existing naming conventions
- ✅ Use proper Coroutine scopes (viewModelScope, lifecycleScope)
- ✅ Add error handling with try-catch and Log statements
- ✅ Use type-safe APIs (StateFlow, LiveData over raw variables)
- ✅ Prefer composition over inheritance
- ✅ Use Hilt for dependency injection

## For Jetpack Compose UI:
- ✅ Use Modifier parameter as last parameter
- ✅ Add proper spacing and padding with .dp units
- ✅ Use Material3 components for consistency
- ✅ Remember state appropriately (@Composable state)
- ✅ Preview composables with @Preview annotations

## After changes:
1. ✅ Rebuild APK: `./gradlew assembleDebug`
2. ✅ Check Lint output for warnings/errors
3. ✅ Review logcat for runtime errors: `adb logcat`
4. ✅ Test affected features on device/emulator
5. ✅ Verify APK file is generated and not corrupted

## Before considering task complete:
- APK successfully builds without errors
- Lint passes without critical issues
- All modified functionality tested
- No unrelated code changed
- Changes aligned with project architecture
