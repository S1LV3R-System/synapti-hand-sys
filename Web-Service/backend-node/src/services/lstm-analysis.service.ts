// ============================================================================
// LSTM ANALYSIS SERVICE - Direct Python CLI Integration
// ============================================================================

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

export interface LSTMAnalysisConfig {
  inputCsv: string;
  outputDir: string;
  recordingId: string;
  patientId?: string;
  protocolJson?: string;
  fps?: number;
  adaptive?: boolean;
}

export interface LSTMAnalysisResult {
  success: boolean;
  recording_id: string;
  output_paths: {
    excel_report: string;
    plots: string;
    pdf_report: string;
    events_json: string;
    metrics_json: string;
  };
  event_summary: {
    [category: string]: {
      count: number;
      total_duration_seconds: number;
      avg_duration_seconds: number;
    };
  };
  lstm_events: Array<{
    category: string;
    event_type: string;
    label: string;
    start_frame: number;
    end_frame: number;
    duration_frames: number;
    duration_seconds: number;
    confidence: number;
    peak_confidence: number;
  }>;
  metrics: {
    [outputType: string]: {
      [metricName: string]: number | string;
    };
  };
  stats: {
    duration_seconds?: number;
    n_frames?: number;
    fps?: number;
  };
  error?: string;
}

class LSTMAnalysisService {
  private pythonScriptPath: string;
  private timeout: number;

  constructor() {
    // Path to Python backend integration script
    // Multiple paths to check for different environments
    const possiblePaths = [
      '/app/analysis-service/backend_integration.py',  // Docker absolute path
      path.join(__dirname, '../../analysis-service/backend_integration.py'),  // Docker from dist/services/
      path.join(__dirname, '../../../analysis-service/backend_integration.py'),  // Dev from src/services/
      path.resolve(process.cwd(), 'analysis-service/backend_integration.py'),  // From CWD
    ];

    this.pythonScriptPath = possiblePaths.find(p => fs.existsSync(p)) || possiblePaths[0];

    // Timeout: 10 minutes for analysis
    this.timeout = parseInt(process.env.LSTM_ANALYSIS_TIMEOUT || '600000');

    // Verify script exists
    if (!fs.existsSync(this.pythonScriptPath)) {
      console.error(`⚠️  LSTM analysis script not found: ${this.pythonScriptPath}`);
    } else {
      console.log(`✓ LSTM analysis service initialized: ${this.pythonScriptPath}`);
    }
  }

  /**
   * Run LSTM analysis on CSV keypoints
   */
  async analyzeCsv(config: LSTMAnalysisConfig): Promise<LSTMAnalysisResult> {
    console.log(`[LSTM] Starting analysis for recording: ${config.recordingId}`);

    // Build command
    const args = [
      'python3',
      this.pythonScriptPath,
      '--input', config.inputCsv,
      '--output', config.outputDir,
      '--recording-id', config.recordingId,
      '--json-output',  // Output JSON for parsing
    ];

    if (config.patientId) {
      args.push('--patient-id', config.patientId);
    }

    if (config.protocolJson) {
      args.push('--protocol', config.protocolJson);
    }

    if (config.fps) {
      args.push('--fps', config.fps.toString());
    }

    if (config.adaptive === false) {
      args.push('--no-adaptive');
    }

    const command = args.join(' ');

    try {
      console.log(`[LSTM] Executing: ${command}`);

      // Execute Python script with timeout
      const { stdout, stderr } = await execAsync(command, {
        timeout: this.timeout,
        maxBuffer: 10 * 1024 * 1024,  // 10MB buffer for large outputs
      });

      // Log any warnings from stderr
      if (stderr && stderr.trim()) {
        console.warn(`[LSTM] Warnings:\n${stderr}`);
      }

      // Parse JSON output
      const result: LSTMAnalysisResult = JSON.parse(stdout);

      if (result.success) {
        console.log(`[LSTM] ✓ Analysis complete: ${result.lstm_events.length} events detected`);
        console.log(`[LSTM] Event summary:`, result.event_summary);
      } else {
        console.error(`[LSTM] Analysis failed: ${result.error}`);
      }

      return result;

    } catch (error: any) {
      console.error(`[LSTM] Execution error:`, error);

      // Handle timeout
      if (error.killed && error.signal === 'SIGTERM') {
        throw new Error(`LSTM analysis timeout after ${this.timeout}ms`);
      }

      // Handle JSON parse errors
      if (error instanceof SyntaxError) {
        throw new Error(`Failed to parse LSTM analysis output: ${error.message}`);
      }

      // Handle execution errors
      throw new Error(
        `LSTM analysis failed: ${error.message}\nStderr: ${error.stderr || 'none'}`
      );
    }
  }

  /**
   * Check if LSTM analysis is available
   */
  async isAvailable(): Promise<boolean> {
    // Check if script exists
    if (!fs.existsSync(this.pythonScriptPath)) {
      return false;
    }

    try {
      // Try to run with --help to verify it works
      await execAsync(`python3 ${this.pythonScriptPath} --help`, {
        timeout: 5000,
      });
      return true;
    } catch (error) {
      console.error('[LSTM] Availability check failed:', error);
      return false;
    }
  }

  /**
   * Get separate plot files from output directory
   * The user mentioned "all of the plots are generated as separate png"
   */
  async getPlotFiles(outputDir: string): Promise<string[]> {
    try {
      const files = await fs.promises.readdir(outputDir);
      const plotFiles = files.filter(file =>
        file.endsWith('.png') && file !== 'Plots.png'
      );
      return plotFiles.map(file => path.join(outputDir, file));
    } catch (error) {
      console.error('[LSTM] Error reading plot files:', error);
      return [];
    }
  }
}

// Export singleton instance
export const lstmAnalysisService = new LSTMAnalysisService();
