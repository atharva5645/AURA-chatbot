import React from 'react';
import { useApp } from '../context/AppContext';
import { Bell, X } from 'lucide-react';

export function NotificationToast() {
  const { alerts, dismissAlert } = useApp();

  if (!alerts || alerts.length === 0) return null;

  return (
    <div className="toast-container">
      {alerts.map((alert) => (
        <div key={alert.id} className="toast-card">
          <Bell size={22} style={{ color: 'var(--accent-teal)' }} />
          <div className="toast-content">
            <h4>{alert.title}</h4>
            <p>
              ⏰ Due at {alert.time}
              {alert.notes ? ` • ${alert.notes}` : ''}
            </p>
          </div>
          <button
            className="toast-close-btn"
            onClick={() => dismissAlert(alert.id)}
            title="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
