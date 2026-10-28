import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import {
    initializeAppCheck,
    ReCaptchaEnterpriseProvider,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app-check.js';
import {
    getFirestore,
    collection,
    addDoc,
    serverTimestamp,
    query,
    orderBy,
    limit,
    getDocs,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const firebaseConfig = {
    apiKey: 'AIzaSyBVjk2UnuuRFfrPKO9oc0auvePrd83WHJw',
    authDomain: 'papierfisch.firebaseapp.com',
    projectId: 'papierfisch',
    storageBucket: 'papierfisch.firebasestorage.app',
    messagingSenderId: '1079916848073',
    appId: '1:1079916848073:web:034c664c8bb6d35396fe18',
};

// reCAPTCHA Enterprise site key behind Firebase App Check. Proves writes
// come from this app (not a script hitting Firestore directly) before the
// request ever reaches the security rules above.
const APP_CHECK_SITE_KEY = '6LdXDQUuAAAAADiutk8tC1FC-r4DkAKjpQKhc6lL';

const app = initializeApp(firebaseConfig);

initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(APP_CHECK_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
});

const db = getFirestore(app);
const leaderboardCollection = collection(db, 'leaderboard');

// Shared, global high-score table backed by Firestore. Writes are
// append-only (enforced by firestore.rules) and reads are public, so every
// player sees the same top 10 regardless of device or browser.

export async function submitScore({ name, territory, kills }) {
    try {
        await addDoc(leaderboardCollection, {
            name: String(name || 'Spieler').slice(0, 20),
            territory: Math.max(0, Math.min(100, Number(territory) || 0)),
            kills: Math.max(0, Math.floor(Number(kills) || 0)),
            timestamp: serverTimestamp(),
        });
        return true;
    } catch (error) {
        console.warn('Konnte Highscore nicht an das geteilte Leaderboard senden:', error);
        return false;
    }
}

export async function fetchTopScores(max = 10) {
    const topQuery = query(leaderboardCollection, orderBy('territory', 'desc'), limit(max));
    const snapshot = await getDocs(topQuery);
    return snapshot.docs.map((doc) => doc.data());
}
