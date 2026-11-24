import React, { useState, useEffect } from 'react';
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
  X,
  Bell,
  Calendar,
  Clock,
  Trash2,
  CheckCircle2,
  Plus,
  AlertCircle,
  ExternalLink
} from 'lucide-react';

export function ReminderModal() {
  const { reminderModal, closeReminderModal, refreshData, reminders = [], setCurrentView } = useApp();
  const { isOpen, mode, data } = reminderModal;

  const [modalTab, setModalTab] = useState('form'); // 'form' | 'reminders'
  const [editingId, setEditingId] = useState(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('18:00');
  const [leadTimeMinutes, setLeadTimeMinutes] = useState(15);
  const [priority, setPriority] = useState('medium');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState(null);
  const [successNotice, setSuccessNotice] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSuccessNotice(null);
      if (mode === 'edit' && data) {
        setModalTab('form');
        setEditingId(data.id);
        setTitle(data.title || '');
        setDate(data.date || '');
        setTime(data.time || '18:00');
        setLeadTimeMinutes(data.lead_time_minutes ?? 15);
        setPriority(data.priority || 'medium');
        setNotes(data.notes || '');
      } else {
        setEditingId(null);
        setTitle('');
        const todayStr = new Date().toISOString().split('T')[0];
        setDate(data?.date || todayStr);
        setTime(data?.time || '18:00');
        setLeadTimeMinutes(15);
        setPriority('medium');
        setNotes('');
        setModalTab(data?.initialTab || 'form');
      }
    }
  }, [isOpen, mode, data]);

  if (!isOpen) return null;

  // Reminders for currently selected date
  const dateReminders = reminders.filter((r) => r.date === date && r.id !== editingId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !date || !time) {
      setError('Please fill in Title, Date, and Time.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const payload = {
        title: title.trim(),
        date,
        time,
        lead_time_minutes: Number(leadTimeMinutes),
        priority,
        notes: notes.trim()
      };

      if (editingId) {
        await api.updateReminder(editingId, payload);
        setSuccessNotice(`Reminder "${title.trim()}" updated successfully!`);
      } else {
        await api.createReminder(payload);
        setSuccessNotice(`Reminder "${title.trim()}" set successfully!`);
      }

      refreshData();
      setTimeout(() => {
        closeReminderModal();
      }, 700);
    } catch (err) {
      setError(err.message || 'Failed to save reminder.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleReminder = async (rId) => {
    try {
      await api.toggleReminder(rId);
      refreshData();
    } catch (err) {
      console.error('Failed to toggle reminder:', err);
    }
  };

  const handleDeleteReminder = async (rId, rTitle = 'Reminder') => {
    if (deletingId) return;
    setDeletingId(rId);
    try {
      await api.deleteReminder(rId);
      refreshData();
      setSuccessNotice(`Reminder "${rTitle}" deleted.`);
      if (editingId === rId) {
        setTimeout(() => closeReminderModal(), 600);
      }
    } catch (err) {
      setError(`Failed to delete reminder: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleLoadForEdit = (r) => {
    setEditingId(r.id);
    setTitle(r.title);
    setDate(r.date);
    setTime(r.time);
    setLeadTimeMinutes(r.lead_time_minutes ?? 15);
    setPriority(r.priority || 'medium');
    setNotes(r.notes || '');
    setModalTab('form');
  };

  return (
    <div className="modal-overlay" onClick={closeReminderModal}>
      <div className="modal-dialog meeting-modal-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Header with View Tabs */}
        <div className="modal-header">
          <div className="modal-header-tabs">
            <button
              type="button"
              className={`modal-tab-btn ${modalTab === 'form' ? 'active' : ''}`}
              onClick={() => setModalTab('form')}
            >
              <Plus size={14} />
              <span>{editingId ? 'Edit Reminder' : 'Set New Reminder'}</span>
            </button>
            <button
              type="button"
              className={`modal-tab-btn ${modalTab === 'reminders' ? 'active' : ''}`}
              onClick={() => setModalTab('reminders')}
            >
              <Bell size={14} />
              <span>My Reminders</span>
              <span className="modal-tab-count-pill">{reminders.length}</span>
            </button>
          </div>
          <button className="modal-close-btn" onClick={closeReminderModal} title="Close modal">
            <X size={20} />
          </button>
        </div>

        {/* Success or Error Notice */}
        {successNotice && (
          <div className="modal-success-banner">
            <CheckCircle2 size={16} />
            <span>{successNotice}</span>
          </div>
        )}

        {/* TAB 1: All Set Reminders List */}
        {modalTab === 'reminders' ? (
          <div className="modal-body modal-scheduled-tab-body">
            <div className="modal-scheduled-summary-bar">
              <span className="summary-text">
                You have <strong>{reminders.filter(r => r.completed === 0).length}</strong> active reminders ({reminders.length} total)
              </span>
              <button
                type="button"
                className="btn-modal-open-cal"
                onClick={() => {
                  closeReminderModal();
                  setCurrentView('reminders');
                }}
              >
                <Bell size={13} />
                <span>Open Reminders Page</span>
                <ExternalLink size={11} />
              </button>
            </div>

            {reminders.length === 0 ? (
              <div className="modal-empty-scheduled">
                <Bell size={36} className="empty-cal-icon" style={{ color: 'var(--accent-teal)' }} />
                <h4>No Reminders Set Yet</h4>
                <p>You haven't set any reminders. Click below to create your first one!</p>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    setEditingId(null);
                    setModalTab('form');
                  }}
                  style={{ marginTop: '10px' }}
                >
                  <Plus size={15} />
                  <span>+ Set a Reminder</span>
                </button>
              </div>
            ) : (
              <div className="modal-scheduled-items-list">
                {reminders.map((r) => {
                  const isTod = isToday(r.date);
                  const isTmrw = isTomorrow(r.date);
                  return (
                    <div
                      key={r.id}
                      className={`modal-scheduled-item-card ${r.completed ? 'completed-reminder' : ''}`}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="checkbox"
                          className="reminder-checkbox"
                          checked={r.completed === 1}
                          onChange={() => handleToggleReminder(r.id)}
                          title="Mark complete / active"
                        />
                        <div className="item-date-col">
                          <span className={`item-rel-chip ${isTod ? 'today' : isTmrw ? 'tomorrow' : ''}`}>
                            {getRelativeDateLabel(r.date)}
                          </span>
                          <span className="item-full-date">{formatDisplayDate(r.date)}</span>
                        </div>
                      </div>

                      <div className="item-info-col">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <h4 className={`item-title ${r.completed ? 'strike-through' : ''}`}>
                            {r.title}
                          </h4>
                          <span className={`priority-pill ${r.priority}`}>
                            {r.priority}
                          </span>
                        </div>
                        <div className="item-time">
                          <Clock size={12} />
                          <span>{formatTime12(r.time)}</span>
                          {r.lead_time_minutes > 0 && (
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                              (Alert {r.lead_time_minutes}m before)
                            </span>
                          )}
                        </div>
                        {r.notes && (
                          <div className="item-meta">
                            <span>{r.notes}</span>
                          </div>
                        )}
                      </div>

                      <div className="item-actions-col">
                        <button
                          type="button"
                          className="btn-item-edit"
                          onClick={() => handleLoadForEdit(r)}
                          title="Edit this reminder"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn-item-del"
                          onClick={() => handleDeleteReminder(r.id, r.title)}
                          disabled={deletingId === r.id}
                          title="Delete this reminder"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="modal-footer" style={{ marginTop: '10px' }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setEditingId(null);
                  setTitle('');
                  setModalTab('form');
                }}
              >
                <Plus size={15} />
                <span>+ Set New Reminder</span>
              </button>
            </div>
          </div>
        ) : (
          /* TAB 2: Set New / Edit Form */
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              {error && (
                <div style={{ padding: '10px 14px', backgroundColor: 'var(--danger-soft)', color: 'var(--danger)', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 600 }}>
                  {error}
                </div>
              )}

              {/* Title input */}
              <div className="form-group">
                <label>Reminder Title / Task *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g., Submit Assignment, Call Mom, Review Paper"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              {/* Date & Time */}
              <div className="form-row">
                <div className="form-group">
                  <label>Date *</label>
                  <input
                    type="date"
                    className="form-input"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Time *</label>
                  <input
                    type="time"
                    className="form-input"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Live Preview of Reminders on Selected Date */}
              <div className="modal-date-meetings-preview">
                <div className="preview-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Bell size={13} style={{ color: 'var(--accent-teal)' }} />
                    <span className="preview-label">
                      Reminders on {formatDisplayDate(date) || date} ({dateReminders.length})
                    </span>
                  </div>
                  {reminders.length > 0 && (
                    <button
                      type="button"
                      className="btn-view-all-modal-link"
                      onClick={() => setModalTab('reminders')}
                      title="View all set reminders"
                    >
                      View all ({reminders.length})
                    </button>
                  )}
                </div>

                {dateReminders.length === 0 ? (
                  <div className="date-free-notice">
                    <CheckCircle2 size={13} style={{ color: '#10b981' }} />
                    <span>No reminders set for this date yet.</span>
                  </div>
                ) : (
                  <div className="date-meetings-chips">
                    {dateReminders.map((dr) => (
                      <div key={dr.id} className="preview-meeting-chip">
                        <Clock size={11} />
                        <span className="chip-time">{formatTime12(dr.time)}</span>
                        <strong className={`chip-title ${dr.completed ? 'strike-through' : ''}`}>
                          {dr.title}
                        </strong>
                        <button
                          type="button"
                          className="chip-btn-edit"
                          onClick={() => handleLoadForEdit(dr)}
                          title="Click to edit"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="chip-btn-del"
                          onClick={() => handleDeleteReminder(dr.id, dr.title)}
                          title="Delete reminder"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Lead Time & Priority */}
              <div className="form-row">
                <div className="form-group">
                  <label>Advance Alert Notice</label>
                  <select
                    className="form-select"
                    value={leadTimeMinutes}
                    onChange={(e) => setLeadTimeMinutes(e.target.value)}
                  >
                    <option value="0">At time of event</option>
                    <option value="5">5 minutes before</option>
                    <option value="15">15 minutes before</option>
                    <option value="30">30 minutes before</option>
                    <option value="60">1 hour before</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Priority</label>
                  <select
                    className="form-select"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High Priority</option>
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div className="form-group">
                <label>Notes / Details</label>
                <textarea
                  className="form-textarea"
                  rows="2"
                  placeholder="Additional instructions or notes..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="modal-footer">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="btn-outline"
                  onClick={closeReminderModal}
                  disabled={loading}
                >
                  Cancel
                </button>
                {editingId && (
                  <button
                    type="button"
                    className="btn-danger-outline"
                    onClick={() => handleDeleteReminder(editingId, title)}
                    disabled={loading || deletingId === editingId}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      color: '#e11d48',
                      borderColor: '#fca5a5',
                      background: '#fff1f2',
                      padding: '7px 12px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <Trash2 size={13} />
                    <span>Delete</span>
                  </button>
                )}
              </div>

              <button
                type="submit"
                className="btn-teal"
                disabled={loading}
              >
                {loading ? 'Saving...' : editingId ? 'Update Reminder' : 'Set Reminder'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
