import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService, BASE } from '../services/auth.service';
import { TaskService } from '../services/task.service';

interface CalEvent {
  id: string;
  title: string;
  date: Date;
  type: 'task' | 'meeting';
  status?: string;
  color: string;
  route?: string;
}

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './calendar.html',
  styleUrls: ['./calendar.css'],
})
export class CalendarComponent implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private taskService = inject(TaskService);

  calendarDate = signal(new Date());
  selectedDay  = signal<Date | null>(null);
  meetings     = signal<any[]>([]);
  loading      = signal(false);

  private get orgId(): string { return this.auth.currentUser()?.orgId ?? ''; }

  calendarYear  = computed(() => this.calendarDate().getFullYear());
  calendarMonth = computed(() => this.calendarDate().getMonth());
  monthLabel    = computed(() =>
    this.calendarDate().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  );

  calendarDays = computed(() => {
    const y = this.calendarYear(), m = this.calendarMonth();
    const first = new Date(y, m, 1).getDay();
    const total = new Date(y, m + 1, 0).getDate();
    const days: (Date | null)[] = [];
    for (let i = 0; i < first; i++) days.push(null);
    for (let d = 1; d <= total; d++) days.push(new Date(y, m, d));
    while (days.length % 7 !== 0) days.push(null);
    return days;
  });

  allEvents = computed<CalEvent[]>(() => {
    const events: CalEvent[] = [];

    // Tasks with due dates
    for (const task of this.taskService.tasks()) {
      if (!task.dueDate) continue;
      let d: Date;
      if (task.dueDate.includes('T') || task.dueDate.match(/\d{4}-\d{2}-\d{2}/)) {
        d = new Date(task.dueDate);
      } else {
        d = new Date(`${task.dueDate} ${this.calendarYear()}`);
      }
      if (isNaN(d.getTime())) continue;
      events.push({
        id: task.id,
        title: task.title,
        date: d,
        type: 'task',
        status: task.status,
        color: task.status === 'done' ? '#10b981' : task.status === 'inprogress' ? '#6366f1' : '#f59e0b',
        route: `/dashboard/tasks/${task.id}`,
      });
    }

    // Meetings
    for (const mtg of this.meetings()) {
      const d = new Date(mtg.startTime);
      if (isNaN(d.getTime())) continue;
      events.push({
        id: mtg._id,
        title: mtg.title,
        date: d,
        type: 'meeting',
        color: '#8b5cf6',
        route: '/dashboard/meetings',
      });
    }

    return events;
  });

  getEventsForDay(day: Date): CalEvent[] {
    return this.allEvents().filter(ev =>
      ev.date.getFullYear() === day.getFullYear() &&
      ev.date.getMonth() === day.getMonth() &&
      ev.date.getDate() === day.getDate(),
    );
  }

  selectedEvents = computed<CalEvent[]>(() => {
    const d = this.selectedDay();
    return d ? this.getEventsForDay(d) : [];
  });

  ngOnInit() { this.loadMeetings(); }

  private async loadMeetings() {
    if (!this.orgId) return;
    this.loading.set(true);
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: any }>(`${BASE}/meetings?orgId=${this.orgId}&limit=100`),
      );
      this.meetings.set(res?.data?.items ?? res?.data?.meetings ?? []);
    } catch { /* optional */ }
    finally { this.loading.set(false); }
  }

  prevMonth() {
    const d = this.calendarDate();
    this.calendarDate.set(new Date(d.getFullYear(), d.getMonth() - 1, 1));
    this.selectedDay.set(null);
  }
  nextMonth() {
    const d = this.calendarDate();
    this.calendarDate.set(new Date(d.getFullYear(), d.getMonth() + 1, 1));
    this.selectedDay.set(null);
  }

  selectDay(day: Date | null) {
    if (!day) return;
    const cur = this.selectedDay();
    this.selectedDay.set(cur?.toDateString() === day.toDateString() ? null : day);
  }

  isToday(day: Date): boolean {
    const t = new Date();
    return day.getFullYear() === t.getFullYear() &&
           day.getMonth() === t.getMonth() &&
           day.getDate() === t.getDate();
  }

  isSelected(day: Date): boolean {
    const s = this.selectedDay();
    return !!s && s.toDateString() === day.toDateString();
  }

  formatTime(iso: string): string {
    try { return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  }
}
