import { useState } from 'react';
import { apiClient } from '../services/api.service';
import { useNavigate, Link } from 'react-router-dom';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const response = await apiClient.post('/auth/login', { email, password });
            // Save auth state (token is handled by interceptor)
            if (response.data?.token) {
                localStorage.setItem('token', response.data.token);
            }
            localStorage.setItem('user', email);
            navigate('/dashboard');
        } catch (err: any) {
            if (err.response?.status === 403) {
                setError('Account waiting for approval');
            } else {
                setError('Invalid credentials');
            }
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100">
            <div className="px-8 py-6 mt-4 text-left bg-white shadow-lg rounded-xl">
                <h3 className="text-2xl font-bold text-center text-gray-900">Login to SynaptiHand</h3>
                <form onSubmit={handleLogin}>
                    <div className="mt-4">
                        <div>
                            <label className="block" htmlFor="email">Email</label>
                            <input
                                type="text"
                                placeholder="Email"
                                className="w-full px-4 py-2 mt-2 border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-600"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div className="mt-4">
                            <label className="block">Password</label>
                            <input
                                type="password"
                                placeholder="Password"
                                className="w-full px-4 py-2 mt-2 border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-600"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
                        <div className="flex items-baseline justify-between">
                            <button type="submit" className="px-6 py-2 mt-4 text-white bg-blue-600 rounded-lg hover:bg-blue-900">Login</button>
                        </div>
                        <div className="mt-4 text-center">
                            <Link to="/register" className="text-sm text-blue-600 hover:underline">Create Account</Link>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default Login;
