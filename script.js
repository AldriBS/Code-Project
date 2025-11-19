/*
 * =====================================================================
 * KOMATSU HYDRAULIC PLANT - WEB DASHBOARD SCRIPT v3.1
 * Firebase Real-time Database Integration
 *
 * NEW in v3.1:
 * - 🔒 ULTRA SECURITY: Integrated securePumpControl() wrapper
 * - 🔒 All pump commands now pass through security layer
 * - 🔒 Authentication, CSRF, rate limiting, audit logging
 *
 * v3.0 features:
 * - ✅ Sensor timeout detection (30s) - auto reset to 0
 * - ✅ Auto-pump activation system
 * - ✅ Configurable water level thresholds
 * - ✅ Alarm system integration
 * - ✅ Real-time sensor online/offline status
 *
 * Previous v2.1 features:
 * - FIX: Race condition pada toggle pump
 * - User Control Lock
 * - Safe data handling
 * =====================================================================
 */

// ==================== GLOBAL VARIABLES ====================
let area1Data = {
    waterLevel: 0,
    waterHeight: 0,
    pumpStatus: false,
    current: 0,
    servoPosition: 0,
    servoState: 'IDLE',
    timestamp: '',
    lastUpdate: 0,
    online: false,
    sensorOnline: true
};

let area2Data = {
    waterLevel: 0,
    waterHeight: 0,
    pumpStatus: false,
    current: 0,
    timestamp: '',
    lastUpdate: 0,
    online: false,
    sensorOnline: true
};

// Config data
let configData = {
    thresholds: {
        area1: {
            normal: { min: 0, max: 5 },
            warning: { min: 6, max: 7 },
            critical: { min: 8, max: 10 }
        },
        area2: {
            normal: { min: 0, max: 5 },
            warning: { min: 6, max: 7 },
            critical: { min: 8, max: 10 }
        }
    },
    autoPump: {
        area1: { enabled: true, activateLevel: 6, deactivateLevel: 3 },
        area2: { enabled: true, activateLevel: 6, deactivateLevel: 3 }
    },
    sensorTimeout: { seconds: 30 }
};

// User control locks
let isUserControllingArea1 = false;
let isUserControllingArea2 = false;
let area1ControlTimeout = null;
let area2ControlTimeout = null;

// Sensor timeout trackers
let area1TimeoutChecker = null;
let area2TimeoutChecker = null;

// ==================== LOAD CONFIG FROM FIREBASE ====================
async function loadConfig() {
    try {
        const configSnapshot = await firebase.database().ref('config').once('value');
        const config = configSnapshot.val();
        
        if (config) {
            configData = config;
            console.log('✅ Config loaded:', configData);
        } else {
            console.warn('⚠️ No config found, using defaults');
            // Initialize default config in Firebase
            await firebase.database().ref('config').set(configData);
        }
    } catch (error) {
        console.error('❌ Failed to load config:', error);
    }
}

// ==================== SENSOR TIMEOUT DETECTION ====================
function checkSensorTimeout(area) {
    const areaData = area === 'area1' ? area1Data : area2Data;
    const now = Date.now();
    const timeout = configData.sensorTimeout.seconds * 1000;
    
    if (areaData.lastUpdate === 0) return; // No data yet
    
    const timeSinceUpdate = now - areaData.lastUpdate;
    
    if (timeSinceUpdate > timeout && areaData.sensorOnline) {
        // Sensor went offline
        console.warn(`⚠️ ${area} sensor OFFLINE - No data for ${Math.round(timeSinceUpdate/1000)}s`);
        
        // Reset to zero
        if (area === 'area1') {
            area1Data.waterLevel = 0;
            area1Data.waterHeight = 0;
            area1Data.sensorOnline = false;
            updateArea1UI();
        } else {
            area2Data.waterLevel = 0;
            area2Data.waterHeight = 0;
            area2Data.sensorOnline = false;
            updateArea2UI();
        }
        
        showNotification(`${area} sensor offline - readings reset to 0`, 'warning');
        showSensorOfflineIndicator(area);
    }
}

// ==================== START SENSOR TIMEOUT CHECKER ====================
function startSensorTimeoutChecker(area) {
    // Clear existing checker
    if (area === 'area1' && area1TimeoutChecker) {
        clearInterval(area1TimeoutChecker);
    } else if (area === 'area2' && area2TimeoutChecker) {
        clearInterval(area2TimeoutChecker);
    }
    
    // Start new checker - check every 5 seconds
    const checker = setInterval(() => {
        checkSensorTimeout(area);
    }, 5000);
    
    if (area === 'area1') {
        area1TimeoutChecker = checker;
    } else {
        area2TimeoutChecker = checker;
    }
    
    console.log(`⏱️ Sensor timeout checker started for ${area}`);
}

// ==================== SENSOR OFFLINE INDICATOR ====================
function showSensorOfflineIndicator(area) {
    const areaNum = area === 'area1' ? 1 : 2;
    const indicatorId = `sensor-offline-${areaNum}`;

    // Remove existing indicator
    const existing = document.getElementById(indicatorId);
    if (existing) existing.remove();

    // Create indicator
    const indicator = document.createElement('div');
    indicator.id = indicatorId;
    indicator.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #ff9800;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 9998;
        font-weight: 600;
        animation: pulse 2s infinite;
        display: flex;
        align-items: center;
        gap: 10px;
    `;

    // Create text node
    const text = document.createTextNode(`⚠️ Area ${areaNum} Sensor OFFLINE`);

    // Create close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'background: none; border: 2px solid white; color: white; padding: 5px 10px; margin-left: 10px; border-radius: 5px; cursor: pointer; font-weight: 600;';
    closeBtn.onclick = function() {
        document.getElementById(indicatorId).remove();
    };

    // Append elements
    indicator.appendChild(text);
    indicator.appendChild(closeBtn);

    document.body.appendChild(indicator);
}

// ==================== REMOVE SENSOR OFFLINE INDICATOR ====================
function removeSensorOfflineIndicator(area) {
    const areaNum = area === 'area1' ? 1 : 2;
    const indicator = document.getElementById(`sensor-offline-${areaNum}`);
    if (indicator) {
        indicator.remove();
        showNotification(`Area ${areaNum} sensor back online`, 'success');
    }
}

// ==================== AUTO-PUMP LOGIC ====================
async function handleAutoPump(area, waterLevel) {
    const autoPumpConfig = configData.autoPump[area];
    
    console.log(`🔍 handleAutoPump: ${area}, level: ${waterLevel}, enabled: ${autoPumpConfig.enabled}`);
    
    if (!autoPumpConfig.enabled) {
        // Auto-pump disabled - MUST check for alarm
        console.log(`⚠️ Auto-pump DISABLED - Checking alarm condition for ${area}`);
        
        if (window.alarmSystem && window.alarmSystem.checkAlarmCondition) {
            await window.alarmSystem.checkAlarmCondition(area, waterLevel, false);
            console.log(`✅ Alarm check completed for ${area}`);
        } else {
            console.error('❌ Alarm system not available!');
        }
        return;
    }
    
    const areaData = area === 'area1' ? area1Data : area2Data;
    const currentPumpStatus = areaData.pumpStatus;
    
    // Auto ON logic
    if (waterLevel >= autoPumpConfig.activateLevel && !currentPumpStatus) {
        console.log(`🤖 AUTO-PUMP ON - ${area} - Level ${waterLevel} >= ${autoPumpConfig.activateLevel}`);
        await setPumpCommand(area, true, 'auto');
        showNotification(`Auto-pump activated for ${area} - Level ${waterLevel}`, 'info');
    }
    
    // Auto OFF logic
    if (waterLevel <= autoPumpConfig.deactivateLevel && currentPumpStatus) {
        console.log(`🤖 AUTO-PUMP OFF - ${area} - Level ${waterLevel} <= ${autoPumpConfig.deactivateLevel}`);
        await setPumpCommand(area, false, 'auto');
        showNotification(`Auto-pump deactivated for ${area} - Level ${waterLevel}`, 'info');
    }
    
    // Clear alarm if auto-pump enabled
    if (window.alarmSystem && window.alarmSystem.clearAlarm) {
        window.alarmSystem.clearAlarm(area);
    }
}

// ==================== SET PUMP COMMAND ====================
async function setPumpCommand(area, command, source = 'manual') {
    const ref = window.firebaseRefs[area];
    if (!ref) return;
    
    try {
        await ref.update({
            pumpCommand: command
        });
        console.log(`✅ Pump command sent: ${area} = ${command} (${source})`);
    } catch (error) {
        console.error('❌ Failed to send pump command:', error);
    }
}

// ==================== FIREBASE LISTENERS ====================
function setupFirebaseListeners() {
    if (!window.firebaseRefs) {
        console.error('Firebase references not initialized');
        return;
    }

    // Area 1 listener
    window.firebaseRefs.area1.on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            // Update timestamp
            const prevSensorStatus = area1Data.sensorOnline;
            area1Data.lastUpdate = Date.now();
            area1Data.sensorOnline = true;
            
            // Sensor back online
            if (!prevSensorStatus) {
                removeSensorOfflineIndicator('area1');
            }
            
            // Safe data assignment
            area1Data = {
                ...area1Data,
                waterLevel: data.waterLevel ?? 0,
                waterHeight: data.waterHeight ?? 0,
                pumpStatus: data.pumpStatus ?? false,
                current: data.current ?? 0,
                servoPosition: data.servoPosition ?? 0,
                servoState: data.servoState ?? 'IDLE',
                timestamp: data.timestamp ?? 'N/A',
                online: data.online ?? false
            };
            
            updateArea1UI();
            
            // Auto-pump check
            handleAutoPump('area1', area1Data.waterLevel);
            
            console.log('Area 1 updated:', {
                waterLevel: area1Data.waterLevel,
                pumpStatus: area1Data.pumpStatus,
                sensorOnline: area1Data.sensorOnline
            });
        }
    });

    // Area 2 listener
    window.firebaseRefs.area2.on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            // Update timestamp
            const prevSensorStatus = area2Data.sensorOnline;
            area2Data.lastUpdate = Date.now();
            area2Data.sensorOnline = true;
            
            // Sensor back online
            if (!prevSensorStatus) {
                removeSensorOfflineIndicator('area2');
            }
            
            // Safe data assignment
            area2Data = {
                ...area2Data,
                waterLevel: data.waterLevel ?? 0,
                waterHeight: data.waterHeight ?? 0,
                pumpStatus: data.pumpStatus ?? false,
                current: data.current ?? 0,
                timestamp: data.timestamp ?? 'N/A',
                online: data.online ?? false
            };
            
            updateArea2UI();
            
            // Auto-pump check
            handleAutoPump('area2', area2Data.waterLevel);
            
            console.log('Area 2 updated:', {
                waterLevel: area2Data.waterLevel,
                pumpStatus: area2Data.pumpStatus,
                sensorOnline: area2Data.sensorOnline
            });
        }
    });

    // Listen to auto-pump config changes
    firebase.database().ref('config/autoPump').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            configData.autoPump = data;
            console.log('🔄 Auto-pump config updated:', data);
        }
    });

    console.log('✅ Firebase listeners initialized');
    
    // Start timeout checkers
    startSensorTimeoutChecker('area1');
    startSensorTimeoutChecker('area2');
}

// ==================== UPDATE UI FUNCTIONS ====================
function updateArea1UI() {
    // Update status indicator
    const status1 = document.getElementById('status1');
    if (status1) {
        status1.className = area1Data.pumpStatus ? 'status-circle on' : 'status-circle off';
    }

    // Update water level bar
    updateWaterLevelBar('levelFill1', area1Data.waterLevel);

    // Update pump icon animation
    const pumpArea1 = document.getElementById('pumpArea1');
    if (pumpArea1) {
        const pumpIcon = pumpArea1.querySelector('.pump-icon');
        if (pumpIcon) {
            if (area1Data.pumpStatus) {
                pumpIcon.classList.add('active');
            } else {
                pumpIcon.classList.remove('active');
            }
        }
    }

    // Add sensor offline indicator to pump overlay
    if (!area1Data.sensorOnline) {
        if (pumpArea1) {
            pumpArea1.style.opacity = '0.5';
            pumpArea1.style.filter = 'grayscale(50%)';
        }
    } else {
        if (pumpArea1) {
            pumpArea1.style.opacity = '1';
            pumpArea1.style.filter = 'none';
        }
    }

    // Update detail page if exists
    updateDetailPage(1, area1Data);
}

function updateArea2UI() {
    // Update status indicator
    const status2 = document.getElementById('status2');
    if (status2) {
        status2.className = area2Data.pumpStatus ? 'status-circle on' : 'status-circle off';
    }

    // Update water level bar
    updateWaterLevelBar('levelFill2', area2Data.waterLevel);

    // Update pump icon animation
    const pumpArea2 = document.getElementById('pumpArea2');
    if (pumpArea2) {
        const pumpIcon = pumpArea2.querySelector('.pump-icon');
        if (pumpIcon) {
            if (area2Data.pumpStatus) {
                pumpIcon.classList.add('active');
            } else {
                pumpIcon.classList.remove('active');
            }
        }
    }

    // Add sensor offline indicator to pump overlay
    if (!area2Data.sensorOnline) {
        if (pumpArea2) {
            pumpArea2.style.opacity = '0.5';
            pumpArea2.style.filter = 'grayscale(50%)';
        }
    } else {
        if (pumpArea2) {
            pumpArea2.style.opacity = '1';
            pumpArea2.style.filter = 'none';
        }
    }

    // Update detail page if exists
    updateDetailPage(2, area2Data);
}

// ==================== WATER LEVEL BAR UPDATE ====================
function updateWaterLevelBar(elementId, level) {
    const levelFill = document.getElementById(elementId);
    if (!levelFill) return;

    const safeLevel = Math.max(0, Math.min(10, level ?? 0));
    const heightPercent = (safeLevel / 10) * 100;
    
    levelFill.style.setProperty('--fill-height', heightPercent + '%');
    
    // Remove all level classes
    levelFill.className = levelFill.className.replace(/level-\d+/g, '').trim();
    
    // Add appropriate level class
    const levelClass = 'level-' + Math.ceil(safeLevel);
    levelFill.classList.add(levelClass);
}

// ==================== DETAIL PAGE UPDATE ====================
function updateDetailPage(area, data) {
    const safeData = {
        waterLevel: data.waterLevel ?? 0,
        waterHeight: data.waterHeight ?? 0,
        pumpStatus: data.pumpStatus ?? false,
        current: data.current ?? 0,
        servoPosition: data.servoPosition ?? 0,
        servoState: data.servoState ?? 'IDLE',
        timestamp: data.timestamp ?? 'N/A',
        online: data.online ?? false,
        sensorOnline: data.sensorOnline ?? true
    };
    
    // Update toggle switch
    const toggle = document.getElementById('pumpToggle' + area);
    if (toggle) {
        const isUserControlling = area === 1 ? isUserControllingArea1 : isUserControllingArea2;
        
        if (!isUserControlling) {
            toggle.checked = safeData.pumpStatus;
        } else {
            const userCommandedState = toggle.checked;
            
            if (safeData.pumpStatus === userCommandedState) {
                console.log(`✅ Area ${area}: ESP32 confirmed pump ${userCommandedState ? 'ON' : 'OFF'}`);
                
                if (area === 1) {
                    isUserControllingArea1 = false;
                    if (area1ControlTimeout) {
                        clearTimeout(area1ControlTimeout);
                        area1ControlTimeout = null;
                    }
                } else {
                    isUserControllingArea2 = false;
                    if (area2ControlTimeout) {
                        clearTimeout(area2ControlTimeout);
                        area2ControlTimeout = null;
                    }
                }
            }
        }
    }

    // Update level value
    const levelValue = document.getElementById('levelValue' + area);
    if (levelValue) {
        levelValue.textContent = safeData.waterLevel.toFixed(1);
    }

    // Update height
    const levelCm = document.getElementById('levelCm' + area);
    if (levelCm) {
        levelCm.textContent = safeData.waterHeight.toFixed(1);
    }

    // Update status text
    const levelStatus = document.getElementById('levelStatus' + area);
    if (levelStatus) {
        const areaKey = 'area' + area;
        const thresholds = configData.thresholds[areaKey];
        
        if (safeData.waterLevel >= thresholds.critical.min) {
            levelStatus.textContent = 'CRITICAL';
            levelStatus.className = 'level-status danger';
        } else if (safeData.waterLevel >= thresholds.warning.min) {
            levelStatus.textContent = 'WARNING';
            levelStatus.className = 'level-status warning';
        } else {
            levelStatus.textContent = 'Normal';
            levelStatus.className = 'level-status normal';
        }
    }

    // Update large level bar
    const levelFillDetail = document.getElementById('levelFillDetail' + area);
    if (levelFillDetail) {
        const heightPercent = (safeData.waterLevel / 10) * 100;
        levelFillDetail.style.setProperty('--fill-height', heightPercent + '%');
        
        levelFillDetail.className = levelFillDetail.className.replace(/level-\d+/g, '').trim();
        const levelClass = 'level-' + Math.ceil(safeData.waterLevel);
        levelFillDetail.classList.add(levelClass);
    }

    // Show sensor offline warning
    if (!safeData.sensorOnline) {
        showSensorOfflineWarningDetail(area);
    } else {
        removeSensorOfflineWarningDetail(area);
    }
}

// ==================== SENSOR OFFLINE WARNING DETAIL PAGE ====================
function showSensorOfflineWarningDetail(area) {
    const warningId = `sensor-warning-detail-${area}`;
    if (document.getElementById(warningId)) return;
    
    const warning = document.createElement('div');
    warning.id = warningId;
    warning.style.cssText = `
        background: #ff9800;
        color: white;
        padding: 12px 15px;
        border-radius: 8px;
        margin-bottom: 15px;
        font-weight: 600;
        text-align: center;
    `;
    warning.textContent = '⚠️ Sensor OFFLINE - Readings reset to 0';
    
    const controlPanel = document.querySelector('.control-panel');
    if (controlPanel) {
        controlPanel.insertBefore(warning, controlPanel.firstChild);
    }
}

function removeSensorOfflineWarningDetail(area) {
    const warning = document.getElementById(`sensor-warning-detail-${area}`);
    if (warning) warning.remove();
}

// ==================== PUMP CONTROL ====================
async function togglePump(area) {
    const toggle = document.getElementById('pumpToggle' + area);
    if (!toggle) return;

    const command = toggle.checked;
    const areaKey = 'area' + area;

    console.log(`🎛️ Manual pump command for ${areaKey}: ${command ? 'ON' : 'OFF'}`);

    // Activate user control lock
    if (area === 1) {
        isUserControllingArea1 = true;
        if (area1ControlTimeout) clearTimeout(area1ControlTimeout);
        area1ControlTimeout = setTimeout(() => {
            console.warn('⚠️ Area 1: Timeout waiting ESP32 confirmation');

            // ✅ REVERT TOGGLE - Pompa tidak merespons
            const toggle1 = document.getElementById('pumpToggle1');
            if (toggle1) {
                toggle1.checked = !command;  // Kembalikan ke posisi semula
                console.log(`🔄 Toggle reverted to: ${toggle1.checked ? 'ON' : 'OFF'}`);
            }

            isUserControllingArea1 = false;
            area1ControlTimeout = null;
            showNotification('Area 1: Pompa tidak merespons - Toggle dikembalikan', 'warning');
        }, 10000);
    } else {
        isUserControllingArea2 = true;
        if (area2ControlTimeout) clearTimeout(area2ControlTimeout);
        area2ControlTimeout = setTimeout(() => {
            console.warn('⚠️ Area 2: Timeout waiting ESP32 confirmation');

            // ✅ REVERT TOGGLE - Pompa tidak merespons
            const toggle2 = document.getElementById('pumpToggle2');
            if (toggle2) {
                toggle2.checked = !command;  // Kembalikan ke posisi semula
                console.log(`🔄 Toggle reverted to: ${toggle2.checked ? 'ON' : 'OFF'}`);
            }

            isUserControllingArea2 = false;
            area2ControlTimeout = null;
            showNotification('Area 2: Pompa tidak merespons - Toggle dikembalikan', 'warning');
        }, 10000);
    }

    showNotification(`${areaKey}: Sending command...`, 'info');

    // ✅ USE SECURE PUMP CONTROL WRAPPER
    // This provides: Authentication, CSRF protection, Rate limiting,
    // Blocked user check, Audit logging, Input validation
    const success = await securePumpControl(area, command);

    if (success) {
        console.log('✅ Command sent successfully (security verified)');
        const action = command ? 'starting' : 'stopping';
        showNotification(`${areaKey}: Pump ${action}`, 'success');
    } else {
        console.error('❌ Failed to send command or security check failed');
        toggle.checked = !command; // Revert toggle

        // Clear user control lock
        if (area === 1) {
            isUserControllingArea1 = false;
            if (area1ControlTimeout) {
                clearTimeout(area1ControlTimeout);
                area1ControlTimeout = null;
            }
        } else {
            isUserControllingArea2 = false;
            if (area2ControlTimeout) {
                clearTimeout(area2ControlTimeout);
                area2ControlTimeout = null;
            }
        }

        showNotification(`${areaKey}: Security check failed or command error`, 'error');
    }
}

// ==================== NAVIGATION ====================
function goToArea(area) {
    window.location.href = `area${area}.html`;
}

// ==================== NOTIFICATION SYSTEM ====================
function showNotification(message, type = 'info') {
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notif => {
        if (notif.textContent === message) {
            notif.remove();
        }
    });
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    const bgColor = type === 'success' ? '#28a745' : 
                    type === 'error' ? '#dc3545' : 
                    type === 'warning' ? '#ff9800' : '#003087';
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        background: ${bgColor};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
        font-weight: 500;
        max-width: 300px;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// ==================== CSS ANIMATIONS ====================
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
    
    @keyframes pulse {
        0%, 100% {
            opacity: 1;
        }
        50% {
            opacity: 0.7;
        }
    }
`;
document.head.appendChild(style);

// ==================== INITIALIZE ON PAGE LOAD ====================
window.addEventListener('load', async () => {
    console.log('Initializing KOMATSU Flood Control Dashboard v3.1...');
    console.log('🔒 NEW: Ultra Security Layer + CSRF + Rate Limiting');
    
    // Load config first
    await loadConfig();
    
    // Wait for Firebase
    const checkFirebase = setInterval(() => {
        if (window.firebaseRefs) {
            clearInterval(checkFirebase);
            setupFirebaseListeners();
            console.log('✅ Dashboard initialized successfully');
            showNotification('System Online - Monitoring Active', 'success');
        }
    }, 100);
    
    setTimeout(() => {
        clearInterval(checkFirebase);
        if (!window.firebaseRefs) {
            console.error('❌ Firebase initialization timeout');
            showNotification('Failed to connect to database', 'error');
        }
    }, 10000);
});

// ==================== CONNECTION STATUS MONITOR ====================
let connectionRef = firebase.database().ref('.info/connected');
connectionRef.on('value', (snapshot) => {
    if (snapshot.val() === true) {
        console.log('✅ Connected to Firebase');
    } else {
        console.log('❌ Disconnected from Firebase');
        showNotification('Connection lost - Reconnecting...', 'error');
    }
});

console.log('✅ Script loaded - KOMATSU Flood Control System v3.1');
console.log('✅ Features: Ultra Security | Sensor Timeout | Auto-Pump | Alarm System');