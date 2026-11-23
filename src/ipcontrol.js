import net from 'net';
import { pbkdf2Sync, createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const PORT = 9761;
const TIMEOUT = 5000;
const BLOCK = 16;
const SALT = Buffer.from([99, 97, 184, 14, 155, 220, 166, 99, 141, 7, 32, 242, 204, 86, 143, 185]);

// Picture modes of the LG Network IP Control, key is lower case webOS reference
// IP Control modes do not depend on the signal, the TV applies them to the playing SDR, HDR or Dolby Vision content
const PICTURE_MODES = {
    normal: 'normal',
    hdrstandard: 'normal',
    dolbyhdrstandard: 'normal',
    cinema: 'cinema',
    hdrcinema: 'cinema',
    dolbyhdrcinema: 'cinema',
    vivid: 'vivid',
    hdrvivid: 'vivid',
    dolbyhdrvivid: 'vivid',
    game: 'game',
    hdrgame: 'game',
    dolbyhdrgame: 'game',
    eco: 'eco',
    hdreco: 'eco',
    sport: 'sports',
    sports: 'sports',
    filmmaker: 'filmMaker',
    hdrfilmmaker: 'filmMaker'
};

class IpControl {
    constructor(host, keycode, port = PORT) {
        this.host = host;
        this.port = port;
        this.key = null;

        const code = String(keycode ?? '').trim().toUpperCase();
        if (/^[A-Z0-9]{8}$/.test(code)) this.key = pbkdf2Sync(code, SALT, 2 ** 14, BLOCK, 'sha256');
    }

    get configured() {
        return this.key !== null;
    }

    // Known modes are sent with the token the TV expects, other modes are sent as they are and the TV decides
    static pictureMode(reference) {
        const value = String(reference ?? '');
        return PICTURE_MODES[value.toLowerCase()] ?? (/^[A-Za-z0-9_]{1,40}$/.test(value) ? value : undefined);
    }

    encrypt(command) {
        let text = `${command}\r`;
        if (text.length % BLOCK === 0) text += ' ';
        const pad = BLOCK - (text.length % BLOCK);
        if (pad !== BLOCK) text += String.fromCharCode(pad).repeat(pad);

        const iv = randomBytes(BLOCK);
        const ecb = createCipheriv('aes-128-ecb', this.key, null);
        ecb.setAutoPadding(false);
        const cbc = createCipheriv('aes-128-cbc', this.key, iv);
        cbc.setAutoPadding(false);
        return Buffer.concat([ecb.update(iv), cbc.update(Buffer.from(text, 'utf8'))]);
    }

    decrypt(data) {
        const ecb = createDecipheriv('aes-128-ecb', this.key, null);
        ecb.setAutoPadding(false);
        const iv = ecb.update(data.subarray(0, BLOCK));
        const cbc = createDecipheriv('aes-128-cbc', this.key, iv);
        cbc.setAutoPadding(false);
        const text = cbc.update(data.subarray(BLOCK)).toString('utf8');
        const end = text.indexOf('\n');
        return end < 0 ? null : text.substring(0, end).trim();
    }

    // One short connection per command, the TV closes idle IP Control sessions
    send(command) {
        return new Promise((resolve, reject) => {
            if (!this.configured) return reject(new Error('IP Control code is not valid'));

            let buffer = Buffer.alloc(0);
            let done = false;
            const socket = net.createConnection({ host: this.host, port: this.port });
            const finish = (error, result) => {
                if (done) return;
                done = true;
                socket.destroy();
                error ? reject(error) : resolve(result);
            };

            socket.setTimeout(TIMEOUT, () => finish(new Error('IP Control timeout')));
            socket.once('error', error => finish(error));
            socket.once('close', () => finish(new Error('IP Control connection closed')));
            socket.once('connect', () => socket.write(this.encrypt(command)));
            socket.on('data', chunk => {
                buffer = Buffer.concat([buffer, chunk]);
                if (buffer.length < BLOCK * 2 || buffer.length % BLOCK !== 0) return;
                const response = this.decrypt(buffer);
                if (response !== null) finish(null, response);
            });
        });
    }

    async setPictureMode(reference) {
        const mode = IpControl.pictureMode(reference);
        if (!mode) throw new Error('Picture mode name is not valid');

        const response = await this.send(`PICTURE_MODE ${mode}`);
        if (response !== 'OK') throw new Error(`IP Control answer: ${response}`);
        return mode;
    }
}

export default IpControl;
