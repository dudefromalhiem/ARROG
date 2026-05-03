/**
 * Data migration script for role system upgrade
 * USAGE: node api/migrate-roles.js
 * 
 * This script:
 * 1. Validates Firestore connection
 * 2. Scans all users for role normalization
 * 3. Creates audit trail for migrations
 * 4. Generates report and backup metadata
 * 5. Makes incremental safe updates
 */

const admin = require('firebase-admin');

let db;

async function initializeAdmin() {
  if (admin.apps.length) {
    db = admin.firestore();
    return;
  }

  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountRaw) {
    throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_KEY environment variable');
  }

  const serviceAccount = JSON.parse(serviceAccountRaw);
  const app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID
  });

  db = admin.firestore(app);
}

const ROLE_MAPPINGS = {
  'user': 'newbie',
  'guest': 'newbie',
  '': 'newbie',
  null: 'newbie',
  undefined: 'newbie',
  'newbie': 'newbie',
  'site_member': 'site_member',
  'contributor': 'contributor',
  'editor': 'contributor',
  'junior_moderator': 'moderator',
  'junior-moderator': 'moderator',
  'moderator': 'moderator',
  'mod': 'moderator',
  'senior_moderator': 'senior_moderator',
  'senior-moderator': 'senior_moderator',
  'chief_of_moderation': 'chief_of_moderation',
  'chief-of-moderation': 'chief_of_moderation',
  'deputy_chief_of_moderation': 'deputy_chief_of_moderation',
  'deputy-chief-of-moderation': 'deputy_chief_of_moderation',
  'junior_admin': 'administrator',
  'junior-admin': 'administrator',
  'admin': 'administrator',
  'administrator': 'administrator',
  'senior_administrator': 'senior_administrator',
  'senior-administrator': 'senior_administrator',
  'chief_administrator': 'chief_administrator',
  'chief-administrator': 'chief_administrator',
  'chief_admin': 'chief_administrator',
  'chief-admin': 'chief_administrator',
  'chiefadmin': 'chief_administrator',
  'deputy_chief_administrator': 'deputy_chief_administrator',
  'deputy-chief-administrator': 'deputy_chief_administrator',
  'owner': 'owner'
};

const ROLE_LABELS = {
  'newbie': 'Newbie',
  'site_member': 'Site Member',
  'contributor': 'Contributor',
  'moderator': 'Moderator',
  'senior_moderator': 'Senior Moderator',
  'chief_of_moderation': 'Chief of Moderation',
  'deputy_chief_of_moderation': 'Deputy Chief of Moderation',
  'administrator': 'Administrator',
  'senior_administrator': 'Senior Administrator',
  'chief_administrator': 'Chief Administrator',
  'deputy_chief_administrator': 'Deputy Chief Administrator',
  'owner': 'The Archivist'
};

function normalizeRole(value) {
  const role = String(value || '').trim().toLowerCase();
  return ROLE_MAPPINGS[role] || ROLE_MAPPINGS['user'];
}

async function validateMigration() {
  console.log('\n📋 VALIDATING MIGRATION PREREQUISITES...\n');

  try {
    // Check Firebase connection
    const testRef = db.collection('config').doc('roles');
    const testSnap = await testRef.get();
    console.log('✓ Firestore connection OK');

    // Check if migration metadata exists
    const metaRef = db.collection('admin').doc('migration_metadata');
    const metaSnap = await metaRef.get();
    if (metaSnap.exists) {
      console.log('⚠ Previous migration found:', metaSnap.data().completedAt);
    }

    return true;
  } catch (err) {
    console.error('✗ Validation failed:', err.message);
    return false;
  }
}

async function analyzeCurrentRoles() {
  console.log('\n📊 ANALYZING CURRENT ROLE DISTRIBUTION...\n');

  const usersRef = db.collection('users');
  const userSnap = await usersRef.get();

  const analysis = {
    totalUsers: userSnap.size,
    byCurrentRole: {},
    byNormalizedRole: {},
    invalidRoles: [],
    noRole: 0,
    needsMigration: []
  };

  userSnap.forEach(doc => {
    const userData = doc.data();
    const currentRole = String(userData.role || '').toLowerCase();
    const normalized = normalizeRole(currentRole);

    // Track distribution
    analysis.byCurrentRole[currentRole || 'undefined'] = (analysis.byCurrentRole[currentRole || 'undefined'] || 0) + 1;
    analysis.byNormalizedRole[normalized] = (analysis.byNormalizedRole[normalized] || 0) + 1;

    // Track changes needed
    if (!currentRole) {
      analysis.noRole++;
      analysis.needsMigration.push({ uid: doc.id, email: userData.email, from: null, to: normalized });
    } else if (normalized !== currentRole && currentRole !== '') {
      analysis.needsMigration.push({ uid: doc.id, email: userData.email, from: currentRole, to: normalized });
    }
  });

  console.log(`Total users: ${analysis.totalUsers}`);
  console.log(`Users without role: ${analysis.noRole}`);
  console.log(`Users needing migration: ${analysis.needsMigration.length}`);
  console.log('\nCurrent role distribution:');
  Object.entries(analysis.byCurrentRole).forEach(([role, count]) => {
    console.log(`  ${role || '(no role)'}: ${count}`);
  });
  console.log('\nNormalized role distribution:');
  Object.entries(analysis.byNormalizedRole).forEach(([role, count]) => {
    console.log(`  ${role}: ${count}`);
  });

  return analysis;
}

async function migrateRoles(analysis) {
  console.log('\n🔄 MIGRATING ROLES...\n');

  const migrations = analysis.needsMigration;
  const batch = db.batch();
  let processed = 0;

  const auditLog = [];

  for (const migration of migrations) {
    const userRef = db.collection('users').doc(migration.uid);

    batch.set(userRef, {
      role: migration.to,
      roleName: ROLE_LABELS[migration.to] || migration.to,
      roleNormalizedAt: admin.firestore.FieldValue.serverTimestamp(),
      roleNormalizedFrom: migration.from || 'unset',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    auditLog.push({
      uid: migration.uid,
      email: migration.email,
      from: migration.from,
      to: migration.to,
      timestamp: new Date().toISOString()
    });

    processed++;
    if (processed % 100 === 0) {
      await batch.commit();
      console.log(`✓ Processed ${processed}/${migrations.length} users`);
    }
  }

  if (processed % 100 !== 0) {
    await batch.commit();
  }

  console.log(`✓ All ${processed} users migrated`);

  return auditLog;
}

async function createBackupMetadata(analysis, auditLog) {
  console.log('\n💾 CREATING BACKUP METADATA...\n');

  const metadata = {
    migrationVersion: 1,
    migratedAt: admin.firestore.FieldValue.serverTimestamp(),
    summary: {
      totalUsers: analysis.totalUsers,
      usersMigrated: analysis.needsMigration.length,
      timestamp: new Date().toISOString()
    },
    beforeState: analysis.byCurrentRole,
    afterState: analysis.byNormalizedRole,
    auditLog: auditLog
  };

  await db.collection('admin').doc('migration_metadata').set(metadata);
  console.log('✓ Metadata saved to admin/migration_metadata');

  return metadata;
}

async function validateMigrationResults() {
  console.log('\n✔ VALIDATING MIGRATION RESULTS...\n');

  const usersRef = db.collection('users');
  const userSnap = await usersRef.get();

  let valid = true;
  const issues = [];

  userSnap.forEach(doc => {
    const userData = doc.data();
    const role = String(userData.role || '').toLowerCase();

    if (!role || role === '' || role === 'undefined') {
      valid = false;
      issues.push(`User ${doc.id} has invalid role: ${userData.role}`);
    }

    if (userData.roleName && !ROLE_LABELS[role]) {
      valid = false;
      issues.push(`User ${doc.id} has unknown role label: ${userData.roleName}`);
    }
  });

  if (valid) {
    console.log('✓ All users have valid normalized roles');
  } else {
    console.log('✗ Validation issues found:');
    issues.forEach(issue => console.log(`  - ${issue}`));
  }

  return valid;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('   🚀 REDOAKGUILD ROLE SYSTEM MIGRATION');
  console.log('═══════════════════════════════════════════════════════════');

  try {
    await initializeAdmin();
    console.log('✓ Firebase initialized');

    // Step 1: Validate prerequisites
    const isValid = await validateMigration();
    if (!isValid) {
      console.error('\n❌ Migration prerequisites failed');
      process.exit(1);
    }

    // Step 2: Analyze current roles
    const analysis = await analyzeCurrentRoles();

    // Step 3: Ask for confirmation
    console.log('\n⚠️  MIGRATION SUMMARY:');
    console.log(`   Users to migrate: ${analysis.needsMigration.length}`);
    console.log(`   Total users affected: ${analysis.totalUsers}`);
    console.log('   This operation is REVERSIBLE via audit logs.\n');

    // In production, add user confirmation here
    // For now, proceed automatically

    // Step 4: Perform migration
    const auditLog = await migrateRoles(analysis);

    // Step 5: Create backup
    const metadata = await createBackupMetadata(analysis, auditLog);

    // Step 6: Validate results
    const isHealthy = await validateMigrationResults();

    if (isHealthy) {
      console.log('\n✅ MIGRATION COMPLETED SUCCESSFULLY\n');
      console.log('📊 Migration Report:');
      console.log(`   Total users: ${analysis.totalUsers}`);
      console.log(`   Users migrated: ${analysis.needsMigration.length}`);
      console.log(`   Migration ID: ${metadata.summary.timestamp}`);
      console.log('');
      process.exit(0);
    } else {
      console.log('\n⚠️  MIGRATION COMPLETED WITH ISSUES\n');
      process.exit(1);
    }
  } catch (err) {
    console.error('\n❌ MIGRATION FAILED:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
