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
		try {
			fs.mkdirSync(prefDir, { recursive: true });
		} catch (error) {
			log.error(`Prepare directory error: ${error.message ?? error}`);
			return;
		}

		api.on('didFinishLaunching', async () => {
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

				//check files exists, if not then create it
				const postFix = host.split('.').join('');
				const keyFile = `${prefDir}/key_${postFix}`;
				const devInfoFile = `${prefDir}/devInfo_${postFix}`;
				const inputsFile = `${prefDir}/inputs_${postFix}`;
				const channelsFile = `${prefDir}/channels_${postFix}`;
				const inputsNamesFile = `${prefDir}/inputsNames_${postFix}`;
				const inputsTargetVisibilityFile = `${prefDir}/inputsTargetVisibility_${postFix}`;

				try {
					const files = [
						keyFile,
						devInfoFile,
						inputsFile,
						channelsFile,
						inputsNamesFile,
						inputsTargetVisibilityFile
					];

					files.forEach((file) => {
						if (!fs.existsSync(file)) {
							fs.writeFileSync(file, '');
						}
					});
				} catch (error) {
					log.error(`Device: ${host} ${deviceName}, prepare files error: ${error}`);
					return;
				}

				//webos device
				try {
					this.lgWebOsDevice = new LgWebOsDevice(api, device, keyFile, devInfoFile, inputsFile, channelsFile, inputsNamesFile, inputsTargetVisibilityFile);
					this.lgWebOsDevice.on('publishAccessory', (accessory) => {
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

					await this.lgWebOsDevice.start();
				} catch (error) {
					log.error(`Device: ${host} ${deviceName}, did finish launching error: ${error}`);
				}
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
