import { join } from 'path';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import LgWebOsDevice from './src/lgwebosdevice.js';
import ImpulseGenerator from './src/impulsegenerator.js';
import { PluginName, PlatformName } from './src/constants.js';

class LgWebOsPlatform {
	constructor(log, config, api) {
		if (!config || !Array.isArray(config.devices)) {
			log.warn(`No configuration found for ${PluginName}.`);
			return;
		}

		this.accessories = [];

		const prefDir = join(api.user.storagePath(), 'lgwebosTv');
		try {
			mkdirSync(prefDir, { recursive: true });
		} catch (error) {
			log.error(`Prepare directory error: ${error.message ?? error}`);
			return;
		}

		api.on('didFinishLaunching', async () => {
			for (const device of config.devices) {
				const displayType = device.displayType ?? 1;
				if (displayType === 0) continue;

				const { name, host, mac } = device;
				const macValid = /^([A-Fa-f0-9]{2}:){5}[A-Fa-f0-9]{2}$/.test(mac);

				if (!name || !host || !macValid) {
					log.warn(`Invalid config: Name: ${name || 'missing'}, Host: ${host || 'missing'}, MAC: ${mac || 'missing'}`);
					continue;
				}

				//log config
				const logLevel = {
					devInfo: device.log?.deviceInfo,
					success: device.log?.success,
					info: device.log?.info,
					warn: device.log?.warn,
					error: device.log?.error,
					debug: device.log?.debug
				};

				if (logLevel.debug) {
					log.info(`Device: ${host} ${name}, did finish launching.`);
					const safeConfig = {
						...device,
						mqtt: {
							auth: {
								...device.mqtt?.auth,
								passwd: 'removed',
							}
						},
					};
					log.info(`Device: ${host} ${name}, Config: ${JSON.stringify(safeConfig, null, 2)}`);
				}

				const postFix = host.replace(/\./g, '');
				const files = {
					key: `${prefDir}/key_${postFix}`,
					devInfo: `${prefDir}/devInfo_${postFix}`,
					inputs: `${prefDir}/inputs_${postFix}`,
					channels: `${prefDir}/channels_${postFix}`,
					inputsNames: `${prefDir}/inputsNames_${postFix}`,
					inputsVisibility: `${prefDir}/inputsTargetVisibility_${postFix}`,
				};

				try {
					Object.values(files).forEach((file) => {
						if (!existsSync(file)) {
							writeFileSync(file, '');
						}
					});
				} catch (error) {
					if (logLevel.error) log.error(`Device: ${host} ${name}, Prepare files error: ${error.message ?? error}`);
					continue;
				}

				try {
					// create impulse generator
					const impulseGenerator = new ImpulseGenerator()
						.on('start', async () => {
							try {
								const lgDevice = new LgWebOsDevice(api, device, files.key, files.devInfo, files.inputs, files.channels, files.inputsNames, files.inputsVisibility)
									.on('devInfo', (info) => logLevel.devInfo && log.info(info))
									.on('success', (msg) => logLevel.success && log.success(`Device: ${host} ${name}, ${msg}`))
									.on('info', (msg) => logLevel.info && log.info(`Device: ${host} ${name}, ${msg}`))
									.on('debug', (msg) => logLevel.debug && log.info(`Device: ${host} ${name}, debug: ${msg}`))
									.on('warn', (msg) => logLevel.warn && log.warn(`Device: ${host} ${name}, ${msg}`))
									.on('error', (msg) => logLevel.error && log.error(`Device: ${host} ${name}, ${msg}`));

								const accessory = await lgDevice.start();
								if (accessory) {
									api.publishExternalAccessories(PluginName, [accessory]);
									if (logLevel.success) log.success(`Device: ${host} ${name}, Published as external accessory.`);

									await impulseGenerator.state(false);
									await lgDevice.startStopImpulseGenerator(true, [{ name: 'heartBeat', sampling: 10000 }]);
								}
							} catch (error) {
								if (logLevel.error) log.error(`Device: ${host} ${name}, Start impulse generator error: ${error.message ?? error}, trying again.`);
							}
						})
						.on('state', (state) => {
							if (logLevel.debug) log.info(`Device: ${host} ${name}, Start impulse generator ${state ? 'started' : 'stopped'}.`);
						});

					// start impulse generator
					await impulseGenerator.state(true, [{ name: 'start', sampling: 60000 }]);
				} catch (error) {
					if (logLevel.error) log.error(`Device: ${host} ${name}, Did finish launching error: ${error.message ?? error}`);
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

