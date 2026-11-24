import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { ScheduledMeetingChart } from './ScheduledMeetingChart';
import {
  getMonthMatrix,
  getDaysOfWeek,
  formatDateISO,
  formatDisplayDate,
  formatTime12
} from '../utils/dateUtils';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  MapPin,
  Users
} from 'lucide-react';

export function CalendarView() {
  const { meetings, openMeetingModal } = useApp();
  const [viewMode, setViewMode] = useState('month'); // 'month' | 'week' | 'day'
  const [currentDate, setCurrentDate] = useState(new Date());

  // Navigation handlers
  const handlePrev = () => {
    const d = new Date(currentDate);
    if (viewMode === 'month') {
      d.setMonth(d.getMonth() - 1);
    } else if (viewMode === 'week') {
      d.setDate(d.getDate() - 7);
    } else {
      d.setDate(d.getDate() - 1);
    }
    setCurrentDate(d);
  };

  const handleNext = () => {
    const d = new Date(currentDate);
    if (viewMode === 'month') {
      d.setMonth(d.getMonth() + 1);
    } else if (viewMode === 'week') {
      d.setDate(d.getDate() + 7);
    } else {
      d.setDate(d.getDate() + 1);
    }
    setCurrentDate(d);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Title formatting
  const getHeaderTitle = () => {
    if (viewMode === 'month') {
      return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    if (viewMode === 'week') {
      const weekDays = getDaysOfWeek(currentDate);
      const start = weekDays[0].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const end = weekDays[6].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return `${start} – ${end}`;
    }
    return currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
  };

  const monthMatrix = getMonthMatrix(currentDate.getFullYear(), currentDate.getMonth());
  const weekDays = getDaysOfWeek(currentDate);
  const selectedDateStr = formatDateISO(currentDate);

  // Group meetings by date
  const meetingsByDate = {};
  for (const m of meetings) {
    if (!meetingsByDate[m.date]) {
      meetingsByDate[m.date] = [];
    }
    meetingsByDate[m.date].push(m);
  }

  // Hours for day view (08:00 to 20:00)
  const dayHours = [];
  for (let h = 8; h <= 20; h++) {
    dayHours.push(`${String(h).padStart(2, '0')}:00`);
  }

  return (
    <div className="view-content">
      <div className="calendar-container">
        {/* Top Controls */}
        <div className="calendar-controls-bar">
          <div className="calendar-nav-group">
            <h3 className="calendar-current-title">{getHeaderTitle()}</h3>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                className="btn-outline"
                style={{ padding: '6px 10px' }}
                onClick={handlePrev}
                title="Previous"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                className="btn-outline"
                style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                onClick={handleToday}
              >
                Today
              </button>
              <button
                className="btn-outline"
                style={{ padding: '6px 10px' }}
                onClick={handleNext}
                title="Next"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div className="view-mode-tabs">
              <button
                className={`view-tab ${viewMode === 'month' ? 'active' : ''}`}
                onClick={() => setViewMode('month')}
              >
                Month
              </button>
              <button
                className={`view-tab ${viewMode === 'week' ? 'active' : ''}`}
                onClick={() => setViewMode('week')}
              >
                Week
              </button>
              <button
                className={`view-tab ${viewMode === 'day' ? 'active' : ''}`}
                onClick={() => setViewMode('day')}
              >
                Day
              </button>
              <button
                className={`view-tab ${viewMode === 'chart' ? 'active' : ''}`}
                onClick={() => setViewMode('chart')}
              >
                Schedule Chart
              </button>
            </div>

            <button
              className="btn-primary"
              onClick={() => openMeetingModal('create', { date: selectedDateStr })}
            >
              <Plus size={16} />
              <span>Schedule</span>
            </button>
          </div>
        </div>

        {/* 1. Month View */}
        {viewMode === 'month' && (
          <div className="month-grid">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="month-weekday-header">
                {d}
              </div>
            ))}

            {monthMatrix.flat().map((cell, idx) => {
              const dayMeetings = meetingsByDate[cell.dateStr] || [];
              return (
                <div
                  key={idx}
                  className={`month-cell ${!cell.isCurrentMonth ? 'not-current' : ''} ${cell.isToday ? 'today' : ''}`}
                  onClick={() => {
                    openMeetingModal('create', { date: cell.dateStr });
                  }}
                >
                  <span className="cell-day-number">{cell.dayNumber}</span>
                  <div className="cell-events">
                    {dayMeetings.slice(0, 3).map((m) => (
                      <div
                        key={m.id}
                        className="cell-event-badge"
                        title={`${m.title} (${formatTime12(m.start_time)})`}
                        onClick={(e) => {
                          e.stopPropagation();
                          openMeetingModal('edit', m);
                        }}
                      >
                        {formatTime12(m.start_time)} {m.title}
                      </div>
                    ))}
                    {dayMeetings.length > 3 && (
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>
                        +{dayMeetings.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 2. Week View */}
        {viewMode === 'week' && (
          <div className="week-grid">
            {weekDays.map((wd) => {
              const dayMeetings = meetingsByDate[wd.dateStr] || [];
              return (
                <div
                  key={wd.dateStr}
                  className={`week-day-column ${wd.isToday ? 'today' : ''}`}
                >
                  <div className="week-col-header">
                    <div className="week-col-name">{wd.dayName}</div>
                    <div className="week-col-num">{wd.dayNumber}</div>
                  </div>

                  <div className="week-col-events">
                    {dayMeetings.length === 0 ? (
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', textAlign: 'center', marginTop: '20px' }}>
                        No events
                      </p>
                    ) : (
                      dayMeetings.map((m) => (
                        <div
                          key={m.id}
                          className="week-event-card"
                          onClick={() => openMeetingModal('edit', m)}
                        >
                          <div className="week-event-title">{m.title}</div>
                          <div className="week-event-time">
                            <Clock size={11} style={{ display: 'inline', marginRight: '3px' }} />
                            {formatTime12(m.start_time)} - {formatTime12(m.end_time)}
                          </div>
                          {m.location && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                              📍 {m.location}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 3. Day View */}
        {viewMode === 'day' && (
          <div className="day-view-container">
            {dayHours.map((hour) => {
              const [hNum] = hour.split(':').map(Number);
              const dayMeetings = (meetingsByDate[selectedDateStr] || []).filter((m) => {
                const [startH] = m.start_time.split(':').map(Number);
                return startH === hNum;
              });

              return (
                <div key={hour} className="day-time-slot-row">
                  <div className="day-slot-time">
                    {formatTime12(hour)}
                  </div>
                  <div
                    className="day-slot-events"
                    onClick={() => {
                      if (dayMeetings.length === 0) {
                        openMeetingModal('create', {
                          date: selectedDateStr,
                          start_time: hour
                        });
                      }
                    }}
                  >
                    {dayMeetings.map((m) => (
                      <div
                        key={m.id}
                        className="meeting-row"
                        style={{ padding: '8px 12px', cursor: 'pointer' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          openMeetingModal('edit', m);
                        }}
                      >
                        <div className="meeting-left">
                          <div className="meeting-time-badge" style={{ minWidth: '70px', padding: '4px 6px' }}>
                            {formatTime12(m.start_time)}
                          </div>
                          <div>
                            <h4 style={{ fontSize: '0.9rem' }}>{m.title}</h4>
                            <div className="meeting-meta">
                              {m.location && <span>📍 {m.location}</span>}
                              {m.attendees && <span>👥 {m.attendees}</span>}
                            </div>
                          </div>
                        </div>
                        <button
                          className="btn-outline"
                          style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            openMeetingModal('edit', m);
                          }}
                        >
                          Details
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 4. Schedule Chart View */}
        {viewMode === 'chart' && (
          <div style={{ marginTop: '16px' }}>
            <ScheduledMeetingChart meetings={meetings} />
          </div>
        )}
      </div>
    </div>
  );
}
