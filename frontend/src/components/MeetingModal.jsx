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
  Calendar,
  Clock,
  MapPin,
  Users,
  AlertTriangle,
  Trash2,
  CheckCircle2,
  CalendarDays,
  Plus,
  Sparkles,
  ExternalLink
} from 'lucide-react';

export function MeetingModal() {
  const { meetingModal, closeMeetingModal, refreshData, meetings = [], setCurrentView } = useApp();
  const { isOpen, mode, data } = meetingModal;

  const [modalTab, setModalTab] = useState('form'); // 'form' | 'scheduled'
  const [editingId, setEditingId] = useState(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('14:00');
  const [endTime, setEndTime] = useState('15:00');
  const [attendees, setAttendees] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState(null);
  const [successNotice, setSuccessNotice] = useState(null);
  const [conflictData, setConflictData] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSuccessNotice(null);
      setConflictData(null);
      if (mode === 'edit' && data) {
        setModalTab('form');
        setEditingId(data.id);
        setTitle(data.title || '');
        setDate(data.date || '');
        setStartTime(data.start_time || '14:00');
        setEndTime(data.end_time || '15:00');
        setAttendees(data.attendees || '');
        setLocation(data.location || '');
        setNotes(data.notes || '');
      } else {
        // Create mode
        setEditingId(null);
        setTitle('');
        const todayStr = new Date().toISOString().split('T')[0];
        setDate(data?.date || todayStr);
        setStartTime(data?.start_time || '14:00');
        const [h, m] = (data?.start_time || '14:00').split(':').map(Number);
        setEndTime(`${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        setAttendees('');
        setLocation('Campus Lab / Online');
        setNotes('');
        setModalTab(data?.initialTab || 'form');
      }
    }
  }, [isOpen, mode, data]);

  if (!isOpen) return null;

  // Meetings on currently selected date in the form
  const dateMeetings = meetings.filter((m) => m.date === date && m.id !== editingId);

  // Submit handler
  const handleSubmit = async (e, force = false) => {
    if (e) e.preventDefault();
    if (!title.trim() || !date || !startTime) {
      setError('Please fill in all required fields (Title, Date, Start Time).');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setConflictData(null);

      const payload = {
        title: title.trim(),
        date,
        start_time: startTime,
        end_time: endTime,
        attendees: attendees.trim(),
        location: location.trim(),
        notes: notes.trim(),
        force
      };

      if (editingId) {
        await api.updateMeeting(editingId, payload);
        setSuccessNotice(`"${title.trim()}" updated successfully!`);
      } else {
        await api.createMeeting(payload);
        setSuccessNotice(`"${title.trim()}" scheduled successfully!`);
      }

      refreshData();
      setTimeout(() => {
        closeMeetingModal();
      }, 700);
    } catch (err) {
      if (err.status === 409 && err.data?.conflict) {
        setConflictData({
          message: err.data.error,
          suggestedSlots: err.data.suggestedSlots || []
        });
      } else {
        setError(err.message || 'Failed to save meeting.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Delete meeting handler
  const handleDeleteMeeting = async (meetingId, meetingTitle = 'Meeting') => {
    if (deletingId) return;
    setDeletingId(meetingId);
    try {
      await api.deleteMeeting(meetingId);
      refreshData();
      setSuccessNotice(`"${meetingTitle}" deleted from calendar.`);
      if (editingId === meetingId) {
        setTimeout(() => closeMeetingModal(), 600);
      }
    } catch (err) {
      setError(`Failed to delete meeting: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  // Load meeting into form for editing
  const handleLoadForEdit = (m) => {
    setEditingId(m.id);
    setTitle(m.title);
    setDate(m.date);
    setStartTime(m.start_time);
    setEndTime(m.end_time || '');
    setAttendees(m.attendees || '');
    setLocation(m.location || '');
    setNotes(m.notes || '');
    setModalTab('form');
  };

  const handleUseSlot = (slot) => {
    setStartTime(slot.start_time);
    setEndTime(slot.end_time);
    setConflictData(null);
  };

  return (
    <div className="modal-overlay" onClick={closeMeetingModal}>
      <div className="modal-dialog meeting-modal-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header with View Tabs */}
        <div className="modal-header">
          <div className="modal-header-tabs">
            <button
              type="button"
              className={`modal-tab-btn ${modalTab === 'form' ? 'active' : ''}`}
              onClick={() => setModalTab('form')}
            >
              <Plus size={14} />
              <span>{editingId ? 'Edit Meeting' : 'Schedule New'}</span>
            </button>
            <button
              type="button"
              className={`modal-tab-btn ${modalTab === 'scheduled' ? 'active' : ''}`}
              onClick={() => setModalTab('scheduled')}
            >
              <CalendarDays size={14} />
              <span>Scheduled Meetings</span>
              <span className="modal-tab-count-pill">{meetings.length}</span>
            </button>
          </div>
          <button className="modal-close-btn" onClick={closeMeetingModal} title="Close modal">
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

        {/* TAB 1: Scheduled Meetings List */}
        {modalTab === 'scheduled' ? (
          <div className="modal-body modal-scheduled-tab-body">
            <div className="modal-scheduled-summary-bar">
              <span className="summary-text">
                You have <strong>{meetings.length}</strong> scheduled {meetings.length === 1 ? 'meeting' : 'meetings'}
              </span>
              <button
                type="button"
                className="btn-modal-open-cal"
                onClick={() => {
                  closeMeetingModal();
                  setCurrentView('calendar');
                }}
              >
                <Calendar size={13} />
                <span>Open Calendar View</span>
                <ExternalLink size={11} />
              </button>
            </div>

            {meetings.length === 0 ? (
              <div className="modal-empty-scheduled">
                <CalendarDays size={36} className="empty-cal-icon" />
                <h4>No Scheduled Meetings</h4>
                <p>You haven't scheduled any meetings yet. Click below to create one!</p>
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
                  <span>+ Schedule a Meeting</span>
                </button>
              </div>
            ) : (
              <div className="modal-scheduled-items-list">
                {meetings.map((m) => {
                  const isTod = isToday(m.date);
                  const isTmrw = isTomorrow(m.date);
                  return (
                    <div key={m.id} className="modal-scheduled-item-card">
                      <div className="item-date-col">
                        <span className={`item-rel-chip ${isTod ? 'today' : isTmrw ? 'tomorrow' : ''}`}>
                          {getRelativeDateLabel(m.date)}
                        </span>
                        <span className="item-full-date">{formatDisplayDate(m.date)}</span>
                      </div>

                      <div className="item-info-col">
                        <h4 className="item-title">{m.title}</h4>
                        <div className="item-time">
                          <Clock size={12} />
                          <span>
                            {formatTime12(m.start_time)} {m.end_time && `– ${formatTime12(m.end_time)}`}
                          </span>
                        </div>
                        {m.location && (
                          <div className="item-meta">
                            <MapPin size={11} />
                            <span>{m.location}</span>
                          </div>
                        )}
                        {m.attendees && (
                          <div className="item-meta">
                            <Users size={11} />
                            <span>{m.attendees}</span>
                          </div>
                        )}
                      </div>

                      <div className="item-actions-col">
                        <button
                          type="button"
                          className="btn-item-edit"
                          onClick={() => handleLoadForEdit(m)}
                          title="Edit this meeting"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn-item-del"
                          onClick={() => handleDeleteMeeting(m.id, m.title)}
                          disabled={deletingId === m.id}
                          title="Delete this meeting"
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
                <span>+ Schedule New Meeting</span>
              </button>
            </div>
          </div>
        ) : (
          /* TAB 2: Schedule / Edit Form */
          <form onSubmit={(e) => handleSubmit(e, false)}>
            <div className="modal-body">
              {error && (
                <div style={{ padding: '10px 14px', backgroundColor: 'var(--danger-soft)', color: 'var(--danger)', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 600 }}>
                  {error}
                </div>
              )}

              {conflictData && (
                <div style={{ padding: '12px 14px', backgroundColor: 'var(--warning-soft)', border: '1px solid #fde68a', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#92400e', fontWeight: 700, fontSize: '0.85rem', marginBottom: '4px' }}>
                    <AlertTriangle size={16} />
                    <span>{conflictData.message}</span>
                  </div>
                  {conflictData.suggestedSlots.length > 0 && (
                    <div style={{ marginTop: '8px' }}>
                      <p style={{ fontSize: '0.78rem', color: '#78350f', marginBottom: '6px' }}>
                        Suggested available slots on this date:
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {conflictData.suggestedSlots.map((s, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className="slot-choice-btn"
                            style={{ padding: '4px 8px', fontSize: '0.78rem' }}
                            onClick={() => handleUseSlot(s)}
                          >
                            Use {formatTime12(s.start_time)} - {formatTime12(s.end_time)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      style={{ fontSize: '0.75rem', color: '#b45309', textDecoration: 'underline' }}
                      onClick={() => handleSubmit(null, true)}
                    >
                      Schedule anyway (ignore conflict)
                    </button>
                  </div>
                </div>
              )}

              {/* Title input */}
              <div className="form-group">
                <label>Meeting Title *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g., AI Capstone Review with Prof. Sharma"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              {/* Date input */}
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

              {/* Live Scheduled Meetings on Selected Date */}
              <div className="modal-date-meetings-preview">
                <div className="preview-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Calendar size={13} style={{ color: 'var(--primary-blue)' }} />
                    <span className="preview-label">
                      Meetings on {formatDisplayDate(date) || date} ({dateMeetings.length})
                    </span>
                  </div>
                  {meetings.length > 0 && (
                    <button
                      type="button"
                      className="btn-view-all-modal-link"
                      onClick={() => setModalTab('scheduled')}
                      title="View all scheduled meetings"
                    >
                      View all ({meetings.length})
                    </button>
                  )}
                </div>

                {dateMeetings.length === 0 ? (
                  <div className="date-free-notice">
                    <CheckCircle2 size={13} style={{ color: '#10b981' }} />
                    <span>No conflicting meetings on this date. All time slots are open!</span>
                  </div>
                ) : (
                  <div className="date-meetings-chips">
                    {dateMeetings.map((dm) => (
                      <div key={dm.id} className="preview-meeting-chip">
                        <Clock size={11} />
                        <span className="chip-time">{formatTime12(dm.start_time)}</span>
                        <strong className="chip-title">{dm.title}</strong>
                        <button
                          type="button"
                          className="chip-btn-edit"
                          onClick={() => handleLoadForEdit(dm)}
                          title="Click to edit this meeting"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="chip-btn-del"
                          onClick={() => handleDeleteMeeting(dm.id, dm.title)}
                          title="Delete meeting"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Time inputs */}
              <div className="form-row">
                <div className="form-group">
                  <label>Start Time *</label>
                  <input
                    type="time"
                    className="form-input"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>End Time</label>
                  <input
                    type="time"
                    className="form-input"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>

              {/* Attendees */}
              <div className="form-group">
                <label>Attendees</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g., Atharva, Prof. Sharma, Neha"
                  value={attendees}
                  onChange={(e) => setAttendees(e.target.value)}
                />
              </div>

              {/* Location */}
              <div className="form-group">
                <label>Location / Link</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g., Room 402, CS Dept or Google Meet"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>

              {/* Notes */}
              <div className="form-group">
                <label>Notes / Agenda</label>
                <textarea
                  className="form-textarea"
                  rows="2"
                  placeholder="Bring slides and architecture diagrams..."
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
                  onClick={closeMeetingModal}
                  disabled={loading}
                >
                  Cancel
                </button>
                {editingId && (
                  <button
                    type="button"
                    className="btn-danger-outline"
                    onClick={() => handleDeleteMeeting(editingId, title)}
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
                className="btn-primary"
                disabled={loading}
              >
                {loading ? 'Saving...' : editingId ? 'Update Meeting' : 'Schedule Meeting'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
