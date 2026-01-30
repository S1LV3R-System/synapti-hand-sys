import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { StatusBadge } from '../../components/StatusBadge';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { ErrorMessage } from '../../components/ErrorMessage';
import { useRecording, useRecordingStatus } from '../../hooks/useRecordings';

export const RecordingDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showVideo, setShowVideo] = useState(false);

  // Fetch recording details
  const { data: recording, isLoading, error } = useRecording(id!);

  // Poll for status if processing
  const shouldPoll = recording?.status === 'processing' || recording?.status === 'uploaded';
  const { data: status } = useRecordingStatus(id!, shouldPoll);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !recording) {
    return (
      <div className="p-6">
        <ErrorMessage
          message="Failed to load recording details"
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  const currentStatus = status?.status || recording.status;
  const progressPercent = status?.progress || recording.progress || 0;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/recordings')}
          className="text-blue-600 hover:text-blue-800 flex items-center mb-4"
        >
          <svg className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Recordings
        </button>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Recording Details</h1>
            <p className="mt-2 text-gray-600 font-mono text-sm">ID: {recording.id}</p>
          </div>
          <StatusBadge status={currentStatus} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Video Player */}
          <Card>
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Video</h2>

              {recording.videoPath ? (
                <div className="bg-gray-900 rounded-lg overflow-hidden">
                  {showVideo ? (
                    <video
                      controls
                      className="w-full"
                      src={recording.videoPath}
                      poster="/video-placeholder.svg"
                    >
                      Your browser does not support the video tag.
                    </video>
                  ) : (
                    <div
                      className="aspect-video flex items-center justify-center cursor-pointer hover:bg-gray-800 transition-colors"
                      onClick={() => setShowVideo(true)}
                    >
                      <div className="text-center">
                        <svg
                          className="h-16 w-16 text-white mx-auto mb-2"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                        </svg>
                        <p className="text-white text-sm">Click to load video</p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center">
                  <div className="text-center text-gray-500">
                    <svg
                      className="h-12 w-12 mx-auto mb-2"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                    <p>Video not available</p>
                  </div>
                </div>
              )}

              {/* Processing Status */}
              {currentStatus === 'processing' && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Processing video...</span>
                    <span className="text-sm text-gray-600">{progressPercent}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    This may take a few minutes. The page will update automatically.
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* Clinical Notes */}
          {recording.clinicalNotes && (
            <Card>
              <div className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Clinical Notes</h2>
                <p className="text-gray-700 whitespace-pre-wrap">{recording.clinicalNotes}</p>
              </div>
            </Card>
          )}

          {/* Analysis Results */}
          {currentStatus === 'analyzed' && recording.analyses && recording.analyses.length > 0 && (
            <Card>
              <div className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">Analysis Results</h2>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => navigate(`/analysis/${recording.id}`)}
                  >
                    View Full Analysis
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {recording.analyses[0]?.tremorFrequency && (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-600">Tremor Frequency</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {recording.analyses[0].tremorFrequency.toFixed(2)} Hz
                      </p>
                    </div>
                  )}
                  {recording.analyses[0]?.tremorAmplitude && (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-600">Tremor Amplitude</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {recording.analyses[0].tremorAmplitude.toFixed(2)} mm
                      </p>
                    </div>
                  )}
                  {recording.analyses[0]?.coordinationScore && (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-600">Coordination Score</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {recording.analyses[0].coordinationScore.toFixed(1)}/100
                      </p>
                    </div>
                  )}
                  {recording.analyses[0]?.overallScore && (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-600">Overall Score</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {recording.analyses[0].overallScore.toFixed(1)}/100
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Recording Information */}
          <Card>
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Information</h2>
              <dl className="space-y-3">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Date</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {new Date(recording.recordingDate).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </dd>
                </div>

                {recording.duration && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Duration</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {Math.floor(recording.duration / 60)}:{String(recording.duration % 60).padStart(2, '0')}
                    </dd>
                  </div>
                )}

                {recording.fps && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Frame Rate</dt>
                    <dd className="mt-1 text-sm text-gray-900">{recording.fps} FPS</dd>
                  </div>
                )}

                <div>
                  <dt className="text-sm font-medium text-gray-500">Uploaded</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {new Date(recording.createdAt).toLocaleString()}
                  </dd>
                </div>
              </dl>
            </div>
          </Card>

          {/* Patient Information */}
          {recording.patient && (
            <Card>
              <div className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Patient</h2>
                <dl className="space-y-3">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Name</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {recording.patient.firstName} {recording.patient.lastName}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">MRN</dt>
                    <dd className="mt-1 text-sm text-gray-900 font-mono">{recording.patient.mrn}</dd>
                  </div>
                  {recording.patient.dateOfBirth && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Date of Birth</dt>
                      <dd className="mt-1 text-sm text-gray-900">
                        {new Date(recording.patient.dateOfBirth).toLocaleDateString()}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            </Card>
          )}

          {/* Protocol Information */}
          {recording.protocol && (
            <Card>
              <div className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Protocol</h2>
                <p className="text-sm text-gray-900 font-medium">{recording.protocol.name}</p>
                {recording.protocol.description && (
                  <p className="mt-2 text-sm text-gray-600">{recording.protocol.description}</p>
                )}
              </div>
            </Card>
          )}

          {/* Actions */}
          <Card>
            <div className="p-6 space-y-3">
              <Button
                variant="primary"
                fullWidth
                onClick={() => navigate(`/analysis/${recording.id}`)}
                disabled={currentStatus !== 'analyzed'}
              >
                View Analysis
              </Button>

              <Button
                variant="secondary"
                fullWidth
                onClick={() => navigate(`/annotations/${recording.id}`)}
                disabled={currentStatus !== 'analyzed'}
              >
                Add Annotation
              </Button>

              <Button
                variant="secondary"
                fullWidth
                onClick={() => {
                  // Download video
                  if (recording.videoPath) {
                    window.open(recording.videoPath, '_blank');
                  }
                }}
                disabled={!recording.videoPath}
              >
                Download Video
              </Button>

              <Button
                variant="error"
                fullWidth
                onClick={() => {
                  if (confirm('Are you sure you want to delete this recording?')) {
                    // Handle delete
                    navigate('/recordings');
                  }
                }}
              >
                Delete Recording
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default RecordingDetail;
