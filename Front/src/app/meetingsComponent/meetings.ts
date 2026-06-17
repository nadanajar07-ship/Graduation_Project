import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService, BASE } from '../services/auth.service';

@Component({
  selector: 'app-meetings',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './meetings.html',
  styleUrls: ['./meetings.css'],
})
export class MeetingsComponent implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private router = inject(Router);

  meetings   = signal<any[]>([]);
  members    = signal<any[]>([]);
  channels   = signal<any[]>([]);
  loading    = signal(true);
  error      = signal('');

  // Create meeting form
  showCreate   = signal(false);
  creating     = signal(false);
  createError  = signal('');
  title        = signal('');
  agenda       = signal('');
  startTime    = signal('');
  endTime      = signal('');
  selectedInvitees = signal<string[]>([]);
  selectedChannel  = signal<string>('');   // optional chat room to host the call

  currentUser = this.auth.currentUser;

  private get orgId(): string {
    return this.auth.currentUser()?.orgId ?? '';
  }

  ngOnInit() {
    this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      const [meetRes, memRes, roomRes] = await Promise.allSettled([
        firstValueFrom(
          this.http.get<{ data: { items: any[] } }>(`${BASE}/meetings?orgId=${this.orgId}`)
        ),
        this.orgId
          ? firstValueFrom(
              this.http.get<{ data: { members: any[] } }>(`${BASE}/org/${this.orgId}/members?limit=100`)
            )
          : Promise.reject('no org'),
        this.orgId
          ? firstValueFrom(
              this.http.get<{ data: { rooms: any[] } }>(`${BASE}/org/${this.orgId}/chat-rooms`)
            )
          : Promise.reject('no org'),
      ]);

      if (meetRes.status === 'fulfilled') {
        const items = meetRes.value?.data?.items ?? [];
        this.meetings.set(items.sort((a: any, b: any) =>
          new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
        ));
      }
      if (memRes.status === 'fulfilled') {
        this.members.set(memRes.value?.data?.members ?? []);
      }
      if (roomRes.status === 'fulfilled') {
        // Only group/channel rooms make sense to host a meeting call.
        const rooms = (roomRes.value?.data?.rooms ?? [])
          .filter((r: any) => !r.isDeleted && r.type !== 'direct');
        this.channels.set(rooms);
      }
    } catch (err: any) {
      this.error.set(err?.error?.message || 'Failed to load meetings');
    } finally {
      this.loading.set(false);
    }
  }

  // ── Create meeting ─────────────────────────────────────────
  openCreate() {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 30);
    const end = new Date(now);
    end.setHours(end.getHours() + 1);
    this.startTime.set(this.toLocal(now));
    this.endTime.set(this.toLocal(end));
    this.title.set('');
    this.agenda.set('');
    this.selectedInvitees.set([]);
    this.selectedChannel.set('');
    this.createError.set('');
    this.showCreate.set(true);
  }

  toggleInvitee(userId: string) {
    this.selectedInvitees.update(list =>
      list.includes(userId) ? list.filter(id => id !== userId) : [...list, userId]
    );
  }

  async createMeeting() {
    if (!this.title().trim() || !this.startTime() || !this.endTime()) {
      this.createError.set('Title, start time, and end time are required.');
      return;
    }
    if (new Date(this.endTime()) <= new Date(this.startTime())) {
      this.createError.set('End time must be after start time.');
      return;
    }
    this.creating.set(true);
    this.createError.set('');
    try {
      const res = await firstValueFrom(
        this.http.post<{ data: any }>(`${BASE}/meetings`, {
          organizationId: this.orgId,
          ...(this.selectedChannel() ? { chatRoomId: this.selectedChannel() } : {}),
          title:     this.title().trim(),
          agenda:    this.agenda().trim(),
          startTime: new Date(this.startTime()).toISOString(),
          endTime:   new Date(this.endTime()).toISOString(),
          invitees:  this.selectedInvitees().map(id => ({ userId: id, isRequired: true })),
        })
      );
      if (res?.data) {
        this.meetings.update(list =>
          [...list, res.data].sort((a, b) =>
            new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
          )
        );
      }
      this.showCreate.set(false);
    } catch (err: any) {
      this.createError.set(err?.error?.message || 'Failed to create meeting');
    } finally {
      this.creating.set(false);
    }
  }

  // ── RSVP ──────────────────────────────────────────────────
  async rsvp(meetingId: string, status: 'accepted' | 'declined' | 'tentative') {
    try {
      const res = await firstValueFrom(
        this.http.patch<{ data: any }>(`${BASE}/meetings/${meetingId}/rsvp`, { meetingId, status })
      );
      if (res?.data) {
        this.meetings.update(list =>
          list.map(m => m._id === meetingId ? res.data : m)
        );
      }
    } catch (err: any) {
      this.error.set(err?.error?.message || 'Failed to update RSVP');
    }
  }

  // ── Cancel meeting (organizer only) ───────────────────────
  async cancelMeeting(meetingId: string) {
    try {
      await firstValueFrom(this.http.delete(`${BASE}/meetings/${meetingId}`));
      this.meetings.update(list => list.filter(m => m._id !== meetingId));
    } catch (err: any) {
      this.error.set(err?.error?.message || 'Failed to cancel meeting');
    }
  }

  // ── Helpers ───────────────────────────────────────────────
  myRsvp(meeting: any): string {
    const myId = this.currentUser()?._id;
    const inv = (meeting.invitees ?? []).find((i: any) =>
      (i.userId?._id ?? i.userId) === myId
    );
    return inv?.status ?? 'pending';
  }

  isOrganizer(meeting: any): boolean {
    const myId = this.currentUser()?._id;
    return (meeting.organizerId?._id ?? meeting.organizerId) === myId;
  }

  isPast(meeting: any): boolean {
    return new Date(meeting.endTime) < new Date();
  }

  /** A meeting is "live" from 10 min before start until its end time. */
  isLive(meeting: any): boolean {
    const now = Date.now();
    const start = new Date(meeting.startTime).getTime() - 10 * 60 * 1000;
    const end = new Date(meeting.endTime).getTime();
    return now >= start && now <= end;
  }

  /** Reduce a meeting's chatRoomId (populated or raw) to a plain id. */
  private roomIdOf(meeting: any): string {
    return meeting?.chatRoomId?._id ?? meeting?.chatRoomId ?? '';
  }

  /** Can this user jump into the call? Needs a live meeting + a hosting room. */
  canJoinCall(meeting: any): boolean {
    return this.isLive(meeting) && !!this.roomIdOf(meeting);
  }

  /**
   * Bridge meeting → call: deep-link into the meeting's chat room and start
   * (or join) the call there. The room's existing call button / overlay owns
   * the live session, so we reuse the fully-wired chat-room call flow.
   */
  joinCall(meeting: any) {
    const roomId = this.roomIdOf(meeting);
    if (!roomId) return;
    this.router.navigate(['/dashboard/messages'], {
      queryParams: { room: roomId, call: 'video' },
    });
  }

  formatDate(dt: string): string {
    return new Date(dt).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });
  }

  formatTime(dt: string): string {
    return new Date(dt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  memberName(m: any): string {
    const u = m.userId ?? m;
    return u.username ?? u.email?.split('@')[0] ?? 'Unknown';
  }

  memberId(m: any): string {
    return m.userId?._id ?? m.userId ?? m._id ?? '';
  }

  isInvited(userId: string): boolean {
    return this.selectedInvitees().includes(userId);
  }

  private toLocal(d: Date): string {
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
  }
}
