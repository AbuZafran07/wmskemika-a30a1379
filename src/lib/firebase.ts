import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";
import type { Messaging } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyALlJ5PSaZGuI9MvAEI0dpzmhWf0q5q86w",
  authDomain: "wms-kemika.firebaseapp.com",
  projectId: "wms-kemika",
  storageBucket: "wms-kemika.firebasestorage.app",
  messagingSenderId: "788659539956",
  appId: "1:788659539956:web:a1312774fb67ac7d91b3a1",
  measurementId: "G-783T70SHXY",
};

const app = initializeApp(firebaseConfig);

let messagingInstance: Messaging | null = null;

export async function getFirebaseMessaging(): Promise<Messaging | null> {
  if (messagingInstance) return messagingInstance;
  
  const supported = await isSupported();
  if (!supported) {
    console.log("Firebase Messaging not supported in this browser");
    return null;
  }
  
  messagingInstance = getMessaging(app);
  return messagingInstance;
}

export async function requestFCMToken(): Promise<string | null> {
  try {
    const messaging = await getFirebaseMessaging();
    if (!messaging) return null;

    // Request notification permission
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.log("Notification permission denied");
      return null;
    }

    // VAPID key from Firebase Console → Cloud Messaging → Web Push certificates
    const token = await getToken(messaging, {
      vapidKey: "BBz-QwhWDYm9a8XEThHBhKQ3ONiyKaGKlRxsywzzgP7uP86rbgExCavjJ5h-dEa8oHKdb4fanNdRAZW1k0ZKg0w",
    });

    console.log("FCM Token obtained");
    return token;
  } catch (error) {
    console.error("Error getting FCM token:", error);
    return null;
  }
}

export function onFCMMessage(callback: (payload: any) => void): (() => void) | null {
  if (!messagingInstance) return null;
  
  return onMessage(messagingInstance, (payload) => {
    console.log("FCM foreground message:", payload);
    callback(payload);
  });
}

export { app as firebaseApp };
