"use strict";
// ============================================================================
// BULL QUEUE SERVICE FOR BACKGROUND PROCESSING
// ============================================================================
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.queueService = exports.JobType = void 0;
const bull_1 = __importDefault(require("bull"));
// Job types
var JobType;
(function (JobType) {
    JobType["VIDEO_PROCESSING"] = "video_processing";
    JobType["ANALYSIS_GENERATION"] = "analysis_generation";
    JobType["REPORT_GENERATION"] = "report_generation";
})(JobType || (exports.JobType = JobType = {}));
class QueueService {
    videoQueue;
    analysisQueue;
    reportQueue;
    constructor() {
        const redisConfig = {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD || undefined,
            db: parseInt(process.env.REDIS_DB || '0'),
        };
        // Initialize queues
        this.videoQueue = new bull_1.default('video-processing', {
            redis: redisConfig,
            defaultJobOptions: this.getDefaultJobOptions(),
        });
        this.analysisQueue = new bull_1.default('analysis-generation', {
            redis: redisConfig,
            defaultJobOptions: this.getDefaultJobOptions(),
        });
        this.reportQueue = new bull_1.default('report-generation', {
            redis: redisConfig,
            defaultJobOptions: this.getDefaultJobOptions(),
        });
        // Setup event handlers
        this.setupEventHandlers();
    }
    /**
     * Default job options with retry strategy
     */
    getDefaultJobOptions() {
        const maxRetries = parseInt(process.env.PROCESSING_MAX_RETRIES || '3');
        return {
            attempts: maxRetries,
            backoff: {
                type: 'exponential',
                delay: 2000, // Start with 2 seconds
            },
            removeOnComplete: false, // Keep completed jobs for tracking
            removeOnFail: false, // Keep failed jobs for debugging
        };
    }
    /**
     * Setup event handlers for job lifecycle
     */
    setupEventHandlers() {
        // Video processing queue events
        this.videoQueue.on('active', (job) => {
            console.log(`[VIDEO] Job ${job.id} started for recording ${job.data.recordingId}`);
        });
        this.videoQueue.on('completed', (job, result) => {
            console.log(`[VIDEO] Job ${job.id} completed for recording ${job.data.recordingId}`);
        });
        this.videoQueue.on('failed', (job, err) => {
            console.error(`[VIDEO] Job ${job.id} failed for recording ${job.data.recordingId}:`, err.message);
        });
        this.videoQueue.on('stalled', (job) => {
            console.warn(`[VIDEO] Job ${job.id} stalled for recording ${job.data.recordingId}`);
        });
        // Analysis queue events
        this.analysisQueue.on('active', (job) => {
            console.log(`[ANALYSIS] Job ${job.id} started for recording ${job.data.recordingId}`);
        });
        this.analysisQueue.on('completed', (job) => {
            console.log(`[ANALYSIS] Job ${job.id} completed for recording ${job.data.recordingId}`);
        });
        this.analysisQueue.on('failed', (job, err) => {
            console.error(`[ANALYSIS] Job ${job.id} failed:`, err.message);
        });
        // Report queue events
        this.reportQueue.on('active', (job) => {
            console.log(`[REPORT] Job ${job.id} started for recording ${job.data.recordingId}`);
        });
        this.reportQueue.on('completed', (job) => {
            console.log(`[REPORT] Job ${job.id} completed for recording ${job.data.recordingId}`);
        });
        this.reportQueue.on('failed', (job, err) => {
            console.error(`[REPORT] Job ${job.id} failed:`, err.message);
        });
    }
    /**
     * Add video processing job to queue
     */
    async addVideoProcessingJob(data, priority) {
        const job = await this.videoQueue.add(data, {
            priority: priority || 0,
            jobId: `video-${data.recordingId}`,
        });
        console.log(`Added video processing job ${job.id} for recording ${data.recordingId}`);
        return job;
    }
    /**
     * Add analysis generation job to queue
     */
    async addAnalysisJob(data, priority) {
        const job = await this.analysisQueue.add(data, {
            priority: priority || 0,
            jobId: `analysis-${data.recordingId}`,
        });
        console.log(`Added analysis job ${job.id} for recording ${data.recordingId}`);
        return job;
    }
    /**
     * Add report generation job to queue
     */
    async addReportJob(data, priority) {
        const job = await this.reportQueue.add(data, {
            priority: priority || 0,
            jobId: `report-${data.recordingId}`,
        });
        console.log(`Added report job ${job.id} for recording ${data.recordingId}`);
        return job;
    }
    /**
     * Get job status by ID
     */
    async getJobStatus(jobId, jobType) {
        let queue;
        switch (jobType) {
            case JobType.VIDEO_PROCESSING:
                queue = this.videoQueue;
                break;
            case JobType.ANALYSIS_GENERATION:
                queue = this.analysisQueue;
                break;
            case JobType.REPORT_GENERATION:
                queue = this.reportQueue;
                break;
            default:
                return null;
        }
        const job = await queue.getJob(jobId);
        if (!job) {
            return null;
        }
        const state = await job.getState();
        const progress = job.progress();
        return {
            jobId: job.id?.toString() || '',
            recordingId: job.data.recordingId,
            status: this.mapJobState(state),
            progress,
            startedAt: job.processedOn ? new Date(job.processedOn) : undefined,
            completedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
            error: job.failedReason,
            retryCount: job.attemptsMade,
        };
    }
    /**
     * Get all jobs for a recording
     */
    async getRecordingJobs(recordingId) {
        const statuses = [];
        // Check video queue
        const videoJobId = `video-${recordingId}`;
        const videoStatus = await this.getJobStatus(videoJobId, JobType.VIDEO_PROCESSING);
        if (videoStatus) {
            statuses.push(videoStatus);
        }
        // Check analysis queue
        const analysisJobId = `analysis-${recordingId}`;
        const analysisStatus = await this.getJobStatus(analysisJobId, JobType.ANALYSIS_GENERATION);
        if (analysisStatus) {
            statuses.push(analysisStatus);
        }
        // Check report queue
        const reportJobId = `report-${recordingId}`;
        const reportStatus = await this.getJobStatus(reportJobId, JobType.REPORT_GENERATION);
        if (reportStatus) {
            statuses.push(reportStatus);
        }
        return statuses;
    }
    /**
     * Map Bull job state to our status enum
     */
    mapJobState(state) {
        switch (state) {
            case 'waiting':
            case 'delayed':
                return 'queued';
            case 'active':
                return 'processing';
            case 'completed':
                return 'completed';
            case 'failed':
                return 'failed';
            default:
                return 'queued';
        }
    }
    /**
     * Cancel a job
     */
    async cancelJob(jobId, jobType) {
        let queue;
        switch (jobType) {
            case JobType.VIDEO_PROCESSING:
                queue = this.videoQueue;
                break;
            case JobType.ANALYSIS_GENERATION:
                queue = this.analysisQueue;
                break;
            case JobType.REPORT_GENERATION:
                queue = this.reportQueue;
                break;
            default:
                return false;
        }
        const job = await queue.getJob(jobId);
        if (job) {
            await job.remove();
            console.log(`Cancelled job ${jobId}`);
            return true;
        }
        return false;
    }
    /**
     * Get queue statistics
     */
    async getQueueStats() {
        const videoStats = await this.videoQueue.getJobCounts();
        const analysisStats = await this.analysisQueue.getJobCounts();
        const reportStats = await this.reportQueue.getJobCounts();
        return {
            video: videoStats,
            analysis: analysisStats,
            report: reportStats,
        };
    }
    /**
     * Clean old completed jobs
     */
    async cleanCompletedJobs(olderThanMs = 24 * 60 * 60 * 1000) {
        await this.videoQueue.clean(olderThanMs, 'completed');
        await this.analysisQueue.clean(olderThanMs, 'completed');
        await this.reportQueue.clean(olderThanMs, 'completed');
        console.log(`Cleaned completed jobs older than ${olderThanMs}ms`);
    }
    /**
     * Get queue instances (for worker registration)
     */
    getQueues() {
        return {
            videoQueue: this.videoQueue,
            analysisQueue: this.analysisQueue,
            reportQueue: this.reportQueue,
        };
    }
}
// Export singleton instance
exports.queueService = new QueueService();
