import express, { json } from 'express';
import EventEmitter from 'events';

class RestFul extends EventEmitter {
    constructor(config) {
        super();
        this.restFulPort = config.port;
        this.restFulDebug = config.debug;

        this.restFulData = {
            systeminfo: 'This data is not available in your system at this time.',
            softwareinfo: 'This data is not available in your system at this time.',
            channels: 'This data is not available in your system at this time.',
            power: 'This data is not available in your system at this time.',
            apps: 'This data is not available in your system at this time.',
            audio: 'This data is not available in your system at this time.',
            currentapp: 'This data is not available in your system at this time.',
            currentchannel: 'This data is not available in your system at this time.',
            picturesettings: 'This data is not available in your system at this time.',
            soundmode: 'This data is not available in your system at this time.',
            soundoutput: 'This data is not available in your system at this time.',
            externalinputlist: 'This data is not available in your system at this time.',
            mediainfo: 'This data is not available in your system at this time.'
        }
        this.connect();
    }

    connect() {
        try {
            const restFul = express();
            restFul.set('json spaces', 2);
            restFul.use(json());

            // GET Routes
            restFul.get('/systeminfo', (req, res) => { res.json(this.restFulData.systeminfo) });
            restFul.get('/softwareinfo', (req, res) => { res.json(this.restFulData.softwareinfo) });
            restFul.get('/channels', (req, res) => { res.json(this.restFulData.channels) });
            restFul.get('/power', (req, res) => { res.json(this.restFulData.power) });
            restFul.get('/apps', (req, res) => { res.json(this.restFulData.apps) });
            restFul.get('/audio', (req, res) => { res.json(this.restFulData.audio) });
            restFul.get('/currentapp', (req, res) => { res.json(this.restFulData.currentapp) });
            restFul.get('/currentchannel', (req, res) => { res.json(this.restFulData.currentchannel) });
            restFul.get('/picturesettings', (req, res) => { res.json(this.restFulData.picturesettings) });
            restFul.get('/soundmode', (req, res) => { res.json(this.restFulData.soundmode) });
            restFul.get('/soundoutput', (req, res) => { res.json(this.restFulData.soundoutput) });
            restFul.get('/externalinputlist', (req, res) => { res.json(this.restFulData.externalinputlist) });
            restFul.get('/mediainfo', (req, res) => { res.json(this.restFulData.externalinputlist) });

            // POST Route
            restFul.post('/', (req, res) => {
                try {
                    const obj = req.body;
                    if (!obj || typeof obj !== 'object' || Object.keys(obj).length === 0) {
                        this.emit('warn', `RESTFul Invalid JSON payload`);
                        return res.status(400).json({ error: 'RESTFul Invalid JSON payload' });
                    }
                    const key = Object.keys(obj)[0];
                    const value = obj[key];
                    this.emit('set', key, value);

                    const emitDebug = this.restFulDebug ? this.emit('debug', `RESTFul post data: ${JSON.stringify(obj, null, 2)}`) : false;
                    res.json({ success: true, received: obj });
                } catch (error) {
                    this.emit('warn', `RESTFul Parse error: ${error}`);
                    res.status(500).json({ error: 'RESTFul Internal Server Error' });
                }
            });

            // Start server
            restFul.listen(this.restFulPort, () => {
                this.emit('connected', `RESTful started on port: ${this.restFulPort}`);
            });
        } catch (error) {
            this.emit('warn', `RESTful Connect error: ${error}`)
        }
    }

    update(path, data) {
        switch (path) {
            case 'systeminfo':
                this.restFulData.systeminfo = data;
                break;
            case 'softwareinfo':
                this.restFulData.softwareinfo = data;
                break;
            case 'channels':
                this.restFulData.channels = data;
                break;
            case 'power':
                this.restFulData.power = data;
                break;
            case 'apps':
                this.restFulData.apps = data;
                break;
            case 'audio':
                this.restFulData.audio = data;
                break;
            case 'currentapp':
                this.restFulData.currentapp = data;
                break;
            case 'currentchannel':
                this.restFulData.currentchannel = data;
                break;
            case 'picturesettings':
                this.restFulData.picturesettings = data;
                break;
            case 'soundmode':
                this.restFulData.soundmode = data;
                break;
            case 'soundoutput':
                this.restFulData.soundoutput = data;
                break;
            case 'externalinputlist':
                this.restFulData.externalinputlist = data;
                break;
            case 'mediainfo':
                this.restFulData.mediainfo = data;
                break;
            default:
                this.emit('warn', `RESTFul update unknown path: ${path}, data: ${data}`)
                break;
        }
        const emitDebug = this.restFulDebug ? this.emit('debug', `RESTFul update path: ${path}, data: ${JSON.stringify(data, null, 2)}`) : false;
    }
}
export default RestFul;