export type AudioOutputMode = "direct" | "audio_context";

export interface PeerAudioDiagnostics {
  outputMode: AudioOutputMode;
  audioContextState: AudioContextState | "none";
  audioContextBaseLatencyMs: number;
  audioContextOutputLatencyMs: number;
  audioSampleRate: number;
  audioCurrentTime: number;
  videoCurrentTime: number;
  videoAudioOffsetMs: number;
}

interface PeerMediaLifecycleDependencies {
  videoElement: HTMLVideoElement;
  audioElement: HTMLAudioElement;
  audioOutputMode?: AudioOutputMode;
  onRenderFrame: () => void;
  log: (message: string) => void;
}

const EMPTY_AUDIO_DIAGNOSTICS: PeerAudioDiagnostics = {
  outputMode: "direct",
  audioContextState: "none",
  audioContextBaseLatencyMs: 0,
  audioContextOutputLatencyMs: 0,
  audioSampleRate: 0,
  audioCurrentTime: 0,
  videoCurrentTime: 0,
  videoAudioOffsetMs: 0,
};

export class PeerMediaLifecycleController {
  private readonly videoStream = new MediaStream();
  private readonly audioStream = new MediaStream();
  private audioContext: AudioContext | null = null;
  private audioSourceNode: MediaStreamAudioSourceNode | null = null;
  private audioGainNode: GainNode | null = null;
  private outputVolume = 1;
  private audioOutputMode: AudioOutputMode = "direct";
  private visibilityChangeListener: (() => void) | null = null;

  constructor(private readonly dependencies: PeerMediaLifecycleDependencies) {
    this.audioOutputMode = dependencies.audioOutputMode ?? "direct";
    dependencies.videoElement.srcObject = this.videoStream;
    dependencies.audioElement.srcObject = this.audioStream;
    dependencies.audioElement.muted = true;
    dependencies.audioElement.volume = this.outputVolume;
  }

  getVideoTrack(): MediaStreamTrack | null {
    return this.videoStream.getVideoTracks()[0] ?? null;
  }

  getAudioDiagnostics(): PeerAudioDiagnostics {
    const audioElement = this.dependencies.audioElement;
    const videoElement = this.dependencies.videoElement;
    const audioCurrentTime = Number.isFinite(audioElement.currentTime) ? audioElement.currentTime : 0;
    const videoCurrentTime = Number.isFinite(videoElement.currentTime) ? videoElement.currentTime : 0;
    const videoAudioOffsetMs = audioCurrentTime > 0 || videoCurrentTime > 0
      ? (videoCurrentTime - audioCurrentTime) * 1000
      : 0;

    return {
      outputMode: this.audioOutputMode,
      audioContextState: this.audioContext?.state ?? "none",
      audioContextBaseLatencyMs: this.audioContext
        ? this.audioContext.baseLatency * 1000
        : 0,
      audioContextOutputLatencyMs: this.audioContext && "outputLatency" in this.audioContext
        ? Number((this.audioContext as AudioContext & { outputLatency?: number }).outputLatency ?? 0) * 1000
        : 0,
      audioSampleRate: this.audioContext?.sampleRate ?? 0,
      audioCurrentTime,
      videoCurrentTime,
      videoAudioOffsetMs,
    };
  }

  setAudioOutputMode(mode: AudioOutputMode): void {
    if (this.audioOutputMode === mode) {
      return;
    }

    this.audioOutputMode = mode;
    if (this.audioStream.getAudioTracks().length > 0) {
      this.startAudioOutput("Audio output mode changed");
    }
  }

  attachTrack(track: MediaStreamTrack): void {
    if (track.kind === "video") {
      this.replaceTrackInStream(this.videoStream, track);
      const video = this.dependencies.videoElement;
      const frameCallback = () => {
        this.dependencies.onRenderFrame();
        if (this.videoStream.active) {
          video.requestVideoFrameCallback(frameCallback);
        }
      };
      video.requestVideoFrameCallback(frameCallback);

      this.dependencies.log(
        `Video element before play: paused=${video.paused}, readyState=${video.readyState}, size=${video.videoWidth}x${video.videoHeight}`,
      );
      video
        .play()
        .then(() => {
          this.dependencies.log("Video element playback started");
        })
        .catch((playError) => {
          this.dependencies.log(`Video play() failed: ${String(playError)}`);
        });
      window.setTimeout(() => {
        this.dependencies.log(
          `Video element post-play: paused=${video.paused}, readyState=${video.readyState}, size=${video.videoWidth}x${video.videoHeight}`,
        );
      }, 1500);

      track.onunmute = () => {
        this.dependencies.log("Video track unmuted");
      };
      track.onmute = () => {
        this.dependencies.log("Warning: video track muted by sender");
      };
      track.onended = () => {
        this.dependencies.log("Warning: video track ended");
      };
      this.dependencies.log("Video track attached");
      return;
    }

    if (track.kind === "audio") {
      this.replaceTrackInStream(this.audioStream, track);
      this.startAudioOutput("Audio track attached");
    }
  }

  setOutputVolume(volume: number): void {
    this.outputVolume = Math.max(
      0,
      Math.min(1, Number.isFinite(volume) ? volume : 1),
    );
    this.dependencies.audioElement.volume = this.outputVolume;
    if (this.audioGainNode) {
      this.audioGainNode.gain.value = this.outputVolume;
    }
  }

  reset(): void {
    this.cleanupAudioRouting();
    this.clearTracks();
  }

  cleanupAudio(): void {
    this.cleanupAudioRouting();
  }

  clearTracks(): void {
    for (const track of this.videoStream.getTracks()) {
      this.videoStream.removeTrack(track);
    }
    for (const track of this.audioStream.getTracks()) {
      this.audioStream.removeTrack(track);
    }
  }

  private replaceTrackInStream(
    stream: MediaStream,
    track: MediaStreamTrack,
  ): void {
    const existingTracks = track.kind === "video"
      ? stream.getVideoTracks()
      : stream.getAudioTracks();
    for (const existingTrack of existingTracks) {
      stream.removeTrack(existingTrack);
    }
    stream.addTrack(track);
  }

  private startAudioOutput(reason: string): void {
    this.cleanupAudioRouting();

    if (this.audioOutputMode === "direct") {
      this.startDirectAudioPlayback(reason);
      return;
    }

    this.startAudioContextPlayback(reason);
  }

  private startAudioContextPlayback(reason: string): void {
    let audioContext: AudioContext | null = null;
    let audioSourceNode: MediaStreamAudioSourceNode | null = null;
    let audioGainNode: GainNode | null = null;
    try {
      audioContext = new AudioContext({
        latencyHint: "interactive",
        sampleRate: 48000,
      });
      audioSourceNode = audioContext.createMediaStreamSource(this.audioStream);
      audioGainNode = audioContext.createGain();
      audioGainNode.gain.value = this.outputVolume;
      audioSourceNode.connect(audioGainNode);
      audioGainNode.connect(audioContext.destination);
      if (audioContext.state === "suspended") {
        void audioContext.resume();
      }

      this.visibilityChangeListener = () => {
        if (document.visibilityState === "visible" && audioContext?.state === "suspended") {
          void audioContext.resume();
        }
      };
      document.addEventListener("visibilitychange", this.visibilityChangeListener);

      this.audioContext = audioContext;
      this.audioSourceNode = audioSourceNode;
      this.audioGainNode = audioGainNode;
      this.dependencies.log(
        `${reason}; audio routed through AudioContext (latency: ${(audioContext.baseLatency * 1000).toFixed(1)}ms, sampleRate: ${audioContext.sampleRate}Hz)`,
      );
    } catch (error) {
      if (audioSourceNode) {
        try {
          audioSourceNode.disconnect();
        } catch {
          // Ignore cleanup errors from a partially-created node.
        }
      }
      if (audioGainNode) {
        try {
          audioGainNode.disconnect();
        } catch {
          // Ignore cleanup errors from a partially-created node.
        }
      }
      if (audioContext) {
        void audioContext.close().catch(() => {});
      }
      this.audioOutputMode = "direct";
      this.startDirectAudioPlayback(
        `AudioContext creation failed, falling back to direct audio: ${String(error)}`,
      );
    }
  }

  private cleanupAudioRouting(): void {
    if (this.audioSourceNode) {
      try {
        this.audioSourceNode.disconnect();
      } catch {
        // Ignore cleanup errors from an already-disconnected node.
      }
      this.audioSourceNode = null;
    }
    if (this.audioGainNode) {
      try {
        this.audioGainNode.disconnect();
      } catch {
        // Ignore cleanup errors from an already-disconnected node.
      }
      this.audioGainNode = null;
    }
    if (this.audioContext) {
      void this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    if (this.visibilityChangeListener) {
      document.removeEventListener("visibilitychange", this.visibilityChangeListener);
      this.visibilityChangeListener = null;
    }
    this.dependencies.audioElement.pause();
    this.dependencies.audioElement.muted = true;
  }

  private startDirectAudioPlayback(reason: string): void {
    const audioElement = this.dependencies.audioElement;
    audioElement.muted = false;
    audioElement.volume = this.outputVolume;
    audioElement.play()
      .then(() => {
        this.dependencies.log(`${reason}; direct audio element playback started`);
      })
      .catch((playError) => {
        this.dependencies.log(`Direct audio autoplay blocked: ${String(playError)}`);
        if (this.audioOutputMode === "direct") {
          this.audioOutputMode = "audio_context";
          this.startAudioContextPlayback("Direct audio playback failed");
        }
      });
  }
}

export function emptyPeerAudioDiagnostics(): PeerAudioDiagnostics {
  return { ...EMPTY_AUDIO_DIAGNOSTICS };
}
