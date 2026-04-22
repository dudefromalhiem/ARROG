const admin = require('firebase-admin');

async function checkPage() {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  const db = admin.firestore();
  
  console.log('Searching for soa-0001...');
  
  // Try ID
  const byId = await db.collection('pages').doc('SOA-0001').get();
  console.log('By ID (SOA-0001):', byId.exists ? 'Found' : 'Not found');
  
  // Try Slug exact
  const bySlugExact = await db.collection('pages').where('slug', '==', 'soa-0001').get();
  console.log('By Slug (soa-0001):', bySlugExact.empty ? 'Not found' : 'Found');

  const bySlugExactCap = await db.collection('pages').where('slug', '==', 'SOA-0001').get();
  console.log('By Slug (SOA-0001):', bySlugExactCap.empty ? 'Not found' : 'Found');
  
  // List first 5 anomalies
  const first5 = await db.collection('pages').where('type', '==', 'Anomaly').limit(5).get();
  console.log('Anomaly count (representative):', first5.size);
  first5.forEach(d => console.log(' - ', d.id, d.data().type, d.data().slug));
}

checkPage().catch(console.error);
