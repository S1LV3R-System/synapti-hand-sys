"use strict";
// ============================================================================
// API Response Types
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.COMPARISON_TYPES = exports.ComparisonType = exports.ANALYSIS_TYPES = exports.AnalysisType = exports.SEVERITY_LEVELS = exports.SeverityLevel = exports.ANNOTATION_TYPES = exports.AnnotationType = exports.REVIEW_STATUSES = exports.ReviewStatus = exports.RECORDING_STATUSES = exports.RecordingStatus = exports.USER_ROLES = exports.UserRole = void 0;
// ============================================================================
// User Roles
// ============================================================================
var UserRole;
(function (UserRole) {
    UserRole["PATIENT"] = "patient";
    UserRole["CLINICIAN"] = "clinician";
    UserRole["RESEARCHER"] = "researcher";
    UserRole["ADMIN"] = "admin";
})(UserRole || (exports.UserRole = UserRole = {}));
exports.USER_ROLES = [
    UserRole.PATIENT,
    UserRole.CLINICIAN,
    UserRole.RESEARCHER,
    UserRole.ADMIN
];
// ============================================================================
// Recording Status
// ============================================================================
var RecordingStatus;
(function (RecordingStatus) {
    RecordingStatus["UPLOADED"] = "uploaded";
    RecordingStatus["PROCESSING"] = "processing";
    RecordingStatus["PROCESSED"] = "processed";
    RecordingStatus["ANALYZED"] = "analyzed";
    RecordingStatus["COMPLETED"] = "completed";
    RecordingStatus["FAILED"] = "failed";
})(RecordingStatus || (exports.RecordingStatus = RecordingStatus = {}));
exports.RECORDING_STATUSES = [
    RecordingStatus.UPLOADED,
    RecordingStatus.PROCESSING,
    RecordingStatus.PROCESSED,
    RecordingStatus.ANALYZED,
    RecordingStatus.COMPLETED,
    RecordingStatus.FAILED
];
// ============================================================================
// Review Status
// ============================================================================
var ReviewStatus;
(function (ReviewStatus) {
    ReviewStatus["PENDING"] = "pending";
    ReviewStatus["APPROVED"] = "approved";
    ReviewStatus["FLAGGED"] = "flagged";
})(ReviewStatus || (exports.ReviewStatus = ReviewStatus = {}));
exports.REVIEW_STATUSES = [
    ReviewStatus.PENDING,
    ReviewStatus.APPROVED,
    ReviewStatus.FLAGGED
];
// ============================================================================
// Annotation Types
// ============================================================================
var AnnotationType;
(function (AnnotationType) {
    AnnotationType["OBSERVATION"] = "observation";
    AnnotationType["DIAGNOSIS"] = "diagnosis";
    AnnotationType["RECOMMENDATION"] = "recommendation";
    AnnotationType["FLAG"] = "flag";
})(AnnotationType || (exports.AnnotationType = AnnotationType = {}));
exports.ANNOTATION_TYPES = [
    AnnotationType.OBSERVATION,
    AnnotationType.DIAGNOSIS,
    AnnotationType.RECOMMENDATION,
    AnnotationType.FLAG
];
// ============================================================================
// Severity Levels
// ============================================================================
var SeverityLevel;
(function (SeverityLevel) {
    SeverityLevel["LOW"] = "low";
    SeverityLevel["MEDIUM"] = "medium";
    SeverityLevel["HIGH"] = "high";
    SeverityLevel["CRITICAL"] = "critical";
})(SeverityLevel || (exports.SeverityLevel = SeverityLevel = {}));
exports.SEVERITY_LEVELS = [
    SeverityLevel.LOW,
    SeverityLevel.MEDIUM,
    SeverityLevel.HIGH,
    SeverityLevel.CRITICAL
];
// ============================================================================
// Analysis Types
// ============================================================================
var AnalysisType;
(function (AnalysisType) {
    AnalysisType["COMPREHENSIVE"] = "comprehensive";
    AnalysisType["TREMOR_FOCUSED"] = "tremor_focused";
    AnalysisType["ROM_FOCUSED"] = "rom_focused";
})(AnalysisType || (exports.AnalysisType = AnalysisType = {}));
exports.ANALYSIS_TYPES = [
    AnalysisType.COMPREHENSIVE,
    AnalysisType.TREMOR_FOCUSED,
    AnalysisType.ROM_FOCUSED
];
// ============================================================================
// Comparison Types
// ============================================================================
var ComparisonType;
(function (ComparisonType) {
    ComparisonType["LONGITUDINAL"] = "longitudinal";
    ComparisonType["BILATERAL"] = "bilateral";
    ComparisonType["TREATMENT_RESPONSE"] = "treatment_response";
})(ComparisonType || (exports.ComparisonType = ComparisonType = {}));
exports.COMPARISON_TYPES = [
    ComparisonType.LONGITUDINAL,
    ComparisonType.BILATERAL,
    ComparisonType.TREATMENT_RESPONSE
];
