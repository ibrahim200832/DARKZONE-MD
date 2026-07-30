// Standalone demo: connects to WhatsApp via Baileys and activates the
// anti-link and auto-reply features from lib/features.js.
//
// This is deliberately separate from index.js, whose bot logic is minified
// and self-defending (obfuscated) and could not be safely verified or
// edited. Run this file directly to try the new features:
//
//   node example-connect.js
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const P = require('pino');
const { registerBotFeatures } = require('./lib/features');
const config = require('./config');

async function start() {
    const { state, saveCreds } = await useMultiFileAuthState('./session');
    const sock = makeWASocket({
        auth: state,
        logger: P({ level: 'silent' }),
        printQRInTerminal: true,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed.', shouldReconnect ? 'Reconnecting...' : 'Logged out.');
            if (shouldReconnect) start();
        } else if (connection === 'open') {
            console.log('✅ Connected to WhatsApp');
        }
    });

    registerBotFeatures(sock, { ownerNumber: config.OWNER_NUMBER });
}

start();
