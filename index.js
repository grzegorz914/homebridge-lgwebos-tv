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

		api.on('didFinishLaunching', () => {
			// Each device is set up independently — a failure in one does not
			// block the others. Promise.allSettled runs all in parallel.
			Promise.allSettled(
				config.devices.map(device =>
					this.setupDevice(device, prefDir, log, api)
				)
			).then(results => {
				results.forEach((result, i) => {
					if (result.status === 'rejected') {
						log.error(`Device[${i}] setup error: ${result.reason?.message ?? result.reason}`);
					}
				});
			});
		});
	}

	// ── Per-device setup ──────────────────────────────────────────────────────

	async setupDevice(device, prefDir, log, api) {
		const { name, host, mac, displayType } = device;

		const macValid = /^([A-Fa-f0-9]{2}:){5}[A-Fa-f0-9]{2}$/.test(mac);
		if (!name || !host || !macValid || !displayType) {
			const reason = !name ? 'name missing'
				: !host ? 'host missing'
					: !macValid ? 'mac invalid'
						: 'display type disabled';
			log.warn(`Device ${name ?? host ?? '(unnamed)'}: ${reason} — will not be published in the Home app`);
			return;
		}

		const logLevel = {
			devInfo: device.log?.deviceInfo,
			success: device.log?.success,
			info: device.log?.info,
			warn: device.log?.warn,
			error: device.log?.error,
			debug: device.log?.debug,
		};

		if (logLevel.debug) {
			log.info(`Device: ${host} ${name}, debug: did finish launching`);
			const safeConfig = {
				...device,
				mqtt: {
					...device.mqtt,
					auth: {
						...device.mqtt?.auth,
						passwd: 'removed',
					},
				},
			};
			log.info(`Device: ${host} ${name}, config: ${JSON.stringify(safeConfig, null, 2)}`);
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
			return;
		}

		// The startup impulse generator retries the full connect+discover cycle
		// every 120 s until it succeeds, then hands off to the lgDevice
		// impulse generator and stops itself.
		const heartBeatInterval = (device.heartBeatInterval ?? 5) * 1000;

		const impulseGenerator = new ImpulseGenerator()
			.on('start', async () => {
				try {
					await this.startDevice(
						device, name, host, files,
						heartBeatInterval, logLevel,
						log, api, impulseGenerator
					);
				} catch (error) {
					if (logLevel.error) log.error(`Device: ${host} ${name}, Start impulse generator error: ${error.message ?? error}, trying again.`);
				}
			})
			.on('state', (state) => {
				if (logLevel.debug) log.info(`Device: ${host} ${name}, Start impulse generator ${state ? 'started' : 'stopped'}.`);
			});

		await impulseGenerator.state(true, [{ name: 'start', sampling: 120_000 }]);
	}

	// ── Connect and register accessory for one device ─────────────────────────

	async startDevice(device, name, host, files, heartBeatInterval, logLevel, log, api, impulseGenerator) {
		const lgDevice = new LgWebOsDevice(
			api, device,
			files.key, files.devInfo, files.inputs, files.channels,
			files.inputsNames, files.inputsVisibility
		)
			.on('devInfo', (info) => logLevel.devInfo && log.info(info))
			.on('success', (msg) => logLevel.success && log.success(`Device: ${host} ${name}, ${msg}`))
			.on('info', (msg) => log.info(`Device: ${host} ${name}, ${msg}`))
			.on('debug', (msg) => log.info(`Device: ${host} ${name}, debug: ${msg}`))
			.on('warn', (msg) => log.warn(`Device: ${host} ${name}, ${msg}`))
			.on('error', (msg) => log.error(`Device: ${host} ${name}, ${msg}`));

		const accessory = await lgDevice.start();
		if (!accessory) return;

		api.publishExternalAccessories(PluginName, [accessory]);
		if (logLevel.success) log.success(`Device: ${host} ${name}, Published as external accessory.`);

		// Stop startup generator and hand off to the lgDevice heartbeat generator
		await impulseGenerator.state(false);
		await new Promise(resolve => setTimeout(resolve, 3000));
		await lgDevice.startStopImpulseGenerator(true, [{ name: 'heartBeat', sampling: heartBeatInterval }]);
	}

	// ── Homebridge accessory cache ────────────────────────────────────────────

	configureAccessory(accessory) {
		this.accessories.push(accessory);
	}
}

export default (api) => {
	api.registerPlatform(PluginName, PlatformName, LgWebOsPlatform);
};