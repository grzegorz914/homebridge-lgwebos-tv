<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-lgwebos-tv/main/graphics/lgwebos.png" width="540"></a>
</p>

<span align="center">

# Homebridge LG webOS TV

[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://badgen.net/npm/dt/homebridge-lgwebos-tv?color=purple)](https://www.npmjs.com/package/homebridge-lgwebos-tv)
[![npm](https://badgen.net/npm/v/homebridge-lgwebos-tv?color=purple)](https://www.npmjs.com/package/homebridge-lgwebos-tv)
[![npm](https://img.shields.io/npm/v/homebridge-lgwebos-tv/beta.svg?style=flat-square)](https://www.npmjs.com/package/homebridge-lgwebos-tv)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-lgwebos-tv.svg)](https://github.com/grzegorz914/homebridge-lgwebos-tv/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-lgwebos-tv.svg)](https://github.com/grzegorz914/homebridge-lgwebos-tv/issues)

Homebridge plugin for LG webOS.
Tested with OLED65G6V, 32LM6300PLA, 49SK8500, OLED65C7T, 55SK800PLB, OLED48CX.

</span>

## Package Requirements

| Package | Installation | Role | Required |
| --- | --- | --- | --- |
| [Homebridge](https://github.com/homebridge/homebridge) | [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) | HomeKit Bridge | Required |
| [Config UI X](https://github.com/homebridge/homebridge-config-ui-x) | [Config UI X Wiki](https://github.com/homebridge/homebridge-config-ui-x/wiki) | Homebridge Web User Interface | Recommended |
| [LG webOS TV](https://www.npmjs.com/package/homebridge-lgwebos-tv) | [Plug-In Wiki](https://github.com/grzegorz914/homebridge-lgwebos-tv/wiki) | Homebridge Plug-In | Required |

## Abut The Plugin

* Power and Screen ON/OFF short press tile in HomeKit app.
* RC/Media control is possible after you go to the RC app on iPhone/iPad.
* Speaker control is possible after you go to RC app on iPhone/iPad `Speaker Service`.
* Legacy Volume and Mute control is possible throught extra `lightbulb`/`fan` (slider).
* Inputs can be changed using Inputs selector in HomeKit.app, additionally can create separate tile.
* Channels can be changed using Channels selector in HomeKit app, additionally can create separate tile.
* Brightness, Contrast, Backlight, Color, Picture Mode and Sound Mode can be changed using extra tile.
* Siri can be used for all functions, some times need create legacy buttons/switches/sensors.
* Automations can be used for all functions, some times need create legacy buttons/switches/sensors.
* Support external integrations, [RESTFul](https://github.com/grzegorz914/homebridge-lgwebos-tv?tab=readme-ov-file#restful-integration), [MQTT](https://github.com/grzegorz914/homebridge-lgwebos-tv?tab=readme-ov-file#mqtt-integration).

<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-lgwebos-tv/main/graphics/homekit.png" width="382"></a>
  <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-lgwebos-tv/main/graphics/inputs.png" width="135"></a> <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-lgwebos-tv/main/graphics/rc1.png" width="135"></a>
  <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-lgwebos-tv/main/graphics/RC.png" width="135"></a>
</p>

## Configuration

* Please configure [LG Connect Apps](https://www.lg.com/au/support/product-help/CT20088015-1437132986635)
* Run this plugin as a [Child Bridge](https://github.com/homebridge/homebridge/wiki/Child-Bridges) (Highly Recommended), this prevent crash Homebridge if plugin crashes.
* Install and use [Homebridge Config UI X](https://github.com/homebridge/homebridge-config-ui-x/wiki) to configure this plugin.
* The `sample-config.json` can be edited and used as an alternative.
* Be sure to always make a backup copy of your config.json file before making any changes to it.

<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-lgwebos-tv/main/graphics/ustawienia.png" width="840"></a>
</p>

| Key | Description |
| --- | --- |
| `name` | Here set the accessory *Name* to be displayed in *Homebridge/HomeKit*. |
| `host` | Here set the *Hsostname or Address IP* of TV. |
| `mac` | Here set the *Mac Address* of TV. |
| `getInputsFromDevice` | This enable load inputs and apps direct from device. |
| `filterSystemApps` | This enable filter sysem apps, only if `getInputsFromDevice` is `true`. |
| `disableLoadDefaultInputs` | This function disable load default inputs `Live TV`, `HDMI 1`, `HDMI 2` in to the inputs list. |
| `inputsDisplayOrder` | Here select display order of the inputs list, `0 - None`, `1 - Ascending by Name`, `2 - Descending by Name`, `3 - Ascending by Reference`, `4 - Ascending by Reference`.. |
| `inputs.name` | Here set *Name* which You want expose to the *Homebridge/HomeKit*. |
| `inputs.reference` | Here set *Reference*. `Live TV`, `HDMI 1`, `HDMI 2` are created by default. |
| `inputs.mode` | Here select input mode, `0 - Input/App`, `1 - Live TV Channel`. |
| `buttons.name` | Here set *Name* which You want expose to the *Homebridge/HomeKit*. |
| `buttons.mode` | Here select button mode, `0 - Input/App`, `1 - Live TV Channel`, `2 - Remote Control`. |
| `buttons.reference` | Here set *Reference*, only for `Input/App` or `Live TV Channel` mode, in other case leave empty. |
| `buttons.command` | Here select `Remote Control` command which will be assigned to the button. |
| `buttons.displayType` | Here select display type in HomeKit app, possible `0 - None/Disabled`, `1 - Outlet`, `2 - Switch`.|
| `buttons.namePrefix` | Here enable/disable the accessory name as a prefix for button name.|
| `sensorPower`| If enabled, then the Power will be exposed as a `Contact Sensor`, fired if Power ON. |
| `sensorPixelRefresh`| If enabled, then the PoPixel Refresh will be exposed as a `Contact Sensor`, fired if Pixel Refresh ON. |
| `sensorVolume`| If enabled, then the Volume will be exposed as a `Contact Sensor`, fired on every Volume change. |
| `sensorMute`| If enabled, then the Mute will be exposed as a `Contact Sensor`, fired if Mmute ON. |
| `sensorInput`| If enabled, then the Input will be exposed as a `Contact Sensor`, fired on every Input change. |
| `sensorChannel`| If enabled, then the Channel will be exposed as a `Contact Sensor`, fired on every Channel change. |
| `sensorSoundMode`| If enabled, then the Sound Mode will be exposed as a `Contact Sensor`, fired on every Sound Mode change. |
| `sensorPictureMode`| If enabled, then the Picture Mode will be exposed as a `Contact Sensor`, fired on every Picture Mode change. |
| `sensorScreenOnOff`| If enabled, then the Screen On/Off will be exposed as a `Contact Sensor`, fired on Screen OFF. |
| `sensorScreenSaver`| If enabled, then the Screen Saver will be exposed as a `Contact Sensor`, fired on Screen Saver ON. |
| `sensorInputs`| Her create custom Inputs sensor, sensors will be exposed as a `Contact Sensor`, fired if switch to it. |
| `sensorInputs.name` | Here set own *Name* which You want expose to the *Homebridge/HomeKit* for this sensor. |
| `sensorInputs.reference` | Here set *Reference* like `com.webos.app.hdmi1` to be exposed as sensor (active on switch to this Input). |
| `sensorInputs.displayType` | Here select sensor type to be exposed in HomeKit app, possible `0 - None/Disabled`, `1 - Motion Sensor`, `2 - Occupancy Sensor`, `3 - Contact Sensor`. |
| `sensorInputs.namePrefix` | Here enable/disable the accessory name as a prefix for sensor name.|
| `pictureModes.name` | Here set own *Name* which You want expose to the *Homebridge/HomeKit* for this sensor. |
| `pictureModes.reference` | Here set *Reference* like `com.webos.app.hdmi1` to be exposed as sensor (active on switch to this Input). |
| `pictureModes.namePrefix` | Here enable/disable the accessory name as a prefix for picture mode.|
| `soundModes.name` | Here set own *Name* which You want expose to the *Homebridge/HomeKit* for this sensor. |
| `soundModes.reference` | Here set *Reference* like `com.webos.app.hdmi1` to be exposed as sensor (active on switch to this Input). |
| `soundModes.namePrefix` | Here enable/disable the accessory name as a prefix for sound mode.|
| `enableDebugMode` | If enabled, deep log will be present in homebridge console. |
| `disableLogInfo` | If enabled, disable log info, all values and state will not be displayed in Homebridge log console. |
| `disableLogDeviceInfo` | If enabled, add ability to disable log device info by every connections device to the network. |
| `disableTvService` | If enabled, TV service will be disabled and prevent display double services if TV already support HomeKit native. |
| `turnScreenOnOff` | This enable possibility turn the screen ON/OFF, only for webOS >= 4.0. |
| `sslWebSocket` | If enabled, SSL WebSocket will support TV with new firmware. |
| `infoButtonCommand` | Here select the function of `I` button in RC app. |
| `volumeControl` | Here select volume control mode `0 - None/Disabled`, `1 - Slider`, `2 - Fan`. |
| `enableRestFul` | If enabled, RESTful server will start automatically and respond to any path request. |
| `restFulPort` | Here set the listening `Port` for RESTful server, every device need own port. |
| `restFulDebug` | If enabled, deep log will be present in homebridge console for RESTFul server. |
| `enableMqtt` | If enabled, MQTT Broker will start automatically and publish all awailable PV installation data. |
| `mqttHost` | Here set the `IP Address` or `Hostname` for MQTT Broker. |
| `mqttPort` | Here set the `Port` for MQTT Broker, default 1883. |
| `mqttClientId` | Here optional set the `Client Id` of MQTT Broker. |
| `mqttPrefix` | Here set the `Prefix` for `Topic` or leave empty. |
| `mqttAuth` | If enabled, MQTT Broker will use authorization credentials. |
| `mqttUser` | Here set the MQTT Broker user. |
| `mqttPasswd` | Here set the MQTT Broker password. |
| `mqttDebug` | If enabled, deep log will be present in homebridge console for MQTT. |
| `reference` | All can be found in `homebridge_directory/lgwebosTv`, `inputs_xxx` file, where `reference == id`, or `channels_xxx` file, where `reference == channelId`. |

### RESTFul Integration

* Request: `http//homebridge_ip_address:port/path`.
* Path: `systemnfo`, `softwareinfo`, `channels`, `apps`, `power`, `audio`, `currentapp`, `currentchannel`, `picturesettings`, `soundmode`.
* Respone as JSON data.

### MQTT Integration

| Direction | Topic | Message | Payload Data |
| --- | --- | --- | --- |
|  Publish   | `System Info`, `Software Info`, `Channels`, `Apps`, `Power`, `Audio`, `Current App`, `Current Channel`, `Picture Settings`, `Sound Mode` | `{state: Active}` | JSON object. |
|  Subscribe   | `Set` | `{Power: true}` | JSON object. |

| Subscribe | Key | Value | Type | Description |
| --- | --- | --- | --- | --- |
| LG WebOS|     |     |     |      |
|     | `Power` | `true`, `false` | boolean | Power state. |
|     | `Input` | `com.webos.app.hdmi2` | string | Set input. |
|     | `Channel` | `channel reference` | string | Set channel. |
|     | `RcControl` | `REWIND` | string | Send RC command. |
|     | `Volume` | `100` | integer | Set volume. |
|     | `Mute` | `true`, `false` | boolean | Set mute. |
