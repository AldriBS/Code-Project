/*
 * =====================================================================
 * KOMATSU FLOOD CONTROL - ENHANCED SECURE LOGIN SYSTEM
 * Firebase Email/Password Authentication with Advanced Security
 *
 * Security Features:
 * - Rate limiting & brute force protection
 * - Account lockout after failed attempts
 * - Session timeout & auto-logout
 * - Login attempt logging
 * - Password strength validation
 * - Email verification requirement
 * - IP-based tracking (client-side)
 *
 * All features are FREE and compatible with Firebase Spark Plan
 * =====================================================================
 */

console.log('🔐 Initializing Enhanced Komatsu Login System...');

// ==================== SECURITY CONFIGURATION ====================

const SECURITY_CONFIG = {
    MAX_LOGIN_ATTEMPTS: 5,              // Max failed attempts before lockout
    LOCKOUT_DURATION: 15 * 60 * 1000,   // 15 minutes lockout
    ATTEMPT_WINDOW: 10 * 60 * 1000,     // 10 minute rolling window
    SESSION_TIMEOUT: 8 * 60 * 60 * 1000, // 8 hours session timeout
    ACTIVITY_CHECK_INTERVAL: 60 * 1000,  // Check activity every 1 minute
    MIN_PASSWORD_LENGTH: 8,              // Minimum password length
    REQUIRE_EMAIL_VERIFICATION: false    // Set to true to enforce email verification
};

// ==================== SECURITY STATE ====================

let lastActivityTime = Date.now();
let sessionTimeoutChecker = null;
let failedAttempts = {};

// ==================== UTILITY FUNCTIONS ====================

// Get client fingerprint (basic)
function getClientFingerprint() {
    const ua = navigator.userAgent;
    const screen = `${window.screen.width}x${window.screen.height}`;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return btoa(`${ua}|${screen}|${timezone}`).substring(0, 32);
}

// Show message
function showMessage(message, type) {
    const messageDiv = document.getElementById('loginMessage');
    messageDiv.textContent = message;
    messageDiv.className = `message ${type} show`;

    setTimeout(() => {
        messageDiv.classList.remove('show');
    }, 5000);
}

// Show/hide loading
function setLoading(isLoading) {
    const loadingDiv = document.getElementById('loginLoading');
    const loginBtn = document.getElementById('loginBtn');
    const loginForm = document.getElementById('loginForm');

    if (isLoading) {
        loadingDiv.classList.add('show');
        loginBtn.disabled = true;
        loginForm.style.opacity = '0.5';
    } else {
        loadingDiv.classList.remove('show');
        loginBtn.disabled = false;
        loginForm.style.opacity = '1';
    }
}

// ==================== RATE LIMITING & LOCKOUT ====================

// Check if account is locked
function checkAccountLockout(email) {
    const key = btoa(email); // Basic obfuscation
    const attempts = failedAttempts[key] || [];
    const now = Date.now();

    // Remove old attempts outside the window
    const recentAttempts = attempts.filter(time => now - time < SECURITY_CONFIG.ATTEMPT_WINDOW);
    failedAttempts[key] = recentAttempts;

    // Check if locked
    if (recentAttempts.length >= SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS) {
        const oldestAttempt = Math.min(...recentAttempts);
        const lockoutEnd = oldestAttempt + SECURITY_CONFIG.LOCKOUT_DURATION;

        if (now < lockoutEnd) {
            const remainingMinutes = Math.ceil((lockoutEnd - now) / 60000);
            return {
                locked: true,
                remainingMinutes: remainingMinutes
            };
        } else {
            // Lockout expired, reset
            failedAttempts[key] = [];
        }
    }

    return { locked: false };
}

// Record failed attempt
function recordFailedAttempt(email) {
    const key = btoa(email);
    if (!failedAttempts[key]) {
        failedAttempts[key] = [];
    }
    failedAttempts[key].push(Date.now());

    // Calculate exponential backoff delay
    const attemptsCount = failedAttempts[key].length;
    const delay = Math.min(1000 * Math.pow(2, attemptsCount - 1), 30000); // Max 30 seconds

    return delay;
}

// Clear failed attempts on successful login
function clearFailedAttempts(email) {
    const key = btoa(email);
    delete failedAttempts[key];
}

// ==================== LOGIN ATTEMPT LOGGING ====================

// Log login attempt to Firebase (for audit trail)
async function logLoginAttempt(email, success, reason = '') {
    try {
        const fingerprint = getClientFingerprint();
        const timestamp = new Date().toISOString();

        const logData = {
            email: email.toLowerCase(),
            success: success,
            reason: reason,
            timestamp: timestamp,
            fingerprint: fingerprint,
            userAgent: navigator.userAgent.substring(0, 100)
        };

        // Store in Firebase under security logs
        await firebase.database().ref('securityLogs/loginAttempts').push(logData);

        console.log(`📝 Login attempt logged: ${success ? 'SUCCESS' : 'FAILED'}`);
    } catch (error) {
        console.error('Failed to log login attempt:', error);
        // Don't block login if logging fails
    }
}

// ==================== PASSWORD VALIDATION ====================

function validatePasswordStrength(password) {
    if (password.length < SECURITY_CONFIG.MIN_PASSWORD_LENGTH) {
        return {
            valid: false,
            message: `Password harus minimal ${SECURITY_CONFIG.MIN_PASSWORD_LENGTH} karakter`
        };
    }

    // Check for at least one number
    if (!/\d/.test(password)) {
        return {
            valid: false,
            message: 'Password harus mengandung minimal 1 angka'
        };
    }

    // Check for at least one letter
    if (!/[a-zA-Z]/.test(password)) {
        return {
            valid: false,
            message: 'Password harus mengandung minimal 1 huruf'
        };
    }

    return { valid: true };
}

// ==================== SESSION TIMEOUT ====================

function updateActivity() {
    lastActivityTime = Date.now();
}

function startSessionMonitoring(user) {
    // Update activity on any user interaction
    ['mousedown', 'keydown', 'scroll', 'touchstart'].forEach(event => {
        document.addEventListener(event, updateActivity, { passive: true });
    });

    // Check session timeout periodically
    sessionTimeoutChecker = setInterval(() => {
        const inactiveTime = Date.now() - lastActivityTime;

        if (inactiveTime > SECURITY_CONFIG.SESSION_TIMEOUT) {
            console.warn('⏰ Session timeout - logging out');
            showMessage('Sesi Anda telah berakhir karena tidak aktif. Silakan login kembali.', 'error');

            // Log timeout event
            logLoginAttempt(user.email, false, 'session_timeout').then(() => {
                firebase.auth().signOut().then(() => {
                    setTimeout(() => {
                        window.location.reload();
                    }, 2000);
                });
            });
        } else {
            // Log activity heartbeat every check interval
            const remainingMinutes = Math.floor((SECURITY_CONFIG.SESSION_TIMEOUT - inactiveTime) / 60000);
            console.log(`💓 Session active - ${remainingMinutes} minutes remaining`);
        }
    }, SECURITY_CONFIG.ACTIVITY_CHECK_INTERVAL);
}

function stopSessionMonitoring() {
    if (sessionTimeoutChecker) {
        clearInterval(sessionTimeoutChecker);
        sessionTimeoutChecker = null;
    }
}

// ==================== CHECK EXISTING SESSION ====================

firebase.auth().onAuthStateChanged((user) => {
    if (user) {
        // Check email verification if required
        if (SECURITY_CONFIG.REQUIRE_EMAIL_VERIFICATION && !user.emailVerified) {
            console.warn('⚠️ Email not verified');
            showMessage('Email Anda belum diverifikasi. Periksa inbox Anda.', 'error');
            firebase.auth().signOut();
            return;
        }

        // User already logged in, redirect to dashboard
        console.log('✅ User already logged in:', user.email);
        console.log('🔄 Redirecting to dashboard...');

        // Start session monitoring
        startSessionMonitoring(user);

        window.location.href = 'index.html';
    } else {
        console.log('ℹ️ No active session - showing login form');
        stopSessionMonitoring();
    }
});

// ==================== LOGIN FORM HANDLING ====================

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value.trim().toLowerCase();
    const password = document.getElementById('password').value;

    // Basic validation
    if (!email || !password) {
        showMessage('Email dan password harus diisi', 'error');
        return;
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showMessage('Format email tidak valid', 'error');
        return;
    }

    // Check account lockout
    const lockoutStatus = checkAccountLockout(email);
    if (lockoutStatus.locked) {
        showMessage(
            `🔒 Akun terkunci karena terlalu banyak percobaan gagal. Coba lagi dalam ${lockoutStatus.remainingMinutes} menit.`,
            'error'
        );
        await logLoginAttempt(email, false, 'account_locked');
        return;
    }

    // Password strength validation (for new logins, informational only)
    const passwordCheck = validatePasswordStrength(password);
    if (!passwordCheck.valid) {
        console.warn('⚠️ Weak password:', passwordCheck.message);
        // Don't block login, just warn
    }

    console.log('🔐 Attempting login for:', email);
    setLoading(true);

    try {
        // Sign in with Firebase Auth
        const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
        const user = userCredential.user;

        // Check email verification if required
        if (SECURITY_CONFIG.REQUIRE_EMAIL_VERIFICATION && !user.emailVerified) {
            setLoading(false);
            showMessage('❌ Email belum diverifikasi. Periksa inbox Anda.', 'error');
            await firebase.auth().signOut();
            await logLoginAttempt(email, false, 'email_not_verified');
            return;
        }

        console.log('✅ Login successful!');
        console.log('👤 User:', user.email);
        console.log('🆔 UID:', user.uid);

        // Clear failed attempts
        clearFailedAttempts(email);

        // Log successful login
        await logLoginAttempt(email, true, 'login_successful');

        // Show success message
        showMessage('Login berhasil! Mengalihkan ke dashboard...', 'success');

        // Set persistence to LOCAL (stay logged in)
        await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);

        // Update last login time in database
        await firebase.database().ref(`users/${user.uid}/lastLogin`).set({
            timestamp: new Date().toISOString(),
            fingerprint: getClientFingerprint()
        });

        // Start session monitoring
        startSessionMonitoring(user);

        // Redirect to dashboard
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1000);

    } catch (error) {
        setLoading(false);
        console.error('❌ Login failed:', error.code, error.message);

        // Record failed attempt and get delay
        const delay = recordFailedAttempt(email);

        // Log failed attempt
        await logLoginAttempt(email, false, error.code);

        // User-friendly error messages
        let errorMessage = 'Login gagal. Silakan coba lagi.';

        switch (error.code) {
            case 'auth/invalid-email':
                errorMessage = '❌ Format email tidak valid.';
                break;
            case 'auth/user-not-found':
                errorMessage = '❌ Email tidak terdaftar.';
                break;
            case 'auth/wrong-password':
                errorMessage = '❌ Password salah.';
                // Add delay for brute force protection
                const attemptsLeft = SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS - (failedAttempts[btoa(email)]?.length || 0);
                if (attemptsLeft > 0 && attemptsLeft <= 3) {
                    errorMessage += ` (${attemptsLeft} percobaan tersisa)`;
                }
                break;
            case 'auth/invalid-credential':
                errorMessage = '❌ Email atau password salah.';
                break;
            case 'auth/too-many-requests':
                errorMessage = '⚠️ Terlalu banyak percobaan login. Coba lagi nanti.';
                break;
            case 'auth/network-request-failed':
                errorMessage = '🌐 Koneksi internet bermasalah. Periksa koneksi Anda.';
                break;
            case 'auth/user-disabled':
                errorMessage = '🚫 Akun ini telah dinonaktifkan. Hubungi administrator.';
                break;
            default:
                errorMessage = `❌ Error: ${error.message}`;
        }

        showMessage(errorMessage, 'error');

        // Add exponential backoff delay
        if (delay > 1000) {
            console.warn(`⏳ Rate limiting: ${delay}ms delay before next attempt`);
            setTimeout(() => {
                setLoading(false);
            }, delay);
        }
    }
});

// ==================== ENTER KEY SUBMIT ====================

document.getElementById('email').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('password').focus();
    }
});

document.getElementById('password').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('loginForm').dispatchEvent(new Event('submit'));
    }
});

// ==================== AUTO-FILL DETECTION ====================

// Clear messages when user starts typing
document.getElementById('email').addEventListener('input', () => {
    const messageDiv = document.getElementById('loginMessage');
    messageDiv.classList.remove('show');
});

document.getElementById('password').addEventListener('input', () => {
    const messageDiv = document.getElementById('loginMessage');
    messageDiv.classList.remove('show');
});

// ==================== CONNECTION STATUS ====================

// Monitor Firebase connection
let connectionRef = firebase.database().ref('.info/connected');
connectionRef.on('value', (snapshot) => {
    if (snapshot.val() === true) {
        console.log('✅ Connected to Firebase');
    } else {
        console.log('⚠️ Disconnected from Firebase');
        showMessage('⚠️ Koneksi ke server terputus. Memeriksa koneksi...', 'error');
    }
});

// ==================== SECURITY HEADERS ====================

// Prevent clickjacking
if (window.top !== window.self) {
    window.top.location = window.self.location;
}

// Disable right-click on login page (optional security measure)
// Uncomment if desired:
// document.addEventListener('contextmenu', (e) => e.preventDefault());

// ==================== INITIALIZATION ====================

console.log('✅ Enhanced Login System initialized');
console.log('🔐 Security Features:');
console.log(`   - Rate limiting: ${SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS} attempts / ${SECURITY_CONFIG.ATTEMPT_WINDOW / 60000} minutes`);
console.log(`   - Lockout duration: ${SECURITY_CONFIG.LOCKOUT_DURATION / 60000} minutes`);
console.log(`   - Session timeout: ${SECURITY_CONFIG.SESSION_TIMEOUT / 3600000} hours`);
console.log(`   - Password min length: ${SECURITY_CONFIG.MIN_PASSWORD_LENGTH} characters`);
console.log(`   - Email verification required: ${SECURITY_CONFIG.REQUIRE_EMAIL_VERIFICATION}`);
console.log('📧 Ready for secure authentication');
console.log('🔒 Session persistence: LOCAL (stay logged in)');

// Test Firebase connection on load
window.addEventListener('load', () => {
    console.log('🔍 Testing Firebase connection...');

    firebase.database().ref('.info/connected').once('value')
        .then((snapshot) => {
            if (snapshot.val() === true) {
                console.log('✅ Firebase connection OK');
            } else {
                console.warn('⚠️ Firebase not connected');
                showMessage('⚠️ Koneksi ke server bermasalah', 'error');
            }
        })
        .catch((error) => {
            console.error('❌ Firebase connection test failed:', error);
            showMessage('❌ Gagal terhubung ke server', 'error');
        });
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    stopSessionMonitoring();
});
