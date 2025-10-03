import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDMPzPn7j1zVqUKNd4sRRJFCD37VkBF8EM",
  authDomain: "amethyst-launcher.firebaseapp.com",
  projectId: "amethyst-launcher",
  storageBucket: "amethyst-launcher.firebasestorage.app",
  messagingSenderId: "366474134955",
  appId: "1:366474134955:web:41a699a7600f3976ecfeee",
  measurementId: "G-KEP4HLNJY8"
};

export const firebaseApp = initializeApp(firebaseConfig);
export const db = getFirestore(firebaseApp);