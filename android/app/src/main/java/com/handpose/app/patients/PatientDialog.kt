package com.handpose.app.patients

import android.app.DatePickerDialog
import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.handpose.app.ui.theme.SynaptiHandTheme
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

/**
 * Dialog mode for create or edit operations.
 */
enum class PatientDialogMode {
    CREATE,
    EDIT
}

/**
 * Unified patient form data matching Patient-Table schema.
 * Works for both create and edit operations.
 */
data class PatientFormData(
    val patientId: String = "",
    val firstName: String = "",
    val middleName: String = "",
    val lastName: String = "",
    val gender: String = "",
    val birthDate: String = "",      // Required for CREATE: yyyy-MM-dd format
    val height: String = "",          // Required for CREATE: in cm
    val weight: String = "",          // Required for CREATE: in kg
    val diagnosis: String = "Healthy"
) {
    /**
     * Check if all required fields are filled based on mode.
     */
    fun isValid(mode: PatientDialogMode): Boolean {
        return when (mode) {
            PatientDialogMode.CREATE -> {
                patientId.isNotBlank() &&
                        firstName.isNotBlank() &&
                        lastName.isNotBlank() &&
                        birthDate.isNotBlank() &&
                        height.isNotBlank() && height.toFloatOrNull() != null &&
                        weight.isNotBlank() && weight.toFloatOrNull() != null
            }
            PatientDialogMode.EDIT -> {
                firstName.isNotBlank() && lastName.isNotBlank()
            }
        }
    }

    /**
     * Full name computed from parts (for display).
     */
    val fullName: String
        get() = listOfNotNull(
            firstName.takeIf { it.isNotBlank() },
            middleName.takeIf { it.isNotBlank() },
            lastName.takeIf { it.isNotBlank() }
        ).joinToString(" ")
}

/**
 * Unified Patient Dialog for both create and edit operations.
 *
 * Supports Patient-Table schema:
 * - Split name: first_name (required), middle_name (optional), last_name (required)
 * - birth_date: Required for CREATE
 * - height: Required for CREATE (cm)
 * - weight: Required for CREATE (kg)
 */
@Composable
fun PatientDialog(
    mode: PatientDialogMode,
    formData: PatientFormData,
    isProcessing: Boolean,
    onFormDataChange: (PatientFormData) -> Unit,
    onDismiss: () -> Unit,
    onSubmit: () -> Unit
) {
    val context = LocalContext.current
    val genderExpanded = remember { mutableStateOf(false) }
    val genderOptions = listOf("Male", "Female", "Other")

    // Mode-specific values
    val dialogTitle = when (mode) {
        PatientDialogMode.CREATE -> "Add Patient"
        PatientDialogMode.EDIT -> "Edit Patient"
    }
    val submitButtonText = when (mode) {
        PatientDialogMode.CREATE -> "Add"
        PatientDialogMode.EDIT -> "Update"
    }
    val patientIdEnabled = mode == PatientDialogMode.CREATE

    Dialog(onDismissRequest = { if (!isProcessing) onDismiss() }) {
        Column(
            modifier = Modifier
                .fillMaxWidth(0.9f)
                .background(
                    color = SynaptiHandTheme.Surface,
                    shape = RoundedCornerShape(16.dp)
                )
                .padding(24.dp)
                .verticalScroll(rememberScrollState())
        ) {
            Text(
                text = dialogTitle,
                color = SynaptiHandTheme.TextPrimary,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold
            )

            Spacer(modifier = Modifier.height(24.dp))

            val textFieldColors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = SynaptiHandTheme.TextPrimary,
                unfocusedTextColor = SynaptiHandTheme.TextPrimary,
                focusedBorderColor = SynaptiHandTheme.Primary,
                unfocusedBorderColor = SynaptiHandTheme.Border,
                focusedLabelColor = SynaptiHandTheme.Primary,
                unfocusedLabelColor = SynaptiHandTheme.TextSecondary,
                cursorColor = SynaptiHandTheme.Primary,
                disabledTextColor = SynaptiHandTheme.TextDisabled,
                disabledBorderColor = SynaptiHandTheme.Border.copy(alpha = 0.5f),
                disabledLabelColor = SynaptiHandTheme.TextDisabled
            )

            // Row 1: Patient ID
            OutlinedTextField(
                value = formData.patientId,
                onValueChange = {
                    if (patientIdEnabled) {
                        onFormDataChange(formData.copy(patientId = it))
                    }
                },
                label = {
                    Text(if (mode == PatientDialogMode.CREATE) "Patient ID *" else "Patient ID")
                },
                placeholder = { Text("e.g., P001", color = SynaptiHandTheme.TextPlaceholder) },
                singleLine = true,
                enabled = patientIdEnabled && !isProcessing,
                colors = textFieldColors,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(12.dp))

            // Row 2: First Name | Middle Name | Last Name
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedTextField(
                    value = formData.firstName,
                    onValueChange = { onFormDataChange(formData.copy(firstName = it)) },
                    label = { Text("First *") },
                    singleLine = true,
                    enabled = !isProcessing,
                    colors = textFieldColors,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                    modifier = Modifier.weight(1f)
                )

                OutlinedTextField(
                    value = formData.middleName,
                    onValueChange = { onFormDataChange(formData.copy(middleName = it)) },
                    label = { Text("Middle") },
                    singleLine = true,
                    enabled = !isProcessing,
                    colors = textFieldColors,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                    modifier = Modifier.weight(1f)
                )

                OutlinedTextField(
                    value = formData.lastName,
                    onValueChange = { onFormDataChange(formData.copy(lastName = it)) },
                    label = { Text("Last *") },
                    singleLine = true,
                    enabled = !isProcessing,
                    colors = textFieldColors,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                    modifier = Modifier.weight(1f)
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Row 3: Gender | Date of Birth
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // Gender Dropdown
                Box(modifier = Modifier.weight(1f)) {
                    OutlinedTextField(
                        value = formData.gender,
                        onValueChange = {},
                        label = { Text("Gender") },
                        singleLine = true,
                        enabled = !isProcessing,
                        readOnly = true,
                        colors = textFieldColors,
                        trailingIcon = {
                            Icon(
                                imageVector = Icons.Default.ArrowDropDown,
                                contentDescription = "Select Gender",
                                tint = SynaptiHandTheme.IconDefault,
                                modifier = Modifier
                                    .size(24.dp)
                                    .clickable { if (!isProcessing) genderExpanded.value = true }
                            )
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable(enabled = !isProcessing) { genderExpanded.value = true }
                    )

                    DropdownMenu(
                        expanded = genderExpanded.value,
                        onDismissRequest = { genderExpanded.value = false }
                    ) {
                        genderOptions.forEach { option ->
                            DropdownMenuItem(
                                text = { Text(option, color = SynaptiHandTheme.TextPrimary) },
                                onClick = {
                                    onFormDataChange(formData.copy(gender = option))
                                    genderExpanded.value = false
                                }
                            )
                        }
                    }
                }

                // Date of Birth
                OutlinedTextField(
                    value = formData.birthDate,
                    onValueChange = {},
                    label = {
                        Text(if (mode == PatientDialogMode.CREATE) "Birth Date *" else "Birth Date")
                    },
                    singleLine = true,
                    enabled = !isProcessing,
                    readOnly = true,
                    colors = textFieldColors,
                    trailingIcon = {
                        Icon(
                            imageVector = Icons.Default.ArrowDropDown,
                            contentDescription = "Pick Date",
                            tint = SynaptiHandTheme.IconDefault,
                            modifier = Modifier
                                .size(24.dp)
                                .clickable(enabled = !isProcessing) {
                                    showDatePicker(context, formData.birthDate) { date ->
                                        onFormDataChange(formData.copy(birthDate = date))
                                    }
                                }
                        )
                    },
                    modifier = Modifier
                        .weight(1f)
                        .clickable(enabled = !isProcessing) {
                            showDatePicker(context, formData.birthDate) { date ->
                                onFormDataChange(formData.copy(birthDate = date))
                            }
                        }
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Row 4: Height | Weight
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedTextField(
                    value = formData.height,
                    onValueChange = { value ->
                        if (value.isEmpty() || value.matches(Regex("^\\d*\\.?\\d*$"))) {
                            onFormDataChange(formData.copy(height = value))
                        }
                    },
                    label = {
                        Text(if (mode == PatientDialogMode.CREATE) "Height (cm) *" else "Height (cm)")
                    },
                    singleLine = true,
                    enabled = !isProcessing,
                    colors = textFieldColors,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Decimal,
                        imeAction = ImeAction.Next
                    ),
                    modifier = Modifier.weight(1f)
                )

                OutlinedTextField(
                    value = formData.weight,
                    onValueChange = { value ->
                        if (value.isEmpty() || value.matches(Regex("^\\d*\\.?\\d*$"))) {
                            onFormDataChange(formData.copy(weight = value))
                        }
                    },
                    label = {
                        Text(if (mode == PatientDialogMode.CREATE) "Weight (kg) *" else "Weight (kg)")
                    },
                    singleLine = true,
                    enabled = !isProcessing,
                    colors = textFieldColors,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Decimal,
                        imeAction = ImeAction.Next
                    ),
                    modifier = Modifier.weight(1f)
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Row 5: Diagnosis
            OutlinedTextField(
                value = formData.diagnosis,
                onValueChange = { onFormDataChange(formData.copy(diagnosis = it)) },
                label = { Text("Diagnosis") },
                maxLines = 3,
                enabled = !isProcessing,
                colors = textFieldColors,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(24.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End
            ) {
                TextButton(
                    onClick = onDismiss,
                    enabled = !isProcessing
                ) {
                    Text(
                        text = "Cancel",
                        color = if (isProcessing) SynaptiHandTheme.TextDisabled else SynaptiHandTheme.TextSecondary
                    )
                }

                Spacer(modifier = Modifier.size(8.dp))

                Button(
                    onClick = onSubmit,
                    enabled = !isProcessing && formData.isValid(mode),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = SynaptiHandTheme.Primary,
                        disabledContainerColor = SynaptiHandTheme.Primary.copy(alpha = 0.5f)
                    )
                ) {
                    if (isProcessing) {
                        CircularProgressIndicator(
                            color = SynaptiHandTheme.TextOnPrimary,
                            modifier = Modifier.size(18.dp),
                            strokeWidth = 2.dp
                        )
                    } else {
                        Text(submitButtonText, color = SynaptiHandTheme.TextOnPrimary)
                    }
                }
            }
        }
    }
}

// =============================================================================
// LEGACY COMPATIBILITY FUNCTIONS
// =============================================================================

/**
 * Legacy CreatePatientDialog for backward compatibility.
 * Wraps the old parameter style into the new unified PatientDialog.
 */
@Composable
fun CreatePatientDialog(
    formData: PatientFormData,
    isCreating: Boolean,
    onFormDataChange: (PatientFormData) -> Unit,
    onDismiss: () -> Unit,
    onCreate: () -> Unit
) {
    PatientDialog(
        mode = PatientDialogMode.CREATE,
        formData = formData,
        isProcessing = isCreating,
        onFormDataChange = onFormDataChange,
        onDismiss = onDismiss,
        onSubmit = onCreate
    )
}

/**
 * Legacy CreatePatientDialog overload for backward compatibility.
 * Wraps the old individual parameter style.
 */
@Composable
fun CreatePatientDialog(
    patientId: String,
    patientName: String,
    middleName: String = "",
    gender: String,
    dateOfBirth: String,
    height: String,
    weight: String,
    diagnosis: String,
    isCreating: Boolean,
    onPatientIdChange: (String) -> Unit,
    onPatientNameChange: (String) -> Unit,
    onMiddleNameChange: (String) -> Unit = {},
    onGenderChange: (String) -> Unit,
    onDateOfBirthChange: (String) -> Unit,
    onHeightChange: (String) -> Unit,
    onWeightChange: (String) -> Unit,
    onDiagnosisChange: (String) -> Unit,
    onDismiss: () -> Unit,
    onCreate: () -> Unit
) {
    // Split patientName into first and last name for backward compatibility
    val nameParts = patientName.trim().split(" ", limit = 2)
    val firstName = nameParts.getOrElse(0) { "" }
    val lastName = nameParts.getOrElse(1) { "" }

    val formData = PatientFormData(
        patientId = patientId,
        firstName = firstName,
        middleName = middleName,
        lastName = lastName,
        gender = gender,
        birthDate = dateOfBirth,
        height = height,
        weight = weight,
        diagnosis = diagnosis
    )

    CreatePatientDialog(
        formData = formData,
        isCreating = isCreating,
        onFormDataChange = { newData ->
            onPatientIdChange(newData.patientId)
            // Combine first and last name for backward compatibility
            onPatientNameChange("${newData.firstName} ${newData.lastName}".trim())
            onMiddleNameChange(newData.middleName)
            onGenderChange(newData.gender)
            onDateOfBirthChange(newData.birthDate)
            onHeightChange(newData.height)
            onWeightChange(newData.weight)
            onDiagnosisChange(newData.diagnosis)
        },
        onDismiss = onDismiss,
        onCreate = onCreate
    )
}

/**
 * Legacy EditPatientDialog for backward compatibility.
 * Wraps into the new unified PatientDialog with EDIT mode.
 */
@Composable
fun EditPatientDialog(
    formData: PatientFormData,
    isUpdating: Boolean,
    onFormDataChange: (PatientFormData) -> Unit,
    onDismiss: () -> Unit,
    onUpdate: () -> Unit
) {
    PatientDialog(
        mode = PatientDialogMode.EDIT,
        formData = formData,
        isProcessing = isUpdating,
        onFormDataChange = onFormDataChange,
        onDismiss = onDismiss,
        onSubmit = onUpdate
    )
}

/**
 * Legacy EditPatientDialog overload for backward compatibility.
 * Wraps the old individual parameter style.
 */
@Composable
fun EditPatientDialog(
    patientId: String,
    patientName: String,
    gender: String,
    dateOfBirth: String,
    height: String,
    weight: String,
    diagnosis: String,
    isUpdating: Boolean,
    onPatientIdChange: (String) -> Unit,
    onPatientNameChange: (String) -> Unit,
    onGenderChange: (String) -> Unit,
    onDateOfBirthChange: (String) -> Unit,
    onHeightChange: (String) -> Unit,
    onWeightChange: (String) -> Unit,
    onDiagnosisChange: (String) -> Unit,
    onDismiss: () -> Unit,
    onUpdate: () -> Unit
) {
    // Split patientName into first and last name for backward compatibility
    val nameParts = patientName.trim().split(" ", limit = 2)
    val firstName = nameParts.getOrElse(0) { "" }
    val lastName = nameParts.getOrElse(1) { "" }

    val formData = PatientFormData(
        patientId = patientId,
        firstName = firstName,
        middleName = "",
        lastName = lastName,
        gender = gender,
        birthDate = dateOfBirth,
        height = height,
        weight = weight,
        diagnosis = diagnosis
    )

    EditPatientDialog(
        formData = formData,
        isUpdating = isUpdating,
        onFormDataChange = { newData ->
            onPatientIdChange(newData.patientId)
            // Combine first and last name for backward compatibility
            onPatientNameChange("${newData.firstName} ${newData.lastName}".trim())
            onGenderChange(newData.gender)
            onDateOfBirthChange(newData.birthDate)
            onHeightChange(newData.height)
            onWeightChange(newData.weight)
            onDiagnosisChange(newData.diagnosis)
        },
        onDismiss = onDismiss,
        onUpdate = onUpdate
    )
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Show date picker dialog for birth date selection.
 */
private fun showDatePicker(
    context: Context,
    currentDate: String,
    onDateSelected: (String) -> Unit
) {
    val calendar = Calendar.getInstance()

    // Parse current date if available
    if (currentDate.isNotBlank()) {
        try {
            val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US)
            calendar.time = dateFormat.parse(currentDate) ?: Calendar.getInstance().time
        } catch (e: Exception) {
            // Use current date if parsing fails
        }
    }

    val year = calendar.get(Calendar.YEAR)
    val month = calendar.get(Calendar.MONTH)
    val day = calendar.get(Calendar.DAY_OF_MONTH)

    DatePickerDialog(
        context,
        { _, selectedYear, selectedMonth, selectedDay ->
            val formattedDate = String.format(
                "%04d-%02d-%02d",
                selectedYear,
                selectedMonth + 1,
                selectedDay
            )
            onDateSelected(formattedDate)
        },
        year,
        month,
        day
    ).show()
}

// =============================================================================
// TYPE ALIASES FOR BACKWARD COMPATIBILITY
// =============================================================================

/**
 * Type alias for EditPatientFormData to maintain backward compatibility.
 * Both data classes are now unified as PatientFormData.
 */
@Deprecated(
    message = "Use PatientFormData instead",
    replaceWith = ReplaceWith("PatientFormData")
)
typealias EditPatientFormData = PatientFormData
