/* =========================================================
   FIREBASE CONFIGURATION
   ---------------------------------------------------------
   Replace the values below with YOUR Firebase Web App config.
   Get this from: Firebase Console → Project Settings →
   General tab → "Your apps" → Web app → SDK setup and
   configuration → Config.

   This is safe to keep in a public GitHub repo — a Firebase
   Web API key is not a secret; it only identifies your
   project. Real protection comes from Firestore Security
   Rules (see the rules provided separately), not from
   hiding this file.
   ========================================================= */
const firebaseConfig = {
  apiKey: "AIzaSyAimzZ6YtZYYaBvtcVSYUUMkmyYHruPi-4",
  authDomain: "csj-brand.firebaseapp.com",
  projectId: "csj-brand",
  storageBucket: "csj-brand.firebasestorage.app",
  messagingSenderId: "447432500382",
  appId: "1:447432500382:web:812a8bc0ae51dc9bcc478f"
};

// Initialize Firebase (compat SDK — works with plain <script> tags, no bundler needed)
firebase.initializeApp(firebaseConfig);

// Make services available globally to index.html / admin.js.
// Firebase Storage is intentionally NOT used anywhere in this project — it requires
// the paid Blaze plan. Product/hero/about images are plain filenames/paths from your
// GitHub images/ folder (e.g. "images/csj-1.jpg"), stored as a text field in Firestore.
window.db = firebase.firestore ? firebase.firestore() : null;
window.auth = firebase.auth ? firebase.auth() : null;
