/**
 * ระบบยืม-คืนอุปกรณ์กีฬาโรงเรียน
 * firebase-config.js - จัดการการตั้งค่าและการเชื่อมต่อ Firebase Cloud Firestore
 */

// คอนฟิกเริ่มต้นของ Firebase (คุณครูสามารถนำค่าจาก Firebase Console มาวางที่นี่ หรือใส่ผ่านเมนูตั้งค่าในเว็บได้)
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

class FirebaseService {
  constructor() {
    this.app = null;
    this.db = null;
    this.isInitialized = false;
    this.init();
  }

  // ดึงคอนฟิกจาก LocalStorage หรือค่าเริ่มต้น
  getConfig() {
    try {
      const saved = localStorage.getItem('sports_school_firebase_config_v1');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Error reading Firebase config from storage:', e);
    }
    return DEFAULT_FIREBASE_CONFIG;
  }

  // บันทึกคอนฟิกใหม่
  saveConfig(config) {
    try {
      localStorage.setItem('sports_school_firebase_config_v1', JSON.stringify(config));
      this.init(); // รีสตาร์ตการเชื่อมต่อ
      return true;
    } catch (e) {
      console.error('Error saving Firebase config:', e);
      return false;
    }
  }

  // ตรวจสอบว่าคอนฟิกมีความสมบูรณ์หรือไม่
  isConfigValid(config) {
    return !!(config && config.apiKey && config.projectId && config.apiKey.trim() !== "");
  }

  // เริ่มต้นเชื่อมต่อ Firebase
  init() {
    const config = this.getConfig();

    if (!this.isConfigValid(config)) {
      this.isInitialized = false;
      this.db = null;
      console.log('ℹ️ Firebase config is empty. Running in LocalStorage mode.');
      return false;
    }

    try {
      // ตรวจสอบว่ามี Firebase SDK โหลดมาแล้วหรือไม่
      if (typeof firebase === 'undefined') {
        console.warn('⚠️ Firebase SDK is not loaded yet.');
        return false;
      }

      // ถ้าเคย init app แล้วให้ใช้ instance เดิม
      if (!firebase.apps.length) {
        this.app = firebase.initializeApp(config);
      } else {
        this.app = firebase.app();
      }

      this.db = firebase.firestore();
      this.isInitialized = true;
      console.log('✅ Firebase Cloud Firestore connected successfully! (Project: ' + config.projectId + ')');
      return true;
    } catch (err) {
      console.error('❌ Failed to initialize Firebase Firestore:', err);
      this.isInitialized = false;
      this.db = null;
      return false;
    }
  }

  // สถานะการเชื่อมต่อ
  getStatus() {
    return {
      connected: this.isInitialized && this.db !== null,
      mode: (this.isInitialized && this.db !== null) ? 'cloud' : 'local',
      projectId: this.getConfig().projectId || null
    };
  }
}

// สร้าง Global instance
window.firebaseService = new FirebaseService();
