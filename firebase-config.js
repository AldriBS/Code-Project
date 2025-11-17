// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyBdBaRFxbZBSXfi44SJdlK1mUwaL-AM6LI",
    authDomain: "hyd-flood-control-system.firebaseapp.com",
    databaseURL: "https://hyd-flood-control-system-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "hyd-flood-control-system",
    storageBucket: "hyd-flood-control-system.appspot.com",
    messagingSenderId: "615287458727",
    appId: "1:615287458727:web:0bfdda59289bd69cff0482" 
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Get a reference to the database service
const database = firebase.database();

// Database References
const area1Ref = database.ref('area1');
const area2Ref = database.ref('area2');

// Export references for use in other files
window.firebaseRefs = {
    area1: area1Ref,
    area2: area2Ref
};

console.log('Firebase initialized successfully');