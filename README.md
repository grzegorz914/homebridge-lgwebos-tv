<p align="center">
  <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://github.com/grzegorz914/homebridge-lgwebos-tv/blob/master/graphics/lgwebos.png" height="140"></a>
</p>

<span align="center">

# Homebridge LG webOS TV
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://badgen.net/npm/dt/homebridge-lgwebos-tv?color=purple)](https://www.npmjs.com/package/homebridge-lgwebos-tv) [![npm](https://badgen.net/npm/v/homebridge-lgwebos-tv?color=purple)](https://www.npmjs.com/package/homebridge-lgwebos-tv) [![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-lgwebos-tv.svg)](https://github.com/grzegorz914/homebridge-lgwebos-tv/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-lgwebos-tv.svg)](https://github.com/grzegorz914/homebridge-lgwebos-tv/issues)

Homebridge plugin to control LG webOS TV in HomeKit as TV service. Tested with LGOLED65G6V, 32LM6300PLA, LG49SK8500.

</span>

## Info
1. Volume/Mute and RC/Media is possible after You go to RC Control app on iPhone/iPad. 
2. Volume and Mute can be changed using hardware buttons on iPhone/iPad.
3. RC/Media control function available from RC Control app on iPhone/iPad.
4. Siri control using siri command.
5. Power ON/OFF short press tile in HomeKit app.
6. Change Inputs/Apps after loong press tile in HomeKit app.

<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://github.com/grzegorz914/homebridge-lgwebos-tv/blob/master/graphics/RC.png" height="140"></a>
</p>

## Package
1. [Homebridge](https://github.com/homebridge/homebridge)
2. [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x)

## Installation
1. Follow the step-by-step instructions on the [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) for how to install Homebridge.
2. Follow the step-by-step instructions on the [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) for how to install Homebridge Config UI X.
3. Install homebridge-lgwebos-tv using: `npm install -g homebridge-lgwebos-tv`.

## Configuration
1. Use [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x) to configure the plugin (strongly recomended), or update your configuration file manually. See `sample-config.json` in this repository for a sample or add the bottom example to Your config.json file.
2. All inputs reference and name can be found in: `homebridge_directory/lgwebosTv/apps_19216818` where `name == title` nad `reference == id`

<p align="left">
  <a href="https://github.com/grzegorz914/homebridge-lgwebos-tv"><img src="https://github.com/grzegorz914/homebridge-lgwebos-tv/blob/master/graphics/ustawienia.png" height="100"></a>
</p>

```json
{
    "platform": "LgWebOsTv",
    "devices": [
        {
            "name": "LG TV",
            "host": "192.168.1.8",
            "mac": "ab:cd:ef:fe:dc:ba",
            "switchInfoMenu": true,
            "inputs": [
                {
                    "name": "Live TV",
                    "reference": "com.webos.app.livetv"
                },
                {
                    "name": "HDMI 1",
                    "reference": "com.webos.app.hdmi1"
                },
                {
                    "name": "HDMI 2",
                    "reference": "com.webos.app.hdmi2"
                },
                {
                    "name": "HDMI 3",
                    "reference": "com.webos.app.hdmi3"
                },
                {
                    "name": "HDMI 4",
                    "reference": "com.webos.app.hdmi4"
                },
                {
                    "name": "Netflix",
                    "reference": "netflix",
                },
                {
                    "name": "YouTube",
                    "reference": "youtube.leanback.v4"
                },
                {
                    "name": "LG Store",
                    "reference": "com.webos.app.discovery"
                }
            ]
        }
    ]
}
```
## Whats new:
https://github.com/grzegorz914/homebridge-lgwebos-tv/blob/master/CHANGELOG.md
