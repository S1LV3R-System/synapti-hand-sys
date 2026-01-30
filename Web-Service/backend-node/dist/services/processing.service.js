"use strict";
// ============================================================================
// PYTHON PROCESSING MICROSERVICE BRIDGE
// ============================================================================
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processingService = void 0;
const axios_1 = __importDefault(require("axios"));
class ProcessingService {
    client;
    serviceUrl;
    timeout;
    maxRetries;
    constructor() {
        this.serviceUrl = process.env.PROCESSING_SERVICE_URL || 'http://localhost:8000';
        this.timeout = parseInt(process.env.PROCESSING_TIMEOUT || '300000'); // 5 minutes
        this.maxRetries = parseInt(process.env.PROCESSING_MAX_RETRIES || '3');
        this.client = axios_1.default.create({
            baseURL: this.serviceUrl,
            timeout: this.timeout,
            headers: {
                'Content-Type': 'application/json',
            },
        });
        console.log(`Initialized Processing Service client: ${this.serviceUrl}`);
    }
    /**
     * Start video processing job
     */
    async startProcessing(videoPath, outputDir, configuration) {
        try {
            const request = {
                videoPath,
                outputDir,
                configuration,
            };
            console.log(`Starting processing for video: ${videoPath}`);
            const response = await this.client.post('/process', request);
            console.log(`Processing job started: ${response.data.jobId}`);
            return response.data;
        }
        catch (error) {
            console.error('Error starting processing:', error);
            throw new Error(`Failed to start processing: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Check processing status
     */
    async checkStatus(jobId) {
        try {
            const response = await this.client.get(`/status/${jobId}`);
            return response.data;
        }
        catch (error) {
            console.error(`Error checking status for job ${jobId}:`, error);
            throw new Error(`Failed to check status: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Poll for processing completion with timeout
     */
    async pollForCompletion(jobId, pollIntervalMs = 5000, maxWaitMs = 600000 // 10 minutes
    ) {
        const startTime = Date.now();
        while (true) {
            const status = await this.checkStatus(jobId);
            if (status.status === 'completed' || status.status === 'failed') {
                return status;
            }
            // Check timeout
            if (Date.now() - startTime > maxWaitMs) {
                throw new Error(`Processing timeout after ${maxWaitMs}ms`);
            }
            // Wait before next poll
            await this.sleep(pollIntervalMs);
        }
    }
    /**
     * Get processing results
     */
    async getResults(jobId) {
        try {
            console.log(`Fetching results for job: ${jobId}`);
            const response = await this.client.get(`/results/${jobId}`);
            console.log(`Successfully retrieved results for job: ${jobId}`);
            return response.data;
        }
        catch (error) {
            console.error(`Error getting results for job ${jobId}:`, error);
            throw new Error(`Failed to get results: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Process video and wait for completion (convenience method)
     */
    async processVideoAndWait(videoPath, outputDir, configuration) {
        try {
            // Start processing
            const startResponse = await this.startProcessing(videoPath, outputDir, configuration);
            // Poll for completion
            const statusResponse = await this.pollForCompletion(startResponse.jobId);
            if (statusResponse.status === 'failed') {
                throw new Error(`Processing failed: ${statusResponse.error}`);
            }
            // Get results
            const results = await this.getResults(startResponse.jobId);
            return results;
        }
        catch (error) {
            console.error('Error in processVideoAndWait:', error);
            throw error;
        }
    }
    /**
     * Cancel a processing job
     */
    async cancelJob(jobId) {
        try {
            await this.client.post(`/cancel/${jobId}`);
            console.log(`Cancelled job: ${jobId}`);
        }
        catch (error) {
            console.error(`Error cancelling job ${jobId}:`, error);
            throw new Error(`Failed to cancel job: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Health check for processing service
     */
    async healthCheck() {
        try {
            const response = await this.client.get('/health', {
                timeout: 5000,
            });
            return response.status === 200;
        }
        catch (error) {
            console.error('Processing service health check failed:', error);
            return false;
        }
    }
    /**
     * Get service statistics
     */
    async getStats() {
        try {
            const response = await this.client.get('/stats');
            return response.data;
        }
        catch (error) {
            console.error('Error getting processing service stats:', error);
            throw new Error(`Failed to get stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Retry wrapper for operations
     */
    async retry(operation, retries = this.maxRetries) {
        let lastError = null;
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                return await operation();
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error('Unknown error');
                console.warn(`Attempt ${attempt + 1} failed:`, lastError.message);
                if (attempt < retries - 1) {
                    // Exponential backoff
                    const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
                    await this.sleep(delay);
                }
            }
        }
        throw lastError || new Error('All retry attempts failed');
    }
}
// Export singleton instance
exports.processingService = new ProcessingService();
