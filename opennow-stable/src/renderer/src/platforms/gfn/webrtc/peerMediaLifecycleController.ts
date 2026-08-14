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

export interface PeerFramePacingDiagnostics {
  /** How late the most recent frame callback arrived after its expected display time. */
  frameAgeMs: number;
  /** Rolling standard deviation of callback-to-callback frame intervals, in ms. */
  framePacingVarianceMs: number;
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
  private frameAgeMs = 0;
  private framePacingVarianceMs = 0;
  private lastFrameCallbackMs: number | null = null;
  private readonly frameIntervalsMs = new Float64Array(120);
  private frameIntervalIndex = 0;
  private frameIntervalCount = 0;
  private frameIntervalSumMs = 0;
  private frameIntervalSumSquaresMs = 0;

  constructor(private readonly dependencies: PeerMediaLifecycleDependencies) {
    this.audioOutputMode = dependencies.audioOutputMode ?? "direct";
    dependencies.videoElement.srcObject = this.videoStream;
    dependencies.audioElement.srcObject = this.audioStream;
    // Direct mode must use the video element's shared MediaStream clock. Keeping
    // audio on a second HTMLMediaElement lets Chromium advance the audio clock
    // independently, which is exactly the "audio ahead of slow video" symptom.
    // Start muted while the video-only track is attaching; direct mode unmutes
    // this same element when the audio track arrives.
    dependencies.videoElement.muted = true;
    dependencies.videoElement.volume = this.outputVolume;
    dependencies.audioElement.muted = true;
    dependencies.audioElement.volume = this.outputVolume;
  }

  getVideoTrack(): MediaStreamTrack | null {
    return this.videoStream.getVideoTracks()[0] ?? null;
  }

  getFramePacingDiagnostics(): PeerFramePacingDiagnostics {
    return {
      frameAgeMs: this.frameAgeMs,
      framePacingVarianceMs: this.framePacingVarianceMs,
    };
  }

  getAudioDiagnostics(): PeerAudioDiagnostics {
    const audioElement = this.dependencies.audioElement;
    const videoElement = this.dependencies.videoElement;
    const videoCurrentTime = Number.isFinite(videoElement.currentTime) ? videoElement.currentTime : 0;
    const audioCurrentTime = this.audioOutputMode === "direct"
      ? videoCurrentTime
      : (Number.isFinite(audioElement.currentTime) ? audioElement.currentTime : 0);
    const videoAudioOffsetMs = this.audioOutputMode === "direct"
      ? 0
      : (audioCurrentTime > 0 || videoCurrentTime > 0
        ? (videoCurrentTime - audioCurrentTime) * 1000
        : 0);

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
      this.resetFramePacingDiagnostics();
      const video = this.dependencies.videoElement;
      const frameCallback = (
        callbackNow: number,
        metadata: VideoFrameCallbackMetadata,
      ) => {
        const expectedDisplayTime = Number(metadata.expectedDisplayTime);
        const presentationTime = Number(metadata.presentationTime);
        const displayTime = Number.isFinite(expectedDisplayTime)
          ? expectedDisplayTime
          : presentationTime;
        if (Number.isFinite(displayTime)) {
          this.frameAgeMs = Math.max(0, Math.min(1000, callbackNow - displayTime));
        }

        if (this.lastFrameCallbackMs !== null) {
          const intervalMs = callbackNow - this.lastFrameCallbackMs;
          if (intervalMs > 0 && intervalMs <= 1000) {
            const oldIntervalMs = this.frameIntervalsMs[this.frameIntervalIndex];
            if (this.frameIntervalCount === this.frameIntervalsMs.length) {
              this.frameIntervalSumMs -= oldIntervalMs;
              this.frameIntervalSumSquaresMs -= oldIntervalMs * oldIntervalMs;
            } else {
              this.frameIntervalCount += 1;
            }
            this.frameIntervalsMs[this.frameIntervalIndex] = intervalMs;
            this.frameIntervalSumMs += intervalMs;
            this.frameIntervalSumSquaresMs += intervalMs * intervalMs;
            this.frameIntervalIndex = (this.frameIntervalIndex + 1) % this.frameIntervalsMs.length;
            const meanMs = this.frameIntervalSumMs / this.frameIntervalCount;
            const varianceMs = Math.max(
              0,
              this.frameIntervalSumSquaresMs / this.frameIntervalCount - meanMs * meanMs,
            );
            this.framePacingVarianceMs = Math.sqrt(varianceMs);
          }
        }
        this.lastFrameCallbackMs = callbackNow;

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
          if (this.audioOutputMode === "direct" && this.audioStream.getAudioTracks().length > 0) {
            this.startDirectAudioPlayback("Video track attached");
          }
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
    this.dependencies.videoElement.volume = this.outputVolume;
    if (this.audioGainNode) {
      this.audioGainNode.gain.value = this.outputVolume;
    }
  }

  reset(): void {
    this.cleanupAudioRouting();
    this.clearTracks();
    this.resetFramePacingDiagnostics();
  }

  cleanupAudio(): void {
    this.cleanupAudioRouting();
  }

  clearTracks(): void {
    this.resetFramePacingDiagnostics();
    for (const track of this.videoStream.getTracks()) {
      this.videoStream.removeTrack(track);
    }
    for (const track of this.audioStream.getTracks()) {
      this.audioStream.removeTrack(track);
    }
  }

  private resetFramePacingDiagnostics(): void {
    this.frameAgeMs = 0;
    this.framePacingVarianceMs = 0;
    this.lastFrameCallbackMs = null;
    this.frameIntervalIndex = 0;
    this.frameIntervalCount = 0;
    this.frameIntervalSumMs = 0;
    this.frameIntervalSumSquaresMs = 0;
    this.frameIntervalsMs.fill(0);
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
    this.dependencies.videoElement.muted = true;
  }

  private startDirectAudioPlayback(reason: string): void {
    const videoElement = this.dependencies.videoElement;
    const audioElement = this.dependencies.audioElement;
    if (this.getVideoTrack() === null) {
      this.dependencies.log(`${reason}; waiting for the video track before enabling shared audio`);
      return;
    }
    // Keep the auxiliary audio element available for recording, but do not use
    // it as a second playback clock in direct mode. The video element already
    // owns the same MediaStream and therefore keeps RTP audio/video aligned.
    audioElement.pause();
    audioElement.muted = true;
    videoElement.muted = false;
    videoElement.volume = this.outputVolume;

    if (!videoElement.paused) {
      this.dependencies.log(`${reason}; direct audio uses the shared video media clock`);
      return;
    }

    videoElement.play()
      .then(() => {
        this.dependencies.log(`${reason}; shared video/audio playback started`);
      })
      .catch((playError) => {
        this.dependencies.log(`Shared video/audio autoplay blocked: ${String(playError)}`);
        if (this.audioOutputMode === "direct") {
          this.audioOutputMode = "audio_context";
          this.startAudioContextPlayback("Shared media playback failed");
        }
      });
  }
}

export function emptyPeerAudioDiagnostics(): PeerAudioDiagnostics {
  return { ...EMPTY_AUDIO_DIAGNOSTICS };
}
