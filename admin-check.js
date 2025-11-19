// Admin Check Middleware
// Checks if current user is admin and controls UI accordingly

let currentUserRole = null;
let isAdmin = false;

// Check user role and setup UI permissions
async function checkUserRole() {
    try {
        const user = firebase.auth().currentUser;

        if (!user) {
            console.log('❌ No user logged in');
            return false;
        }

        // Get ID token with custom claims
        const idTokenResult = await user.getIdTokenResult();

        // Check if user is admin
        isAdmin = idTokenResult.claims.admin === true;
        currentUserRole = idTokenResult.claims.role || 'user';

        console.log('✅ User role checked:', {
            email: user.email,
            isAdmin: isAdmin,
            role: currentUserRole
        });

        // Update UI based on role
        updateUIPermissions();

        return true;
    } catch (error) {
        console.error('❌ Error checking user role:', error);
        return false;
    }
}

// Update UI elements based on user permissions
function updateUIPermissions() {
    // If not admin, disable config modification
    if (!isAdmin) {
        // Disable auto-pump toggle switches
        const autoPumpToggles = document.querySelectorAll('[id^="autoPumpToggle"]');
        autoPumpToggles.forEach(toggle => {
            toggle.disabled = true;
            toggle.style.opacity = '0.6';
            toggle.style.cursor = 'not-allowed';
        });

        // Add "Admin Only" badge to auto-pump sections
        const autoPumpSections = document.querySelectorAll('.auto-pump-control h2');
        autoPumpSections.forEach(header => {
            if (!header.querySelector('.admin-only-badge')) {
                const badge = document.createElement('span');
                badge.className = 'admin-only-badge';
                badge.textContent = '🔒 Admin Only';
                badge.style.cssText = `
                    display: inline-block;
                    background: #ff9800;
                    color: white;
                    font-size: 11px;
                    padding: 3px 8px;
                    border-radius: 4px;
                    margin-left: 10px;
                    font-weight: 600;
                `;
                header.appendChild(badge);
            }
        });

        // Show notification
        showNotification('You are logged in as User (Read-only for settings)', 'info');

        console.log('🔒 User permissions applied: Config modification disabled');
    } else {
        console.log('👑 Admin permissions: Full access enabled');
        showNotification('Welcome Admin! You have full access', 'success');
    }

    // Display user role in header
    displayUserRole();
}

// Display user role badge in header
function displayUserRole() {
    const userInfoDiv = document.getElementById('userInfo');
    if (userInfoDiv) {
        const user = firebase.auth().currentUser;
        if (user) {
            const roleIcon = isAdmin ? '👑' : '👤';
            const roleText = isAdmin ? 'Admin' : 'User';
            const roleColor = isAdmin ? '#ffd700' : '#4CAF50';

            userInfoDiv.innerHTML = `
                <span style="margin-right: 10px; display: flex; align-items: center; gap: 5px;">
                    <span style="background: ${roleColor}; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">
                        ${roleIcon} ${roleText}
                    </span>
                    <span>${user.email}</span>
                </span>
                <button onclick="logout()" style="
                    background: rgba(255,255,255,0.2);
                    border: 1px solid rgba(255,255,255,0.3);
                    color: white;
                    padding: 5px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                    transition: all 0.3s;
                " onmouseover="this.style.background='rgba(255,255,255,0.3)'"
                   onmouseout="this.style.background='rgba(255,255,255,0.2)'">
                    Logout
                </button>
            `;
        }
    }
}

// Override toggleAutoPump function to check admin permission
const originalToggleAutoPump = window.toggleAutoPump;
window.toggleAutoPump = async function(area) {
    if (!isAdmin) {
        showNotification('⛔ Access Denied: Only admins can modify auto-pump settings', 'error');

        // Revert toggle state
        const toggle = document.getElementById('autoPumpToggle' + area);
        if (toggle) {
            toggle.checked = !toggle.checked;
        }

        return;
    }

    // If admin, proceed with original function
    if (originalToggleAutoPump) {
        return originalToggleAutoPump(area);
    }
};

// Check permission before any config write
function checkAdminPermission(action) {
    if (!isAdmin) {
        showNotification(`⛔ Access Denied: Only admins can ${action}`, 'error');
        return false;
    }
    return true;
}

// Enhanced notification with auto-dismiss
function showNotification(message, type = 'info') {
    // Remove existing notification
    const existing = document.querySelector('.notification-toast');
    if (existing) {
        existing.remove();
    }

    const colors = {
        success: { bg: '#4CAF50', icon: '✓' },
        error: { bg: '#f44336', icon: '✕' },
        warning: { bg: '#ff9800', icon: '⚠' },
        info: { bg: '#2196F3', icon: 'ℹ' }
    };

    const color = colors[type] || colors.info;

    const notification = document.createElement('div');
    notification.className = 'notification-toast';
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: ${color.bg};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 10px;
        animation: slideIn 0.3s ease-out;
        max-width: 400px;
        font-size: 14px;
    `;

    notification.innerHTML = `
        <span style="font-size: 18px; font-weight: bold;">${color.icon}</span>
        <span>${message}</span>
    `;

    // Add animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(400px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        @keyframes slideOut {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(400px);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);

    document.body.appendChild(notification);

    // Auto dismiss after 5 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

// Initialize role check when user is authenticated
firebase.auth().onAuthStateChanged((user) => {
    if (user) {
        console.log('🔐 User authenticated, checking role...');
        checkUserRole();
    } else {
        console.log('🚫 No user authenticated');
        isAdmin = false;
        currentUserRole = null;
    }
});
