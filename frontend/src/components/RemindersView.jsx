import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { formatTime12, formatDisplayDate } from '../utils/dateUtils';
import {
  Bell,
  Plus,
  Clock,
  Calendar,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export function RemindersView() {
  const { reminders, refreshData, openReminderModal } = useApp();
  const [filter, setFilter] = useState('all'); // 'all' | 'active' | 'completed' | 'high'

  const handleToggle = async (id) => {
    try {
      await api.toggleReminder(id);
      refreshData();
    } catch (err) {
      console.error('Failed to toggle reminder:', err);
    }
  };

  const handleDelete = async (id, title) => {
    if (window.confirm(`Delete reminder "${title}"?`)) {
      try {
        await api.deleteReminder(id);
        refreshData();
      } catch (err) {
        console.error('Failed to delete reminder:', err);
      }
    }
  };

  const filteredReminders = reminders.filter((r) => {
    if (filter === 'active') return r.completed === 0;
    if (filter === 'completed') return r.completed === 1;
    if (filter === 'high') return r.priority === 'high' && r.completed === 0;
    return true;
  });

  return (
    <div className="view-content">
      {/* Top Filter and Action Bar */}
      <div className="reminders-filter-bar">
        <div className="filter-pills">
          <button
            className={`filter-pill-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({reminders.length})
          </button>
          <button
            className={`filter-pill-btn ${filter === 'active' ? 'active' : ''}`}
            onClick={() => setFilter('active')}
          >
            Active ({reminders.filter(r => r.completed === 0).length})
          </button>
          <button
            className={`filter-pill-btn ${filter === 'completed' ? 'active' : ''}`}
            onClick={() => setFilter('completed')}
          >
            Completed ({reminders.filter(r => r.completed === 1).length})
          </button>
          <button
            className={`filter-pill-btn ${filter === 'high' ? 'active' : ''}`}
            onClick={() => setFilter('high')}
          >
            High Priority ({reminders.filter(r => r.priority === 'high' && r.completed === 0).length})
          </button>
        </div>

        <button
          className="btn-teal"
          onClick={() => openReminderModal('create')}
        >
          <Plus size={16} />
          <span>New Reminder</span>
        </button>
      </div>

      {/* Reminders Cards Grid */}
      {filteredReminders.length === 0 ? (
        <div className="dashboard-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <Bell size={44} style={{ color: 'var(--text-subtle)', margin: '0 auto 12px' }} />
          <h3 style={{ color: 'var(--navy-darkest)', marginBottom: '6px' }}>No reminders found</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            {filter === 'completed'
              ? 'You have not completed any reminders yet.'
              : 'You have no active reminders matching this filter.'}
          </p>
        </div>
      ) : (
        <div className="reminders-grid">
          {filteredReminders.map((r) => (
            <div
              key={r.id}
              className={`reminder-card ${r.completed === 1 ? 'completed' : ''}`}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <input
                      type="checkbox"
                      className="reminder-checkbox"
                      style={{ marginTop: '3px' }}
                      checked={r.completed === 1}
                      onChange={() => handleToggle(r.id)}
                      title="Mark complete / active"
                    />
                    <div>
                      <h4 className="card-title" style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--navy-darkest)' }}>
                        {r.title}
                      </h4>
                      {r.notes && (
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                          {r.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  <span className={`priority-pill ${r.priority}`}>
                    {r.priority}
                  </span>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '14px', fontSize: '0.78rem', color: 'var(--navy-mid)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Calendar size={13} style={{ color: 'var(--primary-blue)' }} />
                    {formatDisplayDate(r.date)}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={13} style={{ color: 'var(--accent-teal)' }} />
                    {formatTime12(r.time)}
                  </span>
                  {r.lead_time_minutes > 0 && (
                    <span style={{ backgroundColor: 'var(--bg-card-subtle)', padding: '2px 6px', borderRadius: '4px' }}>
                      ⏳ Alert {r.lead_time_minutes}m before
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border-light)' }}>
                <button
                  className="btn-outline"
                  style={{ padding: '5px 10px', fontSize: '0.75rem' }}
                  onClick={() => openReminderModal('edit', r)}
                >
                  <Edit2 size={13} />
                  <span>Edit</span>
                </button>
                <button
                  className="btn-danger-outline"
                  style={{ padding: '5px 10px', fontSize: '0.75rem' }}
                  onClick={() => handleDelete(r.id, r.title)}
                >
                  <Trash2 size={13} />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
