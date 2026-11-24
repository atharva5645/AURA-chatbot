import React from 'react';
import { useApp } from '../context/AppContext';
import { formatTime12, formatDisplayDate, isToday } from '../utils/dateUtils';
import { api } from '../services/api';
import {
  Calendar,
  Bell,
  Clock,
  Sparkles,
  MapPin,
  Users,
  Edit2,
  Trash2,
  CheckCircle2,
  Bot,
  ArrowRight,
  Plus
} from 'lucide-react';

export function DashboardView() {
  const {
    stats,
    meetings,
    reminders,
    refreshData,
    openMeetingModal,
    openReminderModal,
    setCurrentView,
    classifierMode
  } = useApp();

  const handleToggleReminder = async (id) => {
    try {
      await api.toggleReminder(id);
      refreshData();
    } catch (err) {
      console.error('Failed to toggle reminder:', err);
    }
  };

  const handleDeleteMeeting = async (id, title) => {
    if (window.confirm(`Are you sure you want to cancel the meeting: "${title}"?`)) {
      try {
        await api.deleteMeeting(id);
        refreshData();
      } catch (err) {
        console.error('Failed to delete meeting:', err);
      }
    }
  };

  const handleDeleteReminder = async (id, title) => {
    if (window.confirm(`Are you sure you want to delete reminder: "${title}"?`)) {
      try {
        await api.deleteReminder(id);
        refreshData();
      } catch (err) {
        console.error('Failed to delete reminder:', err);
      }
    }
  };

  const todayMeetings = meetings.filter(m => isToday(m.date));
  const upcomingMeetings = meetings.filter(m => !isToday(m.date));

  return (
    <div className="view-content">
      {/* Welcome Hero Banner */}
      <div className="welcome-banner">
        <div className="welcome-text">
          <h2>Welcome back, Atharva! 👋</h2>
          <p>
            You have <strong>{stats?.todayMeetingsCount || 0} meetings</strong> today and{' '}
            <strong>{stats?.pendingRemindersCount || 0} pending reminders</strong>.
          </p>
        </div>
        <div className="welcome-quick-chat">
          <button
            className="banner-chat-btn"
            onClick={() => setCurrentView('chat')}
          >
            <Bot size={18} />
            <span>Ask AURA Assistant</span>
          </button>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon blue">
            <Calendar size={24} />
          </div>
          <div className="stat-info">
            <p>Today's Meetings</p>
            <h3>{stats?.todayMeetingsCount ?? 0}</h3>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon teal">
            <Bell size={24} />
          </div>
          <div className="stat-info">
            <p>Active Reminders</p>
            <h3>{stats?.pendingRemindersCount ?? 0}</h3>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon amber">
            <Clock size={24} />
          </div>
          <div className="stat-info">
            <p>Total Scheduled</p>
            <h3>{stats?.totalMeetings ?? 0}</h3>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon purple">
            <Sparkles size={24} />
          </div>
          <div className="stat-info">
            <p>NLP Classifier</p>
            <h3 style={{ fontSize: '1.1rem', textTransform: 'capitalize' }}>
              {classifierMode === 'ml' ? 'Naive Bayes ML' : 'Rule-Based Engine'}
            </h3>
          </div>
        </div>
      </div>

      {/* Dashboard Columns */}
      <div className="dashboard-columns">
        {/* Left Column: Meetings */}
        <div className="dashboard-card">
          <div className="card-header-flex">
            <h3>
              <Calendar size={18} style={{ color: 'var(--primary-blue)' }} />
              <span>Today & Upcoming Meetings</span>
            </h3>
            <button
              className="btn-outline"
              style={{ padding: '4px 10px', fontSize: '0.78rem' }}
              onClick={() => openMeetingModal('create')}
            >
              <Plus size={14} />
              <span>New Meeting</span>
            </button>
          </div>

          <div className="meeting-items-list">
            {meetings.length === 0 ? (
              <div className="empty-state">
                <Calendar size={36} />
                <p>No meetings scheduled. Click "New Meeting" or ask AURA!</p>
              </div>
            ) : (
              meetings.slice(0, 5).map((m) => (
                <div key={m.id} className="meeting-row">
                  <div className="meeting-left">
                    <div className="meeting-time-badge">
                      <div>{formatTime12(m.start_time)}</div>
                      <div style={{ fontSize: '0.68rem', opacity: 0.8 }}>
                        {formatDisplayDate(m.date)}
                      </div>
                    </div>
                    <div className="meeting-info">
                      <h4>{m.title}</h4>
                      <div className="meeting-meta">
                        {m.location && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <MapPin size={12} /> {m.location}
                          </span>
                        )}
                        {m.attendees && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Users size={12} /> {m.attendees}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="meeting-actions">
                    <button
                      className="btn-outline"
                      style={{ padding: '6px', borderRadius: '6px' }}
                      onClick={() => openMeetingModal('edit', m)}
                      title="Edit / Reschedule Meeting"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      className="btn-danger-outline"
                      style={{ padding: '6px', borderRadius: '6px' }}
                      onClick={() => handleDeleteMeeting(m.id, m.title)}
                      title="Cancel Meeting"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {meetings.length > 5 && (
            <button
              className="btn-outline"
              style={{ marginTop: '16px', justifyContent: 'center' }}
              onClick={() => setCurrentView('calendar')}
            >
              <span>View all in Calendar</span>
              <ArrowRight size={14} />
            </button>
          )}
        </div>

        {/* Right Column: Reminders */}
        <div className="dashboard-card">
          <div className="card-header-flex">
            <h3>
              <Bell size={18} style={{ color: 'var(--accent-teal)' }} />
              <span>Reminders & Deadlines</span>
            </h3>
            <button
              className="btn-outline"
              style={{ padding: '4px 10px', fontSize: '0.78rem' }}
              onClick={() => openReminderModal('create')}
            >
              <Plus size={14} />
              <span>New Reminder</span>
            </button>
          </div>

          <div className="reminder-items-list">
            {reminders.length === 0 ? (
              <div className="empty-state">
                <Bell size={36} />
                <p>No reminders saved yet. Set a reminder or ask AURA!</p>
              </div>
            ) : (
              reminders.slice(0, 6).map((r) => (
                <div
                  key={r.id}
                  className={`reminder-row ${r.completed ? 'completed' : ''}`}
                >
                  <input
                    type="checkbox"
                    className="reminder-checkbox"
                    checked={r.completed === 1}
                    onChange={() => handleToggleReminder(r.id)}
                    title="Mark as completed / active"
                  />

                  <div className="reminder-content">
                    <h4>{r.title}</h4>
                    <div className="reminder-meta-tags">
                      <span>⏰ {formatTime12(r.time)}</span>
                      <span>📅 {formatDisplayDate(r.date)}</span>
                      <span className={`priority-pill ${r.priority}`}>
                        {r.priority}
                      </span>
                      {r.lead_time_minutes > 0 && (
                        <span>⏳ {r.lead_time_minutes}m alert</span>
                      )}
                    </div>
                  </div>

                  <div className="meeting-actions">
                    <button
                      className="btn-outline"
                      style={{ padding: '6px', borderRadius: '6px' }}
                      onClick={() => openReminderModal('edit', r)}
                      title="Edit Reminder"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      className="btn-danger-outline"
                      style={{ padding: '6px', borderRadius: '6px' }}
                      onClick={() => handleDeleteReminder(r.id, r.title)}
                      title="Delete Reminder"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {reminders.length > 6 && (
            <button
              className="btn-outline"
              style={{ marginTop: '16px', justifyContent: 'center' }}
              onClick={() => setCurrentView('reminders')}
            >
              <span>View all Reminders</span>
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
