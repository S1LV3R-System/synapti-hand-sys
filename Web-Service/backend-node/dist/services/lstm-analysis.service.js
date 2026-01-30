"use strict";
// ============================================================================
// LSTM ANALYSIS SERVICE - Direct Python CLI Integration
// ============================================================================
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.lstmAnalysisService = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class LSTMAnalysisService {
    pythonScriptPath;
    timeout;
    constructor() {
        // Path to Python backend integration script
        this.pythonScriptPath = path_1.default.join(__dirname, '../../../analysis-service/backend_integration.py');
        // Timeout: 10 minutes for analysis
        this.timeout = parseInt(process.env.LSTM_ANALYSIS_TIMEOUT || '600000');
        // Verify script exists
        if (!fs_1.default.existsSync(this.pythonScriptPath)) {
            console.error(`⚠️  LSTM analysis script not found: ${this.pythonScriptPath}`);
        }
        else {
            console.log(`✓ LSTM analysis service initialized: ${this.pythonScriptPath}`);
        }
    }
    /**
     * Run LSTM analysis on CSV keypoints
     */
    async analyzeCsv(config) {
        console.log(`[LSTM] Starting analysis for recording: ${config.recordingId}`);
        // Build command
        const args = [
            'python3',
            this.pythonScriptPath,
            '--input', config.inputCsv,
            '--output', config.outputDir,
            '--recording-id', config.recordingId,
            '--json-output', // Output JSON for parsing
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
                maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large outputs
            });
            // Log any warnings from stderr
            if (stderr && stderr.trim()) {
                console.warn(`[LSTM] Warnings:\n${stderr}`);
            }
            // Parse JSON output
            const result = JSON.parse(stdout);
            if (result.success) {
                console.log(`[LSTM] ✓ Analysis complete: ${result.lstm_events.length} events detected`);
                console.log(`[LSTM] Event summary:`, result.event_summary);
            }
            else {
                console.error(`[LSTM] Analysis failed: ${result.error}`);
            }
            return result;
        }
        catch (error) {
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
            throw new Error(`LSTM analysis failed: ${error.message}\nStderr: ${error.stderr || 'none'}`);
        }
    }
    /**
     * Check if LSTM analysis is available
     */
    async isAvailable() {
        // Check if script exists
        if (!fs_1.default.existsSync(this.pythonScriptPath)) {
            return false;
        }
        try {
            // Try to run with --help to verify it works
            await execAsync(`python3 ${this.pythonScriptPath} --help`, {
                timeout: 5000,
            });
            return true;
        }
        catch (error) {
            console.error('[LSTM] Availability check failed:', error);
            return false;
        }
    }
    /**
     * Get separate plot files from output directory
     * The user mentioned "all of the plots are generated as separate png"
     */
    async getPlotFiles(outputDir) {
        try {
            const files = await fs_1.default.promises.readdir(outputDir);
            const plotFiles = files.filter(file => file.endsWith('.png') && file !== 'Plots.png');
            return plotFiles.map(file => path_1.default.join(outputDir, file));
        }
        catch (error) {
            console.error('[LSTM] Error reading plot files:', error);
            return [];
        }
    }
}
// Export singleton instance
exports.lstmAnalysisService = new LSTMAnalysisService();
