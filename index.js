import { join } from 'path';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import LgWebOsDevice from './src/lgwebosdevice.js';
import ImpulseGenerator from './src/impulsegenerator.js';
import { PluginName, PlatformName } from './src/constants.js';

class LgWebOsPlatform {
	constructor(log, config, api) {
		// only load if configured
		if (!config || !Array.isArray(config.devices)) {
			log.warn(`No configuration found for ${PluginName}.`);
			return;
		};
		this.accessories = [];

		//check if prefs directory exist
		const prefDir = join(api.user.storagePath(), 'lgwebosTv');
		try {
			mkdirSync(prefDir, { recursive: true });
		} catch (error) {
			log.error(`Prepare directory error: ${error}.`);
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

				//log config
				const enableDebugMode = device.enableDebugMode || false;
				const disableLogDeviceInfo = device.disableLogDeviceInfo || false;
				const disableLogInfo = device.disableLogInfo || false;
				const disableLogSuccess = device.disableLogSuccess || false;
				const disableLogWarn = device.disableLogWarn || false;
				const disableLogError = device.disableLogError || false;
				const debug = !enableDebugMode ? false : log.info(`Device: ${host} ${deviceName}, did finish launching.`);
				const config = {
					...device,
					mqtt: {
						...device.mqtt,
						passwd: 'removed'
					}
				};
				const debug1 = !enableDebugMode ? false : log.info(`Device: ${host} ${deviceName}, Config: ${JSON.stringify(config, null, 2)}.`);

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
						if (!existsSync(file)) {
							writeFileSync(file, '');
						}
					});
				} catch (error) {
					const emitLog = disableLogError ? false : log.error(`Device: ${host} ${deviceName}, Prepare files error: ${error}.`);
					return;
				}

				//webos device
				try {
					const lgWebOsDevice = new LgWebOsDevice(api, device, keyFile, devInfoFile, inputsFile, channelsFile, inputsNamesFile, inputsTargetVisibilityFile);
					lgWebOsDevice.on('publishAccessory', (accessory) => {
						api.publishExternalAccessories(PluginName, [accessory]);
						const emitLog = disableLogSuccess ? false : log.success(`Device: ${host} ${deviceName}, Published as external accessory.`);
					})
						.on('devInfo', (devInfo) => {
							const emitLog = disableLogDeviceInfo ? false : log.info(devInfo);
						})
						.on('success', (success) => {
							const emitLog = disableLogSuccess ? false : log.success(`Device: ${host} ${deviceName}, ${success}.`);
						})
						.on('info', (info) => {
							const emitLog = disableLogInfo ? false : log.info(`Device: ${host} ${deviceName}, ${info}.`);
						})
						.on('debug', (debug) => {
							const emitLog = !enableDebugMode ? false : log.info(`Device: ${host} ${deviceName}, debug: ${debug}.`);
						})
						.on('warn', (warn) => {
							const lemitLog = disableLogWarn ? false : log.warn(`Device: ${host} ${deviceName}, ${warn}.`);
						})
						.on('error', (error) => {
							const emitLog = disableLogError ? false : log.error(`Device: ${host} ${deviceName}, ${error}.`);
						});

					//create impulse generator
					const impulseGenerator = new ImpulseGenerator();
					impulseGenerator.on('start', async () => {
						try {
							const startDone = await lgWebOsDevice.start();
							const stopImpulseGenerator = startDone ? await impulseGenerator.stop() : false;

							//start device impulse generator 
							const startImpulseGenerator = startDone ? await lgWebOsDevice.startImpulseGenerator() : false;
						} catch (error) {
							const emitLog = disableLogError ? false : log.error(`Device: ${host} ${deviceName}, ${error}, trying again.`);
						};
					}).on('state', (state) => {
						const emitLog = !enableDebugMode ? false : state ? log.info(`Device: ${host} ${deviceName}, Start impulse generator started.`) : log.info(`Device: ${host} ${deviceName}, Start impulse generator stopped.`);
					});

					//start impulse generator
					await impulseGenerator.start([{ name: 'start', sampling: 45000 }]);
				} catch (error) {
					throw new Error(`Device: ${host} ${deviceName}, Did finish launching error: ${error}.`);
				}
			}
		});
	}

	configureAccessory(accessory) {
		this.accessories.push(accessory);
	}
}

export default (api) => {
	api.registerPlatform(PluginName, PlatformName, LgWebOsPlatform);
};
