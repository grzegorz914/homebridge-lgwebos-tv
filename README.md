<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-lgwebos-tv/master/graphics/lgwebos.png" width="540"></a>
</p>

<span align="center">

# Homebridge LG webOS TV
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://badgen.net/npm/dt/homebridge-lgwebos-tv?color=purple)](https://www.npmjs.com/package/homebridge-lgwebos-tv) [![npm](https://badgen.net/npm/v/homebridge-lgwebos-tv?color=purple)](https://www.npmjs.com/package/homebridge-lgwebos-tv) [![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-lgwebos-tv.svg)](https://github.com/grzegorz914/homebridge-lgwebos-tv/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-lgwebos-tv.svg)](https://github.com/grzegorz914/homebridge-lgwebos-tv/issues)

Homebridge plugin for LG webOS. 
Tested with OLED65G6V, 32LM6300PLA, 49SK8500, OLED65C7T, 55SK800PLB, OLED48CX.

</span>

## Package Requirements
| Package Link | Installation | Role | Required |
| --- | --- | --- | --- |
| [Homebridge](https://github.com/homebridge/homebridge) | [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) | HomeKit Bridge | Required |
| [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) | [Homebridge Config UI X Wiki](https://github.com/oznu/homebridge-config-ui-x/wiki) | Web User Interface | Recommended |
| [Homebridge LG webOS TV](https://www.npmjs.com/package/homebridge-lgwebos-tv) | `npm install -g homebridge-lgwebos-tv` | Plug-In | Required |

## Note
* Versin 1.7.0 and above need to be used with Homebridge min. v1.3.x.

## Know issues
* If use with Hoobs possible config incompatibilty.
* webOS 2.0 may be not working correct.

## Features and How To Use Them
* Power ON/OFF short press tile in HomeKit app.
* RC/Media control is possible after you go to the RC app on iPhone/iPad.
* Speaker control is possible after you go to RC app on iPhone/iPad `Speaker Service`.
* Legacy Volume and Mute control is possible throught extra `lightbulb` (slider) or using Siri `Volume Service`.
* Inputs can be changed after long press tile in Home.app and select from the list or create separate tile in the Buttons section.
* Siri control.


<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-lgwebos-tv/master/graphics/homekit.png" width="480"></a> 
  <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-lgwebos-tv/master/graphics/inputs.png" width="115"></a>  <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-lgwebos-tv/master/graphics/RC.png" width="115"></a>  <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-lgwebos-tv/master/graphics/rc1.png" width="115"></a>
</p>

## Configuration
[First please configure LG Connect Apps](https://www.lg.com/ca_en/support/product-help/CT20098005-1437129879355-others)

Install and use [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) plugin to configure this plugin (Highly Recommended). The sample configuration can be edited and used manually as an alternative. See the `sample-config.json` file in this repository for an example or copy the example below into your config.json file, making the apporpriate changes before saving it. Be sure to always make a backup copy of your config.json file before making any changes to it.

<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-lgwebos-tv/master/graphics/ustawienia.png" width="840"></a>
</p>

| Key | Description | 
| --- | --- |
| `name` | Here set the accessory *Name* to be displayed in *Homebridge/HomeKit*. |
| `host` | Here set the *Hsostname or Address IP* of TV. |
| `mac` | Here set the *Mac Address* of TV. |
| `refreshInterval` | Set the data refresh time in seconds, default is every 5 seconds. |
| `disableLogInfo` | If enabled, disable log info, all values and state will not be displayed in Homebridge log console. |
| `volumeControl` | Here choice what a additional volume control mode You want to use (None, Slider, Fan). |
| `switchInfoMenu` | If enabled, `I` button change its behaviour in RC app between Menu and INFO. |
| `getInputsFromDevice` | If `true` then the inputs and apps wil be get direct from device. |
| `inputs.name` | Here set *Channel Name* which You want expose to the *Homebridge/HomeKit*. |
| `inputs.reference` | Here set *Input Reference*. All can be found in `homebridge_directory/lgwebosTv/inputs_xxxxxx`, where `name == title` and `reference == id`, `Live TV`, `HDMI 1`, `HDMI 2` inputs are created by default. | 
| `inputs.type` | select source input type. |
| `inputs.mode` | select what a input mode You defined, select `Apps` if You defined some input reference, select `Live TV` if You defined channel reference. |
| `buttons.name` | Here set *Button Name* which You want expose to the *Homebridge/HomeKit*. | 
| `buttons.reference` | Here set *Input Reference*. All can be found in `homebridge_directory/lgwebosTv/inputs_xxxxxx`, where `name == title` and `reference == id`. | 
| `manufacturer`, `modelName`, `serialNumber`, `firmwareRevision` | Optional free-form informational data that will be displayed in the Home.app. |

```json
{
    "platform": "LgWebOsTv",
    "devices": [
        {
            "name": "LG TV",
            "host": "192.168.1.8",
            "mac": "ab:cd:ef:fe:dc:ba",
            "refreshInterval": 5,
            "disableLogInfo": false,
            "volumeControl": 0,
            "switchInfoMenu": false,
            "getInputsFromDevice": false,
            "inputs": [
                {
                    "name": "HDMI 3",
                    "reference": "com.webos.app.hdmi3",
                    "type": "HDMI",
                    "mode": 0
                },
                {
                    "name": "HDMI 4",
                    "reference": "com.webos.app.hdmi4",
                    "type": "HDMI",
                    "mode": 0
                },
                {
                    "name": "Netflix",
                    "reference": "netflix",
                    "type": "APPLICATION",
                    "mode": 0
                },
                {
                    "name": "YouTube",
                    "reference": "youtube.leanback.v4",
                    "type": "APPLICATION",
                    "mode": 0
                },
                {
                    "name": "LG Store",
                    "reference": "com.webos.app.discovery",
                    "type": "APPLICATION",
                    "mode": 0
                }
            ],
          "manufacturer": "Manufacturer",
          "modelName": "Model",
          "serialNumber": "Serial Number",
          "firmwareRevision": "Firmware Revision"
        }
    ]
}
```

## Adding to HomeKit
Each accessory needs to be manually paired. 
1. Open the Home <img src='https://user-images.githubusercontent.com/3979615/78010622-4ea1d380-738e-11ea-8a17-e6a465eeec35.png' width='16.42px'> app on your device. 
2. Tap the Home tab, then tap <img src='https://user-images.githubusercontent.com/3979615/78010869-9aed1380-738e-11ea-9644-9f46b3633026.png' width='16.42px'>. 
3. Tap *Add Accessory*, and select *I Don't Have a Code or Cannot Scan*. 
4. Select Your accessory. 
5. Enter the Homebridge PIN, this can be found under the QR code in Homebridge UI or your Homebridge logs, alternatively you can select *Use Camera* and scan the QR code again.

## Limitations
* Due to a HomeKit limitation, that maximum services for 1 accessory is 100. Acessory containing > 100 services will not respond.
* If all services are enabled possible inputs to use is 95. The services in this accessory are:
  * Information service.
  * Speaker service.
  * Lightbulb service.
  * Fan service
  * Television service.
  * Inputs service which may range from 6 to 100 as each input is 1 service.
  * Buttons service which may range from 6 to 100 as each input is 1 service.

## Whats new:
https://github.com/grzegorz914/homebridge-lgwebos-tv/blob/master/CHANGELOG.md

## Development
* Pull request and help in development highly appreciated.
