'use strict';
class WebSocketSpecialized {
    constructor(connection) {
        this.send = (type, payload) => {
            payload = payload || {};
            const message = Object.keys(payload).reduce((acc, k) => {
                return acc.concat([k + ':' + payload[k]]);
            }, ['type:' + type]).join('\n') + '\n\n';
            connection.send(message);
        };
        this.close = () => {
            connection.close();
        };
    };
};

module.exports = WebSocketSpecialized;