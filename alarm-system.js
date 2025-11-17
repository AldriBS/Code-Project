/*
 * =====================================================================
 * KOMATSU FLOOD CONTROL - ALARM SYSTEM v1.0
 * Real-time Alert & Notification System
 * =====================================================================
 */

console.log('🚨 Initializing Alarm System...');

// ==================== GLOBAL STATE ====================
let alarmState = {
    area1: {
        active: false,
        level: 0,
        priority: null,
        acknowledgedBy: null,
        triggeredAt: null
    },
    area2: {
        active: false,
        level: 0,
        priority: null,
        acknowledgedBy: null,
        triggeredAt: null
    }
};

let audioContext = null;
let alarmBeepInterval = null;
let notificationPermission = 'default';

// ==================== ALARM PRIORITY LEVELS ====================
const ALARM_PRIORITY = {
    WARNING: {
        name: 'WARNING',
        color: '#f39c12',
        icon: '⚠️',
        beepInterval: null, // No sound
        levels: [6]
    },
    ALERT: {
        name: 'ALERT', 
        color: '#ff9800',
        icon: '🚨',
        beepInterval: 15000, // 15 seconds
        levels: [7]
    },
    CRITICAL: {
        name: 'CRITICAL',
        color: '#e74c3c',
        icon: '🆘',
        beepInterval: 5000, // 5 seconds
        levels: [8, 9, 10]
    }
};

// ==================== INITIALIZE AUDIO ====================
function initAudio() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log('✅ Audio context initialized');
    } catch (error) {
        console.warn('⚠️ Audio not supported:', error);
    }
}

// ==================== BEEP SOUND GENERATOR ====================
function playBeep(frequency = 800, duration = 200) {
    if (!audioContext) return;
    
    try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration / 1000);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration / 1000);
        
        console.log('🔊 Beep played:', frequency + 'Hz');
    } catch (error) {
        console.error('❌ Beep error:', error);
    }
}

// ==================== REQUEST NOTIFICATION PERMISSION ====================
async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        console.warn('⚠️ Browser does not support notifications');
        return 'denied';
    }
    
    if (Notification.permission === 'granted') {
        console.log('✅ Notification permission already granted');
        return 'granted';
    }
    
    if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        notificationPermission = permission;
        console.log('🔔 Notification permission:', permission);
        return permission;
    }
    
    return Notification.permission;
}

// ==================== BROWSER NOTIFICATION ====================
function showBrowserNotification(area, level, priority) {
    if (Notification.permission !== 'granted') return;
    
    const title = `🚨 ${priority} - Area ${area}`;
    const body = `Water level: ${level} - Auto-pump disabled!\nManual intervention required.`;
    
    const notification = new Notification(title, {
        body: body,
        icon: 'komatsu_logo.png',
        badge: 'komatsu_logo.png',
        tag: `alarm-area${area}`,
        requireInteraction: true,
        vibrate: [200, 100, 200]
    });
    
    notification.onclick = () => {
        window.focus();
        notification.close();
        goToArea(area);
    };
    
    console.log('🔔 Browser notification sent:', title);
}

// ==================== GET ALARM PRIORITY ====================
function getAlarmPriority(level) {
    for (const [key, priority] of Object.entries(ALARM_PRIORITY)) {
        if (priority.levels.includes(level)) {
            return priority;
        }
    }
    return null;
}

// ==================== CHECK ALARM CONDITION ====================
async function checkAlarmCondition(area, waterLevel, autoPumpEnabled) {
    const areaNum = area === 'area1' ? 1 : 2;
    const priority = getAlarmPriority(waterLevel);
    
    // No alarm if auto-pump enabled OR level is safe
    if (autoPumpEnabled || !priority) {
        if (alarmState[area].active) {
            clearAlarm(area);
        }
        return;
    }
    
    // Alarm should be active
    if (!alarmState[area].active) {
        // New alarm
        console.log(`🚨 ALARM TRIGGERED - Area ${areaNum} - Level ${waterLevel} - ${priority.name}`);
        
        alarmState[area] = {
            active: true,
            level: waterLevel,
            priority: priority.name,
            acknowledgedBy: null,
            triggeredAt: new Date().toISOString()
        };
        
        // Log to Firebase
        await logAlarmToFirebase(area, 'TRIGGERED', waterLevel, priority.name);
        
        // Show visual alarm
        showVisualAlarm(areaNum, waterLevel, priority);
        
        // Start beeping if needed
        startAlarmBeep(priority);
        
        // Browser notification
        showBrowserNotification(areaNum, waterLevel, priority.name);
        
    } else {
        // Update existing alarm
        if (alarmState[area].level !== waterLevel) {
            console.log(`🚨 ALARM UPDATED - Area ${areaNum} - Level ${waterLevel}`);
            alarmState[area].level = waterLevel;
            updateVisualAlarm(areaNum, waterLevel, priority);
        }
    }
}

// ==================== VISUAL ALARM BANNER ====================
function showVisualAlarm(area, level, priority) {
    // Remove existing alarm for this area
    const existingAlarm = document.getElementById(`alarm-banner-${area}`);
    if (existingAlarm) {
        existingAlarm.remove();
    }
    
    // Create alarm banner
    const banner = document.createElement('div');
    banner.id = `alarm-banner-${area}`;
    banner.className = 'alarm-banner';
    banner.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: ${priority.color};
        color: white;
        padding: 15px 20px;
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: space-between;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        animation: alarmFlash 1s ease-in-out infinite;
        font-weight: 600;
    `;
    
    banner.innerHTML = `
        <div style="display: flex; align-items: center; gap: 15px; flex: 1;">
            <span style="font-size: 24px;">${priority.icon}</span>
            <div>
                <div style="font-size: 16px; font-weight: 700;">
                    ${priority.name} ALERT - AREA ${area}
                </div>
                <div style="font-size: 13px; opacity: 0.95; margin-top: 3px;">
                    Water level: ${level} - Auto-pump DISABLED - Manual intervention required
                </div>
            </div>
        </div>
        <div style="display: flex; gap: 10px;">
            <button onclick="acknowledgeAlarm(${area})" style="
                background: rgba(255,255,255,0.2);
                border: 2px solid white;
                color: white;
                padding: 8px 15px;
                border-radius: 5px;
                cursor: pointer;
                font-weight: 600;
                font-size: 13px;
                transition: all 0.3s;
            " onmouseover="this.style.background='rgba(255,255,255,0.3)'" 
               onmouseout="this.style.background='rgba(255,255,255,0.2)'">
                ✓ ACKNOWLEDGE
            </button>
            <button onclick="quickEnableAutoPump(${area})" style="
                background: white;
                border: 2px solid white;
                color: ${priority.color};
                padding: 8px 15px;
                border-radius: 5px;
                cursor: pointer;
                font-weight: 600;
                font-size: 13px;
                transition: all 0.3s;
            " onmouseover="this.style.background='#f0f0f0'" 
               onmouseout="this.style.background='white'">
                ⚡ ENABLE AUTO-PUMP
            </button>
            <button onclick="goToArea(${area})" style="
                background: rgba(255,255,255,0.2);
                border: 2px solid white;
                color: white;
                padding: 8px 15px;
                border-radius: 5px;
                cursor: pointer;
                font-weight: 600;
                font-size: 13px;
                transition: all 0.3s;
            " onmouseover="this.style.background='rgba(255,255,255,0.3)'" 
               onmouseout="this.style.background='rgba(255,255,255,0.2)'">
                → GO TO AREA ${area}
            </button>
        </div>
    `;
    
    document.body.insertBefore(banner, document.body.firstChild);
    
    // Adjust content margin
    const container = document.querySelector('.container');
    if (container) {
        container.style.marginTop = '80px';
    }
    
    console.log('🎨 Visual alarm displayed for Area', area);
}

// ==================== UPDATE VISUAL ALARM ====================
function updateVisualAlarm(area, level, priority) {
    const banner = document.getElementById(`alarm-banner-${area}`);
    if (!banner) return;
    
    banner.style.background = priority.color;
    banner.querySelector('div > div:first-child').innerHTML = 
        `${priority.name} ALERT - AREA ${area}`;
    banner.querySelector('div > div:last-child').innerHTML = 
        `Water level: ${level} - Auto-pump DISABLED - Manual intervention required`;
}

// ==================== START ALARM BEEP ====================
function startAlarmBeep(priority) {
    // Stop existing beep
    if (alarmBeepInterval) {
        clearInterval(alarmBeepInterval);
        alarmBeepInterval = null;
    }
    
    // Start new beep if interval specified
    if (priority.beepInterval) {
        // Immediate first beep
        playBeep();
        
        // Repeating beep
        alarmBeepInterval = setInterval(() => {
            playBeep();
        }, priority.beepInterval);
        
        console.log(`🔊 Alarm beep started: every ${priority.beepInterval}ms`);
    }
}

// ==================== STOP ALARM BEEP ====================
function stopAlarmBeep() {
    if (alarmBeepInterval) {
        clearInterval(alarmBeepInterval);
        alarmBeepInterval = null;
        console.log('🔇 Alarm beep stopped');
    }
}

// ==================== ACKNOWLEDGE ALARM ====================
async function acknowledgeAlarm(area) {
    const areaKey = `area${area}`;
    
    if (!alarmState[areaKey].active) {
        console.warn('⚠️ No active alarm to acknowledge');
        return;
    }
    
    console.log(`✓ Alarm acknowledged for Area ${area}`);
    
    // Get current user
    const user = firebase.auth().currentUser;
    const userEmail = user ? user.email : 'unknown';
    
    // Stop beeping
    stopAlarmBeep();
    
    // Update state
    alarmState[areaKey].acknowledgedBy = userEmail;
    
    // Log to Firebase
    await logAlarmToFirebase(areaKey, 'ACKNOWLEDGED', alarmState[areaKey].level, alarmState[areaKey].priority, userEmail);
    
    // Update visual (add acknowledged badge)
    const banner = document.getElementById(`alarm-banner-${area}`);
    if (banner) {
        const badge = document.createElement('div');
        badge.style.cssText = `
            background: rgba(0,0,0,0.3);
            padding: 5px 12px;
            border-radius: 15px;
            font-size: 12px;
            margin-left: 15px;
        `;
        badge.textContent = `✓ Acknowledged by ${userEmail}`;
        banner.querySelector('div:first-child').appendChild(badge);
        
        // Dim the banner
        banner.style.opacity = '0.8';
    }
    
    showNotification(`Alarm acknowledged by ${userEmail}`, 'info');
}

// ==================== CLEAR ALARM ====================
function clearAlarm(area) {
    const areaNum = area === 'area1' ? 1 : 2;
    
    if (!alarmState[area].active) return;
    
    console.log(`✅ Alarm cleared for Area ${areaNum}`);
    
    // Stop beeping
    stopAlarmBeep();
    
    // Remove visual
    const banner = document.getElementById(`alarm-banner-${areaNum}`);
    if (banner) {
        banner.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => {
            banner.remove();
            
            // Reset content margin
            const container = document.querySelector('.container');
            if (container) {
                container.style.marginTop = '0';
            }
        }, 300);
    }
    
    // Reset state
    alarmState[area] = {
        active: false,
        level: 0,
        priority: null,
        acknowledgedBy: null,
        triggeredAt: null
    };
}

// ==================== QUICK ENABLE AUTO-PUMP ====================
async function quickEnableAutoPump(area) {
    const areaKey = `area${area}`;
    
    console.log(`⚡ Quick enabling auto-pump for Area ${area}`);
    
    try {
        // Enable auto-pump in Firebase
        await firebase.database().ref(`config/autoPump/${areaKey}/enabled`).set(true);
        
        // Clear alarm
        clearAlarm(areaKey);
        
        showNotification(`Auto-pump enabled for Area ${area}`, 'success');
        
        // Redirect to area page
        setTimeout(() => {
            goToArea(area);
        }, 1000);
        
    } catch (error) {
        console.error('❌ Failed to enable auto-pump:', error);
        showNotification('Failed to enable auto-pump', 'error');
    }
}

// ==================== LOG ALARM TO FIREBASE ====================
async function logAlarmToFirebase(area, action, level, priority, user = 'system') {
    try {
        const logEntry = {
            timestamp: new Date().toISOString(),
            action: action,
            level: level,
            priority: priority,
            user: user
        };
        
        // Add to history
        await firebase.database().ref(`alarms/${area}/history`).push(logEntry);
        
        // Update current alarm
        if (action === 'TRIGGERED') {
            await firebase.database().ref(`alarms/${area}/current`).set({
                level: level,
                triggered: logEntry.timestamp,
                acknowledged: false,
                acknowledgedBy: null,
                acknowledgedAt: null,
                priority: priority
            });
        } else if (action === 'ACKNOWLEDGED') {
            await firebase.database().ref(`alarms/${area}/current`).update({
                acknowledged: true,
                acknowledgedBy: user,
                acknowledgedAt: logEntry.timestamp
            });
        }
        
        console.log('📝 Alarm logged to Firebase:', action);
        
    } catch (error) {
        console.error('❌ Failed to log alarm:', error);
    }
}

// ==================== CSS ANIMATIONS ====================
const alarmStyles = document.createElement('style');
alarmStyles.textContent = `
    @keyframes alarmFlash {
        0%, 100% {
            opacity: 1;
        }
        50% {
            opacity: 0.85;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateY(0);
            opacity: 1;
        }
        to {
            transform: translateY(-100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(alarmStyles);

// ==================== INITIALIZE ON LOAD ====================
window.addEventListener('load', async () => {
    console.log('🚨 Alarm system initializing...');
    
    // Initialize audio
    initAudio();
    
    // Request notification permission
    await requestNotificationPermission();
    
    console.log('✅ Alarm system ready');
});

// ==================== EXPORT FUNCTIONS ====================
window.alarmSystem = {
    checkAlarmCondition,
    acknowledgeAlarm,
    clearAlarm,
    quickEnableAutoPump
};

console.log('✅ Alarm system loaded');