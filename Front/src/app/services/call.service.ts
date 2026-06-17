import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  Room,
  RoomEvent,
  RemoteParticipant,
  LocalParticipant,
  Track,
  createLocalTracks,
  LocalTrack,
} from 'livekit-client';
import { BASE } from './auth.service';

export interface CallState {
  roomId: string;
  callId: string;
  token: string;
  livekitUrl: string;
}

@Injectable({ providedIn: 'root' })
export class CallService {
  private http = inject(HttpClient);

  room: Room | null = null;
  activeCall   = signal<CallState | null>(null);
  participants = signal<string[]>([]);
  isMuted      = signal(false);
  isCamOff     = signal(false);
  isScreenSharing = signal(false);
  callError    = signal('');
  connecting   = signal(false);

  isRecording  = signal(false);
  recordingBusy = signal(false);

  // ── Teams-style in-call extras (driven by SocketService) ──
  myHandRaised = signal(false);
  raisedHands  = signal<{ userId: string; username: string }[]>([]);
  // Roster of named participants (built from call:user-joined) for @mentions.
  roster       = signal<{ userId: string; username: string }[]>([]);
  inCallChat   = signal<{ fromUserId: string; fromUsername: string; text: string; at: string; mine: boolean }[]>([]);
  unreadChat   = signal(0);

  localTracks: LocalTrack[] = [];

  private _localVideoEl: HTMLVideoElement | null = null;
  private _remoteContainer: HTMLDivElement | null = null;

  bindVideoEls(
    localEl: HTMLVideoElement | null,
    remoteContainer: HTMLDivElement | null,
  ): void {
    this._localVideoEl = localEl;
    this._remoteContainer = remoteContainer;
    if (localEl) {
      const vt = this.localTracks.find(t => t.kind === Track.Kind.Video);
      if (vt) vt.attach(localEl);
    }
    if (remoteContainer && this.room) {
      for (const [, p] of this.room.remoteParticipants) {
        for (const pub of p.trackPublications.values()) {
          if ((pub as any).isSubscribed && (pub as any).track) {
            this._attachRemoteTrack((pub as any).track, (pub as any).trackSid);
          }
        }
      }
    }
  }

  private _attachRemoteTrack(track: any, trackSid: string): void {
    if (!this._remoteContainer) return;
    if (this._remoteContainer.querySelector(`[data-tsid="${trackSid}"]`)) return;
    const el: HTMLMediaElement = track.attach();
    el.setAttribute('data-tsid', trackSid);
    if (el instanceof HTMLVideoElement) {
      el.autoplay = true;
      el.playsInline = true;
      Object.assign(el.style, {
        flex: '1', minWidth: '280px', maxWidth: '640px',
        borderRadius: '10px', background: '#1a1a2e', objectFit: 'cover',
        maxHeight: 'calc(100vh - 200px)',
      });
    }
    this._remoteContainer.appendChild(el);
  }

  async getCallHistory(roomId: string): Promise<any[]> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: any }>(`${BASE}/chat/rooms/${roomId}/calls`),
      );
      return res?.data?.calls ?? res?.data ?? [];
    } catch { return []; }
  }

  async getActiveCall(roomId: string): Promise<any | null> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: any }>(`${BASE}/chat/rooms/${roomId}/calls/active`),
      );
      return res?.data?.call ?? res?.data ?? null;
    } catch { return null; }
  }

  async joinCall(roomId: string, callId: string): Promise<boolean> {
    this.connecting.set(true);
    this.callError.set('');
    try {
      const tokenRes = await firstValueFrom(
        this.http.post<{ data: any }>(
          `${BASE}/chat/rooms/${roomId}/calls/${callId}/livekit-token`, {},
        ),
      );
      const token = tokenRes?.data?.token;
      const url   = tokenRes?.data?.livekitUrl ?? tokenRes?.data?.url;
      if (!token || !url) {
        this.callError.set('Call server not configured.');
        return false;
      }

      this.room = new Room();
      this.room.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
        this.participants.update(list =>
          list.includes(p.identity) ? list : [...list, p.identity]
        );
      });
      this.room.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
        this.participants.update(list => list.filter(id => id !== p.identity));
      });
      this.room.on(RoomEvent.Disconnected, () => {
        this.activeCall.set(null);
        this.participants.set([]);
      });
      this.room.on(RoomEvent.TrackSubscribed, (track: any, pub: any, participant: RemoteParticipant) => {
        this._attachRemoteTrack(track, pub.trackSid);
        this.participants.update(list =>
          list.includes(participant.identity) ? list : [...list, participant.identity]
        );
      });
      this.room.on(RoomEvent.TrackUnsubscribed, (_track: any, pub: any) => {
        this._remoteContainer?.querySelector(`[data-tsid="${pub.trackSid}"]`)?.remove();
      });

      await this.room.connect(url, token);

      // Publish local audio + video
      this.localTracks = await createLocalTracks({ audio: true, video: true });
      for (const track of this.localTracks) {
        await this.room.localParticipant.publishTrack(track);
      }

      // Attach local video if element already bound
      if (this._localVideoEl) {
        const vt = this.localTracks.find(t => t.kind === Track.Kind.Video);
        if (vt) vt.attach(this._localVideoEl);
      }

      this.activeCall.set({ roomId, callId, token, livekitUrl: url });
      this.participants.set(
        Array.from(this.room.remoteParticipants.values()).map((p: RemoteParticipant) => p.identity),
      );
      return true;
    } catch (err: any) {
      this.callError.set(err?.message || 'Failed to join call');
      return false;
    } finally {
      this.connecting.set(false);
    }
  }

  async toggleMute() {
    const lp: LocalParticipant | undefined = this.room?.localParticipant;
    if (!lp) return;
    const muted = !this.isMuted();
    await lp.setMicrophoneEnabled(!muted);
    this.isMuted.set(muted);
  }

  async toggleCamera() {
    const lp: LocalParticipant | undefined = this.room?.localParticipant;
    if (!lp) return;
    const off = !this.isCamOff();
    await lp.setCameraEnabled(!off);
    this.isCamOff.set(off);
  }

  async toggleScreenShare() {
    const lp: LocalParticipant | undefined = this.room?.localParticipant;
    if (!lp) return;
    const enable = !this.isScreenSharing();
    try {
      await lp.setScreenShareEnabled(enable);
      this.isScreenSharing.set(enable);
    } catch (err: any) {
      // User cancelled the getDisplayMedia picker, or sharing failed.
      this.isScreenSharing.set(false);
      if (err?.name !== 'NotAllowedError') {
        this.callError.set(err?.message || 'Screen share failed');
      }
    }
  }

  /**
   * Start/stop server-side LiveKit composite recording. Only the caller
   * or an org admin may control it (backend enforces; 403 surfaced here).
   * Recording requires LiveKit egress to be configured (else 503).
   */
  async toggleRecording() {
    const active = this.activeCall();
    if (!active || this.recordingBusy()) return;
    this.recordingBusy.set(true);
    this.callError.set('');
    const url = `${BASE}/chat/rooms/${active.roomId}/calls/${active.callId}/recording`;
    try {
      if (this.isRecording()) {
        await firstValueFrom(this.http.delete(url));
        this.isRecording.set(false);
      } else {
        await firstValueFrom(this.http.post(url, { layout: 'speaker' }));
        this.isRecording.set(true);
      }
    } catch (err: any) {
      const status = err?.status;
      const msg = err?.error?.message
        || (status === 503 ? 'Recording requires a configured LiveKit server.'
          : status === 403 ? 'Only the call starter or an admin can record.'
          : 'Recording action failed.');
      this.callError.set(msg);
    } finally {
      this.recordingBusy.set(false);
    }
  }

  /** Fetch a signed download URL for a finished call's recording. */
  async getRecordingDownloadUrl(roomId: string, callId: string): Promise<string | null> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: any }>(
          `${BASE}/chat/rooms/${roomId}/calls/${callId}/recording/download`,
        ),
      );
      return res?.data?.url ?? null;
    } catch {
      return null;
    }
  }

  async hangUp() {
    for (const track of this.localTracks) track.stop();
    this.localTracks = [];
    if (this._remoteContainer) this._remoteContainer.innerHTML = '';
    this._localVideoEl = null;
    this._remoteContainer = null;
    await this.room?.disconnect();
    this.room = null;
    this.activeCall.set(null);
    this.participants.set([]);
    this.isMuted.set(false);
    this.isCamOff.set(false);
    this.isScreenSharing.set(false);
    this.isRecording.set(false);
    this.recordingBusy.set(false);
    this.myHandRaised.set(false);
    this.raisedHands.set([]);
    this.roster.set([]);
    this.inCallChat.set([]);
    this.unreadChat.set(0);
  }

  attachTrack(track: Track, element: HTMLVideoElement | HTMLAudioElement) {
    track.attach(element);
  }
}
