'use strict';

const fs = require('fs');
const mkdirp = require('mkdirp');
const lgtv = require('lgtv2');
const wol = require('wol');
const tcpp = require('tcp-ping');
const path = require('path');

let Accessory, Service, Characteristic, UUIDGen;
let pointerInputSocket;

module.exports = homebridge => {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	Accessory = homebridge.platformAccessory;
	UUIDGen = homebridge.hap.uuid;

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
		this.port = 3000;
		this.mac = device.mac;
		this.switchInfoMenu = device.switchInfoMenu;
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
		this.url = 'ws://' + this.host + ':' + this.port;

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

		//Check net state
		setInterval(function () {
			var me = this;
			tcpp.probe(me.host, me.port, (error, isAlive) => {
				if (!isAlive && me.connectionStatus) {
					me.log('Device: %s, name: %s, state: Offline', me.host, me.name);
					me.connectionStatus = false;
					me.disconnect();
				} else {
					if (isAlive && !me.connectionStatus) {
						me.log('Device: %s, name: %s, state: Online.', me.host, me.name);
						me.lgtv.connect(me.url);
					}
				}
			});
		}.bind(this), 5000);

		this.lgtv.on('connect', () => {
			this.log.debug('Device: %s, connected.', this.host);
			this.connect();
		});

		this.lgtv.on('close', () => {
			this.log.debug('Device: %s, disconnected.', this.host);
			this.pointerInputSocket = null;
			this.connectionStatus = false;
		});

		this.lgtv.on('error', (error) => {
			this.log.error('Device: %s, error: %s', this.host, error);
		});

		this.lgtv.on('prompt', () => {
			this.log.info('Device: %s, waiting on confirmation...', this.host);
			this.connectionStatus = false;
		});

		this.lgtv.on('connecting', () => {
			this.log.debug('Device: %s, connecting...', this.host);
			this.connectionStatus = false;
		});

		//Delay to wait for device info before publish
		setTimeout(this.prepareTvService.bind(this), 1000);
	}

	connect() {
		this.log.info('Device: %s, connected.', this.host);
		this.connectionStatus = true;
		this.getDeviceInfo();
		this.getDeviceState();
		this.connectToPointerInputSocket();
	}

	disconnect() {
		this.log.info('Device: %s, disconnected.', this.host);
		this.lgtv.disconnect();
		this.connectionStatus = false;
	}

	connectToPointerInputSocket() {
		var me = this;
		me.log.debug('Device: %s, connecting to RCsocket', me.host);
		me.lgtv.getSocket('ssap://com.webos.service.networkinput/getPointerInputSocket', (error, sock) => {
			if (!error) {
				me.pointerInputSocket = sock;
			}
			me.log.info('Device: %s, get RC socket succesful', me.host);
		});
	}

	getDeviceInfo() {
		var me = this;
		setTimeout(() => {
			me.log.debug('Device: %s, requesting information from: %s', me.host, me.name);
			me.lgtv.request('ssap://system/getSystemInfo', (error, data) => {
				if (!data || error || data.errorCode) {
					me.log.debug('Device: %s, get System info error: %s', me.host, error);
					return;
				} else {
					delete data['returnValue'];
					me.log.debug('Device: %s, get System info successful: %s', me.host, JSON.stringify(data, null, 2));
					me.manufacturer = 'LG Electronics';
					me.modelName = data.modelName;
					if (fs.existsSync(me.systemFile) === false) {
						fs.writeFile(me.systemFile, JSON.stringify(data), (error) => {
							if (error) {
								me.log.debug('Device: %s, could not write systemFile, error: %s', me.host, error);
							} else {
								me.log.debug('Device: %s, systemFile saved successful', me.host);
							}
						});
					} else {
						me.log.debug('Device: %s, systemFile already exists, not saving', me.host);
					}
				}
			});

			me.lgtv.request('ssap://com.webos.service.update/getCurrentSWInformation', (error, data) => {
				if (!data || error || data.errorCode) {
					me.log.debug('Device: %s, get Software info error: %s', me.host, error);
				} else {
					delete data['returnValue'];
					me.log.debug('Device: %s, get Software info successful: %s', me.host, JSON.stringify(data, null, 2));
					me.productName = data.product_name;
					me.serialNumber = data.device_id;
					me.firmwareRevision = data.minor_ver;
					if (fs.existsSync(me.softwareFile) === false) {
						fs.writeFile(me.softwareFile, JSON.stringify(data), (error) => {
							if (error) {
								me.log.debug('Device: %s, could not write softwareFile, error: %s', me.host, error);
							} else {
								me.log.debug('Device: %s, softwareFile saved successful', me.host);
							}
						});
					} else {
						me.log.debug('Device: %s, softwareFile already exists, not saving', me.host);
					}
				}
			});

			me.lgtv.request('ssap://api/getServiceList', (error, data) => {
				if (!data || error || data.errorCode) {
					me.log.debug('Device: %s, get Services list error: %s', me.host, error);
				} else {
					delete data['returnValue'];
					me.log.debug('Device: %s, get Services list successful: %s', me.host, JSON.stringify(data, null, 2));
					if (fs.existsSync(me.servicesFile) === false) {
						fs.writeFile(me.servicesFile, JSON.stringify(data), (error) => {
							if (error) {
								me.log.debug('Device: %s, could not write servicesFile, error: %s', me.host, error);
							} else {
								me.log.debug('Device: %s, servicesFile saved successful', me.host);
							}
						});
					} else {
						me.log.debug('Device: %s, servicesFile already exists, not saving', me.host);
					}
				}
			});

			me.lgtv.request('ssap://com.webos.applicationManager/listApps', (error, data) => {
				if (!data || error || data.errorCode) {
					me.log.debug('Device: %s, get Apps list error: %s', me.host, error);
				} else {
					delete data['returnValue'];
					me.log.debug('Device: %s, get Apps list successful: %s', me.host, JSON.stringify(data, null, 2));
					if (fs.existsSync(me.appsFile) === false) {
						fs.writeFile(me.appsFile, JSON.stringify(data), (error) => {
							if (error) {
								me.log.debug('Device: %s, could not write appsFile, error: %s', me.host, error);
							} else {
								me.log.debug('Device: %s, appsFile saved successful', me.host);
							}
						});
					} else {
						me.log.debug('Device: %s, appsFile already exists, not saving', me.host);
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
		me.lgtv.subscribe('ssap://com.webos.service.tvpower/power/getPowerState', (error, data) => {
			if (!data || error || data.length <= 0) {
				me.log.error('Device: %s, get current Power state error: %s.', me.host, error);
			} else {
				var state = (((data.state == 'Active') || (data.processing == 'Active') || (data.powerOnReason == 'Active')) && (data.state != 'Active Standby'));
				me.log.info('Device: %s, get current Power state successful: %s', me.host, state ? 'ON' : 'STANDBY');
				me.currentPowerState = state;
			}
		});

		me.lgtv.subscribe('ssap://com.webos.applicationManager/getForegroundAppInfo', (error, data) => {
			if (!data || error) {
				me.log.error('Device: %s, get current App error: %s.', me.host, error);
			} else {
				me.currentInputReference = data.appId;
				me.log('Device: %s, get current App reference successful: %s', me.host, me.currentInputReference);
			}
		});

		me.lgtv.subscribe('ssap://audio/getVolume', (error, data) => {
			if (!data || error) {
				me.log.error('Device: %s, get current Audio state error: %s.', me.host, error);
			} else {
				me.currentMuteState = data.muted;
				if (data.changed && data.changed.indexOf('muted') !== -1)
					me.log.info('Device: %s, get current Mute state: %s', me.host, me.currentMuteState ? 'ON' : 'OFF');
				me.currentVolume = data.volume;
				if (data.changed && data.changed.indexOf('volume') !== -1)
					me.log.info('Device: %s, get current Volume level: %s', me.host, me.currentVolume);
			}
		});

		me.lgtv.subscribe('ssap://tv/getCurrentChannel', (error, data) => {
			if (!data || error) {
				me.log.error('Device: %s, get current Channel and Name error: %s.', me.host, error);
			} else {
				me.currentChannelReference = data.channelNumber;
				me.currentChannelName = data.channelName;
				me.log('Device: %s, get current Channel successful: %s, %s', me.host, me.currentChannelReference, me.currentChannelName);

			}
		});
	}

	//Prepare TV service 
	prepareTvService() {
		this.log.debug('prepereTvService');
		this.tvAccesory = new Accessory(this.name, UUIDGen.generate(this.name));

		this.tvService = new Service.Television(this.name, 'tvService');
		this.tvService.setCharacteristic(Characteristic.ConfiguredName, this.name);
		this.tvService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.tvService.getCharacteristic(Characteristic.Active)
			.on('get', this.getPowerState.bind(this))
			.on('set', this.setPowerState.bind(this));

		this.tvService.getCharacteristic(Characteristic.ActiveIdentifier)
			.on('get', this.getInput.bind(this))
			.on('set', (inputIdentifier, callback) => {
				this.setInput(callback, this.inputReferences[inputIdentifier]);
			});

		this.tvService.getCharacteristic(Characteristic.RemoteKey)
			.on('set', this.setRemoteKey.bind(this));

		this.tvService.getCharacteristic(Characteristic.PowerModeSelection)
			.on('set', this.setPowerModeSelection.bind(this));

		this.tvService.getCharacteristic(Characteristic.PictureMode)
			.on('set', this.setPictureMode.bind(this));


		this.tvAccesory
			.getService(Service.AccessoryInformation)
			.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
			.setCharacteristic(Characteristic.Model, this.modelName)
			.setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
			.setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);

		this.tvAccesory.addService(this.tvService);
		this.prepereTvSpeakerService();
		this.prepareInputServices();

		this.log.debug('Device: %s, publishExternalAccessories: %s', this.host, this.name);
		this.api.publishExternalAccessories('homebridge-lgwebos-tv', [this.tvAccesory]);
	}

	//Prepare speaker service
	prepereTvSpeakerService() {
		this.log.debug('prepereTvSpeakerService');
		this.tvSpeakerService = new Service.TelevisionSpeaker(this.name, 'tvSpeakerService');
		this.tvSpeakerService
			.setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
			.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
		this.tvSpeakerService.getCharacteristic(Characteristic.VolumeSelector)
			.on('set', this.setVolumeSelector.bind(this));
		this.tvSpeakerService.getCharacteristic(Characteristic.Volume)
			.on('get', this.getVolume.bind(this))
			.on('set', this.setVolume.bind(this));
		this.tvSpeakerService.getCharacteristic(Characteristic.Mute)
			.on('get', this.getMute.bind(this))
			.on('set', this.setMute.bind(this));

		this.tvAccesory.addService(this.tvSpeakerService);
		this.tvService.addLinkedService(this.tvSpeakerService);
	}

	//Prepare inputs services
	prepareInputServices() {
		this.log.debug('prepareInputServices');
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
			this.log.debug('Device: %s, read inputsFile failed, error: %s', this.host, error)
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
			if (inputReference !== undefined && inputReference !== null) {
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
								this.log.debug('Device: %s, new Input name saved failed, error: %s', this.host, error);
							} else {
								this.log('Device: %s, new Input name saved successful, name: %s reference: %s', this.host, newInputName, inputReference);
							}
						});
						callback();
					});
				this.tvAccesory.addService(tempInput);
				this.tvService.addLinkedService(tempInput);
				this.inputReferences.push(inputReference);
			}
		});
	}

	getPowerState(callback) {
		var me = this;
		var state = me.currentPowerState;
		me.log('Device: %s, get current Power state successfull, state: %s', me.host, state ? 'ON' : 'STANDBY');
		callback(null, state);
	}

	setPowerState(state, callback) {
		var me = this;
		me.getPowerState(function (error, currentPowerState) {
			if (error) {
				me.log.debug('Device: %s, can not get current Power state. Might be due to a wrong settings in config, error: %s', me.host, error);
				callback(error);
			} else {
				if (state !== currentPowerState) {
					if (state) {
						wol.wake(me.mac, (error) => {
							if (error) {
								me.log.debug('Device: %s, can not set new Power state. Might be due to a wrong settings in config, error: %s', me.host, error);
								callback(error);
							} else {
								me.log('Device: %s, set new Power state successful: ON', me.host);
								me.currentPowerState = true;
							}
						});
					} else {
						me.lgtv.request('ssap://system/turnOff', (error, data) => {
							me.log('Device: %s, set new Power state successful: STANDBY', me.host);
							me.currentPowerState = false;
							me.disconnect();
						});
					}
					callback(null);
				}
			}
		});
	}

	getMute(callback) {
		var me = this;
		var state = me.currentMuteState;
		me.log('Device: %s, get current Mute state successful: %s', me.host, state ? 'ON' : 'OFF');
		callback(null, state);
	}

	setMute(state, callback) {
		var me = this;
		me.getMute(function (error, currentMuteState) {
			if (error) {
				me.log.debug('Device: %s, can not get current Mute for new state. Might be due to a wrong settings in config, error: %s', me.host, error);
				callback(error);
			} else {
				if (state !== currentMuteState) {
					var newState = state;
					me.lgtv.request('ssap://audio/setMute', { mute: newState });
					me.log('Device: %s, set new Mute state successful: %s', me.host, state ? 'ON' : 'OFF');
					me.currentMuteState = state;
					callback(null, state);
				}
			}
		});
	}

	getVolume(callback) {
		var me = this;
		var volume = me.currentVolume;
		me.log('Device: %s, get current Volume level successful: %s', me.host, volume);
		callback(null, volume);
	}

	setVolume(volume, callback) {
		var me = this;
		this.lgtv.request('ssap://audio/setVolume', { volume: volume });
		me.log('Device: %s, set new Volume level successful: %s', me.host, volume);
		callback(null, volume);
	}

	getInput(callback) {
		var me = this;
		if (!me.currentPowerState) {
			me.tvService
				.getCharacteristic(Characteristic.ActiveIdentifier)
				.updateValue(0);
			callback(null);
		} else {
			var inputReference = me.currentInputReference;
			for (let i = 0; i < me.inputReferences.length; i++) {
				if (inputReference === me.inputReferences[i]) {
					me.tvService
						.getCharacteristic(Characteristic.ActiveIdentifier)
						.updateValue(i);
					me.log('Device: %s, get current Input successful: %s', me.host, inputReference);
					me.currentInputReference = inputReference;
				}
			}
			callback(null);
		}
	}


	setInput(callback, inputReference) {
		var me = this;
		me.getInput(function (error, currentInputReference) {
			if (error) {
				me.log.debug('Device: %s, can not get current Input. Might be due to a wrong settings in config, error: %s', me.host, error);
				callback(error);
			} else {
				if (inputReference !== currentInputReference) {
					me.lgtv.request('ssap://system.launcher/launch', { id: inputReference });
					me.log('Device: %s, set new Input successful: %s', me.host, inputReference);
					me.currentInputReference = inputReference;
					callback(null);
				}
			}
		});
	}

	getChannel(callback) {
		var me = this;
		if (!me.currentPowerState) {
			me.tvService
				.getCharacteristic(Characteristic.ActiveIdentifier)
				.updateValue(0);
			callback(null);
		} else {
			var channelReference = me.currentChannelReference;
			for (let i = 0; i < me.channelReferences.length; i++) {
				if (channelReference === me.channelReferences[i]) {
					me.tvService
						.getCharacteristic(Characteristic.ActiveIdentifier)
						.updateValue(i);
					me.log('Device: %s, get current Channel successful: %s', me.host, channelReference);
					me.currentChannelReference = channelReference;
				}
			}
			callback(null);
		}
	}

	setChannel(channelReference, callback) {
		var me = this;
		me.getChannel(function (error, currentChannelReference) {
			if (error) {
				me.log.debug('Device: %s, can not get current Input. Might be due to a wrong settings in config, error: %s', me.host, error);
				callback(error);
			} else {
				if (channelReference !== currentChannelReference) {
					this.lgtv.request('ssap://tv/openChannel', { channelNumber: channelReference });
					me.log('Device: %s, set new Channel successful: %s', me.host, channelReference);
					me.currentChannelReference = channelReference;
					callback(null);
				}
			}
		});
	}

	setPictureMode(remoteKey, callback) {
		var me = this;
		var command;
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
		me.log('Device: %s, setPictureMode successful, remoteKey: %s, command: %s', me.host, remoteKey, command);
		callback(null, remoteKey);
	}

	setPowerModeSelection(remoteKey, callback) {
		var me = this;
		var command;
		switch (remoteKey) {
			case Characteristic.PowerModeSelection.SHOW:
				command = me.switchInfoMenu ? 'MENU' : 'INFO';
				break;
			case Characteristic.PowerModeSelection.HIDE:
				command = 'BACK';
				break;
		}
		this.pointerInputSocket.send('button', { name: command });
		me.log('Device: %s, setPowerModeSelection successful, remoteKey: %s, command: %s', me.host, remoteKey, command);
		callback(null, remoteKey);
	}

	setVolumeSelector(remoteKey, callback) {
		var me = this;
		var command;
		switch (remoteKey) {
			case Characteristic.VolumeSelector.INCREMENT:
				command = 'VOLUMEUP';
				break;
			case Characteristic.VolumeSelector.DECREMENT:
				command = 'VOLUMEDOWN';
				break;
		}
		this.pointerInputSocket.send('button', { name: command });
		me.log('Device: %s, setVolumeSelector successful, remoteKey: %s, command: %s', me.host, remoteKey, command);
		callback(null, remoteKey);
	}

	setRemoteKey(remoteKey, callback) {
		var me = this;
		var command;
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
		me.log('Device: %s, setRemoteKey successful, remoteKey: %s, command: %s', me.host, remoteKey, command);
		callback(null, remoteKey);
	}

};
