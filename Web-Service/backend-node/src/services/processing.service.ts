// ============================================================================
// PYTHON PROCESSING MICROSERVICE BRIDGE
// ============================================================================

import axios, { AxiosInstance } from 'axios';
import {
  PythonProcessRequest,
  PythonProcessResponse,
  PythonStatusResponse,
  PythonResultsResponse,
  ProcessingConfiguration,
} from '../types/processing.types';

class ProcessingService {
  private client: AxiosInstance;
  private serviceUrl: string;
  private timeout: number;
  private maxRetries: number;

  constructor() {
    this.serviceUrl = process.env.PROCESSING_SERVICE_URL || 'http://localhost:8000';
    this.timeout = parseInt(process.env.PROCESSING_TIMEOUT || '300000'); // 5 minutes
    this.maxRetries = parseInt(process.env.PROCESSING_MAX_RETRIES || '3');

    this.client = axios.create({
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
  async startProcessing(
    videoPath: string,
    outputDir: string,
    configuration: ProcessingConfiguration
  ): Promise<PythonProcessResponse> {
    try {
      const request: PythonProcessRequest = {
        videoPath,
        outputDir,
        configuration,
      };

      console.log(`Starting processing for video: ${videoPath}`);

      const response = await this.client.post<PythonProcessResponse>('/process', request);

      console.log(`Processing job started: ${response.data.jobId}`);

      return response.data;
    } catch (error) {
      console.error('Error starting processing:', error);
      throw new Error(
        `Failed to start processing: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Check processing status
   */
  async checkStatus(jobId: string): Promise<PythonStatusResponse> {
    try {
      const response = await this.client.get<PythonStatusResponse>(`/status/${jobId}`);
      return response.data;
    } catch (error) {
      console.error(`Error checking status for job ${jobId}:`, error);
      throw new Error(
        `Failed to check status: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Poll for processing completion with timeout
   */
  async pollForCompletion(
    jobId: string,
    pollIntervalMs: number = 5000,
    maxWaitMs: number = 600000 // 10 minutes
  ): Promise<PythonStatusResponse> {
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
  async getResults(jobId: string): Promise<PythonResultsResponse> {
    try {
      console.log(`Fetching results for job: ${jobId}`);

      const response = await this.client.get<PythonResultsResponse>(`/results/${jobId}`);

      console.log(`Successfully retrieved results for job: ${jobId}`);

      return response.data;
    } catch (error) {
      console.error(`Error getting results for job ${jobId}:`, error);
      throw new Error(
        `Failed to get results: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Process video and wait for completion (convenience method)
   */
  async processVideoAndWait(
    videoPath: string,
    outputDir: string,
    configuration: ProcessingConfiguration
  ): Promise<PythonResultsResponse> {
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
    } catch (error) {
      console.error('Error in processVideoAndWait:', error);
      throw error;
    }
  }

  /**
   * Cancel a processing job
   */
  async cancelJob(jobId: string): Promise<void> {
    try {
      await this.client.post(`/cancel/${jobId}`);
      console.log(`Cancelled job: ${jobId}`);
    } catch (error) {
      console.error(`Error cancelling job ${jobId}:`, error);
      throw new Error(
        `Failed to cancel job: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Health check for processing service
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health', {
        timeout: 5000,
      });
      return response.status === 200;
    } catch (error) {
      console.error('Processing service health check failed:', error);
      return false;
    }
  }

  /**
   * Get service statistics
   */
  async getStats(): Promise<any> {
    try {
      const response = await this.client.get('/stats');
      return response.data;
    } catch (error) {
      console.error('Error getting processing service stats:', error);
      throw new Error(
        `Failed to get stats: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Retry wrapper for operations
   */
  private async retry<T>(
    operation: () => Promise<T>,
    retries: number = this.maxRetries
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        return await operation();
      } catch (error) {
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
export const processingService = new ProcessingService();
