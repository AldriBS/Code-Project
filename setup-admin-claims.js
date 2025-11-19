/**
 * Firebase Cloud Function to Set Admin Custom Claims
 *
 * SETUP INSTRUCTIONS:
 * 1. Install Firebase CLI: npm install -g firebase-tools
 * 2. Initialize functions: firebase init functions
 * 3. Copy this code to functions/index.js
 * 4. Deploy: firebase deploy --only functions
 *
 * USAGE:
 * Call this function via HTTP or Firebase Console
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

/**
 * Set user as admin
 * HTTP Endpoint: https://YOUR-PROJECT.cloudfunctions.net/setAdminClaim
 * Body: { "email": "admin@example.com" }
 */
exports.setAdminClaim = functions.https.onCall(async (data, context) => {
    // Check if request is made by an existing admin
    if (!context.auth || !context.auth.token.admin) {
        throw new functions.https.HttpsError(
            'permission-denied',
            'Only admins can set other admins'
        );
    }

    const email = data.email;

    try {
        const user = await admin.auth().getUserByEmail(email);

        // Set custom claims
        await admin.auth().setCustomUserClaims(user.uid, {
            admin: true,
            role: 'admin'
        });

        // Save to database
        await admin.database().ref(`userRoles/${user.uid}`).set({
            email: email,
            role: 'admin',
            createdAt: new Date().toISOString(),
            setBy: context.auth.uid
        });

        return {
            message: `Success! ${email} is now an admin`,
            uid: user.uid
        };
    } catch (error) {
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * Set user as regular user (non-admin)
 */
exports.setUserClaim = functions.https.onCall(async (data, context) => {
    // Check if request is made by an admin
    if (!context.auth || !context.auth.token.admin) {
        throw new functions.https.HttpsError(
            'permission-denied',
            'Only admins can set user roles'
        );
    }

    const email = data.email;

    try {
        const user = await admin.auth().getUserByEmail(email);

        // Set custom claims
        await admin.auth().setCustomUserClaims(user.uid, {
            admin: false,
            role: 'user'
        });

        // Save to database
        await admin.database().ref(`userRoles/${user.uid}`).set({
            email: email,
            role: 'user',
            createdAt: new Date().toISOString(),
            setBy: context.auth.uid
        });

        return {
            message: `Success! ${email} is now a regular user`,
            uid: user.uid
        };
    } catch (error) {
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * Set ESP32 device claim
 */
exports.setESP32Claim = functions.https.onCall(async (data, context) => {
    // Check if request is made by an admin
    if (!context.auth || !context.auth.token.admin) {
        throw new functions.https.HttpsError(
            'permission-denied',
            'Only admins can set ESP32 devices'
        );
    }

    const uid = data.uid;

    try {
        // Set custom claims for ESP32
        await admin.auth().setCustomUserClaims(uid, {
            admin: false,
            role: 'esp32'
        });

        // Save to database
        await admin.database().ref(`userRoles/${uid}`).set({
            email: 'esp32-device',
            role: 'esp32',
            createdAt: new Date().toISOString(),
            setBy: context.auth.uid
        });

        return {
            message: `Success! ESP32 device registered`,
            uid: uid
        };
    } catch (error) {
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * Get user role
 */
exports.getUserRole = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'User must be authenticated'
        );
    }

    const user = await admin.auth().getUser(context.auth.uid);

    return {
        uid: user.uid,
        email: user.email,
        customClaims: user.customClaims || {},
        isAdmin: user.customClaims?.admin === true,
        role: user.customClaims?.role || 'user'
    };
});

/**
 * Triggered when new user is created
 * Automatically set as regular user (not admin)
 */
exports.onUserCreate = functions.auth.user().onCreate(async (user) => {
    // Set default claims for new users
    await admin.auth().setCustomUserClaims(user.uid, {
        admin: false,
        role: 'user'
    });

    // Save to database
    await admin.database().ref(`userRoles/${user.uid}`).set({
        email: user.email,
        role: 'user',
        createdAt: new Date().toISOString()
    });

    console.log(`New user created: ${user.email} with role: user`);
});
