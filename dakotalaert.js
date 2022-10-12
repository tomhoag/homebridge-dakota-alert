const Gpio = require('onoff').Gpio;

module.exports = (homebridge) => {

    // Service and Characteristic are from hap-nodejs
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory('DakotaAlert', DakotaAlertAccessoryPlugin);
}

const gpio = {
  io: [],
  init: function (pin, callback) {
    this.io[pin] = new Gpio(pin, 'in', 'both', { debounceTimeout: 10 });
    this.io[pin].watch(callback);
  },
  read: function (pin) {
    return this.io[pin].readSync();
  }
};

class DakotaAlertAccessoryPlugin {

    constructor(log, config, api) {
        this.log = log;
        this.api = api;
        this.services = [];

        this.informationService = new this.api.hap.Service.AccessoryInformation()
            .setCharacteristic(this.api.hap.Characteristic.Manufacturer, "Dakota Alert")
            .setCharacteristic(this.api.hap.Characteristic.Model, "RE-4k Plus");
        this.services.push(this.informationService);

        if(config.alerts) {
            config.alerts.forEach(alert => {
                this.log('initing alert \'' + alert.label + '\' on RPi GPIO pin ' + alert.pin);
                const relay = new DakotaRelay(alert.label, alert.pin, this.log);
                this.services.push(relay.service);
            });
        } else {
            this.log("No alerts in homebridge-dakota-alert config!");
        }
    }

    /**
     * return an array of the exposed services -- required method
     */
    getServices() {
        return this.services;
    }

    identify(callback) {
        callback();
    }
}

/**
 * Class to encapsulate the service, gpio interface
 */
class DakotaRelay {

    /**
     * Constructor
     * @param name -- name of the service for this relay
     * @param pin -- RPi gpio pin connected to the receiver relay
     */
    constructor(name, pin) {
        this.name = name;
        this.pin = pin;

        this.INPUT_ACTIVE = Gpio.LOW;
        this.ON_STATE = 1;
        this.OFF_STATE = 0;
        this.postpone = 100; // delay used in the toggle fn

        this.pin = pin;
        gpio.init(this.pin, this.toggleState.bind(this));

        this.service = new Service.MotionSensor(name);
        this.service.subtype = name + pin;
        this.service.name = name;
        this.service.displayName = name;
        this.service.setCharacteristic('Name', name);
        this.motionCharacteristic = this.service.getCharacteristic(Characteristic.MotionDetected);
        this.motionCharacteristic
            .on('get', this.getState.bind(this));
    }

    async getState(callback) {
        const state = await gpio.read(this.pin);
        callback(null, state === this.INPUT_ACTIVE ? this.ON_STATE : this.OFF_STATE);
    }

    async toggleState() {
        if (this.postponeId == null) {
            this.postponeId = setTimeout(async function () {
                this.postponeId = null;
                const state = await gpio.read(this.pin);
                this.motionCharacteristic.updateValue(state === this.INPUT_ACTIVE ? this.ON_STATE : this.OFF_STATE);
            }.bind(this), this.postpone);
        }
    }
}