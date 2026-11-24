import { useEffect, useRef } from 'react';
import { playChime } from '../utils/sound';
import { formatTime12, formatDateISO } from '../utils/dateUtils';

export function useReminderAlerts(reminders = [], onTriggerAlert) {
  const alertedIdsRef = useRef(new Set());

  useEffect(() => {
    // Check reminders every 15 seconds
    const checkDueReminders = () => {
      if (!reminders || reminders.length === 0) return;

      const now = new Date();
      const todayISO = formatDateISO(now);
      const currentHours = now.getHours();
      const currentMinutes = now.getMinutes();
      const currentTotalMins = currentHours * 60 + currentMinutes;

      for (const r of reminders) {
        if (r.completed === 1) continue;
        if (alertedIdsRef.current.has(r.id)) continue;

        // Only check today's reminders
        if (r.date === todayISO) {
          const [rH, rM] = r.time.split(':').map(Number);
          const reminderTotalMins = rH * 60 + rM;
          const leadMins = r.lead_time_minutes || 0;

          // Alert if current time is within lead time before the reminder up to 5 minutes after
          const alertWindowStart = reminderTotalMins - leadMins;
          const alertWindowEnd = reminderTotalMins + 5;

          if (currentTotalMins >= alertWindowStart && currentTotalMins <= alertWindowEnd) {
            alertedIdsRef.current.add(r.id);

            // Play in-app audio chime
            playChime();

            // Trigger in-app notification popup
            if (onTriggerAlert) {
              onTriggerAlert({
                id: r.id,
                title: r.title,
                time: formatTime12(r.time),
                priority: r.priority,
                notes: r.notes
              });
            }

            // Desktop browser notification if permission granted
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              try {
                new Notification(`AURA Reminder: ${r.title}`, {
                  body: `Scheduled for ${formatTime12(r.time)}${r.notes ? ` • ${r.notes}` : ''}`,
                  icon: '/favicon.svg'
                });
              } catch (e) {
                // Ignore if blocked in some environments
              }
            }
          }
        }
      }
    };

    checkDueReminders();
    const interval = setInterval(checkDueReminders, 15000);
    return () => clearInterval(interval);
  }, [reminders, onTriggerAlert]);
}
