import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiClient } from '../services/api.service';
import { clinicalService } from '../services/data.service';
import { Video, Download, PlayCircle, Edit2, X, FileText, BarChart3, Activity, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import type { LSTMEvent, LSTMEventsResponse, ComprehensiveAnalysisResponse } from '../types/api.types';

interface Patient {
    id: string;
    patientId: string;
    patientName: string;
    gender?: string;
    dateOfBirth?: string;
    height?: number;
    weight?: number;
    diagnosis?: string;
}

interface Analysis {
    id?: string;
    tremorFrequency?: number;
    tremorAmplitude?: number;
    sparc?: number;
    overallScore?: number;
    severity?: string;
}

interface Recording {
    id: string;
    createdAt: string;
    videoPath?: string;
    csvPath?: string;
    xlsxPath?: string;
    pdfPath?: string;
    plotsPath?: string;
    status: string;
    analyses?: Analysis[];
}

const PatientDetailPage = () => {
    const { id } = useParams();
    const [patient, setPatient] = useState<Patient | null>(null);
    const [recordings, setRecordings] = useState<Recording[]>([]);
    const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
    const [loading, setLoading] = useState(true);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editForm, setEditForm] = useState({
        firstName: '',
        middleName: '',
        lastName: '',
        gender: '',
        dateOfBirth: '',
        height: '',
        weight: '',
        diagnosis: ''
    });
    const [saving, setSaving] = useState(false);

    // Analysis state
    const [lstmEvents, setLstmEvents] = useState<LSTMEventsResponse | null>(null);
    const [comprehensiveAnalysis, setComprehensiveAnalysis] = useState<ComprehensiveAnalysisResponse | null>(null);
    const [analysisLoading, setAnalysisLoading] = useState(false);
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
        lstmEvents: true,
        movementAnalysis: true,
        reports: true
    });

    useEffect(() => {
        fetchPatient();
        fetchRecordings();
    }, [id]);

    // Fetch analysis data when a recording is selected
    useEffect(() => {
        if (selectedRecording?.id) {
            fetchAnalysisData(selectedRecording.id);
        }
    }, [selectedRecording?.id]);

    const fetchPatient = async () => {
        try {
            const res = await apiClient.get(`/patients/${id}`);
            setPatient(res.data);
        } catch (error) {
            console.error('Error fetching patient:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchRecordings = async () => {
        try {
            const res = await apiClient.get(`/patients/${id}/recordings`);
            const recordingsList = res.data || [];
            setRecordings(recordingsList);
            // Auto-select the latest recording if available
            if (recordingsList.length > 0 && !selectedRecording) {
                setSelectedRecording(recordingsList[0]);
            }
        } catch (error) {
            console.error('Error fetching recordings:', error);
        }
    };

    const fetchAnalysisData = async (recordingId: string) => {
        setAnalysisLoading(true);
        try {
            const [lstm, comprehensive] = await Promise.all([
                clinicalService.getLSTMEvents(recordingId),
                clinicalService.getComprehensiveAnalysis(recordingId)
            ]);
            setLstmEvents(lstm);
            setComprehensiveAnalysis(comprehensive);
        } catch (error) {
            console.error('Error fetching analysis data:', error);
        } finally {
            setAnalysisLoading(false);
        }
    };

    const openEditModal = () => {
        if (patient) {
            // Parse patientName into firstName, middleName, lastName
            const nameParts = (patient.patientName || '').trim().split(' ');
            const firstName = nameParts[0] || '';
            const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';
            const middleName = nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : '';

            setEditForm({
                firstName,
                middleName,
                lastName,
                gender: patient.gender || '',
                dateOfBirth: patient.dateOfBirth ? patient.dateOfBirth.split('T')[0] : '',
                height: patient.height?.toString() || '',
                weight: patient.weight?.toString() || '',
                diagnosis: patient.diagnosis || ''
            });
            setShowEditModal(true);
        }
    };

    const handleSavePatient = async () => {
        if (!patient) return;
        setSaving(true);
        try {
            await apiClient.put(`/patients/${patient.id}`, {
                firstName: editForm.firstName,
                middleName: editForm.middleName || null,
                lastName: editForm.lastName,
                gender: editForm.gender || null,
                birthDate: editForm.dateOfBirth || null,
                height: editForm.height ? parseFloat(editForm.height) : null,
                weight: editForm.weight ? parseFloat(editForm.weight) : null,
                diagnosis: editForm.diagnosis || null
            });
            setShowEditModal(false);
            fetchPatient(); // Refresh patient data
        } catch (error) {
            console.error('Error updating patient:', error);
            alert('Failed to update patient');
        } finally {
            setSaving(false);
        }
    };

    const getAnalysisMetrics = (analysis?: Analysis) => {
        if (!analysis) return null;
        return {
            tremorFrequency: analysis.tremorFrequency?.toFixed(2) || '-',
            tremorAmplitude: analysis.tremorAmplitude?.toFixed(2) || '-',
            sparc: analysis.sparc?.toFixed(2) || '-',
            overallScore: analysis.overallScore?.toFixed(2) || '-',
            severity: analysis.severity || 'Unknown'
        };
    };

    const toggleSection = (section: string) => {
        setExpandedSections(prev => ({
            ...prev,
            [section]: !prev[section]
        }));
    };

    const getCategoryColor = (category: string) => {
        switch (category) {
            case 'WRIST': return 'bg-purple-100 text-purple-800';
            case 'FINGER': return 'bg-blue-100 text-blue-800';
            case 'POSTURE': return 'bg-green-100 text-green-800';
            case 'STATE': return 'bg-orange-100 text-orange-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const formatDuration = (seconds: number) => {
        if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`;
        return `${seconds.toFixed(2)}s`;
    };

    if (loading) return <div className="p-8 text-center">Loading...</div>;
    if (!patient) return <div className="p-8 text-center text-red-600">Patient not found</div>;

    const metrics = getAnalysisMetrics(selectedRecording?.analyses?.[0]);

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <div className="mb-6">
                <Link to="/user-dashboard" className="text-blue-600 hover:underline mb-4 inline-block">&larr; Back to Dashboard</Link>
                <div className="flex items-center justify-between">
                    <h1 className="text-3xl font-bold text-gray-800">{patient.patientName} <span className="text-gray-500 text-lg">({patient.patientId})</span></h1>
                    <button
                        onClick={openEditModal}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                    >
                        <Edit2 size={16} /> Edit Patient
                    </button>
                </div>
                <div className="mt-2 text-gray-600 grid grid-cols-2 md:grid-cols-5 gap-4 bg-white p-4 rounded shadow">
                    <div><span className="font-semibold">Gender:</span> {patient.gender || '-'}</div>
                    <div><span className="font-semibold">DOB:</span> {patient.dateOfBirth ? new Date(patient.dateOfBirth).toLocaleDateString() : '-'}</div>
                    <div><span className="font-semibold">Height:</span> {patient.height ? `${patient.height} cm` : '-'}</div>
                    <div><span className="font-semibold">Weight:</span> {patient.weight ? `${patient.weight} kg` : '-'}</div>
                    <div><span className="font-semibold">Diagnosis:</span> {patient.diagnosis || '-'}</div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Video Player Section */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white p-6 rounded-lg shadow">
                        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                            <Video size={20} /> Recording Playback
                        </h2>

                        {selectedRecording && selectedRecording.videoPath ? (
                            <div className="space-y-4">
                                <div className="bg-black aspect-video rounded-lg overflow-hidden flex items-center justify-center">
                                    <video
                                        key={selectedRecording.id}
                                        controls
                                        className="w-full h-full object-contain"
                                        src={selectedRecording.videoPath}
                                    />
                                </div>
                                <div className="space-y-2 text-sm">
                                    <p><span className="font-semibold">Recording Date:</span> {new Date(selectedRecording.createdAt).toLocaleString()}</p>
                                    <p><span className="font-semibold">Status:</span> <span className="inline-block px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">{selectedRecording.status}</span></p>
                                    <div className="flex flex-wrap gap-3">
                                        {selectedRecording.videoPath && (
                                            <a href={selectedRecording.videoPath} download target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition">
                                                <Download size={16} /> Video
                                            </a>
                                        )}
                                        {selectedRecording.csvPath && (
                                            <a href={selectedRecording.csvPath} download target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition">
                                                <Download size={16} /> CSV
                                            </a>
                                        )}
                                        {selectedRecording.xlsxPath && (
                                            <a href={selectedRecording.xlsxPath} download target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition">
                                                <FileText size={16} /> Excel Report
                                            </a>
                                        )}
                                        {selectedRecording.pdfPath && (
                                            <a href={selectedRecording.pdfPath} download target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition">
                                                <FileText size={16} /> PDF Report
                                            </a>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center">
                                <p className="text-gray-500">No recording selected</p>
                            </div>
                        )}
                    </div>

                    {/* LSTM Event Analysis Section */}
                    {selectedRecording && (
                        <div className="bg-white p-6 rounded-lg shadow">
                            <button
                                onClick={() => toggleSection('lstmEvents')}
                                className="w-full flex items-center justify-between text-xl font-semibold mb-4"
                            >
                                <span className="flex items-center gap-2">
                                    <Activity size={20} /> LSTM Event Detection
                                </span>
                                {expandedSections.lstmEvents ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                            </button>

                            {expandedSections.lstmEvents && (
                                <>
                                    {analysisLoading ? (
                                        <div className="text-center py-8 text-gray-500">
                                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                                            Loading analysis...
                                        </div>
                                    ) : lstmEvents && lstmEvents.events.length > 0 ? (
                                        <div className="space-y-4">
                                            {/* Event Summary */}
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                {Object.entries(lstmEvents.summary).map(([category, summary]) => (
                                                    <div key={category} className={`p-3 rounded-lg ${getCategoryColor(category)}`}>
                                                        <div className="font-semibold text-sm">{category}</div>
                                                        <div className="text-2xl font-bold">{summary.count}</div>
                                                        <div className="text-xs">
                                                            Total: {formatDuration(summary.total_duration_seconds)}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Recording Stats */}
                                            {lstmEvents.stats && (
                                                <div className="flex gap-4 text-sm text-gray-600 bg-gray-50 p-3 rounded">
                                                    <span>Duration: {lstmEvents.stats.duration_seconds?.toFixed(1)}s</span>
                                                    <span>Frames: {lstmEvents.stats.n_frames}</span>
                                                    <span>FPS: {lstmEvents.stats.fps}</span>
                                                </div>
                                            )}

                                            {/* Events Timeline */}
                                            <div className="max-h-64 overflow-y-auto">
                                                <table className="w-full text-sm">
                                                    <thead className="bg-gray-50 sticky top-0">
                                                        <tr>
                                                            <th className="text-left p-2">Category</th>
                                                            <th className="text-left p-2">Event</th>
                                                            <th className="text-left p-2">Duration</th>
                                                            <th className="text-left p-2">Confidence</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {lstmEvents.events.slice(0, 50).map((event: LSTMEvent, idx: number) => (
                                                            <tr key={idx} className="border-b hover:bg-gray-50">
                                                                <td className="p-2">
                                                                    <span className={`px-2 py-0.5 rounded text-xs ${getCategoryColor(event.category)}`}>
                                                                        {event.category}
                                                                    </span>
                                                                </td>
                                                                <td className="p-2 font-medium">{event.label}</td>
                                                                <td className="p-2">{formatDuration(event.duration_seconds)}</td>
                                                                <td className="p-2">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-16 bg-gray-200 rounded-full h-2">
                                                                            <div
                                                                                className="bg-blue-600 h-2 rounded-full"
                                                                                style={{ width: `${event.confidence * 100}%` }}
                                                                            />
                                                                        </div>
                                                                        <span className="text-xs">{(event.confidence * 100).toFixed(0)}%</span>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                                {lstmEvents.events.length > 50 && (
                                                    <p className="text-center text-gray-500 text-sm py-2">
                                                        Showing 50 of {lstmEvents.events.length} events
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center py-8 text-gray-500">
                                            No LSTM analysis available for this recording
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {/* Movement Analysis Section */}
                    {selectedRecording && comprehensiveAnalysis && comprehensiveAnalysis.movementAnalysis.length > 0 && (
                        <div className="bg-white p-6 rounded-lg shadow">
                            <button
                                onClick={() => toggleSection('movementAnalysis')}
                                className="w-full flex items-center justify-between text-xl font-semibold mb-4"
                            >
                                <span className="flex items-center gap-2">
                                    <BarChart3 size={20} /> Movement Analysis
                                </span>
                                {expandedSections.movementAnalysis ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                            </button>

                            {expandedSections.movementAnalysis && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {comprehensiveAnalysis.movementAnalysis.map((analysis) => (
                                        <div key={analysis.id} className="border rounded-lg p-4">
                                            <h4 className="font-semibold text-sm mb-2">{analysis.movementName}</h4>
                                            <p className="text-xs text-gray-500 mb-2">Type: {analysis.outputType}</p>
                                            {analysis.metrics && (
                                                <div className="space-y-1 text-sm">
                                                    {Object.entries(analysis.metrics).slice(0, 5).map(([key, value]) => (
                                                        <div key={key} className="flex justify-between">
                                                            <span className="text-gray-600">{key}:</span>
                                                            <span className="font-medium">
                                                                {typeof value === 'number' ? value.toFixed(3) : value}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            {analysis.plotPath && (
                                                <a
                                                    href={analysis.plotPath}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="mt-2 inline-flex items-center gap-1 text-blue-600 text-xs hover:underline"
                                                >
                                                    View Plot <ExternalLink size={12} />
                                                </a>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Analysis Results & Recording List */}
                <div className="space-y-6">
                    {/* Analysis Metrics */}
                    {selectedRecording && metrics && (
                        <div className="bg-white p-6 rounded-lg shadow">
                            <h3 className="text-lg font-semibold mb-4">Analysis Results</h3>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center py-2 border-b">
                                    <span className="text-gray-600">Tremor Frequency (Hz)</span>
                                    <span className="font-semibold">{metrics.tremorFrequency}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b">
                                    <span className="text-gray-600">Tremor Amplitude</span>
                                    <span className="font-semibold">{metrics.tremorAmplitude}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b">
                                    <span className="text-gray-600">SPARC Score</span>
                                    <span className="font-semibold">{metrics.sparc}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b">
                                    <span className="text-gray-600">Overall Score</span>
                                    <span className="font-semibold">{metrics.overallScore}</span>
                                </div>
                                <div className="flex justify-between items-center py-2">
                                    <span className="text-gray-600">Severity</span>
                                    <span className={`font-semibold px-3 py-1 rounded-full text-xs ${
                                        metrics.severity === 'Mild' ? 'bg-green-100 text-green-800' :
                                        metrics.severity === 'Moderate' ? 'bg-yellow-100 text-yellow-800' :
                                        metrics.severity === 'Severe' ? 'bg-red-100 text-red-800' :
                                        'bg-gray-100 text-gray-800'
                                    }`}>
                                        {metrics.severity}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Analysis Summary Card */}
                    {selectedRecording && comprehensiveAnalysis && (
                        <div className="bg-white p-6 rounded-lg shadow">
                            <h3 className="text-lg font-semibold mb-4">Analysis Summary</h3>
                            <div className="space-y-3 text-sm">
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-600">LSTM Analysis</span>
                                    <span className={`px-2 py-1 rounded text-xs ${
                                        comprehensiveAnalysis.summary.hasLstmAnalysis
                                            ? 'bg-green-100 text-green-700'
                                            : 'bg-gray-100 text-gray-500'
                                    }`}>
                                        {comprehensiveAnalysis.summary.hasLstmAnalysis ? 'Available' : 'Not Available'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-600">Movement Analysis</span>
                                    <span className={`px-2 py-1 rounded text-xs ${
                                        comprehensiveAnalysis.summary.hasMovementAnalysis
                                            ? 'bg-green-100 text-green-700'
                                            : 'bg-gray-100 text-gray-500'
                                    }`}>
                                        {comprehensiveAnalysis.summary.hasMovementAnalysis ? 'Available' : 'Not Available'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-600">Total Events Detected</span>
                                    <span className="font-semibold">{comprehensiveAnalysis.summary.totalEvents}</span>
                                </div>
                                {comprehensiveAnalysis.summary.analysisDate && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-gray-600">Analysis Date</span>
                                        <span className="text-xs">
                                            {new Date(comprehensiveAnalysis.summary.analysisDate).toLocaleDateString()}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Recordings List */}
                    <div className="bg-white p-6 rounded-lg shadow">
                        <h3 className="text-lg font-semibold mb-4">Recording Sessions ({recordings.length})</h3>
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                            {recordings.length === 0 ? (
                                <p className="text-gray-500 text-center py-4">No recordings available</p>
                            ) : (
                                recordings.map(rec => (
                                    <button
                                        key={rec.id}
                                        onClick={() => setSelectedRecording(rec)}
                                        className={`w-full text-left p-3 rounded-lg border-2 transition ${
                                            selectedRecording?.id === rec.id
                                                ? 'border-blue-500 bg-blue-50'
                                                : 'border-gray-200 hover:border-gray-300 bg-white'
                                        }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <PlayCircle size={16} className="mt-1 flex-shrink-0 text-blue-600" />
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-sm truncate">Recording #{rec.id.slice(0, 8)}</p>
                                                <p className="text-xs text-gray-500">{new Date(rec.createdAt).toLocaleDateString()}</p>
                                                <span className="inline-block mt-1 text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">
                                                    {rec.status}
                                                </span>
                                            </div>
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Edit Patient Modal */}
            {showEditModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
                        <div className="flex items-center justify-between p-4 border-b">
                            <h2 className="text-xl font-semibold">Edit Patient</h2>
                            <button onClick={() => setShowEditModal(false)} className="text-gray-500 hover:text-gray-700">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-4 space-y-4">
                            {/* First Name, Middle Name, Last Name */}
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                                    <input
                                        type="text"
                                        value={editForm.firstName}
                                        onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Middle Name</label>
                                    <input
                                        type="text"
                                        value={editForm.middleName}
                                        onChange={(e) => setEditForm({ ...editForm, middleName: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                                    <input
                                        type="text"
                                        value={editForm.lastName}
                                        onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            </div>

                            {/* Gender, Date of Birth */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                                    <select
                                        value={editForm.gender}
                                        onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">Select...</option>
                                        <option value="male">Male</option>
                                        <option value="female">Female</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                                    <input
                                        type="date"
                                        value={editForm.dateOfBirth}
                                        onChange={(e) => setEditForm({ ...editForm, dateOfBirth: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            </div>

                            {/* Height, Weight */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Height (cm)</label>
                                    <input
                                        type="number"
                                        value={editForm.height}
                                        onChange={(e) => setEditForm({ ...editForm, height: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Weight (kg)</label>
                                    <input
                                        type="number"
                                        value={editForm.weight}
                                        onChange={(e) => setEditForm({ ...editForm, weight: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            </div>

                            {/* Diagnosis */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Diagnosis</label>
                                <input
                                    type="text"
                                    value={editForm.diagnosis}
                                    onChange={(e) => setEditForm({ ...editForm, diagnosis: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="e.g., Parkinson's, Essential Tremor"
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 p-4 border-t">
                            <button
                                onClick={() => setShowEditModal(false)}
                                className="px-4 py-2 text-gray-600 hover:text-gray-800"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSavePatient}
                                disabled={saving}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                                {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PatientDetailPage;
