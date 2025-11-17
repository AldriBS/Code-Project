/*
 * =====================================================================
 * KOMATSU FLOOD CONTROL - ENHANCED AUTHENTICATION GUARD v2.0
 * Protect dashboard pages - require login
 * 
 * NEW FEATURES v2.0:
 * - ✅ Protection against double loading
 * - ✅ Debug mode with timestamp logging
 * - ✅ Session persistence check
 * - ✅ 200ms delay before redirect (race condition fix)
 * - ✅ Comprehensive error logging
 * =====================================================================
 */

// ==================== PREVENT DOUBLE LOADING ====================
if (window.authGuardInitialized) {
    console.warn('⚠️ AUTH-GUARD: Already initialized - preventing duplicate load');
    // Stop execution to prevent double initialization
    throw new Error('Auth Guard already loaded');
}
window.authGuardInitialized = true;

// ==================== DEBUG MODE ====================
const DEBUG_MODE = true; // Set to false for production

function debugLog(message, type = 'info') {
    if (!DEBUG_MODE) return;
    
    const timestamp = new Date().toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3
    });
    
    const icons = {
        'info': 'ℹ️',
        'success': '✅',
        'warning': '⚠️',
        'error': '❌',
        'check': '🔍',
        'redirect': '🔄'
    };
    
    const icon = icons[type] || 'ℹ️';
    console.log(`[${timestamp}] ${icon} AUTH-GUARD: ${message}`);
}

debugLog('Initializing Authentication Guard v2.0...', 'info');
debugLog(`Current page: ${window.location.pathname}`, 'check');

// ==================== GLOBAL STATE ====================
let authCheckInProgress = false;
let authStateStable = false;
let redirectTimeout = null;

// ==================== SESSION PERSISTENCE CHECK ====================
async function checkAuthPersistence() {
    debugLog('Checking auth persistence...', 'check');
    
    try {
        const user = firebase.auth().currentUser;
        
        if (user) {
            debugLog(`Session active: ${user.email}`, 'success');
            debugLog(`User UID: ${user.uid}`, 'info');
            return true;
        } else {
            debugLog('No active session found', 'warning');
            return false;
        }
    } catch (error) {
        debugLog(`Persistence check error: ${error.message}`, 'error');
        return false;
    }
}

// ==================== CHECK AUTHENTICATION STATUS ====================
function checkAuth() {
    debugLog('Starting authentication check...', 'check');
    
    return new Promise((resolve, reject) => {
        firebase.auth().onAuthStateChanged((user) => {
            if (user) {
                debugLog(`User authenticated: ${user.email}`, 'success');
                resolve(user);
            } else {
                debugLog('No authenticated user found', 'warning');
                reject('Not authenticated');
            }
        });
    });
}

// ==================== INITIALIZE AUTH GUARD ====================
async function initAuthGuard() {
    debugLog('Initializing auth guard...', 'info');
    
    try {
        // Wait for Firebase to be fully ready
        debugLog('Waiting for Firebase Auth to be ready...', 'check');
        
        await new Promise((resolve) => {
            const unsubscribe = firebase.auth().onAuthStateChanged((user) => {
                unsubscribe();
                debugLog('Firebase Auth ready', 'success');
                resolve(user);
            });
        });
        
        // Check current user
        const user = firebase.auth().currentUser;
        
        if (user) {
            debugLog(`Auth guard initialized successfully`, 'success');
            debugLog(`Logged in as: ${user.email}`, 'info');
            
            // Update UI with user info
            updateUserInfo(user);
            
            // Set up logout button
            setupLogoutButton();
            
            return user;
        } else {
            debugLog('No user session - redirecting to login', 'redirect');
            throw new Error('Not authenticated');
        }
        
    } catch (error) {
        debugLog(`Auth guard initialization failed: ${error.message}`, 'error');
        debugLog('Redirecting to login page...', 'redirect');
        
        // Small delay before redirect
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 100);
    }
}

// ==================== UPDATE UI WITH USER INFO ====================
function updateUserInfo(user) {
    debugLog('Updating user info in UI...', 'info');
    
    const userInfoElement = document.getElementById('userInfo');
    if (userInfoElement) {
        userInfoElement.innerHTML = `
            <span style="margin-right: 15px;">👤 ${user.email}</span>
            <button onclick="logout()" style="
                background: rgba(255,255,255,0.2);
                border: 1px solid white;
                color: white;
                padding: 6px 15px;
                border-radius: 5px;
                cursor: pointer;
                font-size: 14px;
                transition: all 0.3s;
            " onmouseover="this.style.background='rgba(255,255,255,0.3)'" 
               onmouseout="this.style.background='rgba(255,255,255,0.2)'">
                🚪 Logout
            </button>
        `;
        debugLog('User info displayed in header', 'success');
    } else {
        debugLog('userInfo element not found in page', 'warning');
    }
}

// ==================== SETUP LOGOUT BUTTON ====================
function setupLogoutButton() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
        debugLog('Logout button event listener attached', 'success');
    }
}

// ==================== LOGOUT FUNCTION ====================
async function logout() {
    debugLog('Logout initiated by user', 'info');
    
    if (confirm('Are you sure you want to logout?')) {
        try {
            debugLog('Signing out from Firebase...', 'info');
            await firebase.auth().signOut();
            
            debugLog('Logged out successfully', 'success');
            debugLog('Redirecting to login page...', 'redirect');
            
            window.location.href = 'login.html';
        } catch (error) {
            debugLog(`Logout failed: ${error.message}`, 'error');
            alert('Logout failed. Please try again.');
        }
    } else {
        debugLog('Logout cancelled by user', 'info');
    }
}

// ==================== ENHANCED AUTH STATE LISTENER ====================
debugLog('Setting up auth state change listener...', 'info');

firebase.auth().onAuthStateChanged((user) => {
    debugLog('Auth state change event triggered', 'check');
    
    // Prevent multiple simultaneous checks
    if (authCheckInProgress) {
        debugLog('Auth check already in progress - skipping duplicate', 'warning');
        return;
    }
    
    // Mark as stable after first successful check
    if (!authStateStable) {
        authStateStable = true;
        debugLog('Auth state stabilized', 'success');
    }
    
    // Clear any pending redirects
    if (redirectTimeout) {
        clearTimeout(redirectTimeout);
        redirectTimeout = null;
        debugLog('Cleared pending redirect timeout', 'info');
    }
    
    const isLoginPage = window.location.pathname.includes('login.html');
    debugLog(`Is login page: ${isLoginPage}`, 'check');
    
    // Wait 200ms before taking action (race condition prevention)
    redirectTimeout = setTimeout(() => {
        if (!user && !isLoginPage) {
            authCheckInProgress = true;
            
            debugLog('='.repeat(50), 'error');
            debugLog('NO AUTHENTICATED USER DETECTED', 'error');
            debugLog('='.repeat(50), 'error');
            debugLog(`Current path: ${window.location.pathname}`, 'info');
            debugLog('Initiating redirect to login...', 'redirect');
            
            // Small delay to ensure logging is visible
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 100);
            
        } else if (user) {
            debugLog(`User session confirmed: ${user.email}`, 'success');
            debugLog(`UID: ${user.uid}`, 'info');
        } else if (isLoginPage) {
            debugLog('On login page - no action needed', 'info');
        }
    }, 200); // 200ms delay as requested
});

// ==================== INITIALIZE ON PAGE LOAD ====================
window.addEventListener('load', () => {
    debugLog('='.repeat(60), 'info');
    debugLog('PAGE LOADED - Starting Auth Guard', 'info');
    debugLog('='.repeat(60), 'info');
    
    // Check if we're on login page
    const isLoginPage = window.location.pathname.includes('login.html');
    
    if (isLoginPage) {
        debugLog('Login page detected - skipping auth guard', 'info');
    } else {
        debugLog('Protected page - initializing auth check...', 'check');
        initAuthGuard();
    }
});

// ==================== VISIBILITY CHANGE DETECTION ====================
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        debugLog('Page became visible - checking auth status...', 'check');
        checkAuthPersistence();
    }
});

// ==================== EXPORT DEBUG FUNCTION (FOR CONSOLE ACCESS) ====================
window.authGuardDebug = {
    checkPersistence: checkAuthPersistence,
    getCurrentUser: () => firebase.auth().currentUser,
    toggleDebug: () => {
        window.DEBUG_MODE = !window.DEBUG_MODE;
        console.log(`Debug mode: ${window.DEBUG_MODE ? 'ON' : 'OFF'}`);
    }
};

debugLog('='.repeat(60), 'success');
debugLog('AUTH GUARD v2.0 LOADED SUCCESSFULLY', 'success');
debugLog('='.repeat(60), 'success');
debugLog('Available console commands:', 'info');
debugLog('  - window.authGuardDebug.checkPersistence()', 'info');
debugLog('  - window.authGuardDebug.getCurrentUser()', 'info');
debugLog('  - window.authGuardDebug.toggleDebug()', 'info');
debugLog('='.repeat(60), 'success');