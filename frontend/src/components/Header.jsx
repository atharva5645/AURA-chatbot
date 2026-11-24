import React from 'react';
import { useApp } from '../context/AppContext';
import { formatLongDate } from '../utils/dateUtils';
import {
  Volume2,
  VolumeX,
  Plus,
  BellPlus,
  CalendarCheck
} from 'lucide-react';

export function Header() {
  const {
    stats,
    tts,
    openMeetingModal,
    openReminderModal
  } = useApp();

  const todayStr = stats?.todayDate || new Date().toISOString().split('T')[0];

  return (
    <header className="app-header">
      <div className="header-actions">
        {/* Date display */}
        <div className="header-date-badge">
          <CalendarCheck size={14} style={{ color: 'var(--accent-teal)' }} />
          <span>{formatLongDate(todayStr)}</span>
        </div>

        {/* Voice Mute / Speak Toggle */}
        <button
          className={`btn-tts-toggle ${tts.isMuted ? 'muted' : ''}`}
          onClick={tts.toggleMute}
          title={tts.isMuted ? 'Voice output is MUTED (Click to enable)' : 'Voice output is ACTIVE (Click to mute)'}
        >
          {tts.isMuted ? (
            <>
              <VolumeX size={15} />
              <span>Voice Muted</span>
            </>
          ) : (
            <>
              <Volume2 size={15} style={{ color: 'var(--accent-teal)' }} />
              <span>Voice Active</span>
            </>
          )}
        </button>

        {/* Quick Add Reminder */}
        <button
          className="btn-outline"
          onClick={() => openReminderModal('create')}
          title="Add Reminder"
        >
          <BellPlus size={15} />
          <span>Reminder</span>
        </button>

        {/* Quick Schedule Meeting */}
        <button
          className="btn-primary"
          onClick={() => openMeetingModal('create')}
          title="Schedule Meeting"
        >
          <Plus size={15} />
          <span>Schedule</span>
        </button>
      </div>
    </header>
  );
}
