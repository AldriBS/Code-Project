/**
 * =============================================================================
 * REMOVE ADMIN - Komatsu Flood Control System
 * =============================================================================
 *
 * Script untuk remove admin privileges (downgrade ke user biasa)
 *
 * Usage:
 *   node remove-admin.js email@example.com
 *
 * Example:
 *   node remove-admin.js admin2@company.com
 *
 * Note: User tidak dihapus, hanya admin privileges yang diremove
 *
 * =============================================================================
 */

const admin = require('firebase-admin');

// ==================== GET EMAIL FROM COMMAND LINE ====================
const args = process.argv.slice(2);

if (args.length === 0) {
    console.error('\n❌ ERROR: Email tidak diberikan!');
    console.error('\n📝 Usage:');
    console.error('   node remove-admin.js email@example.com');
    console.error('\n💡 Example:');
    console.error('   node remove-admin.js admin2@company.com');
    console.error('');
    process.exit(1);
}

const EMAIL_ADMIN = args[0];

// ==================== INITIALIZE FIREBASE ====================
try {
    const serviceAccount = require('./serviceAccountKey.json');

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`
    });

    console.log('✅ Firebase Admin initialized');
} catch (error) {
    console.error('❌ Error loading service account key:');
    console.error('   Make sure serviceAccountKey.json exists!');
    console.error('   Error:', error.message);
    process.exit(1);
}

// ==================== REMOVE ADMIN FUNCTION ====================
async function removeAdmin() {
    console.log('\n🔐 Removing admin privileges...');
    console.log('📧 Email:', EMAIL_ADMIN);
    console.log('');

    try {
        // 1. Check if user exists
        let user;
        try {
            user = await admin.auth().getUserByEmail(EMAIL_ADMIN);
            console.log('✅ User found in Firebase Authentication');
            console.log('   UID:', user.uid);
        } catch (error) {
            if (error.code === 'auth/user-not-found') {
                console.log('❌ User not found!');
                console.log('   Email:', EMAIL_ADMIN);
                console.log('');
                process.exit(1);
            } else {
                throw error;
            }
        }

        // 2. Check if user is admin
        const existingClaims = user.customClaims || {};
        if (existingClaims.admin !== true) {
            console.log('⚠️  User is not an admin!');
            console.log('   Current claims:', existingClaims);
            console.log('');
            console.log('✅ Nothing to do - user is already a regular user');
            process.exit(0);
        }

        // 3. Confirmation
        console.log('\n⚠️  WARNING: You are about to remove admin privileges!');
        console.log('   User will be downgraded to regular user');
        console.log('   User can still login and control pumps');
        console.log('   User CANNOT modify settings anymore');
        console.log('');

        // 4. Set custom claims to regular user
        console.log('⚙️  Downgrading to regular user...');
        await admin.auth().setCustomUserClaims(user.uid, {
            admin: false,
            role: 'user'
        });
        console.log('✅ Custom claims updated successfully');

        // 5. Update database
        console.log('\n💾 Updating database...');
        await admin.database().ref(`userRoles/${user.uid}`).set({
            email: EMAIL_ADMIN,
            role: 'user',
            isAdmin: false,
            downgradedAt: new Date().toISOString(),
            downgradedBy: 'remove-admin.js script'
        });
        console.log('✅ Database updated: userRoles/' + user.uid);

        // 6. Verify
        console.log('\n🔍 Verifying...');
        const userRecord = await admin.auth().getUser(user.uid);
        console.log('   New claims:', userRecord.customClaims);

        // 7. Success
        console.log('\n');
        console.log('═══════════════════════════════════════════════════════');
        console.log('✅ SUCCESS! Admin privileges removed!');
        console.log('═══════════════════════════════════════════════════════');
        console.log('');
        console.log('👤 User Email:', EMAIL_ADMIN);
        console.log('🆔 UID:', user.uid);
        console.log('📊 New Role: Regular User');
        console.log('');
        console.log('📝 User can now:');
        console.log('   ✅ Login to web dashboard');
        console.log('   ✅ View water levels and pump status');
        console.log('   ✅ Control pumps ON/OFF');
        console.log('   ❌ CANNOT modify auto-pump settings');
        console.log('   ❌ CANNOT modify configurations');
        console.log('');
        console.log('⚠️  IMPORTANT:');
        console.log('   If user is currently logged in, they must LOGOUT');
        console.log('   and LOGIN again to see the changes');
        console.log('');
        console.log('═══════════════════════════════════════════════════════');

    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error('\nFull error:', error);
    }

    process.exit(0);
}

// ==================== RUN ====================
removeAdmin();
