import { readFileSync, writeFileSync, existsSync, accessSync, constants } from 'fs';
import { join } from 'path';

const GPIO_BASE = '/sys/class/gpio';

export const LOW = 0;
export const HIGH = 1;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForAccess(path: string, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      accessSync(path, constants.R_OK | constants.W_OK);
      return;
    } catch {
      await sleep(50);
    }
  }
  throw new Error(`Timed out waiting for write access to ${path}`);
}

export class GpioInput {

  private readonly valuePath: string;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private lastValue = 0;

  private constructor(
    private readonly pin: number,
    valuePath: string,
  ) {
    this.valuePath = valuePath;
  }

  static async create(pin: number, onChange: () => void, pollMs = 50): Promise<GpioInput> {
    const pinPath = join(GPIO_BASE, `gpio${pin}`);

    // Export the pin if not already exported
    if (!existsSync(pinPath)) {
      writeFileSync(join(GPIO_BASE, 'export'), String(pin));
    }

    // Wait for udev to set group permissions
    const directionPath = join(pinPath, 'direction');
    await waitForAccess(directionPath);

    // Set direction to input
    writeFileSync(directionPath, 'in');

    const valuePath = join(pinPath, 'value');
    await waitForAccess(valuePath);

    const gpio = new GpioInput(pin, valuePath);
    gpio.lastValue = gpio.readSync();

    // Poll for changes — sysfs watch is unreliable for GPIO value files
    gpio.pollInterval = setInterval(() => {
      const current = gpio.readSync();
      if (current !== gpio.lastValue) {
        gpio.lastValue = current;
        onChange();
      }
    }, pollMs);

    return gpio;
  }

  readSync(): number {
    return parseInt(readFileSync(this.valuePath, 'utf8').trim(), 10);
  }

  destroy() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    try {
      writeFileSync(join(GPIO_BASE, 'unexport'), String(this.pin));
    } catch {
      // pin may already be unexported
    }
  }
}
