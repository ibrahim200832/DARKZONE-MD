// AI chat: replies to private messages with JARVIS's personality, using the
// same zero-setup free AI fallback (and optional custom-backend contract)
// as the jarvis-mobile companion app. Point AI_BACKEND_URL (or
// opts.backendUrl) at the same Cloudflare Worker the mobile app uses (see
// jarvis-mobile/worker/ai-proxy.js) to share one AI backend across both.
const axios = require('axios');
const config = require('../config');
const { getMessageText } = require('./text');

const JARVIS_SYSTEM_PROMPT =
    'Du bist JARVIS, mit der Persönlichkeit von Tony Starks JARVIS aus den Iron-Man-Filmen: ' +
    'gebildet, trocken-witzig, leicht sarkastisch, aber immer loyal und hilfsbereit. Du sprichst ' +
    'den Nutzer mit "Master" an. Antworte kurz (meist 1-2 Sätze), natürlich und im Gesprächston, ' +
    'wie ein echtes Telefonat, nicht wie ein Roman.';

async function askFreeFallback(message, model, httpClient) {
    const prompt = `${JARVIS_SYSTEM_PROMPT}\n\nMaster sagt: ${message}\n\nJARVIS antwortet:`;
    const url = `https://text.pollinations.ai/${encodeURIComponent(prompt)}`;
    try {
        const res = await httpClient.get(url, { params: { model }, timeout: 25000 });
        const reply = typeof res.data === 'string' ? res.data.trim() : '';
        return reply || 'Ich hab gerade keine Antwort bekommen, Master. Versuch es gleich nochmal.';
    } catch {
        return 'Ich konnte die KI gerade nicht erreichen, Master. Prüf deine Internetverbindung.';
    }
}

async function askBackend(backendUrl, message, httpClient) {
    try {
        const res = await httpClient.post(
            backendUrl.trim(),
            { message },
            { headers: { 'content-type': 'application/json' }, timeout: 25000 },
        );
        const reply = res.data?.reply;
        return reply && reply.length > 0 ? reply : 'Ich habe keine Antwort erhalten.';
    } catch {
        return 'Ich konnte die KI gerade nicht erreichen. Prüf deine Internetverbindung und die Server-Adresse.';
    }
}

async function ask(message, opts = {}) {
    const httpClient = opts.httpClient || axios;
    const backendUrl = opts.backendUrl ?? config.AI_BACKEND_URL;
    const model = opts.model || config.AI_MODEL || 'openai';
    if (backendUrl && backendUrl.trim().length > 0) {
        return askBackend(backendUrl, message, httpClient);
    }
    return askFreeFallback(message, model, httpClient);
}

async function handleAiChat(sock, msg, opts = {}) {
    if (config.AI_CHAT !== 'true') return false;
    if (!msg.message || msg.key.fromMe) return false;

    const jid = msg.key.remoteJid;
    if (!jid || jid.endsWith('@g.us')) return false; // private chats only, to avoid noisy groups

    const text = getMessageText(msg).trim();
    if (!text) return false;

    const reply = await ask(text, opts);
    await sock.sendMessage(jid, { text: reply }, { quoted: msg });
    return true;
}

module.exports = { handleAiChat, ask, JARVIS_SYSTEM_PROMPT };
