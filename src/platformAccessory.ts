import { PlatformAccessory, Service } from 'homebridge';
import { GpioInput, LOW } from './gpio';
import { DakotaAlertPlatform } from './platform';

const TOGGLE_DELAY = 100;

export class DakotaAlertMotionSensor {

  private readonly service: Service;
  private gpio?: GpioInput;
  private postponeId: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly platform: DakotaAlertPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    const alert = this.accessory.context.alert;

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Dakota Alert')
      .setCharacteristic(this.platform.Characteristic.Model, 'RE-4k Plus')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, `GPIO-${alert.pin}`);

    this.service = this.accessory.getService(this.platform.Service.MotionSensor)
      || this.accessory.addService(this.platform.Service.MotionSensor, alert.label);

    this.service.setCharacteristic(this.platform.Characteristic.Name, alert.label);

    this.service.getCharacteristic(this.platform.Characteristic.MotionDetected)
      .onGet(() => this.getMotionDetected());

    this.initGpio(alert.pin, alert.label);
  }

  private async initGpio(pin: number, label: string) {
    try {
      this.gpio = await GpioInput.create(pin, () => this.onGpioChange());
      this.platform.log.info('Initialized motion sensor "%s" on GPIO pin %d', label, pin);
    } catch (e) {
      this.platform.log.error('Failed to initialize GPIO pin %d for "%s": %s', pin, label, e);
    }
  }

  private getMotionDetected(): boolean {
    if (!this.gpio) {
      return false;
    }
    return this.gpio.readSync() === LOW;
  }

  private onGpioChange() {
    if (this.postponeId === null) {
      this.postponeId = setTimeout(() => {
        this.postponeId = null;
        const detected = this.getMotionDetected();
        this.service.updateCharacteristic(
          this.platform.Characteristic.MotionDetected,
          detected,
        );
        this.platform.log.debug('Motion %s on "%s"',
          detected ? 'detected' : 'cleared',
          this.accessory.context.alert.label,
        );
      }, TOGGLE_DELAY);
    }
  }
}
