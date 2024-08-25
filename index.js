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
				const debug = enableDebugMode ? log.info(`Device: ${host} ${deviceName}, did finish launching.`) : false;
				const config = {
					...device,
					mqtt: {
						...device.mqtt,
						passwd: 'removed'
					}
				};
				const debug1 = enableDebugMode ? log.info(`Device: ${host} ${deviceName}, Config: ${JSON.stringify(config, null, 2)}`) : false;

				//define directory and file paths
				const prefDir = path.join(api.user.storagePath(), 'lgwebosTv');
				const postFix = host.split('.').join('');
				const keyFile = `${prefDir}/key_${postFix}`;
				const devInfoFile = `${prefDir}/devInfo_${postFix}`;
				const inputsFile = `${prefDir}/inputs_${postFix}`;
				const channelsFile = `${prefDir}/channels_${postFix}`;
				const inputsNamesFile = `${prefDir}/inputsNames_${postFix}`;
				const inputsTargetVisibilityFile = `${prefDir}/inputsTargetVisibility_${postFix}`;
				const files = [keyFile, devInfoFile, inputsFile, channelsFile, inputsNamesFile, inputsTargetVisibilityFile];

				try {
					//create directory if it doesn't exist
					fs.mkdirSync(prefDir, { recursive: true });

					//create files if they don't exist
					files.forEach((file) => {
						if (!fs.existsSync(file)) {
							fs.writeFileSync(file, '');
						}
					});
				} catch (error) {
					this.emit('error', `prepare files error: ${error}`);
					return;
				}

				//webos device
				const lgWebOsDevice = new LgWebOsDevice(api, device, keyFile, devInfoFile, inputsFile, channelsFile, inputsNamesFile, inputsTargetVisibilityFile);
				lgWebOsDevice.on('publishAccessory', (accessory) => {
					api.publishExternalAccessories(CONSTANTS.PluginName, [accessory]);
					log.success(`Device: ${host} ${deviceName}, published as external accessory.`);
				})
					.on('devInfo', (devInfo) => {
						log.info(devInfo);
					})
					.on('success', (message) => {
						log.success(`Device: ${host} ${deviceName}, ${message}`);
					})
					.on('message', (message) => {
						log.info(`Device: ${host} ${deviceName}, ${message}`);
					})
					.on('debug', (debug) => {
						log.info(`Device: ${host} ${deviceName}, debug: ${debug}`);
					})
					.on('warn', (warn) => {
						log.warn(`Device: ${host} ${deviceName}, ${warn}`);
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
