const admin = require('firebase-admin');

async function main() {
  if (!admin.apps.length) admin.initializeApp();
  const db = admin.firestore();

  const email = process.argv[2];
  if (!email) {
    console.error('Usage: node inspect-firestore.js <email>');
    process.exit(1);
  }

  const normEmail = String(email || '').toLowerCase();

  try {
    // Find user by email
    const userSnap = await db.collection('users').where('email', '==', normEmail).limit(1).get();
    if (userSnap.empty) {
      console.log('No user document found for email:', normEmail);
    } else {
      userSnap.forEach(doc => {
        console.log('=== users/' + doc.id + ' ===');
        console.log(JSON.stringify(doc.data(), null, 2));
      });
    }

    // List application docs by uid if user exists
    if (!userSnap.empty) {
      const doc = userSnap.docs[0];
      const uid = doc.id;
      const app = await db.collection('applications').doc(uid).get();
      console.log('=== applications/' + uid + ' ===');
      console.log(app.exists ? JSON.stringify(app.data(), null, 2) : 'missing');

      const editorApp = await db.collection('editorApplications').doc(uid).get();
      console.log('=== editorApplications/' + uid + ' ===');
      console.log(editorApp.exists ? JSON.stringify(editorApp.data(), null, 2) : 'missing');
    }

    // Print config/roles
    const rolesDoc = await db.collection('config').doc('roles').get();
    console.log('=== config/roles ===');
    console.log(rolesDoc.exists ? JSON.stringify(rolesDoc.data(), null, 2) : 'missing');

    // Optional: show any users with submissionAccess true
    const snap = await db.collection('users').where('submissionAccess', '==', true).limit(50).get();
    console.log('=== users with submissionAccess=== (up to 50)');
    snap.forEach(d => console.log(d.id, (d.data()||{}).email));
  } catch (err) {
    console.error('ERROR', err && err.stack || err);
  } finally {
    process.exit(0);
  }
}

main();
