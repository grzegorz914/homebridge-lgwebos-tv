const ppath = require('persist-path');
const fs = require('fs');
const mkdirp = require('mkdirp');
const lgtv = require('lgtv2');
const wol = require('wol');
const tcpp = require('tcp-ping');
const responseDelay = 2000;

var Accessory, Service, Characteristic, hap, UUIDGen;


let pointerInputSocket;

module.exports = homebridge => {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	Accessory = homebridge.platformAccessory;
	UUIDGen = homebridge.hap.uuid;
	hap = homebridge.hap;

	homebridge.registerPlatform('homebridge-lgwebos-tv', 'lgWebOsTv', lgwebosTvPlatform, true);
};


class lgwebosTvPlatform {
	constructor(log, config, api) {
		this.log = log;
		this.config = config;
		this.api = api;

		this.devices = config.devices || [];
		this.tvAccessories = [];

		if (this.version < 2.1) {
			throw new Error('Unexpected API version.');
		}

		for (var i in this.devices) {
			this.tvAccessories.push(new lgwebosTvDevice(log, this.devices[i], api));
		}

		this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this));
	}
	configureAccessory() { }
	removeAccessory() { }
	didFinishLaunching() {
		var me = this;
		setTimeout(function () {
			me.log.debug('didFinishLaunching');
		},
			(this.devices.length + 1) * responseDelay);
	}
}

class lgwebosTvDevice {
	constructor(log, device, api) {
		this.log = log;
		this.api = api;
		this.port = 3000;

		//device configuration
		this.device = device;
		this.name = device.name;
		this.host = device.host;
		this.mac = device.mac;
		this.switchInfoMenu = device.switchInfoMenu;
		this.inputs = device.inputs;
		this.broadcastAdr = '255.255.255.255';

		//setup variables
		this.connectionStatus = false;
		this.inputReferences = new Array();
		this.channelReferences = new Array();
		this.currentPowerState = false;
		this.currentMuteState = false;
		this.currentVolume = 0;
		this.currentAppReference = '';
		this.currentChannelReference = '';
		this.currentChannelName = '';
		this.prefDir = ppath('lgwebosTv/');
		this.keyFile = this.prefDir + 'key_' + this.host.split('.').join('');
		this.devSysInfoFile = this.prefDir + 'sysinfo_' + this.host.split('.').join('');
		this.devSwInfoFile = this.prefDir + 'swinfo_' + this.host.split('.').join('');
		this.inputsFile = this.prefDir + 'inputs_' + this.host.split('.').join('');
		this.channelsFile = this.prefDir + 'channels_' + this.host.split('.').join('');

		//get Device info
		this.manufacturer = device.manufacturer || 'LG Electronics';
		this.modelName = device.model || 'homebridge-lgwebos-tv';
		this.serialNumber = device.serialNumber || 'SN0000004';
		this.firmwareRevision = device.firmwareRevision || 'FW0000004';

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
			this.checkDeviceState();
		}.bind(this), 5000);

		this.url = 'ws://' + this.host + ':' + this.port;

		this.lgtv = new lgtv({
			url: this.url,
			timeout: 5000,
			reconnect: 3000,
			keyFile: this.keyFile
		});

		this.lgtv.on('connect', () => {
			this.log.debug('Device: %s, connected.', this.host);
			this.connectionStatus = true;
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

		//Delay to wait for device info
		setTimeout(this.prepereTvService.bind(this), responseDelay);

		var deviceName = this.name + this.host;
		var uuid = UUIDGen.generate(deviceName);
		this.tvAccesory = new Accessory(deviceName, uuid, hap.Accessory.Categories.TV);
		this.log.debug('Device: %s, publishExternalAccessories: %s', this.host, this.name);
		this.api.publishExternalAccessories('homebridge-lgwebos-tv', [this.tvAccesory]);
	}

	connect() {
		this.log.info('Device: %s, connected.', this.host);
		this.getDeviceInfo();
		this.connectionStatus = true;
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
			me.log.info('Device: %s, get RC socket succesfull', me.host);
		});
	}

	getDeviceInfo() {
		var me = this;
		setTimeout(() => {
			me.log.debug('Device: %s, requesting TV information', me.host);
			me.lgtv.request('ssap://system/getSystemInfo', (error, data) => {
				if (!data || error || data.errorCode) {
					me.log.debug('Device: %s, get device Info error: %s', me.host, error);
				} else {
					delete data['returnValue'];
					me.log.debug('Device: %s, get device Info successfull: %s', me.host, JSON.stringify(data, null, 2));
					me.manufacturer = 'LG Electronics';
					me.modelName = data.modelName;
					if (fs.existsSync(me.devSysInfoFile) === false) {
						fs.writeFile(me.devSysInfoFile, JSON.stringify(data), (error) => {
							if (error) {
								me.log.debug('Device: %s, could not write devSysInfoFile, error: %s', me.host, error);
							} else {
								me.log.debug('Device: %s, devSysInfoFile saved successful', me.host);
							}
						});
					} else {
						me.log.debug('Device: %s, devSysInfoFile already exists, not saving', me.host);
					}
				}
			});

			me.lgtv.request('ssap://com.webos.service.update/getCurrentSWInformation', (error, data) => {
				if (!data || error || data.errorCode) {
					me.log.debug('Device: %s, get software Info error: %s', me.host, error);
				} else {
					delete data['returnValue'];
					me.log.debug('Device: %s, get software Info successful: %s', me.host, JSON.stringify(data, null, 2));
					me.productName = data.product_name;
					me.serialNumber = data.device_id;
					me.firmwareRevision = data.minor_ver;
					if (fs.existsSync(me.devSwInfoFile) === false) {
						fs.writeFile(me.devSwInfoFile, JSON.stringify(data), (error) => {
							if (error) {
								me.log.debug('Device: %s, could not write devSwInfoFile, error: %s', me.host, error);
							} else {
								me.log.debug('Device: %s, devSwInfoFile saved successful', me.host);
							}
						});
					} else {
						me.log.debug('Device: %s, devSwInfoFile already exists, not saving', me.host);
					}
				}
			});

			me.lgtv.request('ssap://api/getServiceList', (error, data) => {
				if (!data || error || data.errorCode) {
					me.log.debug('Device: %s, get Service list error: %s', me.host, error);
				} else {
					delete data['returnValue'];
					me.log.debug('Device: %s, get Service list successful: %s', me.host, JSON.stringify(data, null, 2));
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
			}, 300);

		}, 350);
	}

	getDeviceState() {
		var me = this;
		me.lgtv.subscribe('ssap://com.webos.service.tvpower/power/getPowerState', (error, data) => {
			if (!data || error || data.length <= 0) {
				me.log.error('Device: %s, get current Power state error: %s.', me.host, error);
			} else {
				me.currentPowerState = (((data.state == 'Active') || (data.processing == 'Active') || (data.powerOnReason == 'Active')) && (data.state != 'Active Standby'));
				me.log.info('Device: %s, get current Power state successful: %s', me.host, me.currentPowerState ? 'ON' : 'STANDBY');
				if (!me.currentPowerState) {
					me.connectionStatus = false;
					me.lgtv.disconnect();
				}
			}
		});

		me.lgtv.subscribe('ssap://com.webos.applicationManager/getForegroundAppInfo', (error, data) => {
			if (!data || error) {
				me.log.error('Device: %s, get current App error: %s.', me.host, error);
			} else {
				me.currentAppReference = data.appId;
				me.log('Device: %s, get current App reference successfull: %s', me.host, me.currentAppReference);
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
				me.log('Device: %s, get current Channel and Name successfull: %s, %s', me.host, me.currentChannelReference, me.currentChannelName);

			}
		});
	}

	//Prepare TV service 
	prepereTvService() {
		this.log.debug('prepereTvService');
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
			.on('set', this.remoteKeyPress.bind(this));

		this.tvService.getCharacteristic(Characteristic.PowerModeSelection)
			.on('set', this.setPowerMode.bind(this));


		this.tvAccesory
			.getService(Service.AccessoryInformation)
			.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
			.setCharacteristic(Characteristic.Model, this.modelName)
			.setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
			.setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);

		this.tvAccesory.addService(this.tvService);
		this.prepereTvSpeakerService();
		this.prepareInputServices();
	}

	//Prepare speaker service
	prepereTvSpeakerService() {
		this.log.debug('prepereTvSpeakerService');
		this.tvSpeakerService = new Service.TelevisionSpeaker(this.name, 'tvSpeakerService');
		this.tvSpeakerService
			.setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
			.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
		this.tvSpeakerService.getCharacteristic(Characteristic.VolumeSelector)
			.on('set', this.volumeSelectorPress.bind(this));
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
			} else if (input.name) {
				inputName = input.name;
			}

			//if reference not null or empty add the input
			if (inputReference !== undefined && inputReference !== null && inputReference !== '') {
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
					.on('set', (name, callback) => {
						this.inputs[inputReference] = name;
						fs.writeFile(this.inputsFile, JSON.stringify(this.inputs), (error) => {
							if (error) {
								this.log.debug('Device: %s, new Input name saved failed, error: %s', this.host, error);
							} else {
								this.log('Device: %s, new Input name saved successfull, name: %s reference: %s', this.host, name, inputReference);
							}
						});
						callback();
					});
				this.tvAccesory.addService(tempInput);
				if (!tempInput.linked)
					this.tvService.addLinkedService(tempInput);
				this.inputReferences.push(inputReference);
			}
		});
	}

	checkDeviceState() {
		var me = this;
		tcpp.probe(me.host, me.port, (error, isAlive) => {
			if (!isAlive && me.connectionStatus) {
				me.log.info('Device: %s, name: %s, state: Offline.', me.host, me.name);
				me.disconnect();
				callback(null, false);
			} else if (isAlive && !me.connectionStatus) {
				me.log.info('Device: %s, name: %s, state: Online, start connecting...', me.host, me.name);
				me.lgtv.connect(me.url);
			}
		});
	}

	getPowerState(callback) {
		var me = this;
		if (me.connectionStatus) {
			callback(null, this.connectionStatus);
		} else {
			me.log('Device: %s, get current Power state failed, not connected to network.', me.host);
			callback(null, false);
		}
	}

	setPowerState(state, callback) {
		var me = this;
		if (me.connectionStatus) {
			if (state) {
				wol.wake(me.mac, (error) => {
					if (error) {
						me.log.debug('Device: %s, can not set new Power state. Might be due to a wrong settings in config, error: %s', me.host, error);
					} else {
						me.log('Device: %s, set new Power state successfull: %s', me.host, state ? 'ON' : 'STANDBY');
						callback();
					}
				});
			} else {
				me.lgtv.request('ssap://system/turnOff', (error, data) => {
					me.log('Device: %s, set new Power state successfull: %s', me.host, state ? 'ON' : 'STANDBY');
					me.disconnect();
				})
			}
			callback();
		} else {
			me.log('Device: %s, get current Power state failed, not connected to network.', me.host);
			callback(null, false);
		}
	}

	getMute(callback) {
		var me = this;
		if (me.connectionStatus) {
			callback(null, this.currentMuteState);
		} else {
			me.log('Device: %s, get current Mute state failed, not connected to network.', me.host);
			callback(null, false);
		}
	}

	setMute(state, callback) {
		var me = this;
		if (me.connectionStatus) {
			me.lgtv.request('ssap://audio/setMute', { mute: state });
			me.log('Device: %s, set new Mute state successfull: %s', me.host, state ? 'ON' : 'OFF');
			callback();
		} else {
			me.log('Device: %s, set Mute failed, not connected to network.', me.host);
			callback(null, false);
		}
	}

	getVolume(callback) {
		var me = this;
		if (me.connectionStatus) {
			callback(null, this.currentVolume);
		} else {
			me.log('Device: %s, get current Volume level failed, not connected to network.', me.host);
			callback(null, false);
		}
	}

	setVolume(volume, callback) {
		var me = this;
		if (me.connectionStatus) {
			me.lgtv.request('ssap://audio/setVolume', { volume: volume });
			me.log('Device: %s, set new Volume level successfull: %s', me.host, volume);
			callback();
		} else {
			me.log('Device: %s, set new Volume level failed, not connected to network.', me.host);
			callback(null, false);
		}
	}

	getInput(callback) {
		var me = this;
		if (me.connectionStatus) {
			callback(null, this.currentAppReference);
		} else {
			me.log('Device: %s, get current Input failed, not connected to network.', me.host);
			callback(null, false);
		}
	}

	setInput(inputReference, callback) {
		var me = this;
		if (me.connectionStatus) {
			me.lgtv.request('ssap://system.launcher/launch', { id: inputReference });
			me.log('Device: %s, set new Input successfull: %s', me.host, inputReference);
			callback();
		} else {
			me.log('Device: %s, set new Input failed, not connected to network.', me.host);
			callback(null, false);
		}
	}

	getChannel(callback) {
		var me = this;
		if (me.connectionStatus) {
			callback(null, this.currentChannelReference);
		} else {
			me.log('Device: %s, get current Channel failed, not connected to network.', me.host);
			callback(null, false);
		}
	}

	setChannel(channelReference, callback) {
		var me = this;
		if (me.connectionStatus) {
			me.lgtv.request('ssap://tv/openChannel', { channelNumber: channelReference });
			me.log('Device: %s, set new Channel successfull: %s', me.host, channelReference);
			callback();
		} else {
			me.log('Device: %s, set new Channel failed, not connected to network.', me.host);
			callback(null, false);
		}
	}

	setPowerMode(state, callback) {
		var me = this;
		if (me.connectionStatus) {
			var command = this.menuButton ? 'INFO' : 'MENU';
			me.log('Device: %s, set command: %s', me.host, command);
			me.sendRemoteControlCommand(command, callback);
		} else {
			me.log('Device: %s, set new PowerModeState failed, not connected to network.', me.host);
		}
	}

	volumeSelectorPress(remoteKey, callback) {
		var me = this;
		if (me.connectionStatus) {
			var command;
			switch (remoteKey) {
				case Characteristic.VolumeSelector.INCREMENT:
					command = 'volumeUp';
					break;
				case Characteristic.VolumeSelector.DECREMENT:
					command = 'volumeDown';
					break;
			}
			me.log('Device: %s, key prssed: %s, command: %s', me.host, remoteKey, command);
			me.lgtv.request('ssap://audio/' + command);
		} else {
			me.log('Device: %s, set new Volume level failed, not connected to network.', me.host);
		}
	}

	remoteKeyPress(remoteKey, callback) {
		var me = this;
		if (me.connectionStatus) {
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
					command = 'INFO';
					break;
			}
			me.log('Device: %s, key prssed: %s, command: %s', me.host, remoteKey, command);
			me.sendRemoteControlCommand(command, callback);
		} else {
			me.log('Device: %s, set RemoteKey failed, not connected to network.', me.host);
		}
	}

	sendRemoteControlCommand(command, callback) {
		var me = this;
		var command = command;
		var type = 'button';
		if (me.connectionStatus && me.pointerInputSocket) {
			me.log('Device: %s, send RC command successfull: %s', me.host, command);
			me.pointerInputSocket.send(type, { name: command });
		} else {
			me.log('Device: %s, send RC command failed, not connected to network.', me.host);
		}
	}
};
