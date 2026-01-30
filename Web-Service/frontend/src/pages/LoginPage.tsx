import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useLogin } from '../hooks/useAuth';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { authService } from '../services/authService';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const navigate = useNavigate();
  const { mutate: login, isPending, error } = useLogin();

  // Redirect if already authenticated
  useEffect(() => {
    if (authService.isAuthenticated()) {
      navigate('/dashboard');
    }
  }, [navigate]);

  // Update error message when mutation fails
  useEffect(() => {
    if (error) {
      setErrorMessage(error.message || 'Login failed. Please check your credentials.');
    }
  }, [error]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    login(
      { email, password },
      {
        onSuccess: () => {
          navigate('/dashboard');
        },
        onError: (err: any) => {
          setErrorMessage(err.message || 'Login failed. Please check your credentials.');
        },
      }
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="flex flex-col items-center">
          {/* Logo */}
          <img
            src="/logo-full-400.png"
            alt="SynaptiHand Logo"
            className="h-40 w-auto mb-4"
          />
          <h2 className="text-center text-2xl font-bold text-secondary-700">
            Sign in to your account
          </h2>
        </div>

        <div className="bg-white rounded-lg shadow-card p-8">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {errorMessage && (
              <ErrorMessage
                title="Authentication Failed"
                message={errorMessage}
                onDismiss={() => setErrorMessage('')}
              />
            )}

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-secondary-700 mb-1"
                >
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="appearance-none relative block w-full px-3 py-2 border border-secondary-300 placeholder-secondary-400 text-secondary-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isPending}
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-secondary-700 mb-1"
                >
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="appearance-none relative block w-full px-3 py-2 border border-secondary-300 placeholder-secondary-400 text-secondary-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isPending}
                />
              </div>
            </div>

            <div>
              <Button
                type="submit"
                fullWidth
                isLoading={isPending}
                disabled={isPending}
              >
                {isPending ? 'Signing in...' : 'Sign in'}
              </Button>
            </div>

            <div className="text-sm text-center">
              <span className="text-secondary-600">Don't have an account? </span>
              <Link to="/register" className="font-medium text-primary-600 hover:text-primary-500">
                Create Account
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
