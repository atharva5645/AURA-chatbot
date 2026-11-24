import React from 'react';
import { useApp } from '../context/AppContext';
import {
  LayoutDashboard,
  MessageSquareCode,
  Calendar,
  Bell,
  Settings,
  Bot,
  X,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';

export function Sidebar({ mobileOpen, setMobileOpen, collapsed, setCollapsed }) {
  const { currentView, setCurrentView, stats } = useApp();

  const navItems = [
    {
      id: 'chat',
      label: 'Voice Chatbot',
      icon: MessageSquareCode,
      badge: 'Main'
    },
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: null
    },
    {
      id: 'calendar',
      label: 'Calendar',
      icon: Calendar,
      badge: stats?.todayMeetingsCount ? `${stats.todayMeetingsCount} today` : null
    },
    {
      id: 'reminders',
      label: 'Reminders',
      icon: Bell,
      badge: stats?.pendingRemindersCount ? `${stats.pendingRemindersCount}` : null
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: Settings,
      badge: null
    }
  ];

  return (
    <>
      {/* Dimmed backdrop when drawer is open */}
      {mobileOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''} ${collapsed ? 'desktop-collapsed' : ''}`}>
        {/* Brand */}
        <div className="sidebar-brand">
          <div className="brand-icon-wrapper">
            <Bot size={22} />
          </div>
          <div className="brand-details">
            <h1>AURA</h1>
            <p>Atharva’s Voice Assistant</p>
          </div>
          <button
            className="sidebar-close-btn"
            onClick={() => setMobileOpen(false)}
            title="Close Menu"
          >
            <X size={18} />
          </button>
          <button
            className="sidebar-collapse-btn"
            onClick={() => setCollapsed(true)}
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose size={18} />
          </button>
        </div>

        {/* Nav items */}
        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={() => {
                  setCurrentView(item.id);
                  setMobileOpen(false);
                }}
              >
                <Icon size={18} />
                <span>{item.label}</span>
                {item.badge && (
                  <span className="nav-badge">{item.badge}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <div className="voice-status-card">
            <div className="voice-status-dot" />
            <div className="voice-status-text">
              <strong>Local NLP Active</strong>
              <p style={{ color: '#94a3b8', fontSize: '0.7rem' }}>Zero API costs • 100% Private</p>
            </div>
          </div>
        </div>
      </aside>

      {collapsed && (
        <button
          className="sidebar-expand-btn"
          onClick={() => setCollapsed(false)}
          title="Open sidebar"
          aria-label="Open sidebar"
        >
          <PanelLeftOpen size={19} />
        </button>
      )}
    </>
  );
}
