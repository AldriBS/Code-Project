/*
 * =====================================================================
 * KOMATSU FLOOD CONTROL - SIMPLE LOGIN SYSTEM
 * Firebase Email/Password Authentication
 * No OTP - Direct Login
 * =====================================================================
 */

console.log('🔐 Initializing Komatsu Login System...');

// ==================== UTILITY FUNCTIONS ====================

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

// ==================== CHECK EXISTING SESSION ====================

firebase.auth().onAuthStateChanged((user) => {
    if (user) {
        // User already logged in, redirect to dashboard
        console.log('✅ User already logged in:', user.email);
        console.log('🔄 Redirecting to dashboard...');
        window.location.href = 'index.html';
    } else {
        console.log('ℹ️ No active session - showing login form');
    }
});

// ==================== LOGIN FORM HANDLING ====================

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    
    // Validation
    if (!email || !password) {
        showMessage('Email dan password harus diisi', 'error');
        return;
    }
    
    console.log('🔐 Attempting login for:', email);
    setLoading(true);
    
    try {
        // Sign in with Firebase Auth
        const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        console.log('✅ Login successful!');
        console.log('👤 User:', user.email);
        console.log('🆔 UID:', user.uid);
        
        // Show success message
        showMessage('Login berhasil! Mengalihkan ke dashboard...', 'success');
        
        // Set persistence to LOCAL (stay logged in)
        await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        
        // Redirect to dashboard
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1000);
        
    } catch (error) {
        setLoading(false);
        console.error('❌ Login failed:', error.code, error.message);
        
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

// ==================== INITIALIZATION ====================

console.log('✅ Login system initialized');
console.log('📧 Ready for email/password authentication');
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