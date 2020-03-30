# homebridge-lgwebos-tv
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://badgen.net/npm/dt/homebridge-lgwebos-tv?color=purple)](https://www.npmjs.com/package/homebridge-lgwebos-tv) [![npm](https://badgen.net/npm/v/homebridge-lgwebos-tv?color=purple)](https://www.npmjs.com/package/homebridge-lgwebos-tv) [![GitHub pull requests](https://img.shields.io/github/issues-pr/grzegorz914/homebridge-lgwebos-tv.svg)](https://github.com/grzegorz914/homebridge-lgwebos-tv/pulls)
[![GitHub issues](https://img.shields.io/github/issues/grzegorz914/homebridge-lgwebos-tv.svg)](https://github.com/grzegorz914/homebridge-lgwebos-tv/issues)

Plugin to control lgwebos TV in HomeKit as TV service. Tested with LGOLED65G6V. Present as TV service, change inputs, volume/mute control, power control.

Homebridge: https://github.com/homebridge/homebridge

## Installation

1. Follow the step-by-step instructions on the [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) for how to install Homebridge.
2. Install homebridge-lgwebos-tv using: `npm install -g homebridge-lgwebos-tv`
3. Update your configuration file. See `sample-config.json` in this repository for a sample. 

## Configuration

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
