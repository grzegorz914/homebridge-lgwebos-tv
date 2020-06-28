# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - (28.06.2020)
### Added
- release version.

## [0.12.0] - (08.06.2020)
### Added
- added possibility to switch LiveTV channels from the inputs list

### Fixed
- other fixes

## [0.11.0] - (23.05.2020)
### Added
- added possibility to select what a type of extra volume control You want to use (None, Slider, Fan)

## [0.10.40] - (22.05.2020)
### Fixed
- fixed RC control
- other improvements

## [0.10.0] - (20.05.2020)
### Added
- added mute ON/OFF to the slider volume

## [0.9.101] - (18.05.2020)
### Fixed
- fixed bug in RC control
- fixed power state

## [0.9.75] - (17.05.2020)
### Fixed
- fixed switch input if start with scene or automation

## [0.9.65] - (16.05.2020)
### Fixed 
- fixed power state

## [0.9.10] - (14.05.2020)
### Added
- added descriptions in config.schema.json

## [0.9.8] - (14.05.2020)
- revert back with defaults inputs
- added input type to inputs
- added other fixes in code to prevent app crash without configured inputs

## [0.9.0] - (14.05.2020) 
- added Types to the inputs references (please update Yours config.json)
- do not add or remove if exist from the config.json default inputs which are now contain in the code 
### [Default inputs:
                {
                    "name": "Live TV",
                    "reference": "com.webos.app.livetv",
                    "type": "TUNER"
                },
                {
                    "name": "HDMI 1",
                    "reference": "com.webos.app.hdmi1",
                    "type": "HDMI"
                },
                {
                    "name": "HDMI 2",
                    "reference": "com.webos.app.hdmi2",
                    "type": "HDMI"
                }

## [0.8.0] - (10.05.2020) 
- code cleanup

## [0.7.0] - (06.05.2020) 
- adapted to HAP-Node JS lib

## [0.5.57] - (06.05.2020)
- code cleanup

## [0.5.50] - (05.05.2020)
- fixes and performance inprovements
- correted logging state

## [0.5.16] - (05.05.2020)
- added real time read and write data for (lightbulb slider volume cont

## [0.5.0] - (01.05.2020)
- added support for webOS < 2.5.0 (please update Your config.json)

## [0.4.4] - (01.05.2020)
- fixes in real time data read and write

## [0.4.0] - (30.04.2020)
- added realtime data read and write

## [0.3.4] - (27.04.2020)
- added switch ON/OFF volume control (please update config.json)

## [0.3.0] - (26.04.2020)
- add Siri volume control
- add Slider] - (Brightness) volume control

## [0.2.112] - (21.04.2020)
- different fixes.

## [0.2.97] - (07.04.2020)
- fixed store of positin in HomeKit fav.

## [0.2.96] - (06.04.2020)
- name corrections in TV information files

## [0.2.95] - (05.04.2020)
- read and store appListFile from TV

## [0.2.93] - (05.04.2020)
- read and store serListFile from TV
- update README.md
- update sample-config.json

## [0.2.91] - (29.03.2020)
- fixes crash if no device name defined
- fixed config.schema.json
- fixed store file inside the Homebridge directory

## [0.2.90] - (29.03.2020)
- some small fixes

## [0.2.77] - (21.03.2020)
- corrections for homebridge git
- performance improvement

## [0.2.1] - (16.02.2020)
- fixed most bugs
- performance improvements
- code cleanup

## [0.0.1] - (10.02.2020)
- initial release
