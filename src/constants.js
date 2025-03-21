export const PlatformName = "LgWebOsTv";
export const PluginName = "homebridge-lgwebos-tv";

export const DefaultInputs = [
    {
        "name": "Live TV",
        "reference": "com.webos.app.livetv",
        "mode": 0
    },
    {
        "name": "HDMI 1",
        "reference": "com.webos.app.hdmi1",
        "mode": 0
    },
    {
        "name": "HDMI 2",
        "reference": "com.webos.app.hdmi2",
        "mode": 0
    }
];

export const InputSourceType = [
    "OTHER",
    "HOME_SCREEN",
    "TUNER",
    "HDMI",
    "COMPOSITE_VIDEO",
    "S_VIDEO",
    "COMPONENT_VIDEO",
    "DVI",
    "AIRPLAY",
    "USB",
    "APPLICATION"
];

export const ApiUrls = {
    "WsUrl": "ws://lgwebostv:3000",
    "WssUrl": "wss://lgwebostv:3001",
    "SocketUrl": "ssap://com.webos.service.networkinput/getPointerInputSocket",
    "ApiGetServiceList": "ssap://api/getServiceList",
    "GetSystemInfo": "ssap://system/getSystemInfo",
    "GetSoftwareInfo": "ssap://com.webos.service.update/getCurrentSWInformation",
    "GetInstalledApps": "ssap://com.webos.applicationManager/listApps",
    "GetChannelList": "ssap://tv/getChannelList",
    "GetPowerState": "ssap://com.webos.service.tvpower/power/getPowerState",
    "GetForegroundAppInfo": "ssap://com.webos.applicationManager/getForegroundAppInfo",
    "GetForegroundAppMediaInfo": "ssap://com.webos.media/getForegroundAppInfo",
    "GetCurrentChannel": "ssap://tv/getCurrentChannel",
    "GetChannelProgramInfo": "ssap://tv/getChannelProgramInfo",
    "GetExternalInputList": "ssap://tv/getExternalInputList",
    "GetAudioStatus": "ssap://audio/getStatus",
    "GetSoundOutput": "ssap://com.webos.service.apiadapter/audio/getSoundOutput",
    "GetVolume": "ssap://audio/getVolume",
    "GetSystemSettings": "ssap://settings/getSystemSettings",
    "GetSystemSettingDesc": "luna://com.webos.service.settings/getSystemSettingDesc",
    "GetAppState": "ssap://com.webos.service.appstatus/getAppStatus",
    "GetCalibration": "ssap://externalpq/getExternalPqData",
    "TurnOff": "ssap://system/turnOff",
    "TurnOn": "ssap://system/turnOn",
    "TurnOffScreen": "ssap://com.webos.service.tv.power/turnOffScreen",
    "TurnOnScreen": "ssap://com.webos.service.tv.power/turnOnScreen",
    "TurnOffScreen45": "ssap://com.webos.service.tvpower/power/turnOffScreen",
    "TurnOnScreen45": "ssap://com.webos.service.tvpower/power/turnOnScreen",
    "LaunchApp": "ssap://system.launcher/launch",
    "CloseApp": "ssap://system.launcher/close",
    "CloseMediaViewer": "ssap://media.viewer/close",
    "CloseWebApp": "ssap://webapp/closeWebApp",
    "OpenChannel": "ssap://tv/openChannel",
    "SwitchInput": "ssap://tv/switchInput",
    "SetCalibration": "ssap://externalpq/setExternalPqData",
    "SetVolume": "ssap://audio/setVolume",
    "SetVolumeUp": "ssap://audio/volumeUp",
    "SetVolumeDown": "ssap://audio/volumeDown",
    "SetMute": "ssap://audio/setMute",
    "SetSoundOutput": "ssap://audio/changeSoundOutput",
    "Set3dOn": "ssap://com.webos.service.tv.display/set3DOn",
    "Set3dOff": "ssap://com.webos.service.tv.display/set3DOff",
    "SetMediaPlay": "ssap://media.controls/play",
    "SetMediaPause": "ssap://media.controls/pause",
    "SetMediaStop": "ssap://media.controls/stop",
    "SetMediaRewind": "ssap://media.controls/rewind",
    "SetMediaFastForward": "ssap://media.controls/fastForward",
    "SetTvChannelUp": "ssap://tv/channelUp",
    "SetTvChannelDown": "ssap://tv/channelDown",
    "CreateToast": "ssap://system.notifications/createToast",
    "CloseToast": "ssap://system.notifications/closeToast",
    "CreateAlert": "ssap://system.notifications/createAlert",
    "CloseAletrt": "ssap://system.notifications/closeAlert",
    "SetConfig": "luna://com.webos.service.config/setConfigs",
    "SetSystemSettings": "luna://com.webos.settingsservice/setSystemSettings",
    "TurnOnScreenSaver": "luna://com.webos.service.tvpower/power/turnOnScreenSaver",
    "RebootTv": "luna://com.webos.service.tvpower/power/reboot",
    "RebootTvWebOs5": "luna://com.webos.service.tv.power/reboot",
    "ShowInputPicker": "luna://com.webos.surfacemanager/showInputPicker",
    "SetDeviceInfo": "luna://com.webos.service.eim/setDeviceInfo",
    "EjectDevice": "luna://com.webos.service.attachedstoragemanager/ejectDevice",
    "ServiceMenu": "com.webos.app.factorywin"
};

export const Pairing = {
    "forcePairing": false,
    "pairingType": "PROMPT",
    "manifest": {
        "manifestVersion": 1,
        "appVersion": "1.1",
        "signed": {
            "created": "20140509",
            "appId": "com.lge.test",
            "vendorId": "com.lge",
            "localizedAppNames": {
                "": "LG Remote App",
                "ko-KR": "리모컨 앱",
                "zxx-XX": "ЛГ Rэмotэ AПП"
            },
            "localizedVendorNames": {
                "": "LG Electronics"
            },
            "permissions": [
                "TEST_SECURE",
                "CONTROL_INPUT_TEXT",
                "CONTROL_MOUSE_AND_KEYBOARD",
                "READ_INSTALLED_APPS",
                "READ_LGE_SDX",
                "READ_NOTIFICATIONS",
                "SEARCH",
                "WRITE_SETTINGS",
                "WRITE_NOTIFICATION_ALERT",
                "CONTROL_POWER",
                "READ_CURRENT_CHANNEL",
                "READ_RUNNING_APPS",
                "READ_UPDATE_INFO",
                "UPDATE_FROM_REMOTE_APP",
                "READ_LGE_TV_INPUT_EVENTS",
                "READ_TV_CURRENT_TIME"
            ],
            "serial": "2f930e2d2cfe083771f68e4fe7bb07"
        },
        "permissions": [
            "LAUNCH",
            "LAUNCH_WEBAPP",
            "APP_TO_APP",
            "CLOSE",
            "TEST_OPEN",
            "TEST_PROTECTED",
            "CONTROL_AUDIO",
            "CONTROL_DISPLAY",
            "CONTROL_INPUT_JOYSTICK",
            "CONTROL_INPUT_MEDIA_RECORDING",
            "CONTROL_INPUT_MEDIA_PLAYBACK",
            "CONTROL_INPUT_TV",
            "CONTROL_POWER",
            "CONTROL_TV_SCREEN",
            "CONTROL_TV_STANBY",
            "CONTROL_FAVORITE_GROUP",
            "CONTROL_USER_INFO",
            "CONTROL_BLUETOOTH",
            "CONTROL_TIMER_INFO",
            "CONTROL_RECORDING",
            "CONTROL_BOX_CHANNEL",
            "CONTROL_CHANNEL_BLOCK",
            "CONTROL_CHANNEL_GROUP",
            "CONTROL_TV_POWER",
            "CONTROL_WOL",
            "READ_APP_STATUS",
            "READ_CURRENT_CHANNEL",
            "READ_INPUT_DEVICE_LIST",
            "READ_NETWORK_STATE",
            "READ_RUNNING_APPS",
            "READ_TV_CHANNEL_LIST",
            "READ_POWER_STATE",
            "READ_COUNTRY_INFO",
            "READ_SETTINGS",
            "READ_RECORDING_STATE",
            "READ_RECORDING_LIST",
            "READ_RECORDING_SCHEDULE",
            "READ_STORAGE_DEVICE_LIST",
            "READ_TV_PROGRAM_INFO",
            "READ_TV_ACR_AUTH_TOKEN",
            "READ_TV_CONTENT_STATE",
            "READ_TV_CURRENT_TIME",
            "WRITE_NOTIFICATION_TOAST",
            "WRITE_RECORDING_LIST",
            "WRITE_RECORDING_SCHEDULE",
            "CHECK_BLUETOOTH_DEVICE",
            "STB_INTERNAL_CONNECTION",
            "ADD_LAUNCHER_CHANNEL",
            "SCAN_TV_CHANNELS",
            "SET_CHANNEL_SKIP",
            "RELEASE_CHANNEL_SKIP",
            "DELETE_SELECT_CHANNEL"
        ],
        "signatures": [
            {
                "signatureVersion": 1,
                "signature": "eyJhbGdvcml0aG0iOiJSU0EtU0hBMjU2Iiwia2V5SWQiOiJ0ZXN0LXNpZ25pbmctY2VydCIsInNpZ25hdHVyZVZlcnNpb24iOjF9.hrVRgjCwXVvE2OOSpDZ58hR+59aFNwYDyjQgKk3auukd7pcegmE2CzPCa0bJ0ZsRAcKkCTJrWo5iDzNhMBWRyaMOv5zWSrthlf7G128qvIlpMT0YNY+n/FaOHE73uLrS/g7swl3/qH/BGFG2Hu4RlL48eb3lLKqTt2xKHdCs6Cd4RMfJPYnzgvI4BNrFUKsjkcu+WD4OO2A27Pq1n50cMchmcaXadJhGrOqH5YmHdOCj5NSHzJYrsW0HPlpuAx/ECMeIZYDh6RMqaFM2DXzdKX9NmmyqzJ3o/0lkk/N97gfVRLW5hA29yeAwaCViZNCP8iC9aO0q9fQojoa7NQnAtw=="
            }
        ]
    }
};

export const SystemApps = [
    "undefined",
    "com.webos.app.softwareupdate",
    "com.webos.app.acrcomponent",
    "com.webos.app.acrhdmi1",
    "com.webos.app.acrhdmi2",
    "com.webos.app.acrhdmi3",
    "com.webos.app.acrhdmi4",
    "com.webos.app.usbc1",
    "com.webos.app.usbc2",
    "com.webos.app.acroverlay",
    "com.webos.app.appcasting",
    "com.webos.app.miracast-overlay",
    "com.webos.app.container",
    "com.webos.app.twinzoom-inhdmi1",
    "com.webos.app.livezoom-inhdmi1",
    "com.webos.app.twinzoom-inhdmi2",
    "com.webos.app.livezoom-inhdmi2",
    "com.webos.app.twinzoom-inhdmi3",
    "com.webos.app.livezoom-inhdmi3",
    "com.webos.app.twinzoom-inhdmi4",
    "com.webos.app.livezoom-inhdmi4",
    "com.webos.app.twinzoom-inphotovideo",
    "com.webos.app.livezoom-inphotovideo",
    "com.webos.app.twinlivezoom-inphotovideo",
    "com.webos.app.livezoom-insmhl",
    "com.webos.app.twinzoom-intv",
    "com.webos.app.livezoom-intv",
    "com.webos.app.twinzoom-inrecordings",
    "com.webos.app.livezoom-inrecordings",
    "com.webos.app.twinzoom-intwindemo",
    "com.webos.app.twinlivezoom-intwindemo",
    "com.webos.app.twinzoom-inmiracast",
    "com.webos.app.tvtutorial",
    "com.webos.app.inputcommon",
    "com.webos.app.mvpdwin",
    "com.webos.app.mystarter",
    "com.webos.app.customersupport",
    "com.webos.app.scheduler",
    "com.webos.app.cheeringtv",
    "com.webos.app.accessibility",
    "com.webos.app.adapp",
    "com.webos.app.crb",
    "com.webos.app.installation",
    "com.webos.app.tvuserguide",
    "com.webos.app.smhl",
    "com.webos.app.store-demo",
    "com.webos.app.eula",
    "com.webos.app.acrcard",
    "com.webos.app.livedmost",
    "com.webos.app.twinwizard",
    "com.webos.app.tvhotkey",
    "com.webos.app.channelsetting",
    "com.webos.app.inputmgr",
    "com.webos.app.membership",
    "com.webos.app.connectionwizard",
    "com.webos.app.twindemo",
    "com.webos.app.webapphost",
    "com.webos.app.remotesetting",
    "com.webos.app.facebooklogin",
    "com.webos.app.voice",
    "com.webos.app.oobe",
    "com.webos.app.beanbrowser",
    "com.webos.app.remoteservice",
    "com.webos.app.tvsimpleviewer",
    "com.webos.app.magicnum",
    "com.webos.app.dvrpopup",
    "com.webos.app.btspeakerapp",
    "com.webos.app.weatherlocation",
    "com.webos.app.partialview",
    "com.webos.app.recommend",
    "com.webos.app.btsurroundautotuning",
    "com.webos.app.systemmusic",
    "com.webos.app.self-diagnosis",
    "com.webos.app.care365",
    "com.webos.app.miracast",
    "com.webos.app.livepick",
    "com.webos.app.onetouchsoundtuning",
    "com.webos.app.sync-demo",
    "com.webos.app.voiceweb",
    "com.webos.app.totalmusic",
    "com.webos.app.sportstreamsettings",
    "com.webos.app.sheduler",
    "com.webos.app.dangbei-overlay",
    "com.webos.app.dangbei-card",
    "com.webos.app.livemenuplayer-incomponent",
    "com.webos.app.livemenuplayer-inscart",
    "com.webos.app.livemenuplayer-intv",
    "com.webos.app.livemenuplayer-inav1",
    "com.webos.app.livemenuplayer-inav2",
    "com.webos.app.livemenuplayer-inhdmi1",
    "com.webos.app.livemenuplayer-inhdmi2",
    "com.webos.app.livemenuplayer-inhdmi3",
    "com.webos.app.livemenuplayer-inhdmi4",
    "com.webos.app.tips",
    "com.webos.app.familycare",
    "com.webos.app.firstuse-overlay",
    "com.webos.app.gameoptimizer",
    "com.webos.app.helpandtips",
    "com.webos.app.livetvopapp",
    "com.webos.app.picturewizard",
    "com.webos.app.remotecontrolguide",
    "com.webos.service.homeconnect.app",
    "com.webos.service.billing.app",
    "com.webos.app.liveginga",
    "com.webos.app.liveinteractivecontent",
    "com.webos.app.lifeonscreen",
    "com.webos.app.roomconnect-full",
    "com.webos.app.voiceview",
    "com.webos.app.iot-thirdparty-login",
    "com.webos.app.brandshop",
    "com.webos.app.lgnlp",
    "com.webos.app.actionhandler",
    "com.webos.app.channeledit",
    "com.webos.app.factorywin",
    "com.webos.exampleapp.enyoapp.epg",
    "com.webos.exampleapp.qmlapp.hbbtv",
    "com.webos.exampleapp.qmlapp.client.positive.one",
    "com.webos.exampleapp.qmlapp.client.positive.two",
    "com.webos.exampleapp.qmlapp.client.negative.one",
    "com.webos.exampleapp.qmlapp.client.negative.two",
    "com.webos.exampleapp.systemui",
    "com.webos.exampleapp.groupowner",
    "com.webos.exampleapp.qmlapp.livetv",
    "com.webos.exampleapp.nav",
    "com.webos.exampleapp.qmlapp.epg",
    "com.webos.exampleapp.qmlapp.discover",
    "com.webos.exampleapp.qmlapp.search",
    "com.palm.app.firstuse",
    "com.palm.app.remotecontrolguide",
    "com.webos.app.shoppinghdmi2",
    "com.webos.app.shoppinghdmi1",
    "com.webos.app.shoppinghdmi4",
    "com.webos.app.shoppingoverlay",
    "com.webos.app.shoppinghdmi3",
    "alibaba.genie",
    "alibaba.genie.view",
    "amazon.alexa.view",
    "com.webos.app.adhdmi1",
    "com.webos.app.adhdmi2",
    "com.webos.app.adhdmi3",
    "com.webos.app.adhdmi4",
    "com.webos.app.adoverlay",
    "com.webos.app.adoverlayex",
    "com.webos.app.overlaymembership",
    "com.webos.chromecast",
    "com.webos.chromecast-settings"
];

export const PictureModes = {
    "cinema": "Cinema",
    "eco": "Eco",
    "expert1": "Expert 1",
    "expert2": "Expert 2",
    "game": "Game",
    "normal": "Normal",
    "photo": "Photo",
    "sports": "ws",
    "technicolor": "Technicolor",
    "vivid": "Vivid",
    "hdrEffect": "HDR Efect",
    "hdrCinemaBright": "HDR Cinema Bright",
    "hdrExternal": "HDR External",
    "hdrGame": "HDR Ganme",
    "hdrStandard": "HDR Standard",
    "hdrTechnicolor": "HDR Technicolor",
    "dolbyHdrCinema": "Dolby HDR Cinema",
    "dolbyHdrCinemaBright": "Dolby HDR Cinema Bright",
    "dolbyHdrDarkAmazon": "Dolby HDR Dark Amazon",
    "dolbyHdrGame": "Dolby HDR Game",
    "dolbyHdrStandard": "Dolby HDR Standard",
    "dolbyHdrVivid": "Dolby HDR Vivid",
    "dolbyStandard": "Dolby Standard"
};

export const SoundModes = {
    "aiSoundPlus": "AI Sound Plus",
    "standard": "Standard",
    "movie": "Movie",
    "clearVoice": "Clear Voice",
    "news": "News",
    "sport": "Sport",
    "music": "Music",
    "game": "Game"
};

export const SoundOutputs = {
    "tv_speaker": "TV Speaker",
    "mastervolume_tv_speaker": "TV Speaker",
    "external_speaker": "External Speakre",
    "external_optical": "External Optical",
    "external_arc": "External ARC",
    "lineout": "Line Out",
    "headphone": "Headphone",
    "tv_external_speaker": "TV External Speaker",
    "tv_external_headphone": "TV External Headphone",
    "bt_soundbar": "BT Soundbar",
    "soundbar": "Soundbar"
};