const fs = require('fs');
const EventEmitter = require('events').EventEmitter;
const util = require('util');
const WebSocketClient = require('websocket').client;
const pairing = require('./pairing.json');

const SpecializedSocket = function (ws) {
    this.send = (type, payload) => {
        payload = payload || {};
        const message = Object.keys(payload).reduce((acc, k) => {
            return acc.concat([k + ':' + payload[k]]);
        }, ['type:' + type]).join('\n') + '\n\n';
        ws.send(message);
    };

    this.close = () => {
        ws.close();
    };
};

const LGTV = function (config) {

    config = config || {};
    config.url = config.url || 'ws://lgwebostv:3000';
    config.timeout = config.timeout || 15000;
    config.reconnect = typeof config.reconnect === 'undefined' ? 5000 : config.reconnect;

    let self = this;

    if (typeof config.clientKey === 'undefined') {
        try {
            self.clientKey = fs.readFileSync(config.keyFile).toString();
        } catch (err) {}
    } else {
        self.clientKey = config.clientKey;
    }

    self.saveKey = config.saveKey || function (key, response) {
        self.clientKey = key;
        fs.writeFile(config.keyFile, key, response);
    };

    const wsConfig = {
        keepalive: true,
        keepaliveInterval: 10000,
        dropConnectionOnKeepaliveTimeout: true,
        keepaliveGracePeriod: 5000
    };

    const client = new WebSocketClient(wsConfig);
    let connection = {};
    let isPaired = false;
    let autoReconnect = config.reconnect;

    let specializedSockets = {};

    let callbacks = {};
    let cidCount = 0;
    let cidPrefix = ('0000000' + (Math.floor(Math.random() * 0xFFFFFFFF).toString(16))).slice(-8);

    function getCid() {
        return cidPrefix + ('000' + (cidCount++).toString(16)).slice(-4);
    }

    let lastError;

    client.on('connectFailed', (error) => {
        if (lastError !== error.toString()) {
            self.emit('error', error);
        }
        lastError = error.toString();

        if (config.reconnect) {
            setTimeout(() => {
                if (autoReconnect) {
                    self.connect(config.url);
                }
            }, config.reconnect);
        }
    });

    client.on('connect', (conn) => {
        connection = conn;

        connection.on('error', (error) => {
            self.emit('error', error);
        });

        connection.on('close', (e) => {
            connection = {};
            Object.keys(callbacks).forEach((cid) => {
                delete callbacks[cid];
            });

            self.emit('close', e);
            self.connection = false;
            if (config.reconnect) {
                setTimeout(() => {
                    if (autoReconnect) {
                        self.connect(config.url);
                    }
                }, config.reconnect);
            }
        });

        connection.on('message', (message) => {
            self.emit('message', message);
            let parsedMessage;
            if (message.type === 'utf8') {
                if (message.utf8Data) {
                    try {
                        parsedMessage = JSON.parse(message.utf8Data);
                    } catch (err) {
                        self.emit('error', new Error('JSON parse error ' + message.utf8Data));
                    }
                }
                if (parsedMessage && callbacks[parsedMessage.id]) {
                    if (parsedMessage.payload && parsedMessage.payload.subscribed) {
                        if (typeof parsedMessage.payload.muted !== 'undefined') {
                            if (parsedMessage.payload.changed) {
                                parsedMessage.payload.changed.push('muted');
                            } else {
                                parsedMessage.payload.changed = ['muted'];
                            }
                        }
                        if (typeof parsedMessage.payload.volume !== 'undefined') {
                            if (parsedMessage.payload.changed) {
                                parsedMessage.payload.changed.push('volume');
                            } else {
                                parsedMessage.payload.changed = ['volume'];
                            }
                        }
                    }
                    callbacks[parsedMessage.id](null, parsedMessage.payload);
                }
            } else {
                self.emit('error', new Error('received non utf8 message ' + message.toString()));
            }
        });

        isPaired = false;

        self.connection = false;

        self.register();
    });

    this.register = () => {
        pairing['client-key'] = self.clientKey || undefined;

        self.send('register', undefined, pairing, (err, res) => {
            if (!err && res) {
                if (res['client-key']) {
                    self.emit('connect');
                    self.connection = true;
                    self.saveKey(res['client-key'], (err) => {
                        if (err) {
                            self.emit('error', err);
                        }
                    });
                    isPaired = true;
                } else {
                    self.emit('prompt');
                }
            } else {
                self.emit('error', err);
            }
        });
    };

    this.request = (uri, payload, response) => {
        this.send('request', uri, payload, response);
    };

    this.subscribe = (uri, payload, response) => {
        this.send('subscribe', uri, payload, response);
    };

    this.send = (type, uri, payload, response) => {
        if (typeof payload === 'function') {
            response = payload;
            payload = {};
        }

        if (!connection.connected) {
            if (typeof response === 'function') {
                response(new Error('not connected'));
            }
            return;
        }

        let cid = getCid();

        const json = JSON.stringify({
            id: cid,
            type: type,
            uri: uri,
            payload: payload
        });

        if (typeof response === 'function') {
            switch (type) {
                case 'request':
                    callbacks[cid] = (err, res) => {
                        delete callbacks[cid];
                        response(err, res);
                    };

                    // Set callback timeout
                    setTimeout(() => {
                        if (callbacks[cid]) {
                            response(new Error('timeout'));
                        }
                        delete callbacks[cid];
                    }, config.timeout);
                    break;

                case 'subscribe':
                    callbacks[cid] = response;
                    break;

                case 'register':
                    callbacks[cid] = response;
                    break;
                default:
                    throw new Error('unknown type');
            }
        }
        connection.send(json);
    };

    this.getSocket = (url, response) => {
        if (specializedSockets[url]) {
            response(null, specializedSockets[url]);
            return;
        }

        self.request(url, (err, data) => {
            if (err) {
                response(err);
                return;
            }

            const special = new WebSocketClient();
            special
                .on('connect', (conn) => {
                    conn
                        .on('error', (error) => {
                            self.emit('error', error);
                        })
                        .on('close', () => {
                            delete specializedSockets[url];
                        });

                    specializedSockets[url] = new SpecializedSocket(conn);
                    response(null, specializedSockets[url]);
                })
                .on('connectFailed', (error) => {
                    self.emit('error', error);
                });

            special.connect(data.socketPath);
        });
    };

    this.connect = (host) => {
        autoReconnect = config.reconnect;

        if (connection.connected && !isPaired) {
            self.register();
        } else if (!connection.connected) {
            self.emit('connecting', host);
            connection = {};
            client.connect(host);
        }
    };

    this.disconnect = () => {
        if (connection && connection.close) {
            connection.close();
        }
        autoReconnect = false;

        Object.keys(specializedSockets).forEach(
            (k) => {
                specializedSockets[k].close();
            }
        );
    };

    setTimeout(() => {
        self.connect(config.url);
    }, 0);
};
util.inherits(LGTV, EventEmitter);
module.exports = LGTV;