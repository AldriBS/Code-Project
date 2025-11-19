/**
 * =============================================================================
 * ADD ADMIN - Komatsu Flood Control System
 * =============================================================================
 *
 * Script untuk menambahkan admin baru via command line
 * Tidak perlu edit file, langsung pass email via argument
 *
 * Usage:
 *   node add-admin.js email@example.com
 *
 * Example:
 *   node add-admin.js admin2@company.com
 *
 * Prerequisites:
 * - serviceAccountKey.json sudah ada di folder ini
 * - User sudah dibuat di Firebase Authentication
 *
 * =============================================================================
 */

const admin = require('firebase-admin');

// ==================== GET EMAIL FROM COMMAND LINE ====================
const args = process.argv.slice(2);

if (args.length === 0) {
    console.error('\n❌ ERROR: Email tidak diberikan!');
    console.error('\n📝 Usage:');
    console.error('   node add-admin.js email@example.com');
    console.error('\n💡 Example:');
    console.error('   node add-admin.js admin2@company.com');
    console.error('');
    process.exit(1);
}

const EMAIL_ADMIN = args[0];

// Validate email format
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(EMAIL_ADMIN)) {
    console.error('\n❌ ERROR: Format email tidak valid!');
    console.error('   Email:', EMAIL_ADMIN);
    console.error('');
    process.exit(1);
}

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

// ==================== ADD ADMIN FUNCTION ====================
async function addAdmin() {
    console.log('\n🔐 Adding new admin...');
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
                console.log('');
                console.log('📝 Please create user first:');
                console.log('   1. Go to: https://console.firebase.google.com/project/hyd-flood-control-system/authentication/users');
                console.log('   2. Click "Add user"');
                console.log('   3. Enter email:', EMAIL_ADMIN);
                console.log('   4. Create a strong password');
                console.log('   5. Then run this script again');
                console.log('');
                process.exit(1);
            } else {
                throw error;
            }
        }

        // 2. Check if already admin
        const existingClaims = user.customClaims || {};
        if (existingClaims.admin === true) {
            console.log('⚠️  User is already an admin!');
            console.log('   Current claims:', existingClaims);
            console.log('');
            console.log('✅ Nothing to do - user already has admin privileges');
            process.exit(0);
        }

        // 3. Set custom claims
        console.log('\n⚙️  Setting custom claims as admin...');
        await admin.auth().setCustomUserClaims(user.uid, {
            admin: true,
            role: 'admin'
        });
        console.log('✅ Custom claims set successfully');

        // 4. Save to database
        console.log('\n💾 Saving to database...');
        await admin.database().ref(`userRoles/${user.uid}`).set({
            email: EMAIL_ADMIN,
            role: 'admin',
            isAdmin: true,
            createdAt: new Date().toISOString(),
            createdBy: 'add-admin.js script'
        });
        console.log('✅ Saved to database: userRoles/' + user.uid);

        // 5. Verify
        console.log('\n🔍 Verifying...');
        const userRecord = await admin.auth().getUser(user.uid);
        console.log('   Custom claims:', userRecord.customClaims);

        // 6. Success
        console.log('\n');
        console.log('═══════════════════════════════════════════════════════');
        console.log('🎉 SUCCESS! Admin added successfully!');
        console.log('═══════════════════════════════════════════════════════');
        console.log('');
        console.log('👑 Admin Email:', EMAIL_ADMIN);
        console.log('🆔 UID:', user.uid);
        console.log('');
        console.log('📝 Next Steps:');
        console.log('   1. User must LOGOUT if currently logged in');
        console.log('   2. Then LOGIN again with:', EMAIL_ADMIN);
        console.log('   3. Should see "👑 Admin" badge in header');
        console.log('   4. Auto-pump toggles should be enabled');
        console.log('');
        console.log('⚠️  IMPORTANT:');
        console.log('   Custom claims require re-authentication to take effect');
        console.log('');
        console.log('═══════════════════════════════════════════════════════');

    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error('\nFull error:', error);
    }

    process.exit(0);
}

// ==================== RUN ====================
addAdmin();
