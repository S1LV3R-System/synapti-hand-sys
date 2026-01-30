import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileUpload } from '../../components/FileUpload';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { useUploadVideo } from '../../hooks/useRecordings';

export const RecordingUpload: React.FC = () => {
  const navigate = useNavigate();
  const { mutate: uploadVideo, isPending, error } = useUploadVideo();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [formData, setFormData] = useState({
    patientId: '',
    protocolId: '',
    clinicalNotes: '',
    deviceType: 'webcam',
    deviceModel: '',
    resolution: '1920x1080',
    frameRate: 30,
  });

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedFile) {
      alert('Please select a video file');
      return;
    }

    if (!formData.patientId) {
      alert('Please enter Patient ID');
      return;
    }

    uploadVideo(
      {
        file: selectedFile,
        metadata: {
          patientId: formData.patientId,
          protocolId: formData.protocolId || undefined,
          clinicalNotes: formData.clinicalNotes || undefined,
          deviceInfo: {
            deviceType: formData.deviceType,
            model: formData.deviceModel || undefined,
            resolution: formData.resolution,
            frameRate: formData.frameRate,
          },
        },
        onProgress: (percentage) => {
          setUploadProgress(percentage);
        },
      },
      {
        onSuccess: (data) => {
          // Navigate to recording detail page
          navigate(`/recordings/${data.recordingId}`);
        },
      }
    );
  };

  const handleCancel = () => {
    navigate('/recordings');
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Upload Recording</h1>
        <p className="mt-2 text-gray-600">
          Upload a video recording for hand pose analysis
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Video File Upload */}
        <Card>
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Video File</h2>
            <FileUpload
              onFileSelect={handleFileSelect}
              accept="video/mp4,video/avi,video/quicktime"
              maxSize={500 * 1024 * 1024}
              disabled={isPending}
            />
          </div>
        </Card>

        {/* Patient Information */}
        <Card>
          <div className="p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Patient Information</h2>

            <div>
              <label htmlFor="patientId" className="block text-sm font-medium text-gray-700 mb-1">
                Patient ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="patientId"
                name="patientId"
                value={formData.patientId}
                onChange={handleInputChange}
                required
                disabled={isPending}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter patient UUID or MRN"
              />
              <p className="mt-1 text-xs text-gray-500">
                Enter the patient's unique identifier
              </p>
            </div>

            <div>
              <label htmlFor="protocolId" className="block text-sm font-medium text-gray-700 mb-1">
                Protocol ID (Optional)
              </label>
              <input
                type="text"
                id="protocolId"
                name="protocolId"
                value={formData.protocolId}
                onChange={handleInputChange}
                disabled={isPending}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter protocol UUID"
              />
              <p className="mt-1 text-xs text-gray-500">
                Select an assessment protocol for this recording
              </p>
            </div>

            <div>
              <label htmlFor="clinicalNotes" className="block text-sm font-medium text-gray-700 mb-1">
                Clinical Notes (Optional)
              </label>
              <textarea
                id="clinicalNotes"
                name="clinicalNotes"
                value={formData.clinicalNotes}
                onChange={handleInputChange}
                disabled={isPending}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter any relevant clinical notes or observations"
              />
            </div>
          </div>
        </Card>

        {/* Device Information */}
        <Card>
          <div className="p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Recording Device</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="deviceType" className="block text-sm font-medium text-gray-700 mb-1">
                  Device Type
                </label>
                <select
                  id="deviceType"
                  name="deviceType"
                  value={formData.deviceType}
                  onChange={handleInputChange}
                  disabled={isPending}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="webcam">Webcam</option>
                  <option value="smartphone">Smartphone</option>
                  <option value="tablet">Tablet</option>
                  <option value="professional-camera">Professional Camera</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label htmlFor="deviceModel" className="block text-sm font-medium text-gray-700 mb-1">
                  Device Model (Optional)
                </label>
                <input
                  type="text"
                  id="deviceModel"
                  name="deviceModel"
                  value={formData.deviceModel}
                  onChange={handleInputChange}
                  disabled={isPending}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Logitech C920"
                />
              </div>

              <div>
                <label htmlFor="resolution" className="block text-sm font-medium text-gray-700 mb-1">
                  Resolution
                </label>
                <select
                  id="resolution"
                  name="resolution"
                  value={formData.resolution}
                  onChange={handleInputChange}
                  disabled={isPending}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="640x480">640x480 (VGA)</option>
                  <option value="1280x720">1280x720 (HD)</option>
                  <option value="1920x1080">1920x1080 (Full HD)</option>
                  <option value="2560x1440">2560x1440 (2K)</option>
                  <option value="3840x2160">3840x2160 (4K)</option>
                </select>
              </div>

              <div>
                <label htmlFor="frameRate" className="block text-sm font-medium text-gray-700 mb-1">
                  Frame Rate (FPS)
                </label>
                <input
                  type="number"
                  id="frameRate"
                  name="frameRate"
                  value={formData.frameRate}
                  onChange={handleInputChange}
                  disabled={isPending}
                  min="15"
                  max="120"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Upload Progress */}
        {isPending && (
          <Card>
            <div className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Uploading...</span>
                <span className="text-sm text-gray-600">{uploadProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Please wait while we upload your video...
              </p>
            </div>
          </Card>
        )}

        {/* Error Display */}
        {error && (
          <ErrorMessage
            message={error instanceof Error ? error.message : 'Upload failed'}
            onRetry={() => handleSubmit(new Event('submit') as any)}
          />
        )}

        {/* Action Buttons */}
        <div className="flex justify-end space-x-4">
          <Button
            type="button"
            variant="secondary"
            onClick={handleCancel}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!selectedFile || isPending}
          >
            {isPending ? (
              <span className="flex items-center">
                <LoadingSpinner />
                <span className="ml-2">Uploading...</span>
              </span>
            ) : (
              'Upload Recording'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default RecordingUpload;
