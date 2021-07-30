<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-lgwebos-tv/master/graphics/lgwebos.png" height="140"></a>
</p>

<span align="center">

# Homebridge LG webOS TV
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://badgen.net/npm/dt/homebridge-lgwebos-tv?color=purple)](https://www.npmjs.com/package/homebridge-lgwebos-tv) [![npm](https://badgen.net/npm/v/homebridge-lgwebos-tv?color=purple)](https://www.npmjs.com/package/homebridge-lgwebos-tv) [![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-lgwebos-tv.svg)](https://github.com/grzegorz914/homebridge-lgwebos-tv/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-lgwebos-tv.svg)](https://github.com/grzegorz914/homebridge-lgwebos-tv/issues)

Homebridge plugin for LG webOS 3.0 amd above. 
Tested with OLED65G6V, 32LM6300PLA, 49SK8500, OLED65C7T, 55SK800PLB, OLED48CX.

</span>

## Package Requirements
| Package Link | Required |
| --- | --- |
| [Homebridge](https://github.com/homebridge/homebridge) | Required | 
| [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x) | Highly Recommended |

## Note
1. Versin 1.7.0 and above need to be used with Homebridge min. v1.3.x.

## Know issues
1. If use with Hoobs possible config incompatibilty.
2. webOS 2.0 may be not working correct.
3. 
## Installation Instructions
1. Follow the step-by-step instructions at [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) for how to install Homebridge.
2. Follow the step-by-step instructions at [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) for how to install Homebridge Config UI X.
3. Install homebridge-lgwebos-tv using: `npm install -g homebridge-lgwebos-tv` or search for `Lgwebos TV` in Config UI X.

## Features and How To Use Them
1. Power ON/OFF using a short press of the created device tile in the HomeKit app.
2. Remote Control and Media control is possible by using the Apple Remote in Control Center on iPhone/iPad (must be installed from the App store prior to iOS/iPadOS 14).
3. Speaker control is possible after you go to Apple Remote in Control Center on iPhone/iPad `Speaker Service`.
4. Legacy volume and mute control is possible throught the extra `lightbulb` (slider) or using Siri `Volume Service`.
5. Inputs can be changed by performing a long press of the device tile in the HomeKit app and then selecting from the list. It is also possible to create separate tiles in the Inputs and Functions button.
8. Siri control, (Volume, Mute) if volume control enabled Slider or Fan.


<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-lgwebos-tv/master/graphics/homekit.png" height="300"></a> 
  </p>
  <p align="left">
  <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-lgwebos-tv/master/graphics/inputs.png" height="300"></a>  <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-lgwebos-tv/master/graphics/RC.png" height="300"></a>  <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-lgwebos-tv/master/graphics/rc1.png" height="300"></a>
</p>

## Configuration TV
1. [Please configure LG Connect Apps](https://www.lg.com/ca_en/support/product-help/CT20098005-1437129879355-others)

## Configuration Values
| Key | Description | 
| --- | --- |
| `inputs` | all reference and name can be found in: `homebridge_directory/lgwebosTv/apps_xxxxxx` where `name == title` and `reference == id` |
| `inputs.name` | set the name which will be displayed as inputs list in HomeKit app |
| `inputs.reference` | set the reference of Inputs/Applications |
| `inputs.type` | select source input type |
| `inputs.mode` | select what a input mode You defined, select `Apps` if You defined some input reference, select `Live TV` if You defined channel reference. |
| `refreshInterval` | Set the data refresh time in seconds, default is every 5 seconds |
| `volumeControl`| Select what a additional volume control mode You want to use (None, Slider, Fan) |
| `switchInfoMenu`| If `true` then the `I` button will toggle its behaviour in the Apple Remote in Control Center and `PowerModeSelection` in settings |
| `disableLogInfo`| If `true` then disable log info, all values and state will not be displayed in Homebridge log console |
| `manufacturer` | Optional free-form informational data that will be displayed in the Home.app if it is filled in |
| `model` | Optional free-form informational data that will be displayed in the Home.app if it is filled in |
| `serialNumber` | Optional free-form informational data that will be displayed in the Home.app if it is filled in |
| `firmwareRevision` | Optional free-form informational data that will be displayed in the Home.app if it is filled in |

<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://raw.githubusercontent.com/grzegorz914/homebridge-lgwebos-tv/master/graphics/ustawienia.png" height="170"></a>
</p>

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
            "inputs": [
                   {
                      "name": "Live TV",
                      "reference": "com.webos.app.livetv",
                      "type": "TUNER",
                      "mode": 0
                  },
                  {
                      "name": "HDMI 1",
                      "reference": "com.webos.app.hdmi1",
                      "type": "HDMI",
                      "mode": 0
                 },
                 {
                      "name": "HDMI 2",
                      "reference": "com.webos.app.hdmi2",
                      "type": "HDMI",
                      "mode": 0
                },
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
1. Open the Home <img src='https://user-images.githubusercontent.com/3979615/78010622-4ea1d380-738e-11ea-8a17-e6a465eeec35.png' height='16.42px'> app on your device. 
2. Tap the Home tab, then tap <img src='https://user-images.githubusercontent.com/3979615/78010869-9aed1380-738e-11ea-9644-9f46b3633026.png' height='16.42px'>. 
3. Tap *Add Accessory*, and select *I Don't Have a Code or Cannot Scan*. 
4. Select Your accessory. 
5. Enter the Homebridge PIN, this can be found under the QR code in Homebridge UI or your Homebridge logs, alternatively you can select *Use Camera* and scan the QR code again.

## Limitations
The HomeKit app has a limitation of a maximum number of 100 services per 1 accessory. If the number of services per accessory is over 100 then the Home app will stop responding. Items that are considered to be services in each accessory are when using this plugin are: 
  1. Information service
  2. Speaker service
  3. Lightbulb service
  4. Television service and inputs service 
  5. 5-100, where every input = 1 service

## Whats new:
https://github.com/grzegorz914/homebridge-lgwebos-tv/blob/master/CHANGELOG.md

## Development
- Pull request and help in development highly appreciated.
