'use strict';

const fs = require('fs');
const mkdirp = require('mkdirp');
const lgtv = require('lgtv2');
const wol = require('wol');
const tcpp = require('tcp-ping');
const path = require('path');

const WEBSOCKET_PORT = 3000;

let Accessory, Service, Characteristic, UUIDGen, Categories;

module.exports = homebridge => {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	Accessory = homebridge.platformAccessory;
	UUIDGen = homebridge.hap.uuid;
	Categories = homebridge.hap.Accessory.Categories;

	homebridge.registerPlatform('homebridge-lgwebos-tv', 'LgWebOsTv', lgwebosTvPlatform, true);
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
		this.tvAccessories = [];

		if (api) {
			this.api = api;
			if (this.version < 2.1) {
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
				this.tvAccessories.push(new lgwebosTvDevice(this.log, deviceName, this.api));
			}
		}
	}

	configureAccessory(platformAccessory) {
		this.log.debug('configureAccessory');
		if (this.tvAccessories) {
			this.tvAccessories.push(platformAccessory);
		}
	}

	removeAccessory(platformAccessory) {
		this.log.debug('removeAccessory');
		this.api.unregisterPlatformAccessories('homebridge-lgwebos-tv', 'LgWebOsTv', [platformAccessory]);
	}
}

class lgwebosTvDevice {
	constructor(log, device, api) {
		this.log = log;
		this.api = api;
		this.device = device;

		//device configuration
		this.device = device;
		this.name = device.name;
		this.host = device.host;
		this.mac = device.mac;
		this.volumeControl = device.volumeControl;
		this.switchInfoMenu = device.switchInfoMenu;
		this.supportOldWebOs = device.supportOldWebOs;
		this.inputs = device.inputs;

		//get Device info
		this.manufacturer = device.manufacturer || 'LG Electronics';
		this.modelName = device.modelName || 'homebridge-lgwebos-tv';
		this.serialNumber = device.serialNumber || 'SN0000004';
		this.firmwareRevision = device.firmwareRevision || 'FW0000004';

		//setup variables
		this.inputReferences = new Array();
		this.channelReferences = new Array();
		this.connectionStatus = false;
		this.currentPowerState = false;
		this.currentMuteState = false;
		this.currentVolume = 0;
		this.currentInputReference = null;
		this.currentChannelReference = null;
		this.currentChannelName = null;
		this.isPaused = false;
		this.prefDir = path.join(api.user.storagePath(), 'lgwebosTv');
		this.keyFile = this.prefDir + '/' + 'key_' + this.host.split('.').join('');
		this.systemFile = this.prefDir + '/' + 'system_' + this.host.split('.').join('');
		this.softwareFile = this.prefDir + '/' + 'software_' + this.host.split('.').join('');
		this.servicesFile = this.prefDir + '/' + 'services_' + this.host.split('.').join('');
		this.appsFile = this.prefDir + '/' + 'apps_' + this.host.split('.').join('');
		this.inputsFile = this.prefDir + '/' + 'inputs_' + this.host.split('.').join('');
		this.channelsFile = this.prefDir + '/' + 'channels_' + this.host.split('.').join('');
		this.url = 'ws://' + this.host + ':' + WEBSOCKET_PORT;

		this.lgtv = new lgtv({
			url: this.url,
			timeout: 5000,
			reconnect: 3000,
			keyFile: this.keyFile
		});

		//check if prefs directory ends with a /, if not then add it
		if (this.prefDir.endsWith('/') === false) {
			this.prefDir = this.prefDir + '/';
		}

		//check if the directory exists, if not then create it
		if (fs.existsSync(this.prefDir) === false) {
			mkdirp(this.prefDir);
		}

		//Check net statek
		setInterval(function () {
			var me = this;
			tcpp.probe(me.host, WEBSOCKET_PORT, (error, isAlive) => {
				if (!isAlive && me.connectionStatus) {
					me.log.debug('Device: %s %s, state: Offline', me.host, me.name);
					me.connectionStatus = false;
					me.disconnect();
				} else {
					if (isAlive && !me.connectionStatus) {
						me.log('Device: %s %s, state: Online.', me.host, me.name);
						me.lgtv.connect(me.url);
					}
				}
			});
		}.bind(this), 5000);

		this.lgtv.on('connect', () => {
			this.log.debug('Device: %s %s, connected.', this.host, this.name);
			this.connectionStatus = true;
			this.connect();
		});

		this.lgtv.on('close', () => {
			this.log.debug('Device: %s %s, disconnected.', this.host, this.name);
			this.pointerInputSocket = null;
			this.connectionStatus = false;
			this.currentPowerState = false;
		});

		this.lgtv.on('error', (error) => {
			this.log.debug('Device: %s %s, error: %s', this.host, this.name, error);
		});

		this.lgtv.on('prompt', () => {
			this.log('Device: %s %s, waiting on confirmation...', this.host, this.name);
			this.connectionStatus = false;
		});

		this.lgtv.on('connecting', () => {
			this.log.debug('Device: %s %s, connecting...', this.host, this.name);
			this.connectionStatus = false;
		});

		//Delay to wait for device info before publish
		setTimeout(this.prepareTelevisionService.bind(this), 1000);
	}

	connect() {
		this.log('Device: %s %s, connected.', this.host, this.name);
		this.getDeviceInfo();
		this.getDeviceState();
		this.connectToPointerInputSocket();
	}

	disconnect() {
		this.log('Device: %s %s, disconnected.', this.host, this.name);
		this.lgtv.disconnect();
	}

	connectToPointerInputSocket() {
		this.log.debug('Device: %s %s, connecting to RCsocket', this.host, this.name);
		this.lgtv.getSocket('ssap://com.webos.service.networkinput/getPointerInputSocket', (error, sock) => {
			if (!error) {
				this.pointerInputSocket = sock;
			}
			this.log('Device: %s %s, get RC socket successful', this.host, this.name);
		});
	}

	getDeviceInfo() {
		var me = this;
		setTimeout(() => {
			me.log.debug('Device: %s %s, requesting Device information.', me.host, me.name);
			me.lgtv.request('ssap://system/getSystemInfo', (error, data) => {
				if (!data || error || data.errorCode) {
					me.log.debug('Device: %s %s, get System info error: %s', me.host, me.name, error);
					return;
				} else {
					delete data['returnValue'];
					me.log.debug('Device: %s %s, get System info successful: %s', me.host, me.name, JSON.stringify(data, null, 2));
					me.manufacturer = 'LG Electronics';
					me.modelName = data.modelName;
					if (fs.existsSync(me.systemFile) === false) {
						fs.writeFile(me.systemFile, JSON.stringify(data), (error) => {
							if (error) {
								me.log.debug('Device: %s %s, could not write systemFile, error: %s', me.host, me.name, error);
							} else {
								me.log.debug('Device: %s %s, systemFile saved successful', me.host, me.name);
							}
						});
					} else {
						me.log.debug('Device: %s %s, systemFile already exists, not saving', me.host, me.name);
					}
				}
			});

			me.lgtv.request('ssap://com.webos.service.update/getCurrentSWInformation', (error, data) => {
				if (!data || error || data.errorCode) {
					me.log.debug('Device: %s %s, get Software info error: %s', me.host, me.name, error);
				} else {
					delete data['returnValue'];
					me.log.debug('Device: %s %s, get Software info successful: %s', me.host, me.name, JSON.stringify(data, null, 2));
					me.productName = data.product_name;
					me.serialNumber = data.device_id;
					me.firmwareRevision = data.minor_ver;
					if (fs.existsSync(me.softwareFile) === false) {
						fs.writeFile(me.softwareFile, JSON.stringify(data), (error) => {
							if (error) {
								me.log.debug('Device: %s %s, could not write softwareFile, error: %s', me.host, me.name, error);
							} else {
								me.log.debug('Device: %s %s, softwareFile saved successful', me.host, me.name);
							}
						});
					} else {
						me.log.debug('Device: %s %s, softwareFile already exists, not saving', me.host, me.name);
					}
				}
			});

			me.lgtv.request('ssap://api/getServiceList', (error, data) => {
				if (!data || error || data.errorCode) {
					me.log.debug('Device: %s %s, get Services list error: %s', me.host, error);
				} else {
					delete data['returnValue'];
					me.log.debug('Device: %s %s, get Services list successful: %s', me.host, me.name, JSON.stringify(data, null, 2));
					if (fs.existsSync(me.servicesFile) === false) {
						fs.writeFile(me.servicesFile, JSON.stringify(data), (error) => {
							if (error) {
								me.log.debug('Device: %s %s, could not write servicesFile, error: %s', me.host, error);
							} else {
								me.log.debug('Device: %s %s, servicesFile saved successful', me.host, me.name);
							}
						});
					} else {
						me.log.debug('Device: %s %s, servicesFile already exists, not saving', me.host, me.name);
					}
				}
			});

			me.lgtv.request('ssap://com.webos.applicationManager/listApps', (error, data) => {
				if (!data || error || data.errorCode) {
					me.log.debug('Device: %s %s, get Apps list error: %s', me.host, me.name, error);
				} else {
					delete data['returnValue'];
					me.log.debug('Device: %s %s, get Apps list successful: %s', me.host, me.name, JSON.stringify(data, null, 2));
					if (fs.existsSync(me.appsFile) === false) {
						fs.writeFile(me.appsFile, JSON.stringify(data), (error) => {
							if (error) {
								me.log.debug('Device: %s %s, could not write appsFile, error: %s', me.host, me.name, error);
							} else {
								me.log.debug('Device: %s %s, appsFile saved successful', me.host, me.name);
							}
						});
					} else {
						me.log.debug('Device: %s %s, appsFile already exists, not saving', me.host, me.name);
					}
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
			}, 250);
		}, 250);
	}

	getDeviceState() {
		var me = this;
		me.lgtv.subscribe('ssap://com.webos.service.tvpower/power/getPower', (error, data) => {
			if (!data || error || data.length <= 0) {
				me.log.error('Device: %s %s, get current Power state error: %s.', me.host, me.name, error);
			} else {
				let statePixelRefresh = (data.state === 'Active Standby');
				if (statePixelRefresh) {
					me.disconnect();
				} else {
					let state = (((data.state === 'Active') || (data.processing === 'Active') || (data.powerOnReason === 'Active')) && (data.state !== 'Active Standby'))
					let powerState = me.supportOldWebOs ? !state : state;
					if (me.televisionService) {
						me.televisionService.getCharacteristic(Characteristic.Active).updateValue(powerState);
						me.log('Device: %s %s, get current Power state successful: %s', me.host, me.name, powerState ? 'ON' : 'STANDBY');
					}
					me.currentPowerState = powerState;
				}
			}
		});

		me.lgtv.subscribe('ssap://tv/getCurrentChannel', (error, data) => {
			if (!data || error) {
				me.log.error('Device: %s %s, get current Channel and Name error: %s.', me.host, me.name, error);
			} else {
				let channelReference = data.channelNumber;
				let channelName = data.channelName;
				if (me.televisionService && data.changed) {
					if (me.channelReferences && me.channelReferences.length > 0) {
						let inputIdentifier = me.channelReferences.indexOf(channelReference);
						//me.televisionService.getCharacteristic(Characteristic.ActiveIdentifier).updateValue(inputIdentifier);
						me.log('Device: %s %s, get current Channel successful: %s, %s', me.host, me.name, channelReference, channelName);
					}
				}
				me.currentChannelReference = channelReference
				me.currentChannelName = channelName;
			}
		});

		me.lgtv.subscribe('ssap://com.webos.applicationManager/getForegroundAppInfo', (error, data) => {
			if (!data || error) {
				me.log.error('Device: %s %s, get current App error: %s.', me.host, me.name, error);
			} else {
				let inputReference = data.appId;
				if (me.televisionService) {
					if (me.inputReferences && me.inputReferences.length > 0) {
						let inputIdentifier = me.inputReferences.indexOf(inputReference);
						me.televisionService.getCharacteristic(Characteristic.ActiveIdentifier).updateValue(inputIdentifier);
						me.log('Device: %s %s, get current Input successful: %s', me.host, me.name, inputReference);
					}
				}
				me.currentInputReference = inputReference;
			}
		});

		me.lgtv.subscribe('ssap://audio/getVolume', (error, data) => {
			if (!data || error) {
				me.log.error('Device: %s %s, get current Audio state error: %s.', me.host, me.name, error);
			} else {
				let muteState = me.currentPowerState ? data.muted : true;
				let volume = data.volume;
				if (me.speakerService) {
					me.speakerService.getCharacteristic(Characteristic.Mute).updateValue(muteState);
					me.speakerService.getCharacteristic(Characteristic.Volume).updateValue(volume);
					if (me.volumeControl && me.volumeService) {
						me.volumeService.getCharacteristic(Characteristic.On).updateValue(!muteState);
						me.volumeService.getCharacteristic(Characteristic.Brightness).updateValue(volume);
					}
					me.log('Device: %s %s, get current Mute state: %s', me.host, me.name, muteState ? 'ON' : 'OFF');
					me.log('Device: %s %s, get current Volume level: %s', me.host, me.name, volume);
				}
				me.currentMuteState = muteState;
				me.currentVolume = volume;
			}
		});
	}


	//Prepare TV service 
	prepareTelevisionService() {
		this.log.debug('prepareTelevisionService');
		this.UUID = UUIDGen.generate(this.name)
		this.accessory = new Accessory(this.name, this.UUID, Categories.TELEVISION);

		this.televisionService = new Service.Television(this.name, 'televisionService');
		this.televisionService.setCharacteristic(Characteristic.ConfiguredName, this.name);
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

		this.televisionService.getCharacteristic(Characteristic.PictureMode)
			.on('set', this.setPictureMode.bind(this));


		this.accessory
			.getService(Service.AccessoryInformation)
			.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
			.setCharacteristic(Characteristic.Model, this.modelName)
			.setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
			.setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);

		this.accessory.addService(this.televisionService);
		this.prepareSpeakerService();
		this.prepareInputsService();
		if (this.volumeControl) {
			this.prepareVolumeService();
		}

		this.log.debug('Device: %s %s, publishExternalAccessories.', this.host, this.name);
		this.api.publishExternalAccessories('homebridge-lgwebos-tv', [this.accessory]);
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
			.on('get', this.getMuteSlider.bind(this));
		this.volumeService.getCharacteristic(Characteristic.Brightness)
			.on('get', this.getVolume.bind(this))
			.on('set', this.setVolume.bind(this));

		this.accessory.addService(this.volumeService);
		this.televisionService.addLinkedService(this.volumeService);
	}

	//Prepare inputs services
	prepareInputsService() {
		this.log.debug('prepareInputsService');
		if (this.inputs === undefined || this.inputs === null || this.inputs.length <= 0) {
			return;
		}

		if (Array.isArray(this.inputs) === false) {
			this.inputs = [this.inputs];
		}

		let savedNames = {};
		try {
			savedNames = JSON.parse(fs.readFileSync(this.inputsFile));
		} catch (error) {
			this.log.debug('Device: %s %s, read inputsFile failed, error: %s', this.host, this.name, error)
		}

		this.inputs.forEach((input, i) => {

			//get input reference
			let inputReference = null;

			if (input.reference !== undefined) {
				inputReference = input.reference;
			} else {
				inputReference = input;
			}

			//get input name		
			let inputName = inputReference;

			if (savedNames && savedNames[inputReference]) {
				inputName = savedNames[inputReference];
			} else {
				if (input.name) {
					inputName = input.name;
				}
			}

			//if reference not null or empty add the input
			if (inputReference !== undefined && inputReference !== null || inputReference !== '') {
				inputReference = inputReference.replace(/\s/g, ''); // remove all white spaces from the string

				let tempInput = new Service.InputSource(inputReference, 'input' + i);
				tempInput
					.setCharacteristic(Characteristic.Identifier, i)
					.setCharacteristic(Characteristic.ConfiguredName, inputName)
					.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
					.setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.TV)
					.setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN);

				tempInput
					.getCharacteristic(Characteristic.ConfiguredName)
					.on('set', (newInputName, callback) => {
						this.inputs[inputReference] = newInputName;
						fs.writeFile(this.inputsFile, JSON.stringify(this.inputs), (error) => {
							if (error) {
								this.log.debug('Device: %s %s, new Input name saved failed, error: %s', this.host, this.name, error);
							} else {
								this.log('Device: %s %s, new Input name saved successful, name: %s reference: %s', this.host, this.name, newInputName, inputReference);
							}
						});
						callback(null, newInputName);
					});
				this.accessory.addService(tempInput);
				this.televisionService.addLinkedService(tempInput);
				this.inputReferences.push(inputReference);
			}
		});
	}

	getPower(callback) {
		var me = this;
		let state = me.currentPowerState;
		me.log.debug('Device: %s %s, get current Power state successfull, state: %s', me.host, me.name, state ? 'ON' : 'STANDBY');
		callback(null, state);
	}

	setPower(state, callback) {
		var me = this;
		if (state !== me.currentPowerState) {
			if (state) {
				wol.wake(me.mac, (error) => {
					if (error) {
						me.log.debug('Device: %s %s, can not set new Power state. Might be due to a wrong settings in config, error: %s', me.host, error);
						callback(error);
					} else {
						me.log('Device: %s %s, set new Power state successful: %s', me.host, me.name, state ? 'ON' : 'STANDBY');
					}
				});
			} else {
				me.lgtv.request('ssap://system/turnOff', (error, data) => {
					me.log('Device: %s %s, set new Power state successful: %s', me.host, me.name, state ? 'ON' : 'STANDBY');
					me.disconnect();
				});
			}
			callback(null)
		}
	}

	getMute(callback) {
		var me = this;
		let state = me.currentPowerState ? me.currentMuteState : true;
		me.log.debug('Device: %s %s, get current Mute state successful: %s', me.host, me.name, state ? 'ON' : 'OFF');
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
		if (state !== me.currentMuteState) {
			let newState = state;
			me.lgtv.request('ssap://audio/setMute', { mute: newState });
			me.log('Device: %s %s, set new Mute state successful: %s', me.host, me.name, state ? 'ON' : 'OFF');
			callback(null, state);
		}
	}

	getVolume(callback) {
		var me = this;
		let volume = me.currentVolume;
		me.log.debug('Device: %s %s, get current Volume level successful: %s', me.host, volume);
		callback(null, volume);
	}

	setVolume(volume, callback) {
		var me = this;
		this.lgtv.request('ssap://audio/setVolume', { volume: volume });
		me.log('Device: %s %s, set new Volume level successful: %s', me.host, me.name, volume);
		callback(null, volume);
	}


	getInput(callback) {
		var me = this;
		let inputReference = me.currentInputReference;
		if (!me.connectionStatus || inputReference === undefined || inputReference === null) {
			me.televisionService
				.getCharacteristic(Characteristic.ActiveIdentifier)
				.updateValue(0);
			callback(null);
		} else {
			let inputIdentifier = me.inputReferences.indexOf(inputReference);
			if (inputReference === me.inputReferences[inputIdentifier]) {
				me.televisionService
					.getCharacteristic(Characteristic.ActiveIdentifier)
					.updateValue(inputIdentifier);
				me.log.debug('Device: %s %s, get current Input successful: %s', me.host, me.name, inputReference);
			}
			callback(null, inputIdentifier);
		}
	}

	setInput(inputIdentifier, callback) {
		var me = this;
		let inputReference = me.inputReferences[inputIdentifier];
		if (inputReference !== me.currentInputReference) {
			me.lgtv.request('ssap://system.launcher/launch', { id: inputReference });
			me.log('Device: %s %s, set new Input successful: %s', me.host, me.name, inputReference);
			callback(null, inputIdentifier);
		}
	}

	getChannel(callback) {
		var me = this;
		let channelReference = me.currentChannelReference;
		if (!me.connectionStatus || channelReference === undefined || channelReference === null) {
			me.televisionService
				.getCharacteristic(Characteristic.ActiveIdentifier)
				.updateValue(0);
			callback(null);
		} else {
			let inputIdentifier = me.channelReferences.indexOf(channelReference);
			if (channelReference === me.channelReferences[inputIdentifier]) {
				me.televisionService
					.getCharacteristic(Characteristic.ActiveIdentifier)
					.updateValue(inputIdentifier);
				me.log.debug('Device: %s %s, get current Channel successful: %s', me.host, me.name, channelReference);
			}
			callback(null, inputIdentifier);
		}
	}

	setChannel(inputIdentifier, callback) {
		var me = this;
		let channelReference = me.channelReferences[inputIdentifier];
		if (channelReference !== me.currentChannelReference) {
			this.lgtv.request('ssap://tv/openChannel', { channelNumber: channelReference });
			me.log('Device: %s %s, set new Channel successful: %s', me.host, me.name, channelReference);
			callback(null, inputIdentifier);
		}
	}

	setPictureMode(remoteKey, callback) {
		var me = this;
		let command;
		switch (remoteKey) {
			case Characteristic.PictureMode.OTHER:
				command = 'INFO';
				break;
			case Characteristic.PictureMode.STANDARD:
				command = 'BACK';
				break;
			case Characteristic.PictureMode.CALIBRATED:
				command = 'INFO';
				break;
			case Characteristic.PictureMode.CALIBRATED_DARK:
				command = 'BACK';
				break;
			case Characteristic.PictureMode.VIVID:
				command = 'INFO';
				break;
			case Characteristic.PictureMode.GAME:
				command = 'BACK';
				break;
			case Characteristic.PictureMode.COMPUTER:
				command = 'INFO';
				break;
			case Characteristic.PictureMode.CUSTOM:
				command = 'BACK';
				break;
		}
		this.pointerInputSocket.send('button', { name: command });
		me.log('Device: %s %s, setPictureMode successful, remoteKey: %s, command: %s', me.host, me.name, remoteKey, command);
		callback(null, remoteKey);
	}

	setPowerModeSelection(remoteKey, callback) {
		var me = this;
		let command;
		switch (remoteKey) {
			case Characteristic.PowerModeSelection.SHOW:
				command = me.switchInfoMenu ? 'MENU' : 'INFO';
				break;
			case Characteristic.PowerModeSelection.HIDE:
				command = 'BACK';
				break;
		}
		this.pointerInputSocket.send('button', { name: command });
		me.log('Device: %s %s, setPowerModeSelection successful, remoteKey: %s, command: %s', me.host, me.name, remoteKey, command);
		callback(null, remoteKey);
	}

	setVolumeSelector(remoteKey, callback) {
		var me = this;
		let command;
		switch (remoteKey) {
			case Characteristic.VolumeSelector.INCREMENT:
				command = 'VOLUMEUP';
				break;
			case Characteristic.VolumeSelector.DECREMENT:
				command = 'VOLUMEDOWN';
				break;
		}
		this.pointerInputSocket.send('button', { name: command });
		me.log('Device: %s %s, setVolumeSelector successful, remoteKey: %s, command: %s', me.host, me.name, remoteKey, command);
		callback(null, remoteKey);
	}

	setRemoteKey(remoteKey, callback) {
		var me = this;
		let command;
		switch (remoteKey) {
			case Characteristic.RemoteKey.REWIND:
				command = 'REWIND';
				break;
			case Characteristic.RemoteKey.FAST_FORWARD:
				command = 'FASTFORWARD';
				break;
			case Characteristic.RemoteKey.NEXT_TRACK:
				command = '';
				break;
			case Characteristic.RemoteKey.PREVIOUS_TRACK:
				command = '';
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
				if (me.isPaused) {
					command = 'PLAY';
				} else {
					command = 'PAUSE';
				}
				me.isPaused = !me.isPaused;
				break;
			case Characteristic.RemoteKey.INFORMATION:
				command = me.switchInfoMenu ? 'MENU' : 'INFO';
				break;
		}
		this.pointerInputSocket.send('button', { name: command });
		me.log('Device: %s %s, setRemoteKey successful, remoteKey: %s, command: %s', me.host, me.name, remoteKey, command);
		callback(null, remoteKey);
	}

};
