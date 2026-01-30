import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { apiClient } from '../services/api.service';
import { CheckCircle, XCircle, Loader2, Mail } from 'lucide-react';

type VerificationState = 'loading' | 'success' | 'error' | 'no-token';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [state, setState] = useState<VerificationState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [resendEmail, setResendEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setState('no-token');
      return;
    }

    verifyEmail();
  }, [token]);

  const verifyEmail = async () => {
    try {
      await apiClient.post('/auth/verify-email', { token });
      setState('success');
    } catch (error: any) {
      setState('error');
      setErrorMessage(error.response?.data?.message || 'Email verification failed');
    }
  };

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail) return;

    setResending(true);
    try {
      await apiClient.post('/auth/resend-verification', { email: resendEmail });
      setResendSuccess(true);
    } catch (error) {
      // Still show success to prevent email enumeration
      setResendSuccess(true);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Logo */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-blue-600">SynaptiHand</h1>
          <p className="mt-2 text-sm text-gray-600">Hand Pose Detection & Analysis Platform</p>
        </div>

        {/* Verification Status */}
        <div className="bg-white shadow rounded-lg p-8">
          {state === 'loading' && (
            <div className="text-center">
              <Loader2 className="mx-auto h-12 w-12 text-blue-600 animate-spin" />
              <h2 className="mt-4 text-xl font-semibold text-gray-900">Verifying your email...</h2>
              <p className="mt-2 text-gray-600">Please wait while we verify your email address.</p>
            </div>
          )}

          {state === 'success' && (
            <div className="text-center">
              <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
              <h2 className="mt-4 text-xl font-semibold text-gray-900">Email Verified!</h2>
              <p className="mt-2 text-gray-600">
                Your email has been verified successfully. Your account is now pending administrator approval.
              </p>
              <p className="mt-4 text-sm text-gray-500">
                You will receive an email notification once your account has been approved.
              </p>
              <Link
                to="/login"
                className="mt-6 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
              >
                Go to Login
              </Link>
            </div>
          )}

          {state === 'error' && (
            <div className="text-center">
              <XCircle className="mx-auto h-12 w-12 text-red-500" />
              <h2 className="mt-4 text-xl font-semibold text-gray-900">Verification Failed</h2>
              <p className="mt-2 text-gray-600">{errorMessage}</p>
              <p className="mt-4 text-sm text-gray-500">
                The verification link may have expired or already been used.
              </p>

              {/* Resend Form */}
              <div className="mt-6 border-t pt-6">
                <h3 className="text-sm font-medium text-gray-900">Request a new verification email</h3>
                {resendSuccess ? (
                  <p className="mt-2 text-sm text-green-600">
                    If an account with that email exists, a verification email has been sent.
                  </p>
                ) : (
                  <form onSubmit={handleResend} className="mt-4">
                    <input
                      type="email"
                      value={resendEmail}
                      onChange={(e) => setResendEmail(e.target.value)}
                      placeholder="Enter your email"
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="submit"
                      disabled={resending}
                      className="mt-3 w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                    >
                      {resending ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        'Resend Verification Email'
                      )}
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}

          {state === 'no-token' && (
            <div className="text-center">
              <Mail className="mx-auto h-12 w-12 text-gray-400" />
              <h2 className="mt-4 text-xl font-semibold text-gray-900">Email Verification</h2>
              <p className="mt-2 text-gray-600">
                No verification token provided. Please use the link from your verification email.
              </p>

              {/* Resend Form */}
              <div className="mt-6 border-t pt-6">
                <h3 className="text-sm font-medium text-gray-900">Didn't receive an email?</h3>
                {resendSuccess ? (
                  <p className="mt-2 text-sm text-green-600">
                    If an account with that email exists, a verification email has been sent.
                  </p>
                ) : (
                  <form onSubmit={handleResend} className="mt-4">
                    <input
                      type="email"
                      value={resendEmail}
                      onChange={(e) => setResendEmail(e.target.value)}
                      placeholder="Enter your email"
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="submit"
                      disabled={resending}
                      className="mt-3 w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                    >
                      {resending ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        'Send Verification Email'
                      )}
                    </button>
                  </form>
                )}
              </div>

              <div className="mt-6">
                <Link to="/login" className="text-sm text-blue-600 hover:text-blue-500">
                  Back to Login
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
