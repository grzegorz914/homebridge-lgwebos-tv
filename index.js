'use strict';
const path = require('path');
const fs = require('fs');
const RestFul = require('./src/restful.js');
const Mqtt = require('./src/mqtt.js');
const LgWebOsDevice = require('./src/lgwebosdevice.js');
const CONSTANS = require('./src/constans.json');

class LgWebOsPlatform {
	constructor(log, config, api) {
		// only load if configured
		if (!config || !Array.isArray(config.devices)) {
			log.warn(`No configuration found for ${CONSTANS.PluginName}`);
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

				//RESTFul server
				const restFulEnabled = device.enableRestFul || false;
				if (restFulEnabled) {
					this.restFulConnected = false;
					const restFulPort = device.restFulPort || 3000;
					const restFulDebug = device.restFulDebug || false;
					this.restFul = new RestFul({
						port: restFulPort,
						debug: restFulDebug
					});

					this.restFul.on('connected', (message) => {
						log(`Device: ${host} ${deviceName}, ${message}`);
						this.restFulConnected = true;
					})
						.on('error', (error) => {
							log.error(`Device: ${host} ${deviceName}, ${error}`);
						})
						.on('debug', (debug) => {
							log(`Device: ${host} ${deviceName}, debug: ${debug}`);
						});
				}

				//MQTT client
				const mqttEnabled = device.enableMqtt || false;
				if (mqttEnabled) {
					this.mqttConnected = false;
					const mqttHost = device.mqttHost;
					const mqttPort = device.mqttPort || 1883;
					const mqttClientId = device.mqttClientId || `Lgwebos_${Math.random().toString(16).slice(3)}`;
					const mqttPrefix = device.mqttPrefix;
					const mqttUser = device.mqttUser;
					const mqttPasswd = device.mqttPasswd;
					const mqttDebug = device.mqttDebug || false;
					this.mqtt = new Mqtt({
						host: mqttHost,
						port: mqttPort,
						clientId: mqttClientId,
						user: mqttUser,
						passwd: mqttPasswd,
						prefix: `${mqttPrefix}/${deviceName}`,
						debug: mqttDebug
					});

					this.mqtt.on('connected', (message) => {
						log(`Device: ${host} ${deviceName}, ${message}`);
						this.mqttConnected = true;
					})
						.on('error', (error) => {
							log.error(`Device: ${host} ${deviceName}, ${error}`);
						})
						.on('debug', (debug) => {
							log(`Device: ${host} ${deviceName}, debug: ${debug}`);
						});
				}

				//webos device
				const lgWebOsDevice = new LgWebOsDevice(api, prefDir, device);
				lgWebOsDevice.on('publishAccessory', (accessory) => {
					api.publishExternalAccessories(CONSTANS.PluginName, [accessory]);
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
					})
					.on('restFul', (path, data) => {
						const restFul = this.restFulConnected ? this.restFul.update(path, data) : false;
					})
					.on('mqtt', (topic, message) => {
						const mqtt = this.mqttConnected ? this.mqtt.send(topic, message) : false;
					});
			}
		});
	}

	configureAccessory(accessory) {
		this.accessories.push(accessory);
	}
}

module.exports = (api) => {
	api.registerPlatform(CONSTANS.PluginName, CONSTANS.PlatformName, LgWebOsPlatform, true);
};
