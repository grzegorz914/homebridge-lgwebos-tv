'use strict';

const fs = require('fs');
const lgtv = require('lgtv2');
const wol = require('wol');
const tcpp = require('tcp-ping');
const path = require('path');

const WEBSOCKET_PORT = 3000;
const PLUGIN_NAME = 'homebridge-lgwebos-tv';
const PLATFORM_NAME = 'LgWebOsTv';

let Accessory, Characteristic, Service, Categories, UUID;

module.exports = (api) => {
	Accessory = api.platformAccessory;
	Characteristic = api.hap.Characteristic;
	Service = api.hap.Service;
	Categories = api.hap.Categories;
	UUID = api.hap.uuid;
	api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, lgwebosTvPlatform, true);
};

class lgwebosTvPlatform {
	constructor(log, config, api) {
		// only load if configured
		if (!config || !Array.isArray(config.devices)) {
			log('No configuration found for homebridge-lgwebos-tv');
			return;
		}
		this.log = log;
		this.config = config;
		this.devices = config.devices || [];
		this.accessories = [];

		if (api) {
			this.api = api;
			if (api.version < 2.1) {
				throw new Error('Unexpected API version.');
			}
			this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this));
		}
	}

	didFinishLaunching() {
		this.log.debug('didFinishLaunching');
		for (let i = 0, len = this.devices.length; i < len; i++) {
			let deviceName = this.devices[i];
			if (!deviceName.name) {
				this.log.warn('Device Name Missing')
			} else {
				this.accessories.push(new lgwebosTvDevice(this.log, deviceName, this.api));
			}
		}
	}

	configureAccessory(platformAccessory) {
		this.log.debug('configureAccessory');
		if (this.accessories) {
			this.accessories.push(platformAccessory);
		}
	}

	removeAccessory(platformAccessory) {
		this.log.debug('removeAccessory');
		this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME[platformAccessory]);
	}
}

class lgwebosTvDevice {
	constructor(log, config, api) {
		this.log = log;
		this.api = api;
		this.config = config;

		//device configuration
		this.name = config.name;
		this.host = config.host;
		this.mac = config.mac;
		this.volumeControl = config.volumeControl;
		this.switchInfoMenu = config.switchInfoMenu;
		this.supportOldWebOs = config.supportOldWebOs;
		this.inputs = config.inputs;

		//device info
		this.manufacturer = config.manufacturer || 'LG Electronics';
		this.modelName = config.modelName || PLUGIN_NAME;
		this.serialNumber = config.serialNumber || 'SN0000004';
		this.firmwareRevision = config.firmwareRevision || 'FW0000004';

		//setup variables
		this.inputNames = new Array();
		this.inputReferences = new Array();
		this.inputTypes = new Array();
		this.channelReferences = new Array();
		this.channelNames = new Array();
		this.connectionStatus = false;
		this.currentPowerState = false;
		this.currentMuteState = false;
		this.currentVolume = 0;
		this.currentInputReference = null;
		this.currentChannelReference = null;
		this.currentChannelNumber = null;
		this.currentChannelName = null;
		this.isPaused = false;
		this.prefDir = path.join(api.user.storagePath(), 'lgwebosTv');
		this.keyFile = this.prefDir + '/' + 'key_' + this.host.split('.').join('');
		this.systemFile = this.prefDir + '/' + 'system_' + this.host.split('.').join('');
		this.softwareFile = this.prefDir + '/' + 'software_' + this.host.split('.').join('');
		this.servicesFile = this.prefDir + '/' + 'services_' + this.host.split('.').join('');
		this.inputsFile = this.prefDir + '/' + 'inputs_' + this.host.split('.').join('');
		this.customInputsFile = this.prefDir + '/' + 'customInputs_' + this.host.split('.').join('');
		this.appsFile = this.prefDir + '/' + 'apps_' + this.host.split('.').join('');
		this.channelsFile = this.prefDir + '/' + 'channels_' + this.host.split('.').join('');
		this.url = 'ws://' + this.host + ':' + WEBSOCKET_PORT;

		this.lgtv = new lgtv({
			url: this.url,
			timeout: 5000,
			reconnect: 3000,
			keyFile: this.keyFile
		});

		if (!Array.isArray(this.inputs) || this.inputs === undefined || this.inputs === null) {
			let defaultInputs = [
				{
					name: 'No inputs configured',
					reference: 'No references configured',
					type: 'No types configured'
				}
			];
			this.inputs = defaultInputs;
		}

		//check if prefs directory ends with a /, if not then add it
		if (this.prefDir.endsWith('/') === false) {
			this.prefDir = this.prefDir + '/';
		}

		//check if the directory exists, if not then create it
		if (fs.existsSync(this.prefDir) === false) {
			fs.mkdir(this.prefDir, { recursive: false }, (error) => {
				if (error) {
					this.log.error('Device: %s %s, create directory: %s, error: %s', this.host, this.name, this.prefDir, error);
				} else {
					this.log.debug('Device: %s %s, create directory successful: %s', this.host, this.name, this.prefDir);
				}
			});
		}

		//Check net statek
		setInterval(function () {
			tcpp.probe(this.host, WEBSOCKET_PORT, (error, isAlive) => {
				if (!isAlive && this.connectionStatus) {
					this.log.debug('Device: %s %s, state: Offline', this.host, this.name);
					this.connectionStatus = false;
					this.lgtv.disconnect();
				} else {
					if (isAlive && !this.connectionStatus) {
						this.log.info('Device: %s %s, state: Online.', this.host, this.name);
						this.connectionStatus = true;
						this.lgtv.connect(this.url);
					}
				}
			});
		}.bind(this), 2000);

		this.lgtv.on('connect', () => {
			this.log.debug('Device: %s %s, connected.', this.host, this.name);
			this.connectionStatus = true;
			this.currentPowerState = true;
			this.connect();
		});

		this.lgtv.on('close', () => {
			this.log.debug('Device: %s %s, disconnected.', this.host, this.name);
			this.pointerInputSocket = null;
			this.currentPowerState = false;
		});

		this.lgtv.on('error', (error) => {
			this.log.debug('Device: %s %s, error: %s', this.host, this.name, error);
			this.lgtv.disconnect();
		});

		this.lgtv.on('prompt', () => {
			this.log.info('Device: %s %s, waiting on confirmation...', this.host, this.name);
			this.connectionStatus = false;
		});

		this.lgtv.on('connecting', () => {
			this.log.debug('Device: %s %s, connecting...', this.host, this.name);
			this.connectionStatus = false;
		});

		//Delay to wait for device info before publish
		setTimeout(this.prepareTelevisionService.bind(this), 1500);
	}

	connect() {
		this.log.info('Device: %s %s, connected.', this.host, this.name);
		this.connectToPointerInputSocket();
		this.getDeviceInfo();
		this.getDeviceState();
	}

	disconnect() {
		this.log.info('Device: %s %s, disconnected.', this.host, this.name);
		this.lgtv.disconnect();
	}

	connectToPointerInputSocket() {
		this.log.debug('Device: %s %s, connecting to RC socket...', this.host, this.name);
		this.lgtv.getSocket('ssap://com.webos.service.networkinput/getPointerInputSocket', (error, sock) => {
			if (!error) {
				this.pointerInputSocket = sock;
				this.log.info('Device: %s %s, RC socket connected.', this.host, this.name);
			}
		});
	}

	getDeviceInfo() {
		var me = this;
		setTimeout(() => {
			me.log.debug('Device: %s %s, requesting Device information.', me.host, me.name);
			me.lgtv.request('ssap://system/getSystemInfo', (error, data) => {
				if (error || data.errorCode) {
					me.log.error('Device: %s %s, get System info error: %s', me.host, me.name, error);
				} else {
					delete data['returnValue'];
					me.log.debug('Device: %s %s, get System info successful: %s', me.host, me.name, JSON.stringify(data, null, 2));
					me.manufacturer = 'LG Electronics';
					me.modelName = data.modelName;
					fs.writeFile(me.systemFile, JSON.stringify(data, null, 2), (error) => {
						if (error) {
							me.log.error('Device: %s %s, could not write systemFile, error: %s', me.host, me.name, error);
						} else {
							me.log.debug('Device: %s %s, systemFile saved successful in: %s', me.host, me.name, me.prefDir);
						}
					});
				}
			});

			me.lgtv.request('ssap://com.webos.service.update/getCurrentSWInformation', (error, data) => {
				if (error || data.errorCode) {
					me.log.error('Device: %s %s, get Software info error: %s', me.host, me.name, error);
				} else {
					delete data['returnValue'];
					me.log.debug('Device: %s %s, get Software info successful: %s', me.host, me.name, JSON.stringify(data, null, 2));
					me.productName = data.product_name;
					me.serialNumber = data.device_id;
					me.firmwareRevision = data.minor_ver;
					fs.writeFile(me.softwareFile, JSON.stringify(data, null, 2), (error) => {
						if (error) {
							me.log.error('Device: %s %s, could not write softwareFile, error: %s', me.host, me.name, error);
						} else {
							me.log.debug('Device: %s %s, softwareFile saved successful in: %s', me.host, me.name, me.prefDir);
						}
					});
				}
			});

			me.lgtv.request('ssap://api/getServiceList', (error, data) => {
				if (error || data.errorCode) {
					me.log.debug('Device: %s %s, get Services list error: %s', me.host, error);
				} else {
					delete data['returnValue'];
					me.log.debug('Device: %s %s, get Services list successful: %s', me.host, me.name, JSON.stringify(data, null, 2));
					fs.writeFile(me.servicesFile, JSON.stringify(data, null, 2), (error) => {
						if (error) {
							me.log.error('Device: %s %s, could not write servicesFile, error: %s', me.host, error);
						} else {
							me.log.debug('Device: %s %s, servicesFile saved successful in: %s', me.host, me.name, me.prefDir);
						}
					});
				}
			});

			me.lgtv.request('ssap://tv/getChannelList', (error, data) => {
				if (error || data.errorCode) {
					me.log.debug('Device: %s %s, get Channels list error: %s', me.host, me.name, error);
				} else {
					delete data['returnValue'];
					me.log.debug('Device: %s %s, get Channels list successful: %s', me.host, me.name, JSON.stringify(data, null, 2));
					fs.writeFile(me.channelsFile, JSON.stringify(data, null, 2), (error) => {
						if (error) {
							me.log.error('Device: %s %s, could not write chanelsFile, error: %s', me.host, me.name, error);
						} else {
							me.log.debug('Device: %s %s, channelsFile saved successful in: %s', me.host, me.name, me.prefDir);
						}
					});
				}
			});

			me.lgtv.request('ssap://com.webos.applicationManager/listApps', (error, data) => {
				if (error || data.errorCode) {
					me.log.debug('Device: %s %s, get Apps list error: %s', me.host, me.name, error);
				} else {
					delete data['returnValue'];
					me.log.debug('Device: %s %s, get Apps list successful: %s', me.host, me.name, JSON.stringify(data, null, 2));
					fs.writeFile(me.appsFile, JSON.stringify(data, null, 2), (error) => {
						if (error) {
							me.log.error('Device: %s %s, could not write appsFile, error: %s', me.host, me.name, error);
						} else {
							me.log.debug('Device: %s %s, appsFile saved successful in: %s', me.host, me.name, me.prefDir);
						}
					});
				}
			});

			setTimeout(() => {
				me.log('-------- %s --------', me.name);
				me.log('Manufacturer: %s', me.manufacturer);
				me.log('Model: %s', me.modelName);
				me.log('System: %s', me.productName);
				me.log('Serialnumber: %s', me.serialNumber);
				me.log('Firmware: %s', me.firmwareRevision);
				me.log('----------------------------------');
			}, 350);
		}, 350);
	}

	getDeviceState() {
		var me = this;
		me.log.debug('Device: %s %s, requesting Device state.', me.host, me.name);
		me.lgtv.subscribe('ssap://com.webos.service.tvpower/power/getPowerState', (error, data) => {
			if (error) {
				me.log.error('Device: %s %s, get current Power state error: %s.', me.host, me.name, error);
			} else {
				me.log.debug('Device: %s %s, get current Power state data: %s', me.host, me.name, data);
				let pixelRefresh = (data.state === 'Active Standby');
				let powerOff = (data.state === 'Suspend');
				let powerOn = (data.state === 'Active');
				let state = (powerOn && (!pixelRefresh || !powerOff));
				let powerState = me.supportOldWebOs ? !state : state;
				if (me.televisionService) {
					if (!powerState && me.currentPowerState) {
						me.televisionService.updateCharacteristic(Characteristic.Active, false);
						me.log.debug('Device: %s %s, get current Power state successful: %s', me.host, me.name, pixelRefresh ? 'PIXEL REFRESH' : 'OFF');
						me.currentPowerState = false;
						me.disconnect();
					} else {
						if (powerState && !me.currentPowerState) {
							me.televisionService.updateCharacteristic(Characteristic.Active, true);
							me.log.debug('Device: %s %s, get current Power state successful: %s', me.host, me.name, 'ON');
							me.currentPowerState = true;
						}
					}
				}
			}
		});

		me.lgtv.subscribe('ssap://tv/getCurrentChannel', (error, data) => {
			if (error) {
				me.log.error('Device: %s %s, get current Channel and Name error: %s.', me.host, me.name, error);
			} else {
				me.log.debug('Device: %s %s, get current Channel data: %s', me.host, me.name, data);
				let channelReference = data.channelId;
				let channelNumber = data.channelNumber;
				let channelName = data.channelName;
				let inputIdentifier = me.channelReferences.indexOf(channelReference);
				if (me.televisionService) {
					//me.televisionService.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
				}
				me.log.debug('Device: %s %s, get current Channel successful: %s, %s, %s', me.host, me.name, channelNumber, channelName, channelReference);
				me.currentChannelReference = channelReference;
				me.currentChannelNumber = channelNumber;
				me.currentChannelName = channelName;
			}
		});

		me.lgtv.subscribe('ssap://com.webos.applicationManager/getForegroundAppInfo', (error, data) => {
			if (error) {
				me.log.error('Device: %s %s, get current App error: %s.', me.host, me.name, error);
			} else {
				me.log.debug('Device: %s %s, get current Aapp state data: %s', me.host, me.name, data);
				let inputReference = data.appId;
				let inputIdentifier = me.inputReferences.indexOf(inputReference);
				if (me.televisionService) {
					me.televisionService.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
				}
				me.log.debug('Device: %s %s, get current Input successful: %s', me.host, me.name, inputReference);
				me.currentInputReference = inputReference;
				me.currentInputName = me.inputNames[inputIdentifier];
			}
		});

		me.lgtv.subscribe('ssap://audio/getVolume', (error, data) => {
			if (error) {
				me.log.error('Device: %s %s, get current Audio state error: %s.', me.host, me.name, error);
			} else {
				me.log.debug('Device: %s %s, get current Audio state data: %s', me.host, me.name, data);
				let volume = data.volume;
				let mute = (data.mute === true);
				let muteState = me.currentPowerState ? mute : true;
				if (me.speakerService) {
					me.speakerService.updateCharacteristic(Characteristic.Volume, volume);
					me.speakerService.updateCharacteristic(Characteristic.Mute, muteState);
					if (me.volumeControl && me.volumeService) {
						me.volumeService.updateCharacteristic(Characteristic.Brightness, volume);
						me.volumeService.updateCharacteristic(Characteristic.On, !muteState);
					}
				}
				me.log.debug('Device: %s %s, get current Volume level: %s', me.host, me.name, volume);
				me.log.debug('Device: %s %s, get current Mute state: %s', me.host, me.name, muteState ? 'ON' : 'OFF');
				me.currentVolume = volume;
				me.currentMuteState = muteState;
			}
		});
	}

	//Prepare TV service 
	prepareTelevisionService() {
		this.log.debug('prepareTelevisionService');
		const accessoryName = this.name;
		const accessoryUUID = UUID.generate(accessoryName);
		this.accessory = new Accessory(accessoryName, accessoryUUID);
		this.accessory.category = Categories.TELEVISION;

		this.accessory.getService(Service.AccessoryInformation)
			.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
			.setCharacteristic(Characteristic.Model, this.modelName)
			.setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
			.setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);


		this.televisionService = new Service.Television(accessoryName, 'televisionService');
		this.televisionService.setCharacteristic(Characteristic.ConfiguredName, accessoryName);
		this.televisionService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.televisionService.getCharacteristic(Characteristic.Active)
			.on('get', this.getPower.bind(this))
			.on('set', this.setPower.bind(this));

		this.televisionService.getCharacteristic(Characteristic.ActiveIdentifier)
			.on('get', this.getInput.bind(this))
			.on('set', this.setInput.bind(this));

		this.televisionService.getCharacteristic(Characteristic.RemoteKey)
			.on('set', this.setRemoteKey.bind(this));

		this.televisionService.getCharacteristic(Characteristic.PowerModeSelection)
			.on('set', this.setPowerModeSelection.bind(this));

		this.accessory.addService(this.televisionService);
		this.prepareSpeakerService();
		this.prepareInputsService();
		if (this.volumeControl) {
			this.prepareVolumeService();
		}

		this.log.debug('Device: %s %s, publishExternalAccessories.', this.host, accessoryName);
		this.api.publishExternalAccessories(PLUGIN_NAME, [this.accessory]);
	}

	//Prepare speaker service
	prepareSpeakerService() {
		this.log.debug('prepareSpeakerService');
		this.speakerService = new Service.TelevisionSpeaker(this.name + ' Speaker', 'speakerService');
		this.speakerService
			.setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
			.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
		this.speakerService.getCharacteristic(Characteristic.VolumeSelector)
			.on('set', this.setVolumeSelector.bind(this));
		this.speakerService.getCharacteristic(Characteristic.Volume)
			.on('get', this.getVolume.bind(this))
			.on('set', this.setVolume.bind(this));
		this.speakerService.getCharacteristic(Characteristic.Mute)
			.on('get', this.getMute.bind(this))
			.on('set', this.setMute.bind(this));

		this.accessory.addService(this.speakerService);
		this.televisionService.addLinkedService(this.speakerService);
	}

	//Prepare volume service
	prepareVolumeService() {
		this.log.debug('prepareVolumeService');
		this.volumeService = new Service.Lightbulb(this.name + ' Volume', 'volumeService');
		this.volumeService.getCharacteristic(Characteristic.On)
			.on('get', this.getMuteSlider.bind(this))
			.on('set', (newValue, callback) => {
				this.speakerService.setCharacteristic(Characteristic.Mute, !newValue);
				callback(null);
			});
		this.volumeService.getCharacteristic(Characteristic.Brightness)
			.on('get', this.getVolume.bind(this))
			.on('set', this.setVolume.bind(this));

		this.accessory.addService(this.volumeService);
		this.televisionService.addLinkedService(this.volumeService);
	}

	//Prepare inputs services
	prepareInputsService() {
		this.log.debug('prepareInputsService');

		let savedNames = {};
		try {
			savedNames = JSON.parse(fs.readFileSync(this.customInputsFile));
		} catch (error) {
			this.log.debug('Device: %s %s, read customInputsFile failed, error: %s', this.host, this.name, error)
		}

		this.inputs.forEach((input, i) => {

			//get input name		
			let inputName = input.name;

			//get input reference
			let inputReference = input.reference;

			//get input type		
			let inputType = input.type;

			if (savedNames && savedNames[inputReference]) {
				inputName = savedNames[inputReference];
			} else {
				inputName = input.name;
			}

			this.inputsService = new Service.InputSource(inputReference, 'input' + i);
			this.inputsService
				.setCharacteristic(Characteristic.Identifier, i)
				.setCharacteristic(Characteristic.ConfiguredName, inputName)
				.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
				.setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType, inputType)
				.setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN);

			this.inputsService
				.getCharacteristic(Characteristic.ConfiguredName)
				.on('set', (name, callback) => {
					savedNames[inputReference] = name;
					fs.writeFile(this.customInputsFile, JSON.stringify(savedNames, null, 2), (error) => {
						if (error) {
							this.log.error('Device: %s %s, new Input name saved failed, error: %s', this.host, this.name, error);
						} else {
							this.log.info('Device: %s %s, new Input name saved successful, name: %s reference: %s', this.host, this.name, name, inputReference);
						}
					});
					callback(null);
				});
			this.accessory.addService(this.inputsService);
			this.televisionService.addLinkedService(this.inputsService);
			this.inputReferences.push(inputReference);
			this.inputNames.push(inputName);
			this.inputTypes.push(inputType);
		});
	}

	getPower(callback) {
		var me = this;
		let state = me.currentPowerState;
		me.log.info('Device: %s %s, get current Power state successfull, state: %s', me.host, me.name, state ? 'ON' : 'OFF');
		callback(null, state);
	}

	setPower(state, callback) {
		var me = this;
		if (state && !me.currentPowerState) {
			wol.wake(me.mac, (error) => {
				if (error) {
					me.log.error('Device: %s %s, can not set new Power state. Might be due to a wrong settings in config, error: %s', me.host, error);
				} else {
					me.log.info('Device: %s %s, set new Power state successful: %s', me.host, me.name, 'ON');
				}
			});
			callback(null);
		} else {
			if (!state && me.currentPowerState) {
				me.lgtv.request('ssap://system/turnOff', (error, data) => {
					me.log.info('Device: %s %s, set new Power state successful: %s', me.host, me.name, 'OFF');
					me.disconnect();
				});
			}
			callback(null);
		}
	}

	getMute(callback) {
		var me = this;
		let state = me.currentPowerState ? me.currentMuteState : true;
		me.log.info('Device: %s %s, get current Mute state successful: %s', me.host, me.name, state ? 'ON' : 'OFF');
		callback(null, state);
	}

	getMuteSlider(callback) {
		var me = this;
		let state = me.currentPowerState ? !me.currentMuteState : false;
		me.log.debug('Device: %s %s, get current Mute state successful: %s', me.host, me.name, !state ? 'ON' : 'OFF');
		callback(null, state);
	}

	setMute(state, callback) {
		var me = this;
		if (me.currentPowerState) {
			let newState = state ? true : false;
			me.lgtv.request('ssap://audio/setMute', { mute: newState });
			me.log.info('Device: %s %s, set new Mute state successful: %s', me.host, me.name, state ? 'ON' : 'OFF');
			callback(null);
		}
	}

	getVolume(callback) {
		var me = this;
		let volume = me.currentVolume;
		me.log.info('Device: %s %s, get current Volume level successful: %s', me.host, me.name, volume);
		callback(null, volume);
	}

	setVolume(volume, callback) {
		var me = this;
		me.lgtv.request('ssap://audio/setVolume', { volume: volume });
		me.log.info('Device: %s %s, set new Volume level successful: %s', me.host, me.name, volume);
		callback(null);
	}


	getInput(callback) {
		var me = this;
		let inputName = me.currentInputName;
		let inputReference = me.currentInputReference;
		let inputIdentifier = me.inputReferences.indexOf(inputReference);
		if (inputReference === me.inputReferences[inputIdentifier]) {
			me.televisionService
				.updateCharacteristic(Characteristic.ActiveIdentifier, inputIdentifier);
			me.log.info('Device: %s %s, get current Input successful: %s %s', me.host, me.name, inputName, inputReference);
			callback(null, inputIdentifier);
		} else {
			me.televisionService
				.updateCharacteristic(Characteristic.ActiveIdentifier, 0);
			me.log.debug('Device: %s %s, get current Channel default: %s %s', me.host, me.name, inputName, inputReference);
			callback(null, 0);
		}
	}

	setInput(inputIdentifier, callback) {
		var me = this;
		setTimeout(() => {
			let inputReference = me.inputReferences[inputIdentifier];
			let inputName = me.inputNames[inputIdentifier];
			me.lgtv.request('ssap://system.launcher/launch', { id: inputReference });
			me.log.info('Device: %s %s, set new Input successful: %s %s', me.host, me.name, inputName, inputReference);
			callback(null);
		}, 250);
	}

	getChannel(callback) {
		var me = this;
		let channelReference = me.currentChannelReference;
		if (!me.currentPowerState || channelReference === undefined || channelReference === null || channelReference === '') {
			me.televisionService
				.getCharacteristic(Characteristic.ActiveIdentifier)
				.updateValue(0);
			callback(null, 0);
		} else {
			let inputIdentifier = me.channelReferences.indexOf(channelReference);
			if (channelReference === me.channelReferences[inputIdentifier]) {
				me.televisionService
					.getCharacteristic(Characteristic.ActiveIdentifier)
					.updateValue(inputIdentifier);
				me.log.info('Device: %s %s, get current Channel successful: %s', me.host, me.name, channelReference);
			}
			callback(null, inputIdentifier);
		}
	}

	setChannel(inputIdentifier, callback) {
		var me = this;
		setTimeout(() => {
			let channelReference = me.channelReferences[inputIdentifier];
			me.lgtv.request('ssap://tv/openChannel', { channelNumber: channelReference });
			me.log.info('Device: %s %s, set new Channel successful: %s', me.host, me.name, channelReference);
			callback(null);
		}, 100);
	}

	setPictureMode(mode, callback) {
		let command = null;
		if (this.currentPowerState && this.pointerInputSocket) {
			switch (mode) {
				case Characteristic.PictureMode.OTHER:
					command = '';
					break;
				case Characteristic.PictureMode.STANDARD:
					command = '';
					break;
				case Characteristic.PictureMode.CALIBRATED:
					command = '';
					break;
				case Characteristic.PictureMode.CALIBRATED_DARK:
					command = '';
					break;
				case Characteristic.PictureMode.VIVID:
					command = '';
					break;
				case Characteristic.PictureMode.GAME:
					command = '';
					break;
				case Characteristic.PictureMode.COMPUTER:
					command = '';
					break;
				case Characteristic.PictureMode.CUSTOM:
					command = '';
					break;
			}
			this.log.info('Device: %s %s, setPictureMode successful, command: %s', this.host, this.name, command);
			this.pointerInputSocket.send('button', { name: command });
			callback(null);
		}
	}

	setPowerModeSelection(state, callback) {
		let command = null;
		if (this.currentPowerState && this.pointerInputSocket) {
			switch (state) {
				case Characteristic.PowerModeSelection.SHOW:
					command = this.switchInfoMenu ? 'MENU' : 'INFO';
					break;
				case Characteristic.PowerModeSelection.HIDE:
					command = 'BACK';
					break;
			}
			this.log.info('Device: %s %s, setPowerModeSelection successful, command: %s', this.host, this.name, command);
			this.pointerInputSocket.send('button', { name: command });
			callback(null);
		}
	}

	setVolumeSelector(state, callback) {
		let command = null;
		if (this.currentPowerState && this.pointerInputSocket) {
			switch (state) {
				case Characteristic.VolumeSelector.INCREMENT:
					command = 'VOLUMEUP';
					break;
				case Characteristic.VolumeSelector.DECREMENT:
					command = 'VOLUMEDOWN';
					break;
			}
			this.log.info('Device: %s %s, setVolumeSelector successful, command: %s', this.host, this.name, command);
			this.pointerInputSocket.send('button', { name: command });
			callback(null);
		}
	}

	setRemoteKey(remoteKey, callback) {
		let command = null;
		if (this.currentPowerState && this.pointerInputSocket) {
			switch (remoteKey) {
				case Characteristic.RemoteKey.REWIND:
					command = 'REWIND';
					break;
				case Characteristic.RemoteKey.FAST_FORWARD:
					command = 'FASTFORWARD';
					break;
				case Characteristic.RemoteKey.NEXT_TRACK:
					command = 'MENU';
					break;
				case Characteristic.RemoteKey.PREVIOUS_TRACK:
					command = 'MENU';
					break;
				case Characteristic.RemoteKey.ARROW_UP:
					command = 'UP';
					break;
				case Characteristic.RemoteKey.ARROW_DOWN:
					command = 'DOWN';
					break;
				case Characteristic.RemoteKey.ARROW_LEFT:
					command = 'LEFT';
					break;
				case Characteristic.RemoteKey.ARROW_RIGHT:
					command = 'RIGHT';
					break;
				case Characteristic.RemoteKey.SELECT:
					command = 'ENTER';
					break;
				case Characteristic.RemoteKey.BACK:
					command = 'BACK';
					break;
				case Characteristic.RemoteKey.EXIT:
					command = 'EXIT';
					break;
				case Characteristic.RemoteKey.PLAY_PAUSE:
					command = me.isPaused ? 'PLAY' : 'PAUSE';
					this.isPaused = !this.isPaused;
					break;
				case Characteristic.RemoteKey.INFORMATION:
					command = this.switchInfoMenu ? 'MENU' : 'INFO';
					break;
			}
			this.log.info('Device: %s %s, setRemoteKey successful, command: %s', this.host, this.name, command);
			this.pointerInputSocket.send('button', { name: command });
			callback(null);
		}
	}
};
