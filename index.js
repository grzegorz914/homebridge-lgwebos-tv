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
		this.api = api;
		this.devices = config.devices;
		this.accessories = [];

		this.api.on('didFinishLaunching', () => {
			this.log.debug('didFinishLaunching');
			for (let i = 0, len = this.devices.length; i < len; i++) {
				let deviceName = this.devices[i];
				if (!deviceName.name) {
					this.log.warn('Device Name Missing')
				} else {
					this.accessories.push(new lgwebosTvDevice(this.log, deviceName, this.api));
				}
			}
		});
	}

	configureAccessory(accessory) {
		this.log.debug('configureAccessory');
		this.accessories.push(accessory);
	}

	removeAccessory(accessory) {
		this.log.debug('removeAccessory');
		this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
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
		this.refreshInterval = config.refreshInterval || 5;
		this.volumeControl = config.volumeControl;
		this.switchInfoMenu = config.switchInfoMenu;
		this.inputs = config.inputs;

		//device info
		this.manufacturer = config.manufacturer || 'LG Electronics';
		this.modelName = config.modelName || 'Model Name';
		this.serialNumber = config.serialNumber || 'Serial Number';
		this.firmwareRevision = config.firmwareRevision || 'Firmware Revision';

		//setup variables
		this.connectionStatus = false;
		this.currentPowerState = false;
		this.inputNames = new Array();
		this.inputReferences = new Array();
		this.inputTypes = new Array();
		this.inputModes = new Array();
		this.channelNames = new Array();
		this.channelReferences = new Array();
		this.channelNumbers = new Array();
		this.currentMuteState = false;
		this.currentVolume = 0;
		this.currentInputName = '';
		this.currentInputReference = '';
		this.currentChannelNumber = -1;
		this.currentChannelName = '';
		this.currentChannelReference = '';
		this.currentMediaState = false; //play/pause
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

		this.lgtv = lgtv({
			url: this.url,
			timeout: 10000,
			reconnect: 5000,
			keyFile: this.keyFile
		});

		if (!Array.isArray(this.inputs) || this.inputs === undefined || this.inputs === null) {
			let defaultInputs = [
				{
					name: 'No inputs configured',
					reference: 'No references configured',
					type: 'No types configured',
					mode: 0
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
					this.log.debug('Device: %s %s, state: Offline.', this.host, this.name);
					if (this.televisionService) {
						this.televisionService.updateCharacteristic(Characteristic.Active, 0);
					}
					this.currentPowerState = false;
					this.connectionStatus = false;
					this.lgtv.disconnect();
				} else {
					if (isAlive && !this.connectionStatus) {
						this.lgtv.connect(this.url);
					} else {
						if (isAlive && this.connectionStatus) {
							this.updateDeviceState();
						}
					}
				}
			});
		}.bind(this), this.refreshInterval * 1000);

		this.lgtv.on('connect', () => {
			this.log.info('Device: %s %s, connected.', this.host, this.name);
			this.lgtv.request('ssap://com.webos.service.tvpower/power/getPowerState', (error, data) => {
				if (error || (data && data.state && data.state === 'Active Standby')) {
					this.log.debug('Device: %s %s, get current Power state successful: PIXEL REFRESH or OFF', this.host, this.name);
					this.currentPowerState = false;
					this.lgtv.disconnect();
				} else {
					this.log.info('Device: %s %s, get current Power state successful: ON', this.host, this.name);
					this.currentPowerState = true;
					this.getDeviceInfo();
					this.connectToPointerInputSocket();
				}
			});
		});

		this.lgtv.on('close', () => {
			this.log.info('Device: %s %s, disconnected.', this.host, this.name);
			if (this.televisionService) {
				this.televisionService.updateCharacteristic(Characteristic.Active, 0);
			}
			this.pointerInputSocket = null;
			this.currentPowerState = false;
		});

		this.lgtv.on('error', (error) => {
			this.log.debug('Device: %s %s, error: %s', this.host, this.name, error);
		});

		this.lgtv.on('prompt', () => {
			this.log.info('Device: %s %s, waiting on confirmation...', this.host, this.name);
			this.connectionStatus = false;
		});

		this.lgtv.on('connecting', () => {
			this.log.debug('Device: %s %s, connecting...', this.host, this.name);
			this.connectionStatus = false;
		});

		this.prepareTelevisionService();
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
		if (this.volumeControl >= 1) {
			this.prepareVolumeService();
		}
		this.prepareInputsService();

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
		if (this.volumeControl == 1) {
			this.volumeService = new Service.Lightbulb(this.name + ' Volume', 'volumeService');
			this.volumeService.getCharacteristic(Characteristic.Brightness)
				.on('get', this.getVolume.bind(this))
				.on('set', (volume, callback) => {
					this.speakerService.setCharacteristic(Characteristic.Volume, volume);
					callback(null);
				});
		}
		if (this.volumeControl == 2) {
			this.volumeService = new Service.Fan(this.name + ' Volume', 'volumeService');
			this.volumeService.getCharacteristic(Characteristic.RotationSpeed)
				.on('get', this.getVolume.bind(this))
				.on('set', (volume, callback) => {
					this.speakerService.setCharacteristic(Characteristic.Volume, volume);
					callback(null);
				});
		}
		this.volumeService.getCharacteristic(Characteristic.On)
			.on('get', (callback) => {
				let state = !this.currentMuteState;
				callback(null, state);
			})
			.on('set', (state, callback) => {
				this.speakerService.setCharacteristic(Characteristic.Mute, !state);
				callback(null);
			});

		this.accessory.addService(this.volumeService);
		this.televisionService.addLinkedService(this.volumeService);
	}

	//Prepare inputs service
	prepareInputsService() {
		this.log.debug('prepareInputsService');

		let savedNames = {};
		try {
			savedNames = JSON.parse(fs.readFileSync(this.customInputsFile));
		} catch (error) {
			this.log.debug('Device: %s %s, read customInputsFile failed, error: %s', this.host, this.name, error)
		}

		this.inputs.forEach((input, i) => {

			//get input reference
			let inputReference = input.reference;

			//get input name		
			let inputName = input.name;

			if (savedNames && savedNames[inputReference]) {
				inputName = savedNames[inputReference];
			} else {
				inputName = input.name;
			}

			//get input type		
			let inputType = input.type;

			//get input mode
			let inputMode = input.mode;

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
			this.inputReferences.push(inputReference);
			this.inputNames.push(inputName);
			this.inputTypes.push(inputType);
			this.inputModes.push(inputMode);

			this.accessory.addService(this.inputsService);
			this.televisionService.addLinkedService(this.inputsService);
		});
	}

	getDeviceInfo() {
		var me = this;
		setTimeout(() => {
			me.log.debug('Device: %s %s, requesting Device information.', me.host, me.name);
			me.lgtv.request('ssap://system/getSystemInfo', (error, data) => {
				if (error || data.errorCode) {
					me.log.debug('Device: %s %s, get System info error: %s', me.host, me.name, error);
				} else {
					delete data['returnValue'];
					me.model = data.modelName;
					if (fs.existsSync(me.systemFile) === false) {
						fs.writeFile(me.systemFile, JSON.stringify(data, null, 2), (error) => {
							if (error) {
								me.log.error('Device: %s %s, could not write systemFile, error: %s', me.host, me.name, error);
							} else {
								me.log.debug('Device: %s %s, systemFile saved successful in: %s %s', me.host, me.name, me.prefDir, JSON.stringify(data, null, 2));
							}
						});
					}
				}
			});

			me.lgtv.request('ssap://com.webos.service.update/getCurrentSWInformation', (error, data) => {
				if (error || data.errorCode) {
					me.log.debug('Device: %s %s, get Software info error: %s', me.host, me.name, error);
				} else {
					delete data['returnValue'];
					me.system = data.product_name;
					me.serial = data.device_id;
					me.firmware = data.minor_ver;
					if (fs.existsSync(me.softwareFile) === false) {
						fs.writeFile(me.softwareFile, JSON.stringify(data, null, 2), (error) => {
							if (error) {
								me.log.error('Device: %s %s, could not write softwareFile, error: %s', me.host, me.name, error);
							} else {
								me.log.debug('Device: %s %s, softwareFile saved successful in: %s %s', me.host, me.name, me.prefDir, JSON.stringify(data, null, 2));
							}
						});
					}
				}
			});

			me.lgtv.request('ssap://api/getServiceList', (error, data) => {
				if (error || data.errorCode) {
					me.log.debug('Device: %s %s, get Services list error: %s', me.host, error);
				} else {
					delete data['returnValue'];
					if (fs.existsSync(me.servicesFile) === false) {
						fs.writeFile(me.servicesFile, JSON.stringify(data, null, 2), (error) => {
							if (error) {
								me.log.error('Device: %s %s, could not write servicesFile, error: %s', me.host, error);
							} else {
								me.log.debug('Device: %s %s, servicesFile saved successful in: %s %s', me.host, me.name, me.prefDir, JSON.stringify(data, null, 2));
							}
						});
					}
				}
			});

			me.lgtv.request('ssap://com.webos.applicationManager/listApps', (error, data) => {
				if (error || data.errorCode) {
					me.log.debug('Device: %s %s, get Apps list error: %s', me.host, me.name, error);
				} else {
					delete data['returnValue'];
					if (fs.existsSync(me.appsFile) === false) {
						fs.writeFile(me.appsFile, JSON.stringify(data, null, 2), (error) => {
							if (error) {
								me.log.error('Device: %s %s, could not write appsFile, error: %s', me.host, me.name, error);
							} else {
								me.log.debug('Device: %s %s, appsFile saved successful in: %s %s', me.host, me.name, me.prefDir, JSON.stringify(data, null, 2));
							}
						});
					}
				}
			});
			setTimeout(() => {
				me.log.info('Device: %s %s, state: Online.', me.host, me.name);
				let manufacturer = me.manufacturer;
				if (typeof me.model !== 'undefined') {
					me.modelName = me.model;
				} else {
					me.modelName = me.modelName;
				};
				if (typeof me.system !== 'undefined') {
					me.system = me.system;
				} else {
					me.system = 'System';
				};
				if (typeof me.serial !== 'undefined') {
					me.serialNumber = me.serial;
				} else {
					me.serialNumber = me.serialNumber;
				};
				if (typeof me.firmware !== 'undefined') {
					me.firmwareRevision = me.firmware;
				} else {
					me.firmwareRevision = me.firmwareRevision;
				};
				me.log('-------- %s --------', me.name);
				me.log('Manufacturer: %s', manufacturer);
				me.log('Model: %s', me.modelName);
				me.log('System: %s', me.system);
				me.log('Serialnr: %s', me.serialNumber);
				me.log('Firmware: %s', me.firmwareRevision);
				me.log('----------------------------------');
				me.connectionStatus = true;
			}, 350);
		}, 350);
	}

	updateDeviceState() {
		var me = this;
		if (this.currentPowerState) {
			me.log.debug('Device: %s %s, requesting Device state.', me.host, me.name);
			me.lgtv.request('ssap://com.webos.service.tvpower/power/getPowerState', (error, data) => {
				if (error) {
					me.log.error('Device: %s %s, get current Power state error: %s %s.', me.host, me.name, error, data);
				} else {
					me.log.debug('Device: %s %s, get current Power state data: %s', me.host, me.name, data);
					let prepareOff = (data.processing === 'Request Power Off' || data.processing === 'Request Active Standby' || data.processing === 'Request Suspend' || data.processing === 'Prepare Suspend');
					let prepareScreenSaver = (data.processing === 'Screen Saver Ready');
					let screenSaver = (data.state === 'Screen Saver');
					let pixelRefresh = (data.state === 'Active Standby');
					let powerOff = (data.state === 'Suspend');
					let prepareOn = (data.processing === 'Screen On' || data.processing === 'Request Screen Saver');
					let powerOn = (data.state === 'Active' || screenSaver);
					let state = (powerOn && !pixelRefresh);
					if (state) {
						if (me.televisionService) {
							me.televisionService.updateCharacteristic(Characteristic.Active, 1);
						}
						me.log.debug('Device: %s %s, get current Power state successful: %s', me.host, me.name, 'ON');
					} else {
						if (me.televisionService) {
							me.televisionService.updateCharacteristic(Characteristic.Active, 0);
						}
						me.log.debug('Device: %s %s, get current Power state successful: %s', me.host, me.name, pixelRefresh ? 'PIXEL REFRESH' : 'OFF');
						me.lgtv.disconnect();
					}
					me.currentPowerState = state;
				}
			});

			me.lgtv.request('ssap://com.webos.applicationManager/getForegroundAppInfo', (error, data) => {
				if (error) {
					me.log.error('Device: %s %s, get current App error: %s.', me.host, me.name, error);
				} else {
					me.log.debug('Device: %s %s, get current App state data: %s', me.host, me.name, data);
					let inputReference = data.appId;
					let inputName = me.inputNames[me.currentInputIdentifier];
					let inputMode = me.inputModes[me.currentInputIdentifier];
					if (me.televisionService && inputMode == 0) {
						me.televisionService.updateCharacteristic(Characteristic.ActiveIdentifier, me.currentInputIdentifier);
						me.log.debug('Device: %s %s, get current Input successful: %s %s', me.host, me.name, inputName, inputReference);
					}
					me.currentInputName = inputName;
					me.currentInputReference = inputReference;
				}
			});

			me.lgtv.request('ssap://tv/getCurrentChannel', (error, data) => {
				if (error) {
					me.log.error('Device: %s %s, get current Channel and Name error: %s.', me.host, me.name, error);
				} else {
					me.log.debug('Device: %s %s, get current Channel data: %s', me.host, me.name, data);
					let channelReference = data.channelId;
					let channelName = data.channelName;
					let inputMode = me.inputModes[me.currentInputIdentifier];
					if (me.televisionService && inputMode == 1) {
						me.televisionService.updateCharacteristic(Characteristic.ActiveIdentifier, me.currentInputIdentifier);
						me.log.debug('Device: %s %s, get current Channel successful: %s, %s', me.host, me.name, channelName, channelReference);
					}
					me.currentChannelName = channelName;
					me.currentChannelReference = channelReference;
				}
			});

			me.currentInputIdentifier = me.inputReferences.indexOf(me.currentChannelReference || me.currentInputReference);

			me.lgtv.request('ssap://audio/getVolume', (error, data) => {
				if (error) {
					me.log.error('Device: %s %s, get current Audio state error: %s.', me.host, me.name, error);
				} else {
					me.log.debug('Device: %s %s, get current Audio state data: %s', me.host, me.name, data);
					let mute = me.currentPowerState ? (data.muted === true) : true;
					let volume = data.volume;
					if (me.speakerService) {
						me.speakerService.updateCharacteristic(Characteristic.Mute, mute);
						me.speakerService.updateCharacteristic(Characteristic.Volume, volume);
						if (me.volumeService && me.volumeControl >= 1) {
							me.volumeService.updateCharacteristic(Characteristic.On, !mute);
						}
						if (me.volumeService && me.volumeControl == 1) {
							me.volumeService.updateCharacteristic(Characteristic.Brightness, volume);
						}
						if (me.volumeService && me.volumeControl == 2) {
							me.volumeService.updateCharacteristic(Characteristic.RotationSpeed, volume);
						}
						me.log.debug('Device: %s %s, get current Mute state: %s', me.host, me.name, mute ? 'ON' : 'OFF');
						me.log.debug('Device: %s %s, get current Volume level: %s', me.host, me.name, volume);
					}
					me.currentMuteState = mute;
					me.currentVolume = volume;
				}
			});
		}
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
					me.log.error('Device: %s %s, can not set Power state ON. Might be due to a wrong settings in config, error: %s', me.host);
				} else {
					me.log.info('Device: %s %s, set new Power state successful: %s', me.host, me.name, 'ON');
				}
			});
			callback(null);
		} else {
			if (!state && me.currentPowerState) {
				me.lgtv.request('ssap://system/turnOff', (error, data) => {
					me.log.info('Device: %s %s, set new Power state successful: %s', me.host, me.name, 'OFF');
					me.currentPowerState = false;
					me.lgtv.disconnect();
				});
			}
			callback(null);
		}
	}

	getMute(callback) {
		var me = this;
		let muteState = me.currentMuteState;
		let state = me.currentPowerState ? muteState : true;
		me.log.info('Device: %s %s, get current Mute state successful: %s', me.host, me.name, state ? 'ON' : 'OFF');
		callback(null, state);
	}

	setMute(state, callback) {
		var me = this;
		let muteState = me.currentMuteState;
		if (me.currentPowerState && state !== muteState) {
			me.lgtv.request('ssap://audio/setMute', { mute: state });
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
		if (volume == 0 || volume == 100) {
			volume = me.currentVolume;
		}
		me.lgtv.request('ssap://audio/setVolume', { volume: volume });
		me.log.info('Device: %s %s, set new Volume level successful: %s', me.host, me.name, volume);
		callback(null);
	}


	getInput(callback) {
		var me = this;
		let inputReference = me.currentInputReference;
		let inputIdentifier = me.currentInputIdentifier
		let inputName = me.inputNames[inputIdentifier];
		let channelName = me.currentChannelName;
		let channelReference = me.currentChannelReference;
		me.log.info('Device: %s %s, get current Input successful: %s %s', me.host, me.name, inputName, inputReference);
		me.log.info('Device: %s %s, get current channel successful: %s %s', me.host, me.name, channelName, channelReference);
		callback(null, inputIdentifier);
	}

	setInput(inputIdentifier, callback) {
		var me = this;
		let inputMode = me.inputModes[inputIdentifier];
		let inputName = me.inputNames[inputIdentifier];
		let inputReference = [me.inputReferences[inputIdentifier], "com.webos.app.livetv"][inputMode];
		if (inputMode >= 0) {
			me.lgtv.request('ssap://system.launcher/launch', { id: inputReference });
			me.log.info('Device: %s %s, set new Input successful: %s %s', me.host, me.name, inputName, inputReference);
			if (inputMode == 1) {
				let channelReference = me.inputReferences[inputIdentifier];
				me.lgtv.request('ssap://tv/openChannel', { channelId: channelReference });
				me.log.info('Device: %s %s, set new Channel successful: %s %s', me.host, me.name, inputName, channelReference);
			}
		}
		callback(null);
	}

	setPictureMode(mode, callback) {
		var me = this;
		let command = null;
		if (me.currentPowerState && me.pointerInputSocket) {
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
			me.log.info('Device: %s %s, setPictureMode successful, command: %s', me.host, me.name, command);
			me.pointerInputSocket.send('button', { name: command });
			callback(null);
		}
	}

	setPowerModeSelection(state, callback) {
		var me = this;
		let command = null;
		if (me.currentPowerState && me.pointerInputSocket) {
			switch (state) {
				case Characteristic.PowerModeSelection.SHOW:
					command = me.switchInfoMenu ? 'MENU' : 'INFO';
					break;
				case Characteristic.PowerModeSelection.HIDE:
					command = 'BACK';
					break;
			}
			me.log.info('Device: %s %s, setPowerModeSelection successful, command: %s', me.host, me.name, command);
			me.pointerInputSocket.send('button', { name: command });
			callback(null);
		}
	}

	setVolumeSelector(state, callback) {
		var me = this;
		let command = null;
		if (me.currentPowerState && me.pointerInputSocket) {
			switch (state) {
				case Characteristic.VolumeSelector.INCREMENT:
					command = 'VOLUMEUP';
					break;
				case Characteristic.VolumeSelector.DECREMENT:
					command = 'VOLUMEDOWN';
					break;
			}
			me.log.info('Device: %s %s, setVolumeSelector successful, command: %s', me.host, me.name, command);
			me.pointerInputSocket.send('button', { name: command });
			callback(null);
		}
	}

	setRemoteKey(remoteKey, callback) {
		var me = this;
		let command = null;
		if (me.currentPowerState && me.pointerInputSocket) {
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
					command = me.currentMediaState ? 'PLAY' : 'PAUSE';
					me.currentMediaState = !me.currentMediaState;
				case Characteristic.RemoteKey.INFORMATION:
					command = me.switchInfoMenu ? 'MENU' : 'INFO';
					break;
			}
			me.log.info('Device: %s %s, setRemoteKey successful, command: %s', me.host, me.name, command);
			me.pointerInputSocket.send('button', { name: command });
			callback(null);
		}
	}
};
