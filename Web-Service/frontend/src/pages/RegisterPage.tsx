import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api.service';

// Comprehensive country codes list - South Korea first as default
const countryCodes = [
    // Default - South Korea
    { code: '+82', country: 'South Korea', flag: '🇰🇷' },
    // Major countries alphabetically
    { code: '+93', country: 'Afghanistan', flag: '🇦🇫' },
    { code: '+355', country: 'Albania', flag: '🇦🇱' },
    { code: '+213', country: 'Algeria', flag: '🇩🇿' },
    { code: '+376', country: 'Andorra', flag: '🇦🇩' },
    { code: '+244', country: 'Angola', flag: '🇦🇴' },
    { code: '+54', country: 'Argentina', flag: '🇦🇷' },
    { code: '+374', country: 'Armenia', flag: '🇦🇲' },
    { code: '+61', country: 'Australia', flag: '🇦🇺' },
    { code: '+43', country: 'Austria', flag: '🇦🇹' },
    { code: '+994', country: 'Azerbaijan', flag: '🇦🇿' },
    { code: '+973', country: 'Bahrain', flag: '🇧🇭' },
    { code: '+880', country: 'Bangladesh', flag: '🇧🇩' },
    { code: '+375', country: 'Belarus', flag: '🇧🇾' },
    { code: '+32', country: 'Belgium', flag: '🇧🇪' },
    { code: '+501', country: 'Belize', flag: '🇧🇿' },
    { code: '+229', country: 'Benin', flag: '🇧🇯' },
    { code: '+975', country: 'Bhutan', flag: '🇧🇹' },
    { code: '+591', country: 'Bolivia', flag: '🇧🇴' },
    { code: '+387', country: 'Bosnia', flag: '🇧🇦' },
    { code: '+267', country: 'Botswana', flag: '🇧🇼' },
    { code: '+55', country: 'Brazil', flag: '🇧🇷' },
    { code: '+673', country: 'Brunei', flag: '🇧🇳' },
    { code: '+359', country: 'Bulgaria', flag: '🇧🇬' },
    { code: '+226', country: 'Burkina Faso', flag: '🇧🇫' },
    { code: '+257', country: 'Burundi', flag: '🇧🇮' },
    { code: '+855', country: 'Cambodia', flag: '🇰🇭' },
    { code: '+237', country: 'Cameroon', flag: '🇨🇲' },
    { code: '+1', country: 'Canada', flag: '🇨🇦' },
    { code: '+238', country: 'Cape Verde', flag: '🇨🇻' },
    { code: '+236', country: 'Central African Republic', flag: '🇨🇫' },
    { code: '+235', country: 'Chad', flag: '🇹🇩' },
    { code: '+56', country: 'Chile', flag: '🇨🇱' },
    { code: '+86', country: 'China', flag: '🇨🇳' },
    { code: '+57', country: 'Colombia', flag: '🇨🇴' },
    { code: '+269', country: 'Comoros', flag: '🇰🇲' },
    { code: '+242', country: 'Congo', flag: '🇨🇬' },
    { code: '+243', country: 'DR Congo', flag: '🇨🇩' },
    { code: '+506', country: 'Costa Rica', flag: '🇨🇷' },
    { code: '+385', country: 'Croatia', flag: '🇭🇷' },
    { code: '+53', country: 'Cuba', flag: '🇨🇺' },
    { code: '+357', country: 'Cyprus', flag: '🇨🇾' },
    { code: '+420', country: 'Czech Republic', flag: '🇨🇿' },
    { code: '+45', country: 'Denmark', flag: '🇩🇰' },
    { code: '+253', country: 'Djibouti', flag: '🇩🇯' },
    { code: '+593', country: 'Ecuador', flag: '🇪🇨' },
    { code: '+20', country: 'Egypt', flag: '🇪🇬' },
    { code: '+503', country: 'El Salvador', flag: '🇸🇻' },
    { code: '+240', country: 'Equatorial Guinea', flag: '🇬🇶' },
    { code: '+291', country: 'Eritrea', flag: '🇪🇷' },
    { code: '+372', country: 'Estonia', flag: '🇪🇪' },
    { code: '+268', country: 'Eswatini', flag: '🇸🇿' },
    { code: '+251', country: 'Ethiopia', flag: '🇪🇹' },
    { code: '+679', country: 'Fiji', flag: '🇫🇯' },
    { code: '+358', country: 'Finland', flag: '🇫🇮' },
    { code: '+33', country: 'France', flag: '🇫🇷' },
    { code: '+241', country: 'Gabon', flag: '🇬🇦' },
    { code: '+220', country: 'Gambia', flag: '🇬🇲' },
    { code: '+995', country: 'Georgia', flag: '🇬🇪' },
    { code: '+49', country: 'Germany', flag: '🇩🇪' },
    { code: '+233', country: 'Ghana', flag: '🇬🇭' },
    { code: '+30', country: 'Greece', flag: '🇬🇷' },
    { code: '+502', country: 'Guatemala', flag: '🇬🇹' },
    { code: '+224', country: 'Guinea', flag: '🇬🇳' },
    { code: '+245', country: 'Guinea-Bissau', flag: '🇬🇼' },
    { code: '+592', country: 'Guyana', flag: '🇬🇾' },
    { code: '+509', country: 'Haiti', flag: '🇭🇹' },
    { code: '+504', country: 'Honduras', flag: '🇭🇳' },
    { code: '+852', country: 'Hong Kong', flag: '🇭🇰' },
    { code: '+36', country: 'Hungary', flag: '🇭🇺' },
    { code: '+354', country: 'Iceland', flag: '🇮🇸' },
    { code: '+91', country: 'India', flag: '🇮🇳' },
    { code: '+62', country: 'Indonesia', flag: '🇮🇩' },
    { code: '+98', country: 'Iran', flag: '🇮🇷' },
    { code: '+964', country: 'Iraq', flag: '🇮🇶' },
    { code: '+353', country: 'Ireland', flag: '🇮🇪' },
    { code: '+972', country: 'Israel', flag: '🇮🇱' },
    { code: '+39', country: 'Italy', flag: '🇮🇹' },
    { code: '+225', country: 'Ivory Coast', flag: '🇨🇮' },
    { code: '+1876', country: 'Jamaica', flag: '🇯🇲' },
    { code: '+81', country: 'Japan', flag: '🇯🇵' },
    { code: '+962', country: 'Jordan', flag: '🇯🇴' },
    { code: '+7', country: 'Kazakhstan', flag: '🇰🇿' },
    { code: '+254', country: 'Kenya', flag: '🇰🇪' },
    { code: '+686', country: 'Kiribati', flag: '🇰🇮' },
    { code: '+965', country: 'Kuwait', flag: '🇰🇼' },
    { code: '+996', country: 'Kyrgyzstan', flag: '🇰🇬' },
    { code: '+856', country: 'Laos', flag: '🇱🇦' },
    { code: '+371', country: 'Latvia', flag: '🇱🇻' },
    { code: '+961', country: 'Lebanon', flag: '🇱🇧' },
    { code: '+266', country: 'Lesotho', flag: '🇱🇸' },
    { code: '+231', country: 'Liberia', flag: '🇱🇷' },
    { code: '+218', country: 'Libya', flag: '🇱🇾' },
    { code: '+423', country: 'Liechtenstein', flag: '🇱🇮' },
    { code: '+370', country: 'Lithuania', flag: '🇱🇹' },
    { code: '+352', country: 'Luxembourg', flag: '🇱🇺' },
    { code: '+853', country: 'Macau', flag: '🇲🇴' },
    { code: '+261', country: 'Madagascar', flag: '🇲🇬' },
    { code: '+265', country: 'Malawi', flag: '🇲🇼' },
    { code: '+60', country: 'Malaysia', flag: '🇲🇾' },
    { code: '+960', country: 'Maldives', flag: '🇲🇻' },
    { code: '+223', country: 'Mali', flag: '🇲🇱' },
    { code: '+356', country: 'Malta', flag: '🇲🇹' },
    { code: '+222', country: 'Mauritania', flag: '🇲🇷' },
    { code: '+230', country: 'Mauritius', flag: '🇲🇺' },
    { code: '+52', country: 'Mexico', flag: '🇲🇽' },
    { code: '+373', country: 'Moldova', flag: '🇲🇩' },
    { code: '+377', country: 'Monaco', flag: '🇲🇨' },
    { code: '+976', country: 'Mongolia', flag: '🇲🇳' },
    { code: '+382', country: 'Montenegro', flag: '🇲🇪' },
    { code: '+212', country: 'Morocco', flag: '🇲🇦' },
    { code: '+258', country: 'Mozambique', flag: '🇲🇿' },
    { code: '+95', country: 'Myanmar', flag: '🇲🇲' },
    { code: '+264', country: 'Namibia', flag: '🇳🇦' },
    { code: '+674', country: 'Nauru', flag: '🇳🇷' },
    { code: '+977', country: 'Nepal', flag: '🇳🇵' },
    { code: '+31', country: 'Netherlands', flag: '🇳🇱' },
    { code: '+64', country: 'New Zealand', flag: '🇳🇿' },
    { code: '+505', country: 'Nicaragua', flag: '🇳🇮' },
    { code: '+227', country: 'Niger', flag: '🇳🇪' },
    { code: '+234', country: 'Nigeria', flag: '🇳🇬' },
    { code: '+850', country: 'North Korea', flag: '🇰🇵' },
    { code: '+389', country: 'North Macedonia', flag: '🇲🇰' },
    { code: '+47', country: 'Norway', flag: '🇳🇴' },
    { code: '+968', country: 'Oman', flag: '🇴🇲' },
    { code: '+92', country: 'Pakistan', flag: '🇵🇰' },
    { code: '+680', country: 'Palau', flag: '🇵🇼' },
    { code: '+970', country: 'Palestine', flag: '🇵🇸' },
    { code: '+507', country: 'Panama', flag: '🇵🇦' },
    { code: '+675', country: 'Papua New Guinea', flag: '🇵🇬' },
    { code: '+595', country: 'Paraguay', flag: '🇵🇾' },
    { code: '+51', country: 'Peru', flag: '🇵🇪' },
    { code: '+63', country: 'Philippines', flag: '🇵🇭' },
    { code: '+48', country: 'Poland', flag: '🇵🇱' },
    { code: '+351', country: 'Portugal', flag: '🇵🇹' },
    { code: '+974', country: 'Qatar', flag: '🇶🇦' },
    { code: '+40', country: 'Romania', flag: '🇷🇴' },
    { code: '+7', country: 'Russia', flag: '🇷🇺' },
    { code: '+250', country: 'Rwanda', flag: '🇷🇼' },
    { code: '+685', country: 'Samoa', flag: '🇼🇸' },
    { code: '+378', country: 'San Marino', flag: '🇸🇲' },
    { code: '+966', country: 'Saudi Arabia', flag: '🇸🇦' },
    { code: '+221', country: 'Senegal', flag: '🇸🇳' },
    { code: '+381', country: 'Serbia', flag: '🇷🇸' },
    { code: '+248', country: 'Seychelles', flag: '🇸🇨' },
    { code: '+232', country: 'Sierra Leone', flag: '🇸🇱' },
    { code: '+65', country: 'Singapore', flag: '🇸🇬' },
    { code: '+421', country: 'Slovakia', flag: '🇸🇰' },
    { code: '+386', country: 'Slovenia', flag: '🇸🇮' },
    { code: '+677', country: 'Solomon Islands', flag: '🇸🇧' },
    { code: '+252', country: 'Somalia', flag: '🇸🇴' },
    { code: '+27', country: 'South Africa', flag: '🇿🇦' },
    { code: '+211', country: 'South Sudan', flag: '🇸🇸' },
    { code: '+34', country: 'Spain', flag: '🇪🇸' },
    { code: '+94', country: 'Sri Lanka', flag: '🇱🇰' },
    { code: '+249', country: 'Sudan', flag: '🇸🇩' },
    { code: '+597', country: 'Suriname', flag: '🇸🇷' },
    { code: '+46', country: 'Sweden', flag: '🇸🇪' },
    { code: '+41', country: 'Switzerland', flag: '🇨🇭' },
    { code: '+963', country: 'Syria', flag: '🇸🇾' },
    { code: '+886', country: 'Taiwan', flag: '🇹🇼' },
    { code: '+992', country: 'Tajikistan', flag: '🇹🇯' },
    { code: '+255', country: 'Tanzania', flag: '🇹🇿' },
    { code: '+66', country: 'Thailand', flag: '🇹🇭' },
    { code: '+670', country: 'Timor-Leste', flag: '🇹🇱' },
    { code: '+228', country: 'Togo', flag: '🇹🇬' },
    { code: '+676', country: 'Tonga', flag: '🇹🇴' },
    { code: '+1868', country: 'Trinidad and Tobago', flag: '🇹🇹' },
    { code: '+216', country: 'Tunisia', flag: '🇹🇳' },
    { code: '+90', country: 'Turkey', flag: '🇹🇷' },
    { code: '+993', country: 'Turkmenistan', flag: '🇹🇲' },
    { code: '+688', country: 'Tuvalu', flag: '🇹🇻' },
    { code: '+256', country: 'Uganda', flag: '🇺🇬' },
    { code: '+380', country: 'Ukraine', flag: '🇺🇦' },
    { code: '+971', country: 'UAE', flag: '🇦🇪' },
    { code: '+44', country: 'United Kingdom', flag: '🇬🇧' },
    { code: '+1', country: 'United States', flag: '🇺🇸' },
    { code: '+598', country: 'Uruguay', flag: '🇺🇾' },
    { code: '+998', country: 'Uzbekistan', flag: '🇺🇿' },
    { code: '+678', country: 'Vanuatu', flag: '🇻🇺' },
    { code: '+379', country: 'Vatican City', flag: '🇻🇦' },
    { code: '+58', country: 'Venezuela', flag: '🇻🇪' },
    { code: '+84', country: 'Vietnam', flag: '🇻🇳' },
    { code: '+967', country: 'Yemen', flag: '🇾🇪' },
    { code: '+260', country: 'Zambia', flag: '🇿🇲' },
    { code: '+263', country: 'Zimbabwe', flag: '🇿🇼' },
];

const RegisterPage = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState<'register' | 'verify'>('register');
    const [registeredEmail, setRegisteredEmail] = useState('');
    const [formData, setFormData] = useState({
        firstName: '',
        middleName: '',
        lastName: '',
        email: '',
        password: '',
        confirmPassword: '',
        birthDate: '',
        countryCode: '+82', // Default to South Korea
        phoneNumber: '',
        institute: '',
        department: '',
        userType: 'Clinician',
        acceptPrivacyPolicy: false
    });
    const [verificationCode, setVerificationCode] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const validateEmail = (email: string): boolean => {
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        return emailRegex.test(email);
    };

    const validatePassword = (password: string): boolean => {
        // At least 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        return passwordRegex.test(password);
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setMessage('');

        // Validations
        if (!validateEmail(formData.email)) {
            setError("Please enter a valid email address");
            return;
        }

        if (!validatePassword(formData.password)) {
            setError("Password must be at least 8 characters with 1 uppercase, 1 lowercase, 1 number, and 1 special character (@$!%*?&)");
            return;
        }

        if (formData.password !== formData.confirmPassword) {
            setError("Passwords do not match");
            return;
        }

        if (!formData.birthDate) {
            setError("Birth date is required");
            return;
        }

        if (!formData.acceptPrivacyPolicy) {
            setError("You must accept the Privacy Policy to register");
            return;
        }

        setIsSubmitting(true);

        try {
            const fullPhoneNumber = formData.phoneNumber
                ? `${formData.countryCode}${formData.phoneNumber.replace(/^0+/, '')}`
                : '';

            const resp = await apiClient.post('/auth/register', {
                email: formData.email,
                password: formData.password,
                firstName: formData.firstName,
                middleName: formData.middleName || '',
                lastName: formData.lastName,
                birthDate: formData.birthDate,
                phoneNumber: fullPhoneNumber,
                institute: formData.institute,
                department: formData.department,
                userType: formData.userType
            });

            // Note: apiClient interceptor unwraps response, so resp.data IS the inner data object
            // Check for requiresVerification directly on resp.data
            if (resp.data?.requiresVerification) {
                setRegisteredEmail(formData.email);
                setStep('verify');
                setMessage('A 6-digit verification code has been sent to your email.');
            } else {
                // This shouldn't happen normally since all registrations require verification
                setMessage('Registration successful!');
            }
        } catch (err: any) {
            const errorMessage = err.response?.data?.error
                || err.response?.data?.message
                || err.message
                || 'Registration failed. Please try again.';
            setError(errorMessage);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleVerifyCode = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);

        try {
            const resp = await apiClient.post('/auth/verify-email', {
                email: registeredEmail,
                code: verificationCode.toUpperCase()
            });

            // Note: apiClient interceptor unwraps response, so resp.data IS the inner data object
            // Check for verified directly on resp.data
            if (resp.data?.verified) {
                setMessage('Email verified! Your account is now pending admin approval.');
                setTimeout(() => navigate('/login'), 3000);
            } else {
                setError('Verification failed');
            }
        } catch (err: any) {
            setError(err.response?.data?.message || 'Verification failed. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleResendCode = async () => {
        setError('');
        setIsSubmitting(true);

        try {
            await apiClient.post('/auth/resend-verification', { email: registeredEmail });
            setMessage('A new verification code has been sent to your email.');
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to resend code.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Verification Step UI
    if (step === 'verify') {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50 py-12 px-4">
                <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-lg">
                    <div className="text-center mb-6">
                        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900">Verify Your Email</h2>
                        <p className="text-gray-600 mt-2">
                            Enter the 6-digit code sent to<br />
                            <span className="font-medium text-blue-600">{registeredEmail}</span>
                        </p>
                    </div>

                    <form onSubmit={handleVerifyCode} className="space-y-6">
                        <div>
                            <input
                                type="text"
                                maxLength={6}
                                value={verificationCode}
                                onChange={(e) => setVerificationCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                                className="text-center text-3xl tracking-[0.5em] font-mono w-full px-4 py-4 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="------"
                            />
                        </div>

                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                                {error}
                            </div>
                        )}

                        {message && (
                            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
                                {message}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isSubmitting || verificationCode.length !== 6}
                            className="w-full py-3 px-4 border border-transparent rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        >
                            {isSubmitting ? 'Verifying...' : 'Verify Email'}
                        </button>

                        <div className="text-center text-sm">
                            <span className="text-gray-600">Didn't receive the code? </span>
                            <button
                                type="button"
                                onClick={handleResendCode}
                                disabled={isSubmitting}
                                className="text-blue-600 hover:text-blue-500 font-medium"
                            >
                                Resend Code
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    // Success message after verification
    if (message && step === 'register') {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="p-8 bg-white shadow-xl rounded-xl text-center max-w-md">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-green-600 mb-4">Registration Successful</h2>
                    <p className="text-gray-700 text-lg mb-6">{message}</p>
                    <Link
                        to="/login"
                        className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
                    >
                        Back to Login
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-lg">
                <div>
                    <h1 className="text-center text-3xl font-extrabold text-blue-600">
                        SynaptiHand
                    </h1>
                    <p className="mt-1 text-center text-sm text-gray-500 italic">
                        From Movement To Meaning
                    </p>
                    <h2 className="mt-4 text-center text-2xl font-bold text-gray-900">
                        Create your account
                    </h2>
                </div>
                <form className="mt-8 space-y-6" onSubmit={handleRegister}>
                    <div className="space-y-4">
                        {/* Name Fields */}
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    First Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    name="firstName"
                                    required
                                    className="appearance-none rounded-lg relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                                    placeholder="John"
                                    value={formData.firstName}
                                    onChange={handleChange}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Middle Name
                                </label>
                                <input
                                    name="middleName"
                                    className="appearance-none rounded-lg relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                                    placeholder="M."
                                    value={formData.middleName}
                                    onChange={handleChange}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Last Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    name="lastName"
                                    required
                                    className="appearance-none rounded-lg relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                                    placeholder="Smith"
                                    value={formData.lastName}
                                    onChange={handleChange}
                                />
                            </div>
                        </div>

                        {/* Birth Date */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Date of Birth <span className="text-red-500">*</span>
                            </label>
                            <input
                                name="birthDate"
                                type="date"
                                required
                                className="appearance-none rounded-lg relative block w-full px-4 py-3 border border-gray-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                                value={formData.birthDate}
                                onChange={handleChange}
                            />
                        </div>

                        {/* Email */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Email Address <span className="text-red-500">*</span>
                            </label>
                            <input
                                name="email"
                                type="email"
                                required
                                className="appearance-none rounded-lg relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                                placeholder="doctor@hospital.com"
                                value={formData.email}
                                onChange={handleChange}
                            />
                        </div>

                        {/* Password Fields */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Password <span className="text-red-500">*</span>
                                </label>
                                <input
                                    name="password"
                                    type="password"
                                    required
                                    minLength={8}
                                    className="appearance-none rounded-lg relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                                    placeholder="Min 8 chars"
                                    value={formData.password}
                                    onChange={handleChange}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Confirm <span className="text-red-500">*</span>
                                </label>
                                <input
                                    name="confirmPassword"
                                    type="password"
                                    required
                                    className="appearance-none rounded-lg relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                                    placeholder="Confirm"
                                    value={formData.confirmPassword}
                                    onChange={handleChange}
                                />
                            </div>
                        </div>

                        {/* Phone Number with Country Code */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Phone Number <span className="text-red-500">*</span>
                            </label>
                            <div className="flex gap-2">
                                <select
                                    name="countryCode"
                                    value={formData.countryCode}
                                    onChange={handleChange}
                                    className="appearance-none rounded-lg px-3 py-3 border border-gray-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white min-w-[140px]"
                                >
                                    {countryCodes.map((cc, index) => (
                                        <option key={`${cc.code}-${cc.country}-${index}`} value={cc.code}>
                                            {cc.flag} {cc.code} ({cc.country})
                                        </option>
                                    ))}
                                </select>
                                <input
                                    name="phoneNumber"
                                    type="tel"
                                    required
                                    className="appearance-none rounded-lg relative block flex-1 px-4 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                                    placeholder="1234567890"
                                    value={formData.phoneNumber}
                                    onChange={handleChange}
                                    pattern="[0-9]*"
                                />
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                                Select your country code and enter phone number
                            </p>
                        </div>

                        {/* Institute */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Institute / Hospital <span className="text-red-500">*</span>
                            </label>
                            <input
                                name="institute"
                                required
                                className="appearance-none rounded-lg relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                                placeholder="Seoul National University Hospital"
                                value={formData.institute}
                                onChange={handleChange}
                            />
                        </div>

                        {/* Department */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Department <span className="text-red-500">*</span>
                            </label>
                            <input
                                name="department"
                                required
                                className="appearance-none rounded-lg relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                                placeholder="Neurology / Physical Therapy / Rehabilitation"
                                value={formData.department}
                                onChange={handleChange}
                            />
                        </div>

                        {/* User Type */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Account Type <span className="text-red-500">*</span>
                            </label>
                            <select
                                name="userType"
                                value={formData.userType}
                                onChange={handleChange}
                                className="appearance-none rounded-lg relative block w-full px-4 py-3 border border-gray-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white"
                            >
                                <option value="Clinician">Clinician</option>
                                <option value="Researcher">Researcher</option>
                                <option value="Patient">Patient</option>
                            </select>
                            <p className="text-xs text-gray-500 mt-1">
                                Select the type of account that best describes your role
                            </p>
                        </div>

                        {/* Privacy Policy Agreement */}
                        <div className="mt-4">
                            <label className="flex items-start gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    name="acceptPrivacyPolicy"
                                    checked={formData.acceptPrivacyPolicy}
                                    onChange={(e) => setFormData({ ...formData, acceptPrivacyPolicy: e.target.checked })}
                                    className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                />
                                <span className="text-sm text-gray-600">
                                    I agree to the{' '}
                                    <a
                                        href="/privacy-policy"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:text-blue-500 underline"
                                    >
                                        Privacy Policy
                                    </a>
                                    {' '}and{' '}
                                    <a
                                        href="/terms-of-service"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:text-blue-500 underline"
                                    >
                                        Terms of Service
                                    </a>
                                    {' '}<span className="text-red-500">*</span>
                                </span>
                            </label>
                        </div>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    {/* Submit Button */}
                    <div>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? (
                                <span className="flex items-center">
                                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Creating Account...
                                </span>
                            ) : (
                                'Create Account'
                            )}
                        </button>
                    </div>

                    {/* Login Link */}
                    <div className="text-sm text-center">
                        <span className="text-gray-600">Already have an account? </span>
                        <Link to="/login" className="font-medium text-blue-600 hover:text-blue-500">
                            Sign in
                        </Link>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default RegisterPage;
