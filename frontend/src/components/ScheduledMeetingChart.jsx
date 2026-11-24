import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import {
  formatTime12,
  formatDisplayDate,
  getRelativeDateLabel,
  isToday,
  isTomorrow
} from '../utils/dateUtils';
import {
  Calendar,
  CalendarCheck,
  CalendarPlus,
  Clock,
  MapPin,
  Users,
  Trash2,
  CheckCircle2,
  ExternalLink,
  Bell,
  Sparkles,
  Check,
  Plus
} from 'lucide-react';

export function ScheduledMeetingChart({ meetings = [], reminders = [], onDeleted = null, focus = null }) {
  const { setCurrentView, openMeetingModal, openReminderModal, refreshData } = useApp();
  const [meetingList, setMeetingList] = useState(meetings);
  const [reminderList, setReminderList] = useState(reminders);
  const [deletingId, setDeletingId] = useState(null);
  const [deletingReminderId, setDeletingReminderId] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);

  // Keep the interactive chart in sync when its parent refreshes data after
  // creating, editing, or deleting a meeting/reminder.
  useEffect(() => {
    setMeetingList(meetings);
  }, [meetings]);

  useEffect(() => {
    setReminderList(reminders);
  }, [reminders]);

  const isReminderPrimary = focus === 'reminders' || (reminderList.length > 0 && meetingList.length === 0);

  // Group by date for meetings
  const groupedByDate = meetingList.reduce((acc, m) => {
    const key = m.date || 'Unscheduled';
    if (!acc[key]) acc[key] = [];
    acc[key].push(m);
    return acc;
  }, {});

  // Calculate time distribution (Morning / Afternoon / Evening)
  let morningCount = 0;
  let afternoonCount = 0;
  let eveningCount = 0;

  meetingList.forEach((m) => {
    if (!m.start_time) return;
    const hour = parseInt(m.start_time.split(':')[0], 10);
    if (hour < 12) morningCount++;
    else if (hour < 17) afternoonCount++;
    else eveningCount++;
  });

  const total = meetingList.length;
  const morningPct = total > 0 ? (morningCount / total) * 100 : 0;
  const afternoonPct = total > 0 ? (afternoonCount / total) * 100 : 0;
  const eveningPct = total > 0 ? (eveningCount / total) * 100 : 0;

  // Handle direct meeting deletion
  const handleDeleteMeeting = async (meeting) => {
    if (deletingId) return;
    setDeletingId(meeting.id);
    try {
      await api.deleteMeeting(meeting.id);
      setMeetingList((prev) => prev.filter((m) => m.id !== meeting.id));
      setStatusMessage(`"${meeting.title}" deleted from calendar.`);
      refreshData();
      if (onDeleted) onDeleted(meeting);
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (err) {
      console.error('Failed to delete meeting:', err);
      setStatusMessage(`Failed to delete: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  // Handle reminder toggle
  const handleToggleReminder = async (rId) => {
    try {
      await api.toggleReminder(rId);
      setReminderList((prev) =>
        prev.map((r) => (r.id === rId ? { ...r, completed: r.completed ? 0 : 1 } : r))
      );
      refreshData();
    } catch (err) {
      console.error('Failed to toggle reminder:', err);
    }
  };

  // Handle reminder delete
  const handleDeleteReminder = async (rId, rTitle) => {
    if (deletingReminderId) return;
    setDeletingReminderId(rId);
    try {
      await api.deleteReminder(rId);
      setReminderList((prev) => prev.filter((r) => r.id !== rId));
      setStatusMessage(`Reminder "${rTitle}" deleted.`);
      refreshData();
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (err) {
      console.error('Failed to delete reminder:', err);
    } finally {
      setDeletingReminderId(null);
    }
  };

  return (
    <div className="scheduled-chart-card">
      {/* 1. Header Bar */}
      <div className="chart-header-row">
        {isReminderPrimary ? (
          <>
            <div className="chart-header-title">
              <Bell size={18} className="chart-icon" style={{ color: 'var(--accent-teal)' }} />
              <span>My Set Reminders</span>
              <span className="chart-count-pill" style={{ background: '#ecfdf5', color: '#047857', borderColor: '#a7f3d0' }}>
                {reminderList.length} {reminderList.length === 1 ? 'Reminder' : 'Reminders'}
              </span>
            </div>
            <button
              type="button"
              className="btn-chart-calendar-link"
              onClick={() => setCurrentView('reminders')}
              title="Open full interactive reminders page"
            >
              <Bell size={13} />
              <span>Open Reminders Page</span>
              <ExternalLink size={11} />
            </button>
          </>
        ) : (
          <>
            <div className="chart-header-title">
              <CalendarCheck size={18} className="chart-icon" />
              <span>Scheduled Meetings Chart</span>
              <span className="chart-count-pill">{total} {total === 1 ? 'Meeting' : 'Meetings'}</span>
            </div>
            <button
              type="button"
              className="btn-chart-calendar-link"
              onClick={() => setCurrentView('calendar')}
              title="Open full interactive calendar grid"
            >
              <Calendar size={13} />
              <span>Open Calendar</span>
              <ExternalLink size={11} />
            </button>
          </>
        )}
      </div>

      {statusMessage && (
        <div className="chart-status-toast">
          <CheckCircle2 size={14} />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* 2. When Reminders are Primary: Show Reminders List at top */}
      {isReminderPrimary && (
        <div className="chart-reminders-primary-list">
          {reminderList.length === 0 ? (
            <div className="chart-empty-state">
              <div className="empty-chart-icon-box" style={{ background: '#ecfdf5', color: '#047857' }}>
                <Bell size={28} />
              </div>
              <p className="empty-title">No Reminders Set Yet</p>
              <p className="empty-sub">
                Say <em>"Remind me to submit project at 6 PM"</em> or click below.
              </p>
              <button
                type="button"
                className="btn-chart-add"
                style={{ background: 'var(--accent-teal)' }}
                onClick={() => openReminderModal('create')}
              >
                <Plus size={13} />
                <span>+ Set a Reminder</span>
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {reminderList.map((r) => {
                const isTod = isToday(r.date);
                const isTmrw = isTomorrow(r.date);
                return (
                  <div key={r.id} className="chart-meeting-item">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        className="reminder-checkbox"
                        checked={r.completed === 1}
                        onChange={() => handleToggleReminder(r.id)}
                        title="Click to toggle completed"
                      />
                      <div className="meeting-time-block" style={{ background: '#ecfdf5', color: '#047857' }}>
                        <Clock size={12} />
                        <span className="time-text">{formatTime12(r.time)}</span>
                      </div>
                    </div>

                    <div className="meeting-main-info">
                      <div className="meeting-title-row">
                        <h4 className={`chart-meeting-title ${r.completed ? 'strike-through' : ''}`}>
                          {r.title}
                        </h4>
                        <span className={`priority-pill ${r.priority}`}>
                          {r.priority}
                        </span>
                      </div>
                      <div className="meeting-meta-row">
                        <span className="meta-item">
                          <Calendar size={11} /> {formatDisplayDate(r.date)} {isTod ? '(Today)' : isTmrw ? '(Tomorrow)' : ''}
                        </span>
                        {r.notes && <span className="meta-item">📝 {r.notes}</span>}
                      </div>
                    </div>

                    <div className="meeting-action-buttons">
                      <button
                        type="button"
                        className="btn-chart-delete"
                        onClick={() => handleDeleteReminder(r.id, r.title)}
                        disabled={deletingReminderId === r.id}
                        title="Delete reminder"
                      >
                        <Trash2 size={13} />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 3. Visual Time Distribution Bar (for Meetings) */}
      {!isReminderPrimary && total > 0 && (
        <div className="chart-distribution-section">
          <div className="distribution-legend">
            <span className="dist-label">Time Distribution:</span>
            <span className="dist-tag morning">
              <span className="dot morning" /> Morning ({morningCount})
            </span>
            <span className="dist-tag afternoon">
              <span className="dot afternoon" /> Afternoon ({afternoonCount})
            </span>
            <span className="dist-tag evening">
              <span className="dot evening" /> Evening ({eveningCount})
            </span>
          </div>
          <div className="distribution-bar">
            {morningPct > 0 && (
              <div
                className="bar-segment morning"
                style={{ width: `${morningPct}%` }}
                title={`Morning: ${morningCount} (${Math.round(morningPct)}%)`}
              />
            )}
            {afternoonPct > 0 && (
              <div
                className="bar-segment afternoon"
                style={{ width: `${afternoonPct}%` }}
                title={`Afternoon: ${afternoonCount} (${Math.round(afternoonPct)}%)`}
              />
            )}
            {eveningPct > 0 && (
              <div
                className="bar-segment evening"
                style={{ width: `${eveningPct}%` }}
                title={`Evening: ${eveningCount} (${Math.round(eveningPct)}%)`}
              />
            )}
          </div>
        </div>
      )}

      {/* 4. Meetings List grouped by Date */}
      {!isReminderPrimary && (
        <>
          {total === 0 ? (
            <div className="chart-empty-state">
              <div className="empty-chart-icon-box">
                <CalendarPlus size={28} />
              </div>
              <p className="empty-title">No Meetings Scheduled Yet</p>
              <p className="empty-sub">
                Say <em>"Schedule project meeting tomorrow at 3 PM"</em> or click below.
              </p>
              <button
                type="button"
                className="btn-chart-add"
                onClick={() => openMeetingModal('create')}
              >
                <Sparkles size={13} />
                <span>+ Schedule a Meeting</span>
              </button>
            </div>
          ) : (
            <div className="chart-timeline-list">
              {Object.entries(groupedByDate).map(([dateStr, dayMeetings]) => {
                const relLabel = getRelativeDateLabel(dateStr);
                const isTod = isToday(dateStr);
                const isTmrw = isTomorrow(dateStr);

                return (
                  <div key={dateStr} className="chart-day-group">
                    <div className="chart-day-header">
                      <span className={`day-rel-badge ${isTod ? 'today' : isTmrw ? 'tomorrow' : ''}`}>
                        {relLabel}
                      </span>
                      <span className="day-formatted-date">{formatDisplayDate(dateStr)}</span>
                    </div>

                    <div className="chart-day-meetings">
                      {dayMeetings.map((m) => (
                        <div key={m.id} className="chart-meeting-item">
                          <div className="meeting-time-block">
                            <Clock size={13} />
                            <span className="time-text">
                              {formatTime12(m.start_time)}
                              {m.end_time && ` – ${formatTime12(m.end_time)}`}
                            </span>
                          </div>

                          <div className="meeting-main-info">
                            <div className="meeting-title-row">
                              <h4 className="chart-meeting-title">{m.title}</h4>
                              {m.category && (
                                <span className="chart-category-tag">{m.category}</span>
                              )}
                            </div>

                            <div className="meeting-meta-row">
                              {m.location && (
                                <span className="meta-item">
                                  <MapPin size={12} /> {m.location}
                                </span>
                              )}
                              {m.attendees && (
                                <span className="meta-item">
                                  <Users size={12} /> {m.attendees}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="meeting-action-buttons">
                            <button
                              type="button"
                              className="btn-chart-view-cal"
                              onClick={() => setCurrentView('calendar')}
                              title="View on Calendar"
                            >
                              <Calendar size={13} />
                              <span>Calendar</span>
                            </button>
                            <button
                              type="button"
                              className="btn-chart-delete"
                              onClick={() => handleDeleteMeeting(m)}
                              disabled={deletingId === m.id}
                              title="Delete this meeting"
                            >
                              <Trash2 size={13} />
                              <span>{deletingId === m.id ? 'Deleting...' : 'Delete'}</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* 5. Reminders Section when meetings are primary */}
      {!isReminderPrimary && reminderList.length > 0 && (
        <div className="chart-reminders-subcard">
          <div className="reminders-subcard-header">
            <Bell size={14} />
            <span>Associated Reminders ({reminderList.length})</span>
          </div>
          <div className="reminders-subcard-list">
            {reminderList.map((r) => (
              <div
                key={r.id}
                className={`chart-reminder-chip ${r.completed ? 'completed' : ''}`}
                onClick={() => handleToggleReminder(r.id)}
                title="Click to toggle completion"
              >
                <span className={`rem-check-box ${r.completed ? 'checked' : ''}`}>
                  {r.completed ? '✓' : ''}
                </span>
                <span className="rem-chip-title">{r.title}</span>
                <span className="rem-chip-time">
                  {formatTime12(r.time)} ({r.date})
                </span>
                <button
                  type="button"
                  className="chip-del-mini"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteReminder(r.id, r.title);
                  }}
                  title="Delete reminder"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. Footer Quick Actions */}
      <div className="chart-footer-row" style={{ display: 'flex', gap: '8px' }}>
        {isReminderPrimary ? (
          <button
            type="button"
            className="btn-chart-quick-add"
            style={{ background: '#ecfdf5', borderColor: '#a7f3d0', color: '#047857' }}
            onClick={() => openReminderModal('create')}
          >
            <Plus size={13} />
            <span>+ Set Another Reminder</span>
          </button>
        ) : (
          total > 0 && (
            <button
              type="button"
              className="btn-chart-quick-add"
              onClick={() => openMeetingModal('create')}
            >
              <CalendarPlus size={13} />
              <span>+ Schedule Another Meeting</span>
            </button>
          )
        )}
      </div>
    </div>
  );
}
