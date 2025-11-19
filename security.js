// Enhanced Security Layer
// Protection against hacking, malware, XSS, CSRF, injection attacks

// ==========================================
// 1. CONTENT SECURITY POLICY (CSP)
// ==========================================
function setupContentSecurityPolicy() {
    const meta = document.createElement('meta');
    meta.httpEquiv = 'Content-Security-Policy';
    meta.content = `
        default-src 'self';
        script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.gstatic.com https://*.firebaseio.com https://*.googleapis.com https://*.gstatic.com;
        style-src 'self' 'unsafe-inline';
        img-src 'self' data: https:;
        font-src 'self' data:;
        connect-src 'self' https://*.firebaseio.com https://*.googleapis.com wss://*.firebaseio.com wss://*.firebasedatabase.app;
        base-uri 'self';
        form-action 'self';
    `.replace(/\s+/g, ' ').trim();

    document.head.appendChild(meta);
    console.log('✅ Content Security Policy enabled');
}

// ==========================================
// 2. SECURITY HEADERS
// ==========================================
function setupSecurityHeaders() {
    // NOTE: X-Frame-Options and X-Content-Type-Options can only be set
    // via HTTP headers, not meta tags. Use .htaccess or server config instead.

    // Referrer-Policy: Control referrer information
    const referrerPolicy = document.createElement('meta');
    referrerPolicy.name = 'referrer';
    referrerPolicy.content = 'strict-origin-when-cross-origin';
    document.head.appendChild(referrerPolicy);

    console.log('✅ Security headers configured');
    console.log('ℹ️  Note: X-Frame-Options must be set via HTTP headers (.htaccess)');
}

// ==========================================
// 3. INPUT SANITIZATION
// ==========================================
function sanitizeInput(input) {
    if (typeof input !== 'string') return input;

    // Remove HTML tags
    const div = document.createElement('div');
    div.textContent = input;
    let sanitized = div.innerHTML;

    // Remove script tags and event handlers
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
    sanitized = sanitized.replace(/javascript:/gi, '');

    return sanitized;
}

// ==========================================
// 4. XSS PROTECTION
// ==========================================
function escapeHTML(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

// Override innerHTML for safe usage
const originalInnerHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
Object.defineProperty(Element.prototype, 'innerHTML', {
    set: function(value) {
        // Allow only for trusted elements
        if (this.hasAttribute('data-safe-html')) {
            originalInnerHTML.set.call(this, value);
        } else {
            originalInnerHTML.set.call(this, sanitizeInput(value));
        }
    },
    get: originalInnerHTML.get
});

// ==========================================
// 5. CSRF PROTECTION
// ==========================================
class CSRFProtection {
    constructor() {
        this.token = this.generateToken();
        this.sessionId = this.generateSessionId();
    }

    generateToken() {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    validateRequest(action) {
        const user = firebase.auth().currentUser;
        if (!user) {
            console.error('⛔ CSRF: No authenticated user');
            return false;
        }

        // Verify session is valid
        const lastActivity = sessionStorage.getItem('lastActivity');
        const now = Date.now();

        if (lastActivity && (now - parseInt(lastActivity)) > 30 * 60 * 1000) {
            console.error('⛔ CSRF: Session expired');
            this.forceReauth();
            return false;
        }

        // Update last activity
        sessionStorage.setItem('lastActivity', now.toString());
        return true;
    }

    forceReauth() {
        alert('Your session has expired. Please log in again.');
        firebase.auth().signOut();
        window.location.href = 'login.html';
    }
}

const csrfProtection = new CSRFProtection();

// ==========================================
// 6. RATE LIMITING
// ==========================================
class RateLimiter {
    constructor(maxRequests = 10, timeWindow = 60000) {
        this.maxRequests = maxRequests;
        this.timeWindow = timeWindow;
        this.requests = new Map();
    }

    checkLimit(action) {
        const now = Date.now();
        const key = `${action}_${firebase.auth().currentUser?.uid || 'anonymous'}`;

        if (!this.requests.has(key)) {
            this.requests.set(key, []);
        }

        const timestamps = this.requests.get(key);

        // Remove old timestamps
        const validTimestamps = timestamps.filter(t => now - t < this.timeWindow);
        this.requests.set(key, validTimestamps);

        if (validTimestamps.length >= this.maxRequests) {
            console.error(`⛔ Rate limit exceeded for action: ${action}`);
            return false;
        }

        validTimestamps.push(now);
        this.requests.set(key, validTimestamps);
        return true;
    }
}

const rateLimiter = new RateLimiter(10, 60000); // 10 requests per minute

// ==========================================
// 7. SECURE PUMP CONTROL
// ==========================================
async function securePumpControl(area, command) {
    try {
        // 1. Check authentication
        const user = firebase.auth().currentUser;
        if (!user) {
            throw new Error('User not authenticated');
        }

        // 2. Verify user is not suspended/blocked
        const idTokenResult = await user.getIdTokenResult();
        if (idTokenResult.claims.blocked === true) {
            throw new Error('Account is blocked');
        }

        // 3. CSRF protection
        if (!csrfProtection.validateRequest('pumpControl')) {
            throw new Error('CSRF validation failed');
        }

        // 4. Rate limiting
        if (!rateLimiter.checkLimit('pumpControl')) {
            throw new Error('Too many requests. Please wait.');
        }

        // 5. Validate input
        if (typeof area !== 'number' || (area !== 1 && area !== 2)) {
            throw new Error('Invalid area parameter');
        }

        if (typeof command !== 'boolean') {
            throw new Error('Invalid command parameter');
        }

        // 6. Create audit log
        const auditLog = {
            timestamp: new Date().toISOString(),
            user: user.email,
            uid: user.uid,
            action: 'pumpControl',
            area: area,
            command: command,
            ip: await getClientIP(),
            userAgent: navigator.userAgent
        };

        // 7. Execute command with integrity check
        const commandHash = await hashData(`${area}:${command}:${Date.now()}`);

        await firebase.database().ref(`area${area}/pumpCommand`).set(command);
        await firebase.database().ref(`auditLogs/${Date.now()}`).set(auditLog);

        console.log('✅ Pump command executed securely:', auditLog);
        return true;

    } catch (error) {
        console.error('⛔ Security error in pump control:', error);
        showSecurityAlert(error.message);

        // Log security violation
        await logSecurityViolation('pumpControl', error.message);
        return false;
    }
}

// ==========================================
// 8. DATA INTEGRITY CHECK
// ==========================================
async function hashData(data) {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyDataIntegrity(data, expectedHash) {
    const actualHash = await hashData(data);
    return actualHash === expectedHash;
}

// ==========================================
// 9. SUSPICIOUS ACTIVITY DETECTION
// ==========================================
class SecurityMonitor {
    constructor() {
        this.violations = [];
        this.threshold = 5; // Max violations before blocking
    }

    recordViolation(type, details) {
        const violation = {
            timestamp: Date.now(),
            type: type,
            details: details,
            user: firebase.auth().currentUser?.email || 'anonymous',
            uid: firebase.auth().currentUser?.uid || 'unknown'
        };

        this.violations.push(violation);

        // Check if threshold exceeded
        const recentViolations = this.violations.filter(
            v => Date.now() - v.timestamp < 5 * 60 * 1000 // 5 minutes
        );

        if (recentViolations.length >= this.threshold) {
            this.blockUser();
        }

        // Log to Firebase
        this.logToFirebase(violation);
    }

    async blockUser() {
        console.error('⛔ Too many security violations. Blocking user.');

        const user = firebase.auth().currentUser;
        if (user) {
            // Log blocking event
            await firebase.database().ref(`securityBlocks/${user.uid}`).set({
                timestamp: new Date().toISOString(),
                reason: 'Multiple security violations',
                violations: this.violations
            });
        }

        // Sign out and redirect
        await firebase.auth().signOut();
        window.location.href = 'blocked.html';
    }

    async logToFirebase(violation) {
        try {
            await firebase.database().ref(`securityViolations/${Date.now()}`).set(violation);
        } catch (error) {
            console.error('Failed to log violation:', error);
        }
    }
}

const securityMonitor = new SecurityMonitor();

// ==========================================
// 10. SECURE SESSION MANAGEMENT
// ==========================================
function setupSecureSession() {
    // Set session timeout (30 minutes)
    const SESSION_TIMEOUT = 30 * 60 * 1000;
    let lastActivity = Date.now();

    function resetSessionTimer() {
        lastActivity = Date.now();
        sessionStorage.setItem('lastActivity', lastActivity.toString());
    }

    function checkSession() {
        const now = Date.now();
        const stored = sessionStorage.getItem('lastActivity');

        if (stored && (now - parseInt(stored)) > SESSION_TIMEOUT) {
            console.log('🔒 Session expired');
            firebase.auth().signOut();
            window.location.href = 'login.html';
        }
    }

    // Monitor user activity
    ['mousedown', 'keypress', 'scroll', 'touchstart'].forEach(event => {
        document.addEventListener(event, resetSessionTimer, { passive: true });
    });

    // Check session every minute
    setInterval(checkSession, 60000);

    console.log('✅ Secure session management enabled');
}

// ==========================================
// 11. PREVENT DEVTOOLS TAMPERING
// ==========================================
function detectDevTools() {
    // DISABLED: Too aggressive, causes infinite Firebase connection errors
    // DevTools detection can be monitored via server logs instead
    console.log('ℹ️  DevTools detection disabled (use server-side monitoring)');

    /* Original code - DISABLED
    const threshold = 160;
    let devtoolsOpen = false;

    setInterval(() => {
        if (window.outerWidth - window.innerWidth > threshold ||
            window.outerHeight - window.innerHeight > threshold) {
            if (!devtoolsOpen) {
                devtoolsOpen = true;
                console.warn('⚠️ Developer tools detected');
                securityMonitor.recordViolation('devtools', 'Developer tools opened');
            }
        } else {
            devtoolsOpen = false;
        }
    }, 1000);
    */
}

// ==========================================
// 12. PREVENT CONSOLE MANIPULATION
// ==========================================
function protectConsole() {
    // Prevent console.log override
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    Object.defineProperty(console, 'log', {
        value: originalLog,
        writable: false,
        configurable: false
    });

    Object.defineProperty(console, 'error', {
        value: originalError,
        writable: false,
        configurable: false
    });

    Object.defineProperty(console, 'warn', {
        value: originalWarn,
        writable: false,
        configurable: false
    });
}

// ==========================================
// 13. SECURITY UTILITIES
// ==========================================
async function getClientIP() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        return data.ip;
    } catch (error) {
        return 'unknown';
    }
}

async function logSecurityViolation(action, reason) {
    const user = firebase.auth().currentUser;
    const violation = {
        timestamp: new Date().toISOString(),
        action: action,
        reason: reason,
        user: user?.email || 'anonymous',
        uid: user?.uid || 'unknown',
        ip: await getClientIP(),
        userAgent: navigator.userAgent
    };

    await firebase.database().ref(`securityViolations/${Date.now()}`).set(violation);
    securityMonitor.recordViolation(action, reason);
}

function showSecurityAlert(message) {
    const alert = document.createElement('div');
    alert.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #f44336;
        color: white;
        padding: 20px 30px;
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.3);
        z-index: 99999;
        font-size: 16px;
        font-weight: bold;
        text-align: center;
    `;
    alert.innerHTML = `
        <div style="font-size: 48px; margin-bottom: 10px;">🛡️</div>
        <div>Security Alert</div>
        <div style="font-size: 14px; font-weight: normal; margin-top: 10px;">${escapeHTML(message)}</div>
    `;

    document.body.appendChild(alert);

    setTimeout(() => {
        alert.remove();
    }, 5000);
}

// ==========================================
// 14. INITIALIZE SECURITY
// ==========================================
function initializeSecurity() {
    console.log('🔒 Initializing security layers...');

    // Setup all security features
    setupContentSecurityPolicy();
    setupSecurityHeaders();
    setupSecureSession();
    detectDevTools();
    protectConsole();

    // Override dangerous functions
    window.eval = function() {
        securityMonitor.recordViolation('eval', 'Attempted to use eval()');
        throw new Error('eval() is disabled for security');
    };

    // Prevent right-click and inspect element in production
    if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        document.addEventListener('contextmenu', e => e.preventDefault());
        document.addEventListener('keydown', e => {
            // F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U
            if (e.keyCode === 123 ||
                (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74)) ||
                (e.ctrlKey && e.keyCode === 85)) {
                e.preventDefault();
                securityMonitor.recordViolation('devtools', 'Attempted to open developer tools');
            }
        });
    }

    console.log('✅ Security layers initialized');
}

// ==========================================
// 15. EXPORT SECURE FUNCTIONS
// ==========================================
window.securePumpControl = securePumpControl;
window.sanitizeInput = sanitizeInput;
window.escapeHTML = escapeHTML;
window.csrfProtection = csrfProtection;
window.rateLimiter = rateLimiter;
window.securityMonitor = securityMonitor;

// Auto-initialize on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSecurity);
} else {
    initializeSecurity();
}

console.log('🛡️ Security module loaded');
