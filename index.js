'use strict';
const path = require('path');
const fs = require('fs');
const LgWebOsDevice = require('./src/lgwebosdevice.js');
const CONSTANTS = require('./src/constants.json');

class LgWebOsPlatform {
	constructor(log, config, api) {
		// only load if configured
		if (!config || !Array.isArray(config.devices)) {
			log.warn(`No configuration found for ${CONSTANTS.PluginName}`);
			return;
		};
		this.accessories = [];

		//check if prefs directory exist
		const prefDir = path.join(api.user.storagePath(), 'lgwebosTv');
		if (!fs.existsSync(prefDir)) {
			fs.mkdirSync(prefDir);
		};

		api.on('didFinishLaunching', () => {
			for (const device of config.devices) {
				const deviceName = device.name;
				const host = device.host;
				const mac = device.mac

				const macRegex = /^([A-Fa-f0-9]{2}:){5}[A-Fa-f0-9]{2}$/;
				if (!deviceName || !host || !macRegex.test(mac)) {
					log.warn(`Name: ${deviceName ? 'OK' : deviceName}, host: ${host ? 'OK' : host}, mac: ${macRegex.test(mac) ? 'OK' : mac}, in config wrong or missing.`);
					return;
				}

				//debug config
				const enableDebugMode = device.enableDebugMode || false;
				const debug = enableDebugMode ? log(`Device: ${host} ${deviceName}, did finish launching.`) : false;
				const debug1 = enableDebugMode ? log(`Device: ${host} ${deviceName}, Config: ${JSON.stringify(device, null, 2)}`) : false;

				//webos device
				const lgWebOsDevice = new LgWebOsDevice(api, prefDir, device);
				lgWebOsDevice.on('publishAccessory', (accessory) => {
					api.publishExternalAccessories(CONSTANTS.PluginName, [accessory]);
					const debug = enableDebugMode ? log(`Device: ${host} ${deviceName}, published as external accessory.`) : false;
				})
					.on('devInfo', (devInfo) => {
						log(devInfo);
					})
					.on('message', (message) => {
						log(`Device: ${host} ${deviceName}, ${message}`);
					})
					.on('debug', (debug) => {
						log(`Device: ${host} ${deviceName}, debug: ${debug}`);
					})
					.on('error', (error) => {
						log.error(`Device: ${host} ${deviceName}, ${error}`);
					});
			}
		});
	}

	configureAccessory(accessory) {
		this.accessories.push(accessory);
	}
}

module.exports = (api) => {
	api.registerPlatform(CONSTANTS.PluginName, CONSTANTS.PlatformName, LgWebOsPlatform, true);
};
