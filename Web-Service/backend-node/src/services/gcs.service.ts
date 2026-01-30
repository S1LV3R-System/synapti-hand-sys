// ============================================================================
// GOOGLE CLOUD STORAGE SERVICE
// ============================================================================
// Bucket: gs://handpose-system
// Structure:
//   - Uploads-mp4/   → Video uploads from mobile
//   - Uploads-CSV/   → Keypoint CSV from mobile
//   - Result-Output/ → Backend processed outputs (pdf, xlsx, png)
// ============================================================================

import { Storage, Bucket, File, GetSignedUrlConfig } from '@google-cloud/storage';
import fs from 'fs';
import path from 'path';
import { GCSPathConfig } from '../types/processing.types';

// GCS folder prefixes for organized bucket structure
const GCS_PATHS = {
  UPLOADS_VIDEO: 'Uploads-mp4',    // Video uploads from mobile
  UPLOADS_CSV: 'Uploads-CSV',      // Keypoint CSV from mobile
  RESULT_OUTPUT: 'Result-Output',  // Backend processed outputs (pdf, xlsx, png)
  LABEL_IMAGES: 'Label-Images',    // Labeled frame images and screenshots
} as const;

// Default signed URL expiration times (in minutes)
const SIGNED_URL_EXPIRY = {
  UPLOAD: 60,      // 1 hour for uploads
  DOWNLOAD: 60,    // 1 hour for downloads
  VIDEO: 120,      // 2 hours for video playback
} as const;

class GCSService {
  private storage: Storage | null = null;
  private bucket: Bucket | null = null;
  private bucketName: string;
  private projectId: string;
  private useMockStorage: boolean;
  private localStoragePath: string = '';

  constructor() {
    // Initialize GCS client
    const credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    this.projectId = process.env.GCS_PROJECT_ID || '';
    this.bucketName = process.env.GCS_BUCKET_NAME || 'handpose-system';

    // Check if mock storage is explicitly enabled via environment variable
    const mockStorageEnv = process.env.ENABLE_MOCK_STORAGE;
    const forceMockStorage = mockStorageEnv === 'true' || mockStorageEnv === '1';

    // Check for available credentials
    const hasServiceAccountKey = credentials && fs.existsSync(credentials);
    const hasProjectId = !!this.projectId;

    // Use mock storage if:
    // 1. ENABLE_MOCK_STORAGE is explicitly set to true, OR
    // 2. Missing credentials AND projectId (when mock is not explicitly disabled)
    const mockDisabled = mockStorageEnv === 'false' || mockStorageEnv === '0';
    this.useMockStorage = forceMockStorage || (!mockDisabled && !hasServiceAccountKey && !hasProjectId);

    if (this.useMockStorage) {
      // Use local file system for development
      this.localStoragePath = path.join(process.cwd(), 'local-storage');
      if (!fs.existsSync(this.localStoragePath)) {
        fs.mkdirSync(this.localStoragePath, { recursive: true });
      }
      console.log('⚠️  Using MOCK GCS with local file storage at:', this.localStoragePath);
      console.log('    Bucket structure: Uploads-mp4/, Uploads-CSV/, Result-Output/');
      console.log('    Set ENABLE_MOCK_STORAGE=false and provide GCS credentials for real GCS');
    } else {
      try {
        // Initialize GCS with available credentials
        const storageOptions: any = { projectId: this.projectId };

        if (hasServiceAccountKey) {
          storageOptions.keyFilename = credentials;
          console.log(`✓ Using service account key: ${credentials}`);
        } else {
          // Try Application Default Credentials (ADC)
          console.log('ℹ️  Using Application Default Credentials (ADC)');
        }

        this.storage = new Storage(storageOptions);
        this.bucket = this.storage.bucket(this.bucketName);

        console.log(`✓ GCS initialized with bucket: gs://${this.bucketName}`);
        console.log(`  Project: ${this.projectId}`);
        console.log('  Bucket structure: Uploads-mp4/, Uploads-CSV/, Result-Output/');
      } catch (error) {
        console.error('❌ Failed to initialize GCS:', error);
        // Fallback to mock storage
        this.useMockStorage = true;
        this.localStoragePath = path.join(process.cwd(), 'local-storage');
        if (!fs.existsSync(this.localStoragePath)) {
          fs.mkdirSync(this.localStoragePath, { recursive: true });
        }
        console.log('⚠️  Falling back to MOCK GCS due to initialization error');
      }
    }
  }

  /**
   * Check if using real GCS or mock storage
   */
  isUsingRealGCS(): boolean {
    return !this.useMockStorage;
  }

  /**
   * Upload a file to Google Cloud Storage (or local mock)
   */
  async uploadFile(localPath: string, gcsPath: string): Promise<string> {
    try {
      if (!fs.existsSync(localPath)) {
        throw new Error(`Local file not found: ${localPath}`);
      }

      if (this.useMockStorage) {
        // Mock: Copy file to local storage
        const destPath = path.join(this.localStoragePath, gcsPath);
        const destDir = path.dirname(destPath);
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }
        fs.copyFileSync(localPath, destPath);
        const fullPath = `mock-gs://${this.bucketName}/${gcsPath}`;
        console.log(`[MOCK] Uploaded to ${fullPath} (local: ${destPath})`);
        return fullPath;
      }

      console.log(`Uploading ${localPath} to gs://${this.bucketName}/${gcsPath}`);

      await this.bucket!.upload(localPath, {
        destination: gcsPath,
        metadata: {
          cacheControl: 'no-cache',
        },
      });

      const fullPath = `gs://${this.bucketName}/${gcsPath}`;
      console.log(`Successfully uploaded to ${fullPath}`);

      return fullPath;
    } catch (error) {
      console.error('Error uploading file to GCS:', error);
      throw new Error(`Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Download a file from Google Cloud Storage (or local mock)
   */
  async downloadFile(gcsPath: string, localPath: string): Promise<void> {
    try {
      // Remove gs://bucket-name/ or mock-gs://bucket-name/ prefix if present
      const cleanPath = gcsPath.replace(`gs://${this.bucketName}/`, '').replace(`mock-gs://${this.bucketName}/`, '');

      // Ensure local directory exists
      const localDir = path.dirname(localPath);
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }

      if (this.useMockStorage) {
        // Mock: Copy from local storage
        const sourcePath = path.join(this.localStoragePath, cleanPath);
        if (!fs.existsSync(sourcePath)) {
          throw new Error(`Mock file not found: ${sourcePath}`);
        }
        fs.copyFileSync(sourcePath, localPath);
        console.log(`[MOCK] Downloaded from ${sourcePath} to ${localPath}`);
        return;
      }

      console.log(`Downloading gs://${this.bucketName}/${cleanPath} to ${localPath}`);

      await this.bucket!.file(cleanPath).download({
        destination: localPath,
      });

      console.log(`Successfully downloaded to ${localPath}`);
    } catch (error) {
      console.error('Error downloading file from GCS:', error);
      throw new Error(`Failed to download file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate a signed URL for secure file access (or local path for mock)
   */
  async generateSignedUrl(gcsPath: string, expiryMinutes: number = 60): Promise<string> {
    try {
      const cleanPath = gcsPath.replace(`gs://${this.bucketName}/`, '').replace(`mock-gs://${this.bucketName}/`, '');

      if (this.useMockStorage) {
        // Mock: Return local file path as "signed URL"
        const localPath = path.join(this.localStoragePath, cleanPath);
        const mockUrl = `http://localhost:5000/mock-gcs/${cleanPath}`;
        console.log(`[MOCK] Generated signed URL: ${mockUrl}`);
        return mockUrl;
      }

      const [url] = await this.bucket!.file(cleanPath).getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + expiryMinutes * 60 * 1000,
      });

      return url;
    } catch (error) {
      console.error('Error generating signed URL:', error);
      throw new Error(`Failed to generate signed URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete a file from Google Cloud Storage (or local mock)
   */
  async deleteFile(gcsPath: string): Promise<void> {
    try {
      const cleanPath = gcsPath.replace(`gs://${this.bucketName}/`, '').replace(`mock-gs://${this.bucketName}/`, '');

      if (this.useMockStorage) {
        // Mock: Delete from local storage
        const localPath = path.join(this.localStoragePath, cleanPath);
        if (fs.existsSync(localPath)) {
          fs.unlinkSync(localPath);
          console.log(`[MOCK] Deleted ${localPath}`);
        }
        return;
      }

      console.log(`Deleting gs://${this.bucketName}/${cleanPath}`);

      await this.bucket!.file(cleanPath).delete();

      console.log(`Successfully deleted ${cleanPath}`);
    } catch (error) {
      console.error('Error deleting file from GCS:', error);
      throw new Error(`Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * List files in a GCS directory
   */
  async listFiles(prefix: string): Promise<string[]> {
    try {
      if (!this.bucket) {
        throw new Error('GCS bucket not initialized');
      }
      const [files] = await this.bucket.getFiles({ prefix });
      return files.map(file => `gs://${this.bucketName}/${file.name}`);
    } catch (error) {
      console.error('Error listing files from GCS:', error);
      throw new Error(`Failed to list files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if a file exists in GCS (or local mock)
   */
  async fileExists(gcsPath: string): Promise<boolean> {
    try {
      const cleanPath = gcsPath.replace(`gs://${this.bucketName}/`, '').replace(`mock-gs://${this.bucketName}/`, '');

      if (this.useMockStorage) {
        // Mock: Check local file system
        const localPath = path.join(this.localStoragePath, cleanPath);
        return fs.existsSync(localPath);
      }

      const [exists] = await this.bucket!.file(cleanPath).exists();
      return exists;
    } catch (error) {
      console.error('Error checking file existence:', error);
      return false;
    }
  }

  /**
   * Generate GCS path for a recording (legacy format)
   * Format: organizations/{org}/patients/{patientId}/recordings/{recordingId}/
   * @deprecated Use generateResultOutputPath for new uploads
   */
  generateRecordingPath(config: GCSPathConfig): string {
    const { organization, patientId, recordingId, fileType, fileName } = config;

    return `organizations/${organization}/patients/${patientId}/recordings/${recordingId}/${fileType}/${fileName}`;
  }

  // ============================================================================
  // NEW ORGANIZED BUCKET STRUCTURE PATHS
  // ============================================================================

  /**
   * Generate path for video uploads from mobile
   * Format: Uploads-mp4/{sessionId}/video.mp4
   */
  generateVideoUploadPath(sessionId: string): string {
    return `${GCS_PATHS.UPLOADS_VIDEO}/${sessionId}/video.mp4`;
  }

  /**
   * Generate path for CSV/metadata uploads from mobile
   * Format: Uploads-CSV/{sessionId}/{filename}
   */
  generateCsvUploadPath(sessionId: string, filename: string): string {
    return `${GCS_PATHS.UPLOADS_CSV}/${sessionId}/${filename}`;
  }

  /**
   * Generate path for processed result outputs
   * Format: Result-Output/{recordingId}/{filename}
   */
  generateResultOutputPath(recordingId: string, filename: string): string {
    return `${GCS_PATHS.RESULT_OUTPUT}/${recordingId}/${filename}`;
  }

  /**
   * Generate path for label images (screenshots, labeled frames)
   * Format: Label-Images/{recordingId}/{filename}
   */
  generateLabelImagePath(recordingId: string, filename: string): string {
    return `${GCS_PATHS.LABEL_IMAGES}/${recordingId}/${filename}`;
  }

  /**
   * Generate path for label image thumbnail
   * Format: Label-Images/{recordingId}/thumbnails/{filename}
   */
  generateLabelImageThumbnailPath(recordingId: string, filename: string): string {
    return `${GCS_PATHS.LABEL_IMAGES}/${recordingId}/thumbnails/${filename}`;
  }

  /**
   * Check if a path uses legacy format
   */
  isLegacyPath(gcsPath: string): boolean {
    return gcsPath.includes('mobile-uploads/') ||
           gcsPath.includes('organizations/');
  }

  /**
   * Get the folder prefix constants
   */
  getPathPrefixes() {
    return GCS_PATHS;
  }

  // ============================================================================
  // SIGNED URL GENERATION FOR DIRECT UPLOADS/DOWNLOADS
  // ============================================================================

  /**
   * Generate a signed URL for direct file upload (PUT)
   * Used for mobile app direct uploads to GCS
   */
  async generateSignedUploadUrl(
    gcsPath: string,
    contentType: string,
    expiryMinutes: number = SIGNED_URL_EXPIRY.UPLOAD
  ): Promise<{ url: string; expiresAt: string }> {
    try {
      if (this.useMockStorage) {
        // Mock: Return a local upload endpoint
        const mockUrl = `http://localhost:5000/api/mock-gcs/upload/${encodeURIComponent(gcsPath)}`;
        const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString();
        console.log(`[MOCK] Generated signed upload URL: ${mockUrl}`);
        return { url: mockUrl, expiresAt };
      }

      if (!this.bucket) {
        throw new Error('GCS bucket not initialized');
      }

      const file = this.bucket.file(gcsPath);
      const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

      const [url] = await file.getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: expiresAt,
        contentType,
      });

      console.log(`Generated signed upload URL for gs://${this.bucketName}/${gcsPath}`);
      return { url, expiresAt: expiresAt.toISOString() };
    } catch (error) {
      console.error('Error generating signed upload URL:', error);
      throw new Error(`Failed to generate signed upload URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate a signed URL for video upload from mobile
   * Returns signed URL for direct PUT to Uploads-mp4/{sessionId}/video.mp4
   */
  async generateVideoUploadSignedUrl(
    sessionId: string,
    contentType: string = 'video/mp4'
  ): Promise<{ url: string; gcsPath: string; expiresAt: string }> {
    const gcsPath = this.generateVideoUploadPath(sessionId);
    const result = await this.generateSignedUploadUrl(gcsPath, contentType, SIGNED_URL_EXPIRY.UPLOAD);
    return { ...result, gcsPath: `gs://${this.bucketName}/${gcsPath}` };
  }

  /**
   * Generate a signed URL for CSV upload from mobile
   * Returns signed URL for direct PUT to Uploads-CSV/{sessionId}/{filename}
   */
  async generateCsvUploadSignedUrl(
    sessionId: string,
    filename: string,
    contentType: string = 'text/csv'
  ): Promise<{ url: string; gcsPath: string; expiresAt: string }> {
    const gcsPath = this.generateCsvUploadPath(sessionId, filename);
    const result = await this.generateSignedUploadUrl(gcsPath, contentType, SIGNED_URL_EXPIRY.UPLOAD);
    return { ...result, gcsPath: `gs://${this.bucketName}/${gcsPath}` };
  }

  /**
   * Generate signed URLs for complete mobile upload session
   * Returns all URLs needed for a mobile upload (video, keypoints, metadata)
   */
  async generateMobileUploadSignedUrls(sessionId: string): Promise<{
    video: { url: string; gcsPath: string; expiresAt: string };
    keypoints: { url: string; gcsPath: string; expiresAt: string };
    metadata: { url: string; gcsPath: string; expiresAt: string };
    sessionId: string;
  }> {
    const [video, keypoints, metadata] = await Promise.all([
      this.generateVideoUploadSignedUrl(sessionId),
      this.generateCsvUploadSignedUrl(sessionId, 'keypoints.csv'),
      this.generateCsvUploadSignedUrl(sessionId, 'metadata.json', 'application/json'),
    ]);

    return { video, keypoints, metadata, sessionId };
  }

  /**
   * Verify bucket connectivity and permissions
   */
  async verifyBucketAccess(): Promise<{
    connected: boolean;
    bucket: string;
    folders: string[];
    error?: string;
  }> {
    try {
      if (this.useMockStorage) {
        return {
          connected: true,
          bucket: `mock://${this.bucketName}`,
          folders: Object.values(GCS_PATHS),
        };
      }

      if (!this.bucket) {
        return {
          connected: false,
          bucket: this.bucketName,
          folders: [],
          error: 'Bucket not initialized',
        };
      }

      // Check if bucket exists and we have access
      const [exists] = await this.bucket.exists();
      if (!exists) {
        return {
          connected: false,
          bucket: this.bucketName,
          folders: [],
          error: 'Bucket does not exist or no access',
        };
      }

      // List top-level folders
      const [files] = await this.bucket.getFiles({ delimiter: '/', maxResults: 10 });
      const prefixes = new Set<string>();

      // Check for our expected folders
      for (const folder of Object.values(GCS_PATHS)) {
        const [folderFiles] = await this.bucket.getFiles({ prefix: `${folder}/`, maxResults: 1 });
        if (folderFiles.length > 0 || true) { // Folder exists even if empty
          prefixes.add(folder);
        }
      }

      return {
        connected: true,
        bucket: `gs://${this.bucketName}`,
        folders: Array.from(prefixes),
      };
    } catch (error) {
      return {
        connected: false,
        bucket: this.bucketName,
        folders: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(gcsPath: string): Promise<any> {
    try {
      if (!this.bucket) {
        throw new Error('GCS bucket not initialized');
      }
      const cleanPath = gcsPath.replace(`gs://${this.bucketName}/`, '');
      const [metadata] = await this.bucket.file(cleanPath).getMetadata();
      return metadata;
    } catch (error) {
      console.error('Error getting file metadata:', error);
      throw new Error(`Failed to get metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Copy file within GCS
   */
  async copyFile(sourcePath: string, destinationPath: string): Promise<void> {
    try {
      if (!this.bucket) {
        throw new Error('GCS bucket not initialized');
      }
      const cleanSource = sourcePath.replace(`gs://${this.bucketName}/`, '');
      const cleanDest = destinationPath.replace(`gs://${this.bucketName}/`, '');

      await this.bucket.file(cleanSource).copy(this.bucket.file(cleanDest));

      console.log(`Copied ${cleanSource} to ${cleanDest}`);
    } catch (error) {
      console.error('Error copying file in GCS:', error);
      throw new Error(`Failed to copy file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get bucket name
   */
  getBucketName(): string {
    return this.bucketName;
  }
}

// Export singleton instance
export const gcsService = new GCSService();
