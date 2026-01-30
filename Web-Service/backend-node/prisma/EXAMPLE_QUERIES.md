# Example Queries and API Integration

Comprehensive examples of common database operations for the medical hand pose analysis platform.

---

## Table of Contents

1. [User Management](#user-management)
2. [Recording Session Operations](#recording-session-operations)
3. [Signal Processing](#signal-processing)
4. [Clinical Analysis](#clinical-analysis)
5. [Protocol Management](#protocol-management)
6. [Reports & Comparisons](#reports--comparisons)
7. [Analytics & Dashboards](#analytics--dashboards)
8. [Advanced Queries](#advanced-queries)

---

## User Management

### Create Patient Account

```typescript
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function createPatient(data: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}) {
  const passwordHash = await bcrypt.hash(data.password, 10);

  const patient = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      role: 'patient',
      isActive: true,
    },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      userId: patient.id,
      action: 'CREATE',
      resource: 'User',
      resourceId: patient.id,
      details: JSON.stringify({ role: 'patient' }),
    },
  });

  return patient;
}
```

### Create Clinician Account

```typescript
async function createClinician(data: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  licenseNumber: string;
  specialty: string;
  organization: string;
}) {
  const passwordHash = await bcrypt.hash(data.password, 10);

  const clinician = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      role: 'clinician',
      licenseNumber: data.licenseNumber,
      specialty: data.specialty,
      organization: data.organization,
      isActive: true,
    },
  });

  return clinician;
}
```

### Authenticate User

```typescript
import { randomBytes } from 'crypto';

async function authenticateUser(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user || !user.isActive || user.deletedAt) {
    throw new Error('Invalid credentials or inactive account');
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    throw new Error('Invalid credentials');
  }

  // Create session
  const token = randomBytes(32).toString('hex');
  const tokenHash = await bcrypt.hash(token, 10);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const session = await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
    },
  });

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLogin: new Date() },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'LOGIN',
      resource: 'User',
      resourceId: user.id,
    },
  });

  return { user, token, sessionId: session.id };
}
```

### Get User Profile with Stats

```typescript
async function getUserProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      _count: {
        select: {
          patientRecordings: true,
          clinicianRecordings: true,
          protocols: true,
        },
      },
    },
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Get latest recordings for patients
  let latestRecordings = [];
  if (user.role === 'patient') {
    latestRecordings = await prisma.recordingSession.findMany({
      where: {
        patientId: userId,
        deletedAt: null,
      },
      orderBy: { recordingDate: 'desc' },
      take: 5,
      include: {
        protocol: { select: { name: true } },
        clinicalAnalyses: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      specialty: user.specialty,
      organization: user.organization,
      lastLogin: user.lastLogin,
    },
    stats: {
      recordingsAsPatient: user._count.patientRecordings,
      recordingsOrdered: user._count.clinicianRecordings,
      protocolsCreated: user._count.protocols,
    },
    latestRecordings,
  };
}
```

---

## Recording Session Operations

### Create Recording Session

```typescript
async function createRecordingSession(data: {
  patientId: string;
  clinicianId?: string;
  protocolId?: string;
  duration: number;
  fps: number;
  deviceInfo: {
    deviceType: string;
    model: string;
    resolution: string;
  };
  videoPath: string;
  csvPath: string;
}) {
  // Verify patient exists
  const patient = await prisma.user.findUnique({
    where: { id: data.patientId },
  });

  if (!patient || patient.role !== 'patient') {
    throw new Error('Invalid patient ID');
  }

  const recording = await prisma.recordingSession.create({
    data: {
      patientId: data.patientId,
      clinicianId: data.clinicianId,
      protocolId: data.protocolId,
      recordingDate: new Date(),
      duration: data.duration,
      fps: data.fps,
      deviceInfo: JSON.stringify(data.deviceInfo),
      videoPath: data.videoPath,
      csvPath: data.csvPath,
      status: 'uploaded',
      processingMetadata: JSON.stringify({
        uploadedAt: new Date().toISOString(),
      }),
      reviewStatus: 'pending',
    },
    include: {
      patient: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      protocol: true,
    },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      userId: data.patientId,
      action: 'CREATE',
      resource: 'RecordingSession',
      resourceId: recording.id,
      details: JSON.stringify({
        protocolId: data.protocolId,
        duration: data.duration,
      }),
    },
  });

  return recording;
}
```

### Update Recording Status

```typescript
async function updateRecordingStatus(
  recordingId: string,
  status: string,
  metadata?: Record<string, any>
) {
  const recording = await prisma.recordingSession.findUnique({
    where: { id: recordingId },
  });

  if (!recording) {
    throw new Error('Recording not found');
  }

  // Parse existing metadata
  const existingMetadata = recording.processingMetadata
    ? JSON.parse(recording.processingMetadata)
    : {};

  // Merge with new metadata
  const updatedMetadata = {
    ...existingMetadata,
    ...metadata,
    [`${status}At`]: new Date().toISOString(),
  };

  const updated = await prisma.recordingSession.update({
    where: { id: recordingId },
    data: {
      status,
      processingMetadata: JSON.stringify(updatedMetadata),
    },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      userId: recording.patientId,
      action: 'UPDATE_STATUS',
      resource: 'RecordingSession',
      resourceId: recordingId,
      details: JSON.stringify({ status, metadata }),
    },
  });

  return updated;
}
```

### Get Patient Recordings

```typescript
async function getPatientRecordings(
  patientId: string,
  options?: {
    status?: string;
    limit?: number;
    offset?: number;
    includePending?: boolean;
  }
) {
  const where: any = {
    patientId,
    deletedAt: null,
  };

  if (options?.status) {
    where.status = options.status;
  }

  const recordings = await prisma.recordingSession.findMany({
    where,
    orderBy: { recordingDate: 'desc' },
    take: options?.limit || 20,
    skip: options?.offset || 0,
    include: {
      clinician: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          specialty: true,
        },
      },
      protocol: {
        select: {
          id: true,
          name: true,
          description: true,
        },
      },
      clinicalAnalyses: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true,
          tremorFrequency: true,
          tremorAmplitude: true,
          sparc: true,
          asymmetryIndex: true,
          overallScore: true,
          confidence: true,
        },
      },
      _count: {
        select: {
          annotations: true,
          reports: true,
        },
      },
    },
  });

  const totalCount = await prisma.recordingSession.count({ where });

  return {
    recordings,
    pagination: {
      total: totalCount,
      limit: options?.limit || 20,
      offset: options?.offset || 0,
      hasMore: (options?.offset || 0) + recordings.length < totalCount,
    },
  };
}
```

### Get Recording Details

```typescript
async function getRecordingDetails(recordingId: string, userId: string) {
  const recording = await prisma.recordingSession.findUnique({
    where: { id: recordingId },
    include: {
      patient: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      clinician: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          specialty: true,
          organization: true,
        },
      },
      protocol: true,
      reviewer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      signalProcessingResults: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true,
          processingVersion: true,
          filtersApplied: true,
          qualityMetrics: true,
          processingTime: true,
          createdAt: true,
        },
      },
      clinicalAnalyses: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      annotations: {
        orderBy: { createdAt: 'desc' },
        include: {
          clinician: {
            select: {
              firstName: true,
              lastName: true,
              specialty: true,
            },
          },
        },
      },
      reports: {
        orderBy: { generatedAt: 'desc' },
        select: {
          id: true,
          reportType: true,
          title: true,
          pdfPath: true,
          generatedAt: true,
        },
      },
    },
  });

  if (!recording) {
    throw new Error('Recording not found');
  }

  // Check access permissions
  const hasAccess =
    recording.patientId === userId ||
    recording.clinicianId === userId ||
    recording.reviewedById === userId;

  if (!hasAccess) {
    throw new Error('Access denied');
  }

  return recording;
}
```

---

## Signal Processing

### Store Signal Processing Results

```typescript
async function storeSignalProcessingResults(data: {
  recordingSessionId: string;
  processingVersion: string;
  filtersApplied: string[];
  rawLandmarks: any[];
  filterResults: {
    butterworth?: any;
    kalman?: any;
    savitzkyGolay?: any;
    movingAverage?: any;
    exponentialSmoothing?: any;
    fftFiltered?: any;
    waveletDenoised?: any;
    particleFilter?: any;
    unscentedKalman?: any;
  };
  qualityMetrics: any;
  processingTime: number;
}) {
  // Verify recording exists
  const recording = await prisma.recordingSession.findUnique({
    where: { id: data.recordingSessionId },
  });

  if (!recording) {
    throw new Error('Recording not found');
  }

  const result = await prisma.signalProcessingResult.create({
    data: {
      recordingSessionId: data.recordingSessionId,
      processingVersion: data.processingVersion,
      filtersApplied: JSON.stringify(data.filtersApplied),
      rawLandmarks: JSON.stringify(data.rawLandmarks),
      butterworth: data.filterResults.butterworth
        ? JSON.stringify(data.filterResults.butterworth)
        : null,
      kalman: data.filterResults.kalman
        ? JSON.stringify(data.filterResults.kalman)
        : null,
      savitzkyGolay: data.filterResults.savitzkyGolay
        ? JSON.stringify(data.filterResults.savitzkyGolay)
        : null,
      movingAverage: data.filterResults.movingAverage
        ? JSON.stringify(data.filterResults.movingAverage)
        : null,
      exponentialSmoothing: data.filterResults.exponentialSmoothing
        ? JSON.stringify(data.filterResults.exponentialSmoothing)
        : null,
      fftFiltered: data.filterResults.fftFiltered
        ? JSON.stringify(data.filterResults.fftFiltered)
        : null,
      waveletDenoised: data.filterResults.waveletDenoised
        ? JSON.stringify(data.filterResults.waveletDenoised)
        : null,
      particleFilter: data.filterResults.particleFilter
        ? JSON.stringify(data.filterResults.particleFilter)
        : null,
      unscentedKalman: data.filterResults.unscentedKalman
        ? JSON.stringify(data.filterResults.unscentedKalman)
        : null,
      qualityMetrics: JSON.stringify(data.qualityMetrics),
      processingTime: data.processingTime,
    },
  });

  // Update recording status
  await updateRecordingStatus(data.recordingSessionId, 'processed', {
    processingTime: data.processingTime,
    filtersCount: data.filtersApplied.length,
  });

  return result;
}
```

### Get Signal Processing Results

```typescript
async function getSignalProcessingResults(
  recordingSessionId: string,
  filterNames?: string[]
) {
  const result = await prisma.signalProcessingResult.findFirst({
    where: { recordingSessionId },
    orderBy: { createdAt: 'desc' },
  });

  if (!result) {
    return null;
  }

  // Parse JSON strings
  const parsed: any = {
    id: result.id,
    recordingSessionId: result.recordingSessionId,
    processingVersion: result.processingVersion,
    filtersApplied: JSON.parse(result.filtersApplied),
    qualityMetrics: result.qualityMetrics
      ? JSON.parse(result.qualityMetrics)
      : null,
    processingTime: result.processingTime,
    createdAt: result.createdAt,
  };

  // Include raw landmarks if requested
  if (!filterNames || filterNames.includes('raw')) {
    parsed.rawLandmarks = JSON.parse(result.rawLandmarks);
  }

  // Include specific filter results
  const filterMap: Record<string, string | null> = {
    butterworth: result.butterworth,
    kalman: result.kalman,
    savitzkyGolay: result.savitzkyGolay,
    movingAverage: result.movingAverage,
    exponentialSmoothing: result.exponentialSmoothing,
    fftFiltered: result.fftFiltered,
    waveletDenoised: result.waveletDenoised,
    particleFilter: result.particleFilter,
    unscentedKalman: result.unscentedKalman,
  };

  if (filterNames) {
    filterNames.forEach((name) => {
      if (filterMap[name]) {
        parsed[name] = JSON.parse(filterMap[name] as string);
      }
    });
  } else {
    // Include all available filters
    Object.entries(filterMap).forEach(([name, value]) => {
      if (value) {
        parsed[name] = JSON.parse(value);
      }
    });
  }

  return parsed;
}
```

---

## Clinical Analysis

### Store Clinical Analysis

```typescript
async function storeClinicalAnalysis(data: {
  recordingSessionId: string;
  analysisVersion: string;
  analysisType: string;
  tremorMetrics: {
    frequency: number;
    amplitude: number;
    regularity: number;
    dominantFrequency: number;
    spectrum: any;
  };
  smoothnessMetrics: {
    sparc: number;
    ldljv: number;
    normalizedJerk: number;
  };
  romMeasurements: any;
  asymmetryMetrics: {
    index: number;
    details: any;
  };
  coordinationMetrics: {
    score: number;
    reactionTime: number;
    accuracy: number;
  };
  severityScores: any;
  overallScore: number;
  clinicalSummary: string;
  confidence: number;
  qualityFlags: string[];
}) {
  const analysis = await prisma.clinicalAnalysis.create({
    data: {
      recordingSessionId: data.recordingSessionId,
      analysisVersion: data.analysisVersion,
      analysisType: data.analysisType,
      tremorFrequency: data.tremorMetrics.frequency,
      tremorAmplitude: data.tremorMetrics.amplitude,
      tremorRegularity: data.tremorMetrics.regularity,
      dominantFrequency: data.tremorMetrics.dominantFrequency,
      frequencySpectrum: JSON.stringify(data.tremorMetrics.spectrum),
      sparc: data.smoothnessMetrics.sparc,
      ldljv: data.smoothnessMetrics.ldljv,
      normalizedJerk: data.smoothnessMetrics.normalizedJerk,
      romMeasurements: JSON.stringify(data.romMeasurements),
      asymmetryIndex: data.asymmetryMetrics.index,
      asymmetryDetails: JSON.stringify(data.asymmetryMetrics.details),
      coordinationScore: data.coordinationMetrics.score,
      reactionTime: data.coordinationMetrics.reactionTime,
      movementAccuracy: data.coordinationMetrics.accuracy,
      severityScores: JSON.stringify(data.severityScores),
      overallScore: data.overallScore,
      clinicalSummary: data.clinicalSummary,
      confidence: data.confidence,
      qualityFlags: JSON.stringify(data.qualityFlags),
    },
  });

  // Update recording status
  await updateRecordingStatus(data.recordingSessionId, 'analyzed');

  return analysis;
}
```

### Get Clinical Analysis with Interpretation

```typescript
async function getClinicalAnalysis(recordingSessionId: string) {
  const analysis = await prisma.clinicalAnalysis.findFirst({
    where: { recordingSessionId },
    orderBy: { createdAt: 'desc' },
    include: {
      recordingSession: {
        include: {
          patient: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
          protocol: {
            select: {
              name: true,
              configuration: true,
            },
          },
        },
      },
    },
  });

  if (!analysis) {
    return null;
  }

  // Parse JSON fields
  const parsed = {
    ...analysis,
    frequencySpectrum: analysis.frequencySpectrum
      ? JSON.parse(analysis.frequencySpectrum)
      : null,
    romMeasurements: analysis.romMeasurements
      ? JSON.parse(analysis.romMeasurements)
      : null,
    asymmetryDetails: analysis.asymmetryDetails
      ? JSON.parse(analysis.asymmetryDetails)
      : null,
    severityScores: analysis.severityScores
      ? JSON.parse(analysis.severityScores)
      : null,
    qualityFlags: analysis.qualityFlags
      ? JSON.parse(analysis.qualityFlags)
      : [],
  };

  // Add clinical interpretation
  const interpretation = generateInterpretation(parsed);

  return {
    ...parsed,
    interpretation,
  };
}

function generateInterpretation(analysis: any) {
  const interpretations: string[] = [];

  // Tremor interpretation
  if (analysis.tremorFrequency) {
    if (analysis.tremorFrequency >= 4 && analysis.tremorFrequency <= 6) {
      interpretations.push(
        'Tremor frequency consistent with parkinsonian tremor (4-6 Hz)'
      );
    } else if (analysis.tremorFrequency >= 6 && analysis.tremorFrequency <= 12) {
      interpretations.push(
        'Tremor frequency consistent with essential tremor (6-12 Hz)'
      );
    }
  }

  // Asymmetry interpretation
  if (analysis.asymmetryIndex) {
    if (analysis.asymmetryIndex > 0.3) {
      interpretations.push(
        'Significant asymmetry detected, suggests unilateral involvement'
      );
    } else if (analysis.asymmetryIndex < 0.1) {
      interpretations.push('Symmetric presentation, bilateral involvement');
    }
  }

  // Smoothness interpretation
  if (analysis.sparc) {
    if (analysis.sparc < -2.0) {
      interpretations.push('Reduced movement smoothness detected');
    } else {
      interpretations.push('Normal movement smoothness');
    }
  }

  // Overall severity
  if (analysis.overallScore) {
    if (analysis.overallScore >= 80) {
      interpretations.push('Mild impairment');
    } else if (analysis.overallScore >= 60) {
      interpretations.push('Moderate impairment');
    } else {
      interpretations.push('Severe impairment');
    }
  }

  return interpretations.join('. ');
}
```

### Compare Analyses Over Time

```typescript
async function compareAnalysesOverTime(
  patientId: string,
  startDate?: Date,
  endDate?: Date
) {
  const recordings = await prisma.recordingSession.findMany({
    where: {
      patientId,
      status: 'completed',
      deletedAt: null,
      recordingDate: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: { recordingDate: 'asc' },
    include: {
      clinicalAnalyses: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  const timeline = recordings.map((r) => ({
    date: r.recordingDate,
    recordingId: r.id,
    analysis: r.clinicalAnalyses[0] || null,
  }));

  // Calculate trends
  const metrics = timeline
    .filter((t) => t.analysis)
    .map((t) => ({
      date: t.date,
      tremorFrequency: t.analysis.tremorFrequency,
      tremorAmplitude: t.analysis.tremorAmplitude,
      asymmetryIndex: t.analysis.asymmetryIndex,
      overallScore: t.analysis.overallScore,
    }));

  const trends = calculateTrends(metrics);

  return {
    timeline,
    metrics,
    trends,
  };
}

function calculateTrends(metrics: any[]) {
  if (metrics.length < 2) return null;

  const first = metrics[0];
  const last = metrics[metrics.length - 1];

  return {
    tremorFrequency: {
      change: last.tremorFrequency - first.tremorFrequency,
      percentChange:
        ((last.tremorFrequency - first.tremorFrequency) / first.tremorFrequency) *
        100,
      trend:
        last.tremorFrequency > first.tremorFrequency ? 'increasing' : 'decreasing',
    },
    overallScore: {
      change: last.overallScore - first.overallScore,
      percentChange:
        ((last.overallScore - first.overallScore) / first.overallScore) * 100,
      trend: last.overallScore > first.overallScore ? 'improving' : 'declining',
    },
  };
}
```

---

## Protocol Management

### Create Protocol

```typescript
async function createProtocol(data: {
  name: string;
  description: string;
  version: string;
  configuration: {
    movements: Array<{
      name: string;
      duration: number;
      repetitions?: number;
      instructions: string;
    }>;
    requiredMetrics: string[];
    instructions: string;
    clinicalGuidelines: string;
  };
  indicatedFor: string;
  contraindications?: string;
  createdById: string;
  isPublic: boolean;
}) {
  const protocol = await prisma.protocol.create({
    data: {
      name: data.name,
      description: data.description,
      version: data.version,
      configuration: JSON.stringify(data.configuration),
      indicatedFor: data.indicatedFor,
      contraindications: data.contraindications,
      createdById: data.createdById,
      isPublic: data.isPublic,
      isActive: true,
    },
    include: {
      createdBy: {
        select: {
          firstName: true,
          lastName: true,
          specialty: true,
        },
      },
    },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      userId: data.createdById,
      action: 'CREATE',
      resource: 'Protocol',
      resourceId: protocol.id,
      details: JSON.stringify({ name: data.name }),
    },
  });

  return protocol;
}
```

### Get Available Protocols

```typescript
async function getAvailableProtocols(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error('User not found');
  }

  const protocols = await prisma.protocol.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      OR: [
        { isPublic: true },
        { createdById: userId },
      ],
    },
    orderBy: { createdAt: 'desc' },
    include: {
      createdBy: {
        select: {
          firstName: true,
          lastName: true,
          specialty: true,
        },
      },
      _count: {
        select: { recordings: true },
      },
    },
  });

  return protocols.map((p) => ({
    ...p,
    configuration: JSON.parse(p.configuration),
    usageCount: p._count.recordings,
  }));
}
```

---

## Reports & Comparisons

### Generate Clinical Report

```typescript
async function generateClinicalReport(recordingSessionId: string) {
  const recording = await prisma.recordingSession.findUnique({
    where: { id: recordingSessionId },
    include: {
      patient: true,
      clinician: true,
      protocol: true,
      clinicalAnalyses: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!recording) {
    throw new Error('Recording not found');
  }

  const analysis = recording.clinicalAnalyses[0];
  if (!analysis) {
    throw new Error('No analysis available');
  }

  // Generate PDF (implementation depends on PDF library)
  const pdfPath = `gs://handpose-reports/${recording.patientId}/${recordingSessionId}/clinical_report.pdf`;

  const report = await prisma.report.create({
    data: {
      recordingSessionId,
      reportType: 'clinical',
      title: `Clinical Assessment Report - ${recording.patient.firstName} ${recording.patient.lastName}`,
      summary: analysis.clinicalSummary,
      pdfPath,
      configuration: JSON.stringify({
        includedSections: [
          'patient_info',
          'recording_metadata',
          'tremor_analysis',
          'smoothness_metrics',
          'rom_measurements',
          'clinical_summary',
        ],
      }),
      generatedBy: 'system',
      version: '1.0',
      isShared: false,
    },
  });

  return report;
}
```

### Create Recording Comparison

```typescript
async function createRecordingComparison(
  baselineRecordingId: string,
  comparedRecordingId: string,
  comparisonType: string
) {
  // Get both analyses
  const [baselineAnalysis, comparedAnalysis] = await Promise.all([
    prisma.clinicalAnalysis.findFirst({
      where: { recordingSessionId: baselineRecordingId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.clinicalAnalysis.findFirst({
      where: { recordingSessionId: comparedRecordingId },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  if (!baselineAnalysis || !comparedAnalysis) {
    throw new Error('Analysis not found for one or both recordings');
  }

  // Calculate metric differences
  const differences = {
    tremorFrequency: {
      baseline: baselineAnalysis.tremorFrequency,
      compared: comparedAnalysis.tremorFrequency,
      absoluteChange:
        comparedAnalysis.tremorFrequency - baselineAnalysis.tremorFrequency,
      percentChange:
        ((comparedAnalysis.tremorFrequency - baselineAnalysis.tremorFrequency) /
          baselineAnalysis.tremorFrequency) *
        100,
    },
    overallScore: {
      baseline: baselineAnalysis.overallScore,
      compared: comparedAnalysis.overallScore,
      absoluteChange:
        comparedAnalysis.overallScore - baselineAnalysis.overallScore,
      percentChange:
        ((comparedAnalysis.overallScore - baselineAnalysis.overallScore) /
          baselineAnalysis.overallScore) *
        100,
    },
  };

  // Determine overall change
  const overallChange =
    differences.overallScore.absoluteChange > 5
      ? 'improved'
      : differences.overallScore.absoluteChange < -5
      ? 'declined'
      : 'stable';

  const comparison = await prisma.recordingComparison.create({
    data: {
      baselineRecordingId,
      comparedRecordingId,
      comparisonType,
      metricDifferences: JSON.stringify(differences),
      overallChange,
      changeScore: differences.overallScore.absoluteChange,
    },
  });

  return comparison;
}
```

---

## Analytics & Dashboards

### Clinician Dashboard

```typescript
async function getClinicianDashboard(clinicianId: string) {
  const [
    pendingReviews,
    recentRecordings,
    patientStats,
  ] = await Promise.all([
    // Recordings awaiting review
    prisma.recordingSession.findMany({
      where: {
        clinicianId,
        reviewStatus: 'pending',
        status: { in: ['analyzed', 'completed'] },
        deletedAt: null,
      },
      orderBy: { recordingDate: 'asc' },
      take: 10,
      include: {
        patient: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        protocol: {
          select: { name: true },
        },
      },
    }),

    // Recent recordings
    prisma.recordingSession.findMany({
      where: {
        clinicianId,
        deletedAt: null,
      },
      orderBy: { recordingDate: 'desc' },
      take: 10,
      include: {
        patient: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        clinicalAnalyses: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    }),

    // Patient statistics
    prisma.recordingSession.groupBy({
      by: ['patientId'],
      where: {
        clinicianId,
        deletedAt: null,
      },
      _count: {
        id: true,
      },
    }),
  ]);

  return {
    pendingReviews: {
      count: pendingReviews.length,
      recordings: pendingReviews,
    },
    recentRecordings,
    patientStats: {
      totalPatients: patientStats.length,
      totalRecordings: patientStats.reduce((sum, p) => sum + p._count.id, 0),
    },
  };
}
```

### Patient Dashboard

```typescript
async function getPatientDashboard(patientId: string) {
  const [recordings, latestAnalysis] = await Promise.all([
    // All recordings
    prisma.recordingSession.findMany({
      where: {
        patientId,
        deletedAt: null,
      },
      orderBy: { recordingDate: 'desc' },
      take: 10,
      include: {
        protocol: {
          select: { name: true },
        },
        clinicalAnalyses: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    }),

    // Latest complete analysis
    prisma.clinicalAnalysis.findFirst({
      where: {
        recordingSession: {
          patientId,
          status: 'completed',
          deletedAt: null,
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        recordingSession: {
          select: {
            recordingDate: true,
          },
        },
      },
    }),
  ]);

  // Extract trend data
  const trendData = recordings
    .filter((r) => r.clinicalAnalyses[0])
    .map((r) => ({
      date: r.recordingDate,
      overallScore: r.clinicalAnalyses[0].overallScore,
      tremorFrequency: r.clinicalAnalyses[0].tremorFrequency,
    }));

  return {
    recordings,
    latestAnalysis: latestAnalysis
      ? {
          ...latestAnalysis,
          frequencySpectrum: latestAnalysis.frequencySpectrum
            ? JSON.parse(latestAnalysis.frequencySpectrum)
            : null,
          severityScores: latestAnalysis.severityScores
            ? JSON.parse(latestAnalysis.severityScores)
            : null,
        }
      : null,
    trendData,
  };
}
```

---

## Advanced Queries

### Search Recordings

```typescript
async function searchRecordings(criteria: {
  patientName?: string;
  clinicianId?: string;
  protocolId?: string;
  status?: string;
  dateFrom?: Date;
  dateTo?: Date;
  minOverallScore?: number;
  maxOverallScore?: number;
}) {
  const where: any = {
    deletedAt: null,
  };

  // Patient name search
  if (criteria.patientName) {
    where.patient = {
      OR: [
        { firstName: { contains: criteria.patientName } },
        { lastName: { contains: criteria.patientName } },
      ],
    };
  }

  // Other filters
  if (criteria.clinicianId) where.clinicianId = criteria.clinicianId;
  if (criteria.protocolId) where.protocolId = criteria.protocolId;
  if (criteria.status) where.status = criteria.status;
  if (criteria.dateFrom || criteria.dateTo) {
    where.recordingDate = {};
    if (criteria.dateFrom) where.recordingDate.gte = criteria.dateFrom;
    if (criteria.dateTo) where.recordingDate.lte = criteria.dateTo;
  }

  const recordings = await prisma.recordingSession.findMany({
    where,
    include: {
      patient: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
      clinician: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
      protocol: {
        select: { name: true },
      },
      clinicalAnalyses: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  // Filter by score (post-query since it's in related table)
  let filtered = recordings;
  if (criteria.minOverallScore || criteria.maxOverallScore) {
    filtered = recordings.filter((r) => {
      const analysis = r.clinicalAnalyses[0];
      if (!analysis) return false;
      if (
        criteria.minOverallScore &&
        analysis.overallScore < criteria.minOverallScore
      )
        return false;
      if (
        criteria.maxOverallScore &&
        analysis.overallScore > criteria.maxOverallScore
      )
        return false;
      return true;
    });
  }

  return filtered;
}
```

---

These examples demonstrate the complete API integration patterns for the medical hand pose analysis platform. All queries follow best practices for:

- Performance optimization with strategic includes and selects
- Access control and security checks
- Proper error handling
- Audit logging
- JSON parsing for SQLite compatibility
- Transaction support where needed

For production use, wrap these in proper API endpoints with authentication, validation, and error handling middleware.
