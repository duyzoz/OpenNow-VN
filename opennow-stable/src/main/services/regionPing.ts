import * as net from "node:net";
import type { PingResult, StreamRegion } from "@shared/gfn";

const PING_TIMEOUT_MS = 1800;
const PING_SAMPLE_COUNT = 3;
const PING_SAMPLE_GAP_MS = 40;

export async function tcpPing(
  hostname: string,
  port: number,
  timeoutMs: number = PING_TIMEOUT_MS,
): Promise<number | null> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = new net.Socket();

    socket.setTimeout(timeoutMs);

    socket.once("connect", () => {
      const pingMs = Date.now() - startTime;
      socket.destroy();
      resolve(pingMs);
    });

    socket.once("timeout", () => {
      socket.destroy();
      resolve(null);
    });

    socket.once("error", () => {
      socket.destroy();
      resolve(null);
    });

    socket.connect(port, hostname);
  });
}

export async function pingRegions(regions: StreamRegion[]): Promise<PingResult[]> {
  const pingPromises = regions.map(async (region) => {
    try {
      const url = new URL(region.url);
      const hostname = url.hostname;
      const port = url.protocol === "https:" ? 443 : 80;

      const validPings: number[] = [];

      // Measure three real TCP connection samples without a discarded warm-up.
      // All regions are already measured in parallel by Promise.all below; keeping
      // samples sequential per region avoids opening competing sockets to one host.
      for (let i = 0; i < PING_SAMPLE_COUNT; i++) {
        if (i > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, PING_SAMPLE_GAP_MS));
        }
        const pingMs = await tcpPing(hostname, port, PING_TIMEOUT_MS);
        if (pingMs !== null) validPings.push(pingMs);
      }

      // The median is more stable than an average when one sample is delayed by
      // DNS/OS scheduling or a transient network spike.
      if (validPings.length > 0) {
        const orderedPings = [...validPings].sort((a, b) => a - b);
        const middle = Math.floor(orderedPings.length / 2);
        const medianPing = orderedPings.length % 2 === 1
          ? orderedPings[middle]
          : Math.round((orderedPings[middle - 1] + orderedPings[middle]) / 2);
        return { url: region.url, pingMs: medianPing };
      } else {
        return {
          url: region.url,
          pingMs: null,
          error: "All ping tests failed",
        };
      }
    } catch {
      return {
        url: region.url,
        pingMs: null,
        error: "Invalid URL",
      };
    }
  });

  return Promise.all(pingPromises);
}
