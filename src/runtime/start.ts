import { bootstrap } from "./bootstrap.js";
import type { RuntimeContainer } from "./bootstrap.js";

export async function start(): Promise<never> {
  console.log("[runtime] bootstrapping");

  let container: RuntimeContainer;
  try {
    container = bootstrap();
  } catch (err) {
    console.error("[runtime] startup failed", err);
    throw err;
  }

  console.log("[runtime] storage ready");
  console.log("[runtime] services ready");

  registerShutdown(container);

  console.log("[runtime] startup complete");

  return new Promise<never>(() => undefined);
}

function registerShutdown(container: RuntimeContainer): void {
  let isShuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`[runtime] shutdown started (${signal})`);

    try {
      await container.services.shutdown();
      await container.storage.client.end();
    } catch {
      // Best-effort
    }

    console.log("[runtime] shutdown complete");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}