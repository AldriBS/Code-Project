/**
 * =============================================================================
 * LIST ADMINS - Komatsu Flood Control System
 * =============================================================================
 *
 * Script untuk melihat daftar semua admin
 *
 * Usage:
 *   node list-admins.js
 *
 * =============================================================================
 */

const admin = require('firebase-admin');

// ==================== INITIALIZE FIREBASE ====================
try {
    const serviceAccount = require('./serviceAccountKey.json');

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`
    });

    console.log('✅ Firebase Admin initialized\n');
} catch (error) {
    console.error('❌ Error loading service account key:');
    console.error('   Make sure serviceAccountKey.json exists!');
    console.error('   Error:', error.message);
    process.exit(1);
}

// ==================== LIST ADMINS FUNCTION ====================
async function listAdmins() {
    console.log('👑 Listing all admins...\n');

    try {
        // Get all users from Authentication
        const listUsersResult = await admin.auth().listUsers(1000);

        const admins = [];
        const users = [];
        const others = [];

        for (const user of listUsersResult.users) {
            const claims = user.customClaims || {};

            if (claims.admin === true || claims.role === 'admin') {
                admins.push({
                    email: user.email,
                    uid: user.uid,
                    created: user.metadata.creationTime,
                    lastSignIn: user.metadata.lastSignInTime || 'Never'
                });
            } else if (claims.role === 'user') {
                users.push({
                    email: user.email,
                    uid: user.uid,
                    created: user.metadata.creationTime,
                    lastSignIn: user.metadata.lastSignInTime || 'Never'
                });
            } else {
                others.push({
                    email: user.email,
                    uid: user.uid,
                    role: claims.role || 'none',
                    created: user.metadata.creationTime
                });
            }
        }

        // Display Admins
        console.log('═══════════════════════════════════════════════════════');
        console.log('👑 ADMINS (' + admins.length + ')');
        console.log('═══════════════════════════════════════════════════════');

        if (admins.length === 0) {
            console.log('   No admins found');
        } else {
            admins.forEach((admin, index) => {
                console.log(`\n${index + 1}. ${admin.email}`);
                console.log(`   UID: ${admin.uid}`);
                console.log(`   Created: ${admin.created}`);
                console.log(`   Last Login: ${admin.lastSignIn}`);
            });
        }

        // Display Users
        console.log('\n\n═══════════════════════════════════════════════════════');
        console.log('👤 USERS (' + users.length + ')');
        console.log('═══════════════════════════════════════════════════════');

        if (users.length === 0) {
            console.log('   No regular users found');
        } else {
            users.forEach((user, index) => {
                console.log(`\n${index + 1}. ${user.email}`);
                console.log(`   UID: ${user.uid}`);
                console.log(`   Created: ${user.created}`);
                console.log(`   Last Login: ${user.lastSignIn}`);
            });
        }

        // Display Others
        if (others.length > 0) {
            console.log('\n\n═══════════════════════════════════════════════════════');
            console.log('❓ OTHERS (No Role Set) (' + others.length + ')');
            console.log('═══════════════════════════════════════════════════════');

            others.forEach((other, index) => {
                console.log(`\n${index + 1}. ${other.email}`);
                console.log(`   UID: ${other.uid}`);
                console.log(`   Role: ${other.role}`);
                console.log(`   Created: ${other.created}`);
            });
        }

        // Summary
        console.log('\n\n═══════════════════════════════════════════════════════');
        console.log('📊 SUMMARY');
        console.log('═══════════════════════════════════════════════════════');
        console.log(`   👑 Admins: ${admins.length}`);
        console.log(`   👤 Users: ${users.length}`);
        console.log(`   ❓ Others: ${others.length}`);
        console.log(`   📊 Total: ${listUsersResult.users.length}`);
        console.log('═══════════════════════════════════════════════════════\n');

    } catch (error) {
        console.error('❌ ERROR:', error.message);
        console.error('\nFull error:', error);
    }

    process.exit(0);
}

// ==================== RUN ====================
listAdmins();
