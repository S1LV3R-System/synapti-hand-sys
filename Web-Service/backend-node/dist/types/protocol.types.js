"use strict";
// ============================================================================
// PROTOCOL MOVEMENT SYSTEM TYPES
// ============================================================================
// Comprehensive type definitions for the hierarchical movement-based protocol system
// Supports 6 movement types with type-specific configurations
Object.defineProperty(exports, "__esModule", { value: true });
exports.MOVEMENT_TYPE_DESCRIPTIONS = exports.OBJECT_HOLD_SUB_MOVEMENTS = exports.ObjectHoldSubMovement = exports.HAND_CATEGORIES = exports.HandCategory = exports.APERTURE_CATEGORIES = exports.ApertureCategory = exports.FINGERS_BENDING_SUB_MOVEMENTS = exports.FingersBendingSubMovement = exports.BILATERAL_PATTERNS = exports.BilateralPattern = exports.UNILATERAL_MODES = exports.UnilateralMode = exports.FINGERS = exports.Finger = exports.WRIST_ROTATION_SUB_MOVEMENTS = exports.WristRotationSubMovement = exports.MOVEMENT_TYPES = exports.MovementType = exports.POSTURES = exports.Posture = exports.HANDS = exports.Hand = void 0;
exports.isWristRotationConfig = isWristRotationConfig;
exports.isFingerTappingConfig = isFingerTappingConfig;
exports.isFingersBendingConfig = isFingersBendingConfig;
exports.isApertureClosureConfig = isApertureClosureConfig;
exports.isObjectHoldConfig = isObjectHoldConfig;
exports.isFreestyleConfig = isFreestyleConfig;
// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================
var Hand;
(function (Hand) {
    Hand["LEFT"] = "left";
    Hand["RIGHT"] = "right";
    Hand["BOTH"] = "both";
})(Hand || (exports.Hand = Hand = {}));
exports.HANDS = [Hand.LEFT, Hand.RIGHT, Hand.BOTH];
var Posture;
(function (Posture) {
    Posture["PRONATION"] = "pronation";
    Posture["SUPINATION"] = "supination";
    Posture["NEUTRAL"] = "neutral";
})(Posture || (exports.Posture = Posture = {}));
exports.POSTURES = [Posture.PRONATION, Posture.SUPINATION, Posture.NEUTRAL];
var MovementType;
(function (MovementType) {
    MovementType["WRIST_ROTATION"] = "wrist_rotation";
    MovementType["FINGER_TAPPING"] = "finger_tapping";
    MovementType["FINGERS_BENDING"] = "fingers_bending";
    MovementType["APERTURE_CLOSURE"] = "aperture_closure";
    MovementType["OBJECT_HOLD"] = "object_hold";
    MovementType["FREESTYLE"] = "freestyle";
})(MovementType || (exports.MovementType = MovementType = {}));
exports.MOVEMENT_TYPES = [
    MovementType.WRIST_ROTATION,
    MovementType.FINGER_TAPPING,
    MovementType.FINGERS_BENDING,
    MovementType.APERTURE_CLOSURE,
    MovementType.OBJECT_HOLD,
    MovementType.FREESTYLE
];
// ============================================================================
// WRIST ROTATION
// ============================================================================
var WristRotationSubMovement;
(function (WristRotationSubMovement) {
    WristRotationSubMovement["ROTATION_IN_OUT"] = "rotation_in_out";
    WristRotationSubMovement["ROTATION_OUT_IN"] = "rotation_out_in";
    WristRotationSubMovement["ROTATION_IN"] = "rotation_in";
    WristRotationSubMovement["ROTATION_OUT"] = "rotation_out";
})(WristRotationSubMovement || (exports.WristRotationSubMovement = WristRotationSubMovement = {}));
exports.WRIST_ROTATION_SUB_MOVEMENTS = [
    WristRotationSubMovement.ROTATION_IN_OUT,
    WristRotationSubMovement.ROTATION_OUT_IN,
    WristRotationSubMovement.ROTATION_IN,
    WristRotationSubMovement.ROTATION_OUT
];
// ============================================================================
// FINGER TAPPING
// ============================================================================
var Finger;
(function (Finger) {
    Finger["THUMB"] = "thumb";
    Finger["INDEX"] = "index";
    Finger["MIDDLE"] = "middle";
    Finger["RING"] = "ring";
    Finger["LITTLE"] = "little";
})(Finger || (exports.Finger = Finger = {}));
exports.FINGERS = [
    Finger.THUMB,
    Finger.INDEX,
    Finger.MIDDLE,
    Finger.RING,
    Finger.LITTLE
];
var UnilateralMode;
(function (UnilateralMode) {
    UnilateralMode["TAP_SLOWLY"] = "tap_slowly";
    UnilateralMode["TAP_FAST"] = "tap_fast";
})(UnilateralMode || (exports.UnilateralMode = UnilateralMode = {}));
exports.UNILATERAL_MODES = [
    UnilateralMode.TAP_SLOWLY,
    UnilateralMode.TAP_FAST
];
var BilateralPattern;
(function (BilateralPattern) {
    BilateralPattern["ALTERNATING"] = "alternating";
    BilateralPattern["SYNCHRONOUS"] = "synchronous";
})(BilateralPattern || (exports.BilateralPattern = BilateralPattern = {}));
exports.BILATERAL_PATTERNS = [
    BilateralPattern.ALTERNATING,
    BilateralPattern.SYNCHRONOUS
];
// ============================================================================
// FINGERS BENDING
// ============================================================================
var FingersBendingSubMovement;
(function (FingersBendingSubMovement) {
    FingersBendingSubMovement["UNILATERAL"] = "unilateral";
    FingersBendingSubMovement["BILATERAL"] = "bilateral";
})(FingersBendingSubMovement || (exports.FingersBendingSubMovement = FingersBendingSubMovement = {}));
exports.FINGERS_BENDING_SUB_MOVEMENTS = [
    FingersBendingSubMovement.UNILATERAL,
    FingersBendingSubMovement.BILATERAL
];
// ============================================================================
// APERTURE-CLOSURE
// ============================================================================
var ApertureCategory;
(function (ApertureCategory) {
    ApertureCategory["APERTURE"] = "aperture";
    ApertureCategory["CLOSURE"] = "closure";
    ApertureCategory["APERTURE_CLOSURE"] = "aperture_closure";
})(ApertureCategory || (exports.ApertureCategory = ApertureCategory = {}));
exports.APERTURE_CATEGORIES = [
    ApertureCategory.APERTURE,
    ApertureCategory.CLOSURE,
    ApertureCategory.APERTURE_CLOSURE
];
var HandCategory;
(function (HandCategory) {
    HandCategory["UNILATERAL"] = "unilateral";
    HandCategory["BILATERAL"] = "bilateral";
})(HandCategory || (exports.HandCategory = HandCategory = {}));
exports.HAND_CATEGORIES = [
    HandCategory.UNILATERAL,
    HandCategory.BILATERAL
];
// ============================================================================
// OBJECT HOLD
// ============================================================================
var ObjectHoldSubMovement;
(function (ObjectHoldSubMovement) {
    ObjectHoldSubMovement["OPEN_PALM"] = "open_palm";
    ObjectHoldSubMovement["CLOSED_GRASP"] = "closed_grasp";
})(ObjectHoldSubMovement || (exports.ObjectHoldSubMovement = ObjectHoldSubMovement = {}));
exports.OBJECT_HOLD_SUB_MOVEMENTS = [
    ObjectHoldSubMovement.OPEN_PALM,
    ObjectHoldSubMovement.CLOSED_GRASP
];
// ============================================================================
// TYPE GUARDS
// ============================================================================
function isWristRotationConfig(config) {
    return 'subMovement' in config &&
        Object.values(WristRotationSubMovement).includes(config.subMovement);
}
function isFingerTappingConfig(config) {
    return 'fingers' in config && Array.isArray(config.fingers);
}
function isFingersBendingConfig(config) {
    return 'subMovement' in config &&
        Object.values(FingersBendingSubMovement).includes(config.subMovement);
}
function isApertureClosureConfig(config) {
    return 'apertureCategory' in config && 'handCategory' in config;
}
function isObjectHoldConfig(config) {
    return 'subMovement' in config &&
        Object.values(ObjectHoldSubMovement).includes(config.subMovement);
}
function isFreestyleConfig(config) {
    return Object.keys(config).length === 0;
}
// ============================================================================
// CONSTANT DESCRIPTIONS
// ============================================================================
exports.MOVEMENT_TYPE_DESCRIPTIONS = {
    [MovementType.WRIST_ROTATION]: {
        type: MovementType.WRIST_ROTATION,
        displayName: 'Wrist Rotation',
        description: 'Rotating the wrist in specified directions to assess mobility and tremor',
        hasSubMovements: true
    },
    [MovementType.FINGER_TAPPING]: {
        type: MovementType.FINGER_TAPPING,
        displayName: 'Finger Tapping',
        description: 'Tapping selected fingers with specified rhythm to assess coordination',
        hasSubMovements: true
    },
    [MovementType.FINGERS_BENDING]: {
        type: MovementType.FINGERS_BENDING,
        displayName: 'Fingers Bending',
        description: 'Flexing and extending fingers to assess range of motion',
        hasSubMovements: true
    },
    [MovementType.APERTURE_CLOSURE]: {
        type: MovementType.APERTURE_CLOSURE,
        displayName: 'Aperture-Closure',
        description: 'Opening and closing hand to assess dexterity and control',
        hasSubMovements: true
    },
    [MovementType.OBJECT_HOLD]: {
        type: MovementType.OBJECT_HOLD,
        displayName: 'Object Hold',
        description: 'Holding an object with specified grip to assess stability',
        hasSubMovements: true
    },
    [MovementType.FREESTYLE]: {
        type: MovementType.FREESTYLE,
        displayName: 'Freestyle',
        description: 'Free hand movement without specific constraints',
        hasSubMovements: false
    }
};
