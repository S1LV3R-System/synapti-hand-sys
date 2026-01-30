import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';


/**
 * Get user dashboard statistics
 * Returns counts of projects, patients, recordings, and recent activity
 */
export async function getUserStats(req: AuthRequest, res: Response) {
  try {
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    // For admin, show all data; for others, show only their own
    const isAdmin = userRole === 'admin';

    // Get project IDs the user has access to
    const projectAccess = isAdmin
      ? await prisma.project.findMany({
          where: { deletedAt: null },
          select: { id: true }
        })
      : await prisma.project.findMany({
          where: {
            deletedAt: null,
            OR: [
              { ownerId: userId },
              { members: { some: { userId } } }
            ]
          },
          select: { id: true }
        });

    const projectIds = projectAccess.map(p => p.id);

    // Count projects
    const projectsCount = projectIds.length;

    // Count patients in accessible projects
    const patientsCount = await prisma.patient.count({
      where: {
        deletedAt: null,
        projectId: { in: projectIds }
      }
    });

    // Count recordings in accessible projects
    const recordingsCount = await prisma.experimentSession.count({
      where: {
        deletedAt: null,
        projectId: { in: projectIds }
      }
    });

    // Count pending analysis recordings
    const pendingAnalysisCount = await prisma.experimentSession.count({
      where: {
        deletedAt: null,
        projectId: { in: projectIds },
        status: { in: ['uploaded', 'processing'] }
      }
    });

    // Get recent recordings with patient info
    const recentRecordings = await prisma.experimentSession.findMany({
      where: {
        deletedAt: null,
        projectId: { in: projectIds }
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        patientModel: {
          select: {
            id: true,
            patientId: true,
            patientName: true,
            diagnosis: true
          }
        },
        project: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    // Get diagnosis distribution for comparison feature
    const diagnosisStats = await prisma.patient.groupBy({
      by: ['diagnosis'],
      where: {
        deletedAt: null,
        projectId: { in: projectIds },
        diagnosis: { not: null }
      },
      _count: { id: true }
    });

    return res.json({
      success: true,
      data: {
        projects: projectsCount,
        patients: patientsCount,
        recordings: recordingsCount,
        pendingAnalysis: pendingAnalysisCount,
        recentRecordings: recentRecordings.map(r => ({
          id: r.id,
          status: r.status,
          createdAt: r.createdAt,
          patient: r.patientModel ? {
            id: r.patientModel.id,
            patientId: r.patientModel.patientId,
            patientName: r.patientModel.patientName,
            diagnosis: r.patientModel.diagnosis
          } : null,
          project: r.project ? {
            id: r.project.id,
            name: r.project.name
          } : null
        })),
        diagnosisGroups: diagnosisStats.map(d => ({
          diagnosis: d.diagnosis,
          count: d._count.id
        }))
      }
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get user statistics'
    });
  }
}

/**
 * Get diagnosis-based comparison data
 * Aggregates metrics across patients with the same diagnosis
 */
export async function getDiagnosisComparison(req: AuthRequest, res: Response) {
  try {
    const userId = req.user!.userId;
    const userRole = req.user!.role;
    const { diagnosis } = req.query;

    const isAdmin = userRole === 'admin';

    // Get accessible project IDs
    const projectAccess = isAdmin
      ? await prisma.project.findMany({
          where: { deletedAt: null },
          select: { id: true }
        })
      : await prisma.project.findMany({
          where: {
            deletedAt: null,
            OR: [
              { ownerId: userId },
              { members: { some: { userId } } }
            ]
          },
          select: { id: true }
        });

    const projectIds = projectAccess.map(p => p.id);

    // Build patient filter
    const patientFilter: any = {
      deletedAt: null,
      projectId: { in: projectIds }
    };

    if (diagnosis && diagnosis !== 'all') {
      patientFilter.diagnosis = diagnosis as string;
    } else {
      patientFilter.diagnosis = { not: null };
    }

    // Get patients with their recordings and analysis
    const patients = await prisma.patient.findMany({
      where: patientFilter,
      include: {
        recordings: {
          where: { deletedAt: null },
          include: {
            clinicalAnalyses: {
              orderBy: { createdAt: 'desc' },
              take: 1
            }
          }
        },
        project: {
          select: { name: true, ownerId: true }
        }
      }
    });

    // Aggregate metrics by diagnosis group
    const diagnosisGroups: Record<string, {
      diagnosis: string;
      patientCount: number;
      recordingCount: number;
      metrics: {
        tremorFrequency: number[];
        tremorAmplitude: number[];
        sparc: number[];
      };
    }> = {};

    for (const patient of patients) {
      const diag = patient.diagnosis || 'undiagnosed';

      if (!diagnosisGroups[diag]) {
        diagnosisGroups[diag] = {
          diagnosis: diag,
          patientCount: 0,
          recordingCount: 0,
          metrics: {
            tremorFrequency: [],
            tremorAmplitude: [],
            sparc: []
          }
        };
      }

      diagnosisGroups[diag].patientCount++;
      diagnosisGroups[diag].recordingCount += patient.recordings.length;

      // Collect metrics from analyses
      for (const recording of patient.recordings) {
        for (const analysis of recording.clinicalAnalyses) {
          if (analysis.tremorFrequency != null) {
            diagnosisGroups[diag].metrics.tremorFrequency.push(analysis.tremorFrequency);
          }
          if (analysis.tremorAmplitude != null) {
            diagnosisGroups[diag].metrics.tremorAmplitude.push(analysis.tremorAmplitude);
          }
          if (analysis.sparc != null) {
            diagnosisGroups[diag].metrics.sparc.push(analysis.sparc);
          }
        }
      }
    }

    // Calculate statistics for each group
    const comparisonData = Object.values(diagnosisGroups).map(group => {
      const calcStats = (arr: number[]) => {
        if (arr.length === 0) return null;
        const sorted = [...arr].sort((a, b) => a - b);
        const sum = arr.reduce((a, b) => a + b, 0);
        return {
          min: sorted[0],
          max: sorted[sorted.length - 1],
          mean: sum / arr.length,
          median: sorted[Math.floor(sorted.length / 2)],
          count: arr.length
        };
      };

      return {
        diagnosis: group.diagnosis,
        patientCount: group.patientCount,
        recordingCount: group.recordingCount,
        metrics: {
          tremorFrequency: calcStats(group.metrics.tremorFrequency),
          tremorAmplitude: calcStats(group.metrics.tremorAmplitude),
          sparc: calcStats(group.metrics.sparc)
        }
      };
    });

    // Get all available diagnoses for filter
    const availableDiagnoses = await prisma.patient.findMany({
      where: {
        deletedAt: null,
        projectId: { in: projectIds },
        diagnosis: { not: null }
      },
      select: { diagnosis: true },
      distinct: ['diagnosis']
    });

    return res.json({
      success: true,
      data: {
        comparison: comparisonData,
        availableDiagnoses: availableDiagnoses.map(d => d.diagnosis).filter(Boolean),
        totalPatients: patients.length,
        isAdminView: isAdmin
      }
    });
  } catch (error) {
    console.error('Get diagnosis comparison error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get diagnosis comparison data'
    });
  }
}
