import { spawn, type ChildProcess } from 'child_process';

const DISPLAY = process.env.DISPLAY ?? ':99';

export class VideoStreamer {
  private ffmpegProc: ChildProcess | null = null;
  private xvfbProc: ChildProcess | null = null;
  private browserProc: ChildProcess | null = null;
  private stopped = false;
  private restartDelay = 5_000;
  private readonly maxRestartDelay = 300_000;

  constructor(
    private readonly streamKey: string,
    private readonly gameClientUrl?: string,
  ) {}

  async start(): Promise<void> {
    this.stopped = false;
    // Xvfb and game browser are managed by start.sh — just capture the display with ffmpeg
    this.spawnFFmpeg();
  }

  private startXvfb(): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('Xvfb', [DISPLAY, '-screen', '0', '1280x720x24', '-nolisten', 'tcp'], {
        stdio: 'ignore',
      });
      this.xvfbProc = proc;

      proc.on('error', reject);
      // Give Xvfb 1s to boot
      setTimeout(resolve, 1000);

      proc.on('close', (code) => {
        if (!this.stopped) console.error(`[video] Xvfb exited (code ${code})`);
      });
    });
  }

  private startBrowser(): Promise<void> {
    if (!this.gameClientUrl) {
      console.log('[video] No game URL set, skipping browser launch');
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const args = [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--use-gl=swiftshader',
        '--kiosk',
        '--window-size=1280,720',
        '--window-position=0,0',
        this.gameClientUrl!,
      ];

      // Try chromium, fall back to google-chrome
      const browser = this.findBrowser();
      const proc = spawn(browser, args, {
        stdio: 'ignore',
        env: { ...process.env, DISPLAY },
      });
      this.browserProc = proc;

      proc.on('error', (err) => console.error('[video] Browser error:', err.message));
      proc.on('close', (code) => {
        if (!this.stopped) {
          console.error(`[video] Browser exited (code ${code}), restarting in 5s...`);
          setTimeout(() => this.startBrowser().catch((e: Error) => console.error('[video] Browser restart error:', e.message)), 5000);
        }
      });

      // Give browser time to render
      setTimeout(resolve, 4000);
    });
  }

  private findBrowser(): string {
    // Try in order
    for (const b of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']) {
      try {
        const result = Bun.spawnSync(['which', b]);
        if (result.exitCode === 0) return b;
      } catch {}
    }
    return 'chromium';
  }

  private buildFFmpegArgs(): string[] {
    const isLinux = process.platform === 'linux';

    const videoInput = isLinux
      ? ['-f', 'x11grab', '-r', '30', '-s', '1920x1080', '-i', `${DISPLAY}.0`]
      : ['-f', 'avfoundation', '-framerate', '30', '-video_size', '1920x1080', '-i', '1:none'];

    return [
      ...videoInput,
      '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
      '-vcodec', 'libx264',
      '-preset', 'veryfast',
      '-b:v', '6000k',
      '-maxrate', '6000k',
      '-bufsize', '12000k',
      '-pix_fmt', 'yuv420p',
      '-g', '60',
      '-acodec', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-map', '0:v', '-map', '1:a',
      '-f', 'flv',
      `rtmp://live.twitch.tv/live/${this.streamKey}`,
    ];
  }

  private spawnFFmpeg(): void {
    if (this.stopped) return;

    const args = this.buildFFmpegArgs();
    const proc = spawn('ffmpeg', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, DISPLAY },
    });
    this.ffmpegProc = proc;

    proc.on('spawn', () => {
      this.restartDelay = 5_000;
      console.log('[video] ffmpeg started');
    });

    proc.stderr?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      // Only log non-stats lines
      if (!line.includes('fps=') && !line.includes('kbits/s') && line.length > 0) {
        console.log('[video]', line.slice(-200));
      }
    });

    proc.on('close', (code) => {
      if (this.stopped) return;
      console.log(`[video] ffmpeg exited (code ${code}), restarting in ${this.restartDelay}ms`);
      setTimeout(() => {
        this.restartDelay = Math.min(this.restartDelay * 2, this.maxRestartDelay);
        this.spawnFFmpeg();
      }, this.restartDelay);
    });

    proc.on('error', (err) => {
      console.error('[video] ffmpeg error:', err.message);
    });
  }

  stop(): void {
    this.stopped = true;
    this.ffmpegProc?.kill('SIGTERM');
    this.browserProc?.kill('SIGTERM');
    this.xvfbProc?.kill('SIGTERM');
    this.ffmpegProc = null;
    this.browserProc = null;
    this.xvfbProc = null;
  }
}
