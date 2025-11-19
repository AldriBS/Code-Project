/**
 * =============================================================================
 * SET FIRST ADMIN - Komatsu Flood Control System
 * =============================================================================
 *
 * Script untuk set admin pertama kali via Node.js
 *
 * Prerequisites:
 * 1. Download Service Account Key dari Firebase Console:
 *    - Firebase Console → Project Settings → Service Accounts
 *    - Generate new private key
 *    - Save sebagai serviceAccountKey.json di folder ini
 *
 * 2. Install dependencies:
 *    npm install firebase-admin
 *
 * 3. Edit EMAIL_ADMIN di bawah dengan email Anda
 *
 * 4. Run:
 *    node set-first-admin.js
 *
 * =============================================================================
 */

const admin = require('firebase-admin');

// ==================== CONFIGURATION ====================
// ⚠️ GANTI EMAIL INI DENGAN EMAIL ANDA!
const EMAIL_ADMIN = 'admin@example.com';  // <-- GANTI INI!

// Service Account Key path
const serviceAccountPath = './serviceAccountKey.json';

// ==================== INITIALIZE FIREBASE ====================
try {
    const serviceAccount = require(serviceAccountPath);

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: serviceAccount.project_id
            ? `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`
            : 'https://YOUR-PROJECT-ID-default-rtdb.firebaseio.com'
    });

    console.log('✅ Firebase Admin initialized');
} catch (error) {
    console.error('❌ Error loading service account key:');
    console.error('   Make sure serviceAccountKey.json exists in this folder!');
    console.error('   Download it from: Firebase Console → Project Settings → Service Accounts');
    console.error('   Error:', error.message);
    process.exit(1);
}

// ==================== SET ADMIN FUNCTION ====================
async function setFirstAdmin() {
    console.log('\n🔐 Setting up first admin...');
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
                console.log('⚠️  User not found in Firebase Authentication');
                console.log('   Please create user first:');
                console.log('   1. Firebase Console → Authentication → Add User');
                console.log('   2. Enter email:', EMAIL_ADMIN);
                console.log('   3. Create a strong password');
                console.log('   4. Then run this script again');
                process.exit(1);
            } else {
                throw error;
            }
        }

        // 2. Set custom claims
        console.log('\n⚙️  Setting custom claims as admin...');
        await admin.auth().setCustomUserClaims(user.uid, {
            admin: true,
            role: 'admin'
        });
        console.log('✅ Custom claims set successfully');

        // 3. Save to database
        console.log('\n💾 Saving to database...');
        await admin.database().ref(`userRoles/${user.uid}`).set({
            email: EMAIL_ADMIN,
            role: 'admin',
            isAdmin: true,
            createdAt: new Date().toISOString(),
            createdBy: 'set-first-admin.js script'
        });
        console.log('✅ Saved to database: userRoles/' + user.uid);

        // 4. Verify
        console.log('\n🔍 Verifying...');
        const userRecord = await admin.auth().getUser(user.uid);
        console.log('   Custom claims:', userRecord.customClaims);

        // 5. Success
        console.log('\n');
        console.log('═══════════════════════════════════════════════════════');
        console.log('🎉 SUCCESS! Admin set up successfully!');
        console.log('═══════════════════════════════════════════════════════');
        console.log('');
        console.log('👑 Admin Email:', EMAIL_ADMIN);
        console.log('🆔 UID:', user.uid);
        console.log('');
        console.log('📝 Next Steps:');
        console.log('   1. Open login.html in browser');
        console.log('   2. Login with:', EMAIL_ADMIN);
        console.log('   3. You should see "👑 Admin" badge in header');
        console.log('   4. Auto-pump toggles should be enabled');
        console.log('');
        console.log('⚠️  IMPORTANT:');
        console.log('   - If user already logged in, they must LOGOUT first');
        console.log('   - Then login again to get admin permissions');
        console.log('   - Custom claims update requires re-authentication');
        console.log('');
        console.log('═══════════════════════════════════════════════════════');

    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error('\nFull error:', error);
    }

    process.exit(0);
}

// ==================== RUN ====================
// Check if email was changed
if (EMAIL_ADMIN === 'admin@example.com') {
    console.error('\n⚠️  WARNING: Please edit this file first!');
    console.error('   Change EMAIL_ADMIN to your actual email address');
    console.error('   Line 20: const EMAIL_ADMIN = "your-email@example.com";');
    console.error('');
    process.exit(1);
}

// Run the function
setFirstAdmin();
