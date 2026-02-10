// Firebase configuration and initialization
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAP-WcJoYaym3OMJ4vx-oW5FQ7c1mtq7bo",
  authDomain: "geogessr-a4adc.firebaseapp.com",
  projectId: "geogessr-a4adc",
  storageBucket: "geogessr-a4adc.firebasestorage.app",
  messagingSenderId: "410750999117",
  appId: "1:410750999117:web:10ad7eb001e3bc2d3c9a04",
  measurementId: "G-E43H8NN3TH"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
const db = getFirestore(app);

export { app, db };
