import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { DashboardView } from './components/DashboardView';
import { ChatAssistantView } from './components/ChatAssistantView';
import { CalendarView } from './components/CalendarView';
import { RemindersView } from './components/RemindersView';
import { SettingsView } from './components/SettingsView';
import { MeetingModal } from './components/MeetingModal';
import { ReminderModal } from './components/ReminderModal';
import { NotificationToast } from './components/NotificationToast';

function AppLayout() {
  const { currentView } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const renderCurrentView = () => {
    switch (currentView) {
      case 'dashboard':
        return <DashboardView />;
      case 'chat':
        return <ChatAssistantView />;
      case 'calendar':
        return <CalendarView />;
      case 'reminders':
        return <RemindersView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <Sidebar
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
      />

      {/* Main Panel */}
      <div className="main-content">
        <Header />
        <main className="app-main-viewport">{renderCurrentView()}</main>
      </div>

      {/* Modals & Toasts */}
      <MeetingModal />
      <ReminderModal />
      <NotificationToast />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppLayout />
    </AppProvider>
  );
}
