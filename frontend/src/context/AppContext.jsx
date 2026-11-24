import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { useSpeechSynthesis } from '../hooks/useSpeechSynthesis';
import { useReminderAlerts } from '../hooks/useReminderAlerts';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  // Default to full-screen voice chat
  const [currentView, setCurrentView] = useState('chat');
  const [sidebarOpen, setSidebarOpen] = useState(false); // Collapsed by default for full-screen chatbot
  const [handsFreeMode, setHandsFreeMode] = useState(() => {
    return localStorage.getItem('aura_hands_free') === 'true';
  });

  const [meetings, setMeetings] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // In-app alert notifications
  const [alerts, setAlerts] = useState([]);

  // NLP engine preference
  const [classifierMode, setClassifierMode] = useState(() => {
    return localStorage.getItem('aura_classifier_mode') || 'rule_based';
  });

  // Browser notification permission state
  const [notificationPermission, setNotificationPermission] = useState(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );

  // Speech synthesis hook
  const tts = useSpeechSynthesis();

  // Meeting modal state
  const [meetingModal, setMeetingModal] = useState({
    isOpen: false,
    mode: 'create', // 'create' | 'edit'
    data: null
  });

  // Reminder modal state
  const [reminderModal, setReminderModal] = useState({
    isOpen: false,
    mode: 'create', // 'create' | 'edit'
    data: null
  });

  const openMeetingModal = useCallback((mode = 'create', data = null) => {
    setMeetingModal({ isOpen: true, mode, data });
  }, []);

  const closeMeetingModal = useCallback(() => {
    setMeetingModal({ isOpen: false, mode: 'create', data: null });
  }, []);

  const openReminderModal = useCallback((mode = 'create', data = null) => {
    setReminderModal({ isOpen: true, mode, data });
  }, []);

  const closeReminderModal = useCallback(() => {
    setReminderModal({ isOpen: false, mode: 'create', data: null });
  }, []);

  const dismissAlert = useCallback((id) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  const triggerAlert = useCallback((alertItem) => {
    setAlerts(prev => [alertItem, ...prev]);
  }, []);

  // Keep reminder notifications active regardless of the current view. Until
  // this hook is mounted, reminders are saved but no client-side due-time
  // check ever runs.
  useReminderAlerts(reminders, triggerAlert);

  const toggleHandsFree = useCallback(() => {
    setHandsFreeMode(prev => {
      const next = !prev;
      localStorage.setItem('aura_hands_free', String(next));
      return next;
    });
  }, []);

  // Fetch all core data
  const refreshData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [meetingsRes, remindersRes, statsRes] = await Promise.all([
        api.getMeetings(),
        api.getReminders(),
        api.getStats()
      ]);

      if (meetingsRes.success) setMeetings(meetingsRes.data);
      if (remindersRes.success) setReminders(remindersRes.data);
      if (statsRes.success) setStats(statsRes.data);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError(err.message || 'Could not load data from backend server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const changeClassifierMode = useCallback((newMode) => {
    setClassifierMode(newMode);
    localStorage.setItem('aura_classifier_mode', newMode);
  }, []);

  const requestNotificationPermission = useCallback(async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const permission = await Notification.requestPermission();
        setNotificationPermission(permission);
        return permission;
      } catch (err) {
        console.warn('Failed to request notification permission:', err);
      }
    }
    return 'unsupported';
  }, []);

  const value = {
    currentView,
    setCurrentView,
    sidebarOpen,
    setSidebarOpen,
    handsFreeMode,
    toggleHandsFree,
    meetings,
    reminders,
    stats,
    loading,
    error,
    refreshData,
    alerts,
    dismissAlert,
    triggerAlert,
    classifierMode,
    setClassifierMode: changeClassifierMode,
    tts,
    meetingModal,
    openMeetingModal,
    closeMeetingModal,
    reminderModal,
    openReminderModal,
    closeReminderModal,
    notificationPermission,
    requestNotificationPermission
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
