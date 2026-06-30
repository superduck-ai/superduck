import type { IntlShape } from 'react-intl';
import type { SavedPrompt } from '../../extensionServices';

export function getScheduleText(intl: IntlShape, p: SavedPrompt): string {
  if (!p.repeatType || p.repeatType === 'none') return '';
  const timeStr = p.specificTime
    ? intl.formatTime(new Date(`2000-01-01T${p.specificTime}`), {
        hour: 'numeric',
        minute: '2-digit'
      })
    : '';
  const withTime = (label: string) =>
    timeStr
      ? intl.formatMessage(
          {
            defaultMessage: '{label} at {time}',
            id: 'schedule_label_at_time'
          },
          { label, time: timeStr }
        )
      : label;

  switch (p.repeatType) {
    case 'once':
      if (p.specificDate) {
        const [year, mo, d] = p.specificDate.split('-').map(Number);
        const dateStr = intl.formatDate(new Date(year, mo - 1, d), {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
        return timeStr
          ? intl.formatMessage(
              {
                defaultMessage: '{date} at {time}',
                id: 'schedule_date_at_time'
              },
              { date: dateStr, time: timeStr }
            )
          : dateStr;
      }
      return withTime(
        intl.formatMessage({
          defaultMessage: 'Once',
          id: 'once'
        })
      );
    case 'daily':
      return withTime(
        intl.formatMessage({
          defaultMessage: 'Daily',
          id: 'daily'
        })
      );
    case 'weekly':
      return withTime(
        intl.formatMessage(
          {
            defaultMessage: '{weekly} on {day}',
            id: 'schedule_weekly_on_day'
          },
          {
            weekly: intl.formatMessage({
              defaultMessage: 'Weekly',
              id: 'weekly'
            }),
            day: intl.formatDate(new Date(2020, 5, 7 + (p.dayOfWeek || 0)), {
              weekday: 'long'
            })
          }
        )
      );
    case 'monthly':
      return withTime(
        intl.formatMessage(
          {
            defaultMessage: '{monthly} on day {dayOfMonth}',
            id: 'schedule_monthly_on_day'
          },
          {
            monthly: intl.formatMessage({
              defaultMessage: 'Monthly',
              id: 'monthly'
            }),
            dayOfMonth: p.dayOfMonth || 1
          }
        )
      );
    case 'annually':
      if (p.monthAndDay) {
        const [mo, d] = p.monthAndDay.split('-').map(Number);
        return withTime(
          intl.formatMessage(
            {
              defaultMessage: '{annually} on {date}',
              id: 'schedule_annually_on_date'
            },
            {
              annually: intl.formatMessage({
                defaultMessage: 'Annually',
                id: 'annually'
              }),
              date: intl.formatDate(new Date(2000, mo - 1, d), {
                month: 'short',
                day: 'numeric'
              })
            }
          )
        );
      }
      return withTime(
        intl.formatMessage({
          defaultMessage: 'Annually',
          id: 'annually'
        })
      );
    default:
      return '';
  }
}
