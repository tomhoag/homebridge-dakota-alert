import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { DakotaAlertMotionSensor } from './platformAccessory';

interface AlertConfig {
  label: string;
  pin: number;
}

export class DakotaAlertPlatform implements DynamicPlatformPlugin {

  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  public readonly accessories: PlatformAccessory[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    this.log.debug('Finished initializing platform:', this.config.name);

    this.api.on('didFinishLaunching', () => {
      this.discoverDevices();
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.push(accessory);
  }

  discoverDevices() {
    const alerts: AlertConfig[] = this.config.alerts || [];

    if (alerts.length === 0) {
      this.log.warn('No alerts configured in homebridge-dakota-alert config!');
      return;
    }

    // Track which cached accessories are still configured
    const configuredUUIDs = new Set<string>();

    for (const alert of alerts) {
      const uuid = this.api.hap.uuid.generate(`${PLUGIN_NAME}-${alert.label}-${alert.pin}`);
      configuredUUIDs.add(uuid);

      const existingAccessory = this.accessories.find(acc => acc.UUID === uuid);

      if (existingAccessory) {
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
        existingAccessory.context.alert = alert;
        new DakotaAlertMotionSensor(this, existingAccessory);
      } else {
        this.log.info('Adding new accessory:', alert.label, 'on GPIO pin', alert.pin);
        const accessory = new this.api.platformAccessory(alert.label, uuid);
        accessory.context.alert = alert;
        new DakotaAlertMotionSensor(this, accessory);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }

    // Remove cached accessories that are no longer configured
    for (const accessory of this.accessories) {
      if (!configuredUUIDs.has(accessory.UUID)) {
        this.log.info('Removing unconfigured accessory:', accessory.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }
}
