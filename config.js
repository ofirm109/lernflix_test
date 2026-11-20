/*
 * ===================== הגדרות החיבור ל-Firebase =====================
 *
 * כל עוד השדות ריקים, המשחק עובד ב"מצב הדגמה" – רק בתוך דפדפן אחד
 * (אפשר לפתוח כמה לשוניות ולנסות), בלי טלפונים אמיתיים.
 *
 * כדי לחבר טלפונים אמיתיים:
 *   1. פתחו פרויקט ב-Firebase לפי מדריך ההתקנה (README.md).
 *   2. העתיקו לכאן את הערכים מ-Project settings › Your apps › SDK setup and configuration.
 *   3. ודאו ש-databaseURL מולא (מופיע בעמוד Realtime Database).
 *
 * אין כאן מייל או סיסמה: המרצה מקליד/ה אותם במסך הכניסה,
 * וההרשאה נקבעת ברשימת admins במסד הנתונים (ראו מדריך ההתקנה).
 */
window.QUIZ_CONFIG = {
  firebase: {
    apiKey: "AIzaSyBPBR3lGbv8OdD0A501sEVIVnWp-bBHKOE",
    authDomain: "live-quiz-4bfe2.firebaseapp.com",
    databaseURL: "https://live-quiz-4bfe2-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "live-quiz-4bfe2",
    storageBucket: "live-quiz-4bfe2.firebasestorage.app",
    messagingSenderId: "688250707341",
    appId: "1:688250707341:web:e01da25905d9c4c03031c4"
  }
};
