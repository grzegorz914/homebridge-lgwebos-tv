const ppath = require('persist-path');
const fs = require('fs');
const mkdirp = require('mkdirp');
const Lgtv2 = require('lgtv2');
const wol = require('wake_on_lan');
const tcpp = require('tcp-ping');
const responseDelay = 1500;

var Accessory, Service, Characteristic, hap, UUIDGen;

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
		this.prefDir = ppath('lgwebosTv/');
		this.inputsFile = this.prefDir + 'inputs_' + this.name.split(' ').join('');
		this.keyFile = this.prefDir + 'keyFile_' + this.name.split(' ').join('');
		this.url = 'ws://' + this.host + ':' + this.port;

		//get Device info
		this.getDeviceInfo();
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

		// create the lgtv instance
		this.lgtv = new Lgtv2({
			url: this.url,
			timeout: 5000,
			reconnect: 3000,
			keyFile: this.keyFile
		});

		//Check net state
		setInterval(function () {
			var me = this;
			tcpp.probe(me.host, me.port, (error, isAlive) => {
				if (!isAlive && me.connectionStatus) {
					me.log('Device: %s, state: Offline.', me.host);
					me.connectionStatus = false;
					callback(null, false);
				} else if (isAlive && !me.connectionStatus) {
					me.log('Device: %s, state: Online.', me.host);
					me.lgtv.connect(me.url);
				}
			});
		}.bind(this), 5000);

		//register to listeners
		this.lgtv.on('connect', () => {
			this.log.debug('Device: %s, connected to TV, checking power status', this.host);
			this.lgtv.request('ssap://com.webos.service.tvpower/power/getPowerState', (error, data) => {
				if (error || (data && data.state && data.state === 'Active Standby')) {
					this.log.debug('Device: %s, power state Off or Pixel Refresher is running, disconnecting...', this.host);
					this.lgtv.disconnect();
				} else {
					this.log.debug('Device: %s, power status: On', this.host);
					this.connect();
				}
			});
		});

		this.lgtv.on('close', () => {
			this.log.debug('Device: %s, disconnected.', this.host);
			this.connectionStatus = false;
			this.pointerInputSocket = null;
		});

		this.lgtv.on('error', (error) => {
			this.log.error('Device: %s, error: %s', this.host, error);
		});

		this.lgtv.on('prompt', () => {
			this.log.info('Device: %s, prompt for confirmation...', this.host);
			this.connectionStatus = false;
		});

		this.lgtv.on('connecting', () => {
			this.log.debug('Device: %s, connecting...', this.host);
			this.connectionStatus = false;
		});

		//Delay to wait for device info
		setTimeout(this.prepereTvService.bind(this), responseDelay);

		var deviceName = this.name;
		var uuid = UUIDGen.generate(deviceName);
		this.tvAccesory = new Accessory(deviceName, uuid, hap.Accessory.Categories.TV);
		this.log.debug('Device: %s, publishExternalAccessories: %s', this.host, this.name);
		this.api.publishExternalAccessories('homebridge-lgwebos-tv', [this.tvAccesory]);
	}


	// --== CONNECT/DISCONNECT METHODS ==--	
	connect() {
		this.log('Device: %s, connected.', this.host);
		this.connectionStatus = true;
		this.connectToPointerInputSocket();
	}

	disconnect() {
		this.log('Device: %s, disconnected.', this.host);
		this.connectionStatus = false;
		this.lgtv.disconnect();
	}

	connectToPointerInputSocket() {
		this.log('Device: %s, connecting to remote control socket', this.host);
		this.lgtv.getSocket('ssap://com.webos.service.networkinput/getPointerInputSocket', (error, sock) => {
			if (!error) {
				this.pointerInputSocket = sock;
			}
		});
	}

	getDeviceInfo() {
		var me = this;
		setTimeout(() => {
			this.log.debug('Device: %s, requesting TV information', me.host);
			this.lgtv.request('ssap://system/getSystemInfo', (error, data) => {
				if (!data || error || data.errorCode) {
					me.log.debug('Device: %s, get system info error: %s', me.host, error);
				} else {
					delete data['returnValue'];
					me.log.debug('Device: %s, get system info successfull: %s', me.host, JSON.stringify(data, null, 2));
					me.manufacturer = 'LG Electronics';
					me.modelName = data.modelName;
					me.serialNumber = 'SN0000004';
					me.firmwareRevision = 'FW0000004';

					me.log('-----Device %s-----', me.host);
					me.log('Manufacturer: %s', me.manufacturer);
					me.log('Model: %s', me.modelName);
					me.log('Serialnumber: %s', me.serialNumber);
					me.log('Firmware: %s', me.firmwareRevision);
					me.log('Device: %s, getDeviceInfo successfull.', me.host);
				}
			});

			this.lgtv.request('ssap://com.webos.service.update/getCurrentSWInformation', (error, data) => {
				if (!data || error || data.errorCode) {
					this.log.debug('Device: %s, get sw information error: %s', me.host, error);
				} else {
					delete data['returnValue'];
					me.log('Device: %s, get sw information successful: %s', me.host, JSON.stringify(data, null, 2));
				}
			});

			this.lgtv.request('ssap://api/getServiceList', (error, data) => {
				if (!data || error || data.errorCode) {
					me.log.debug('Device: %s, get service list error: %s', me.host, error);
				} else {
					delete data['returnValue'];
					me.log.debug('Device: %s, get service list successful: %s', me.host, JSON.stringify(data, null, 2));
				}
			});
		}, 200);
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
			.on('set', (inputIdentifier, callback) => {
				this.setInput(callback, this.inputReferences[inputIdentifier]);
			})
			.on('get', this.getInput.bind(this));

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
		} catch (err) {
			this.log.debug('Device: %s,  inputs file does not exist', this.host)
		}

		this.inputReferences = new Array();
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
								this.log.debug('Device: %s, can not write new Input name, error: %s', this.host, error);
							} else {
								this.log('Device: %s, saved new Input successfull, name: %s reference: %s', this.host, name, inputReference);
							}
						});
						callback()
					});
				this.tvAccesory.addService(tempInput);
				if (!tempInput.linked)
					this.tvService.addLinkedService(tempInput);
				this.inputReferences.push(inputReference);
			}

		});
	}

	getPowerState(callback) {
		var me = this;
		if (me.connectionStatus) {
			this.lgtv.subscribe('ssap://com.webos.service.tvpower/power/getPowerState', function (error, data) {
				if (error) {
					me.log.debug('Device: %s, can not get current Power state. Might be due to a wrong settings in config, error: %s', me.host, error);
					if (callback)
						callback(error);
				} else {
					let statusState = (data && data.state ? data.state : null);
					let statusProcessing = (data && data.processing ? data.processing : null);
					let statusPowerOnReason = (data && data.powerOnReason ? data.powerOnReason : null);
					let state = '';

					if (statusState) {
						state = true;
					}

					if (statusProcessing) {
						state = true;
					}

					if (statusPowerOnReason) {
						state = true;
					}

					if (statusState === 'Active Standby') {
						state = false;
						this.disconnect();
					}
					me.log('Device: %s, get current Power state successfull: %s', me.host, state ? 'ON' : 'STANDBY');
					callback(null, state);
				}
			});
		} else {
			me.log('Device: %s, get current Power state failed, not connected to network.', me.host);
			callback(null, false);
		}
	}

	setPowerState(state, callback) {
		var me = this;
		if (me.connectionStatus) {
			wol.wake(this.mac, { 'address': this.broadcastAdr }, function (error) {
				if (error) {
					me.log.debug('Device: %s, can not set new Power state. Might be due to a wrong settings in config, error: %s', me.host, error);
					if (callback)
						callback(error);
				} else {
					me.log('Device: %s, set new Power state successfull: %s', me.host, state ? 'ON' : 'STANDBY');
					callback(null, state);
				}
			});
		} else {
			me.log('Device: %s, set new Power state failed, not connected to network.', me.host);
		}
	}

	getMute(callback) {
		var me = this;
		if (me.connectionStatus) {
			this.lgtv.subscribe('ssap://audio/getStatus', function (error, data) {
				if (error) {
					me.log.debug('Device: %s, can not get current Mute state. Might be due to a wrong settings in config, error: %s', me.host, error);
					if (callback)
						callback(error);
				} else {
					var state = data.mute;
					me.log('Device: %s, get current Mute state successfull: %s', me.host, state ? 'ON' : 'OFF');
					callback(null, state);
				}
			});
		} else {
			me.log('Device: %s, get current Mute state failed, not connected to network.', me.host);
			callback(null, false);
		}
	}

	setMute(state, callback) {
		var me = this;
		if (me.connectionStatus) {
			var newState = state ? true : false;
			this.lgtv.request('ssap://audio/setMute', { mute: newState }, function (error) {
				if (error) {
					me.log.debug('Device: %s, can not set new Mute state. Might be due to a wrong settings in config, error: %s', me.host, error);
					if (callback)
						callback(error);
				} else {
					me.log('Device: %s, set new Mute state successfull: %s', me.host, state ? 'ON' : 'OFF');
					callback(null, state);
				}
			});
		} else {
			me.log('Device: %s, set Mute failed, not connected to network.', me.host);
		}
	}

	getVolume(callback) {
		var me = this;
		if (me.connectionStatus) {
			this.lgtv.subscribe('ssap://audio/getStatus', function (error, data) {
				if (error) {
					me.log.debug('Device: %s, can not get current Volume level. Might be due to a wrong settings in config, error: %s', me.host, error);
					if (callback)
						callback(error);
				} else {
					var volume = data.volume;
					me.log('Device: %s, get current Volume level successfull: %s', me.host, volume);
					callback(null, volume);
				}
			});
		} else {
			me.log('Device: %s, get current Volume level failed, not connected to network.', me.host);
			callback(null, false);
		}
	}

	setVolume(volume, callback) {
		var me = this;
		if (me.connectionStatus) {
			var targetVolume = volume;
			this.lgtv.request('ssap://audio/setVolume', { volume: targetVolume }, function (error) {
				if (error) {
					me.log.debug('Device: %s, can not set new Volume level. Might be due to a wrong settings in config, error: %s', me.host, error);
					if (callback)
						callback(error);
				} else {
					me.log('Device: %s, set new Volume level successfull: %s', me.host, targetVolume);
					callback(null, volume);
				}
			});
		} else {
			me.log('Device: %s, set new Volume level failed, not connected to network.', me.host);
		}
	}

	getInput(callback) {
		var me = this;
		if (me.connectionStatus) {
			this.lgtv.subscribe('ssap://com.webos.applicationManager/getForegroundAppInfo', function (error, data) {
				if (error) {
					me.log.debug('Device: %s, can not get current Input. Might be due to a wrong settings in config, error: %s', me.host, error);
					if (callback)
						callback(error);
				} else {
					let inputReference = data.appId;
					for (let i = 0; i < me.inputReferences.length; i++) {
						if (inputReference === me.inputReferences[i]) {
							me.tvService
								.getCharacteristic(Characteristic.ActiveIdentifier)
								.updateValue(i);
							me.log('Device: %s, get current Input successfull: %s', me.host, inputReference);
						}
					}
					callback();
				}
			});
		} else {
			me.log('Device: %s, get current Input failed, not connected to network.', me.host);
			callback(null, false);
		}
	}

	setInput(callback, inputReference) {
		var me = this;
		if (me.connectionStatus) {
			me.getInput(function (error, currentInputReference) {
				if (error) {
					me.log.debug('Device: %s, can not get current Input Reference. Might be due to a wrong settings in config, error: %s', me.host, error);
					if (callback)
						callback(error);
				} else {
					if (currentInputReference == inputReference) {
						callback(null, inputReference);
					} else {
						this.lgtv.request('ssap://system.launcher/launch', { id: inputReference }, function (error) {
							if (error) {
								me.log.debug('Device: %s, can not set new Input. Might be due to a wrong settings in config, error: %s', me.host, error);
								if (callback)
									callback(error);
							} else {
								me.log('Device: %s, set new Input successfull: %s', me.host, inputReference);
								if (callback)
									callback(null, inputReference);
							}
						});
					}
				}
			});
		} else {
			me.log('Device: %s, set new Input failed, not connected to network.', me.host);
		}
	}

	setPowerMode(callback, state) {
		var me = this;
		if (me.connectionStatus) {
			var command = this.menuButton ? 'INFO' : 'MENU';
			me.log('Device: %s, set command: %s', me.host, command);
			this.sendRemoteControlCommand(command, callback);
		} else {
			me.log('Device: %s, set new PowerModeState failed, not connected to network.', me.host);
		}
	}

	volumeSelectorPress(remoteKey, callback) {
		var me = this;
		if (me.connectionStatus) {
			var command = 0;
			switch (remoteKey) {
				case Characteristic.VolumeSelector.INCREMENT:
					command = 'UP';
					break;
				case Characteristic.VolumeSelector.DECREMENT:
					command = 'DOWN';
					break;
			}
			me.log('Device: %s, key prssed: %s, command: %s', me.host, remoteKey, command);
			this.sendRemoteControlCommand(command, callback);
		} else {
			me.log('Device: %s, set new Volume level failed, not connected to network.', me.host);
		}
	}

	remoteKeyPress(remoteKey, callback) {
		var me = this;
		var command = 0;
		if (me.connectionStatus) {
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
					me.isPaused = !this.isPaused;
					break;
				case Characteristic.RemoteKey.INFORMATION:
					command = '';
					break;
			}
			me.log('Device: %s, key prssed: %s, command: %s', me.host, remoteKey, command);
			this.sendRemoteControlCommand(command, callback);
		} else {
			me.log('Device: %s, set RemoteKey failed, not connected to network.', me.host);
		}
	}

	sendRemoteControlCommand(command, callback) {
		var me = this;
		if (me.connectionStatus) {
			if (command === 'CLICK') {
				this.pointerInputSocket.send('click');
			} else {
				this.pointerInputSocket.send('button', {
					name: command
				});
			}
			me.log('Device: %s, send RC command successfull: %s', me.host, command);
			callback(null, command);
		} else {
			me.log('Device: %s, send RC command failed, not connected to network.', me.host);
		}
	}
};
