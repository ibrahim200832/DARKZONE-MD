// Auto-reply: sends a canned response when an incoming message matches a
// configured trigger phrase. Triggers/replies are editable at runtime via
// setAutoReply(), stored through lib/configdb.js.
const config = require('../config');
const { getConfig, setConfig } = require('./configdb');
const { getMessageText } = require('./text');

const DEFAULT_REPLIES = {
    hi: 'Hello! 👋 How can I help you today?',
    hello: 'Hey there! 👋 How can I help you today?',
    menu: `Type ${config.PREFIX}menu to see available commands.`,
};

function getReplyMap() {
    return { ...DEFAULT_REPLIES, ...(getConfig('AUTO_REPLY_MAP') || {}) };
}

function setAutoReply(trigger, reply) {
    const map = getConfig('AUTO_REPLY_MAP') || {};
    map[trigger.toLowerCase()] = reply;
    setConfig('AUTO_REPLY_MAP', map);
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesTrigger(text, trigger) {
    return new RegExp(`\\b${escapeRegex(trigger.toLowerCase())}\\b`).test(text);
}

async function handleAutoReply(sock, msg) {
    if (config.AUTO_REPLY !== 'true') return false;
    if (!msg.message || msg.key.fromMe) return false;

    const text = getMessageText(msg).trim().toLowerCase();
    if (!text) return false;

    const replies = getReplyMap();
    for (const [trigger, reply] of Object.entries(replies)) {
        if (matchesTrigger(text, trigger)) {
            await sock.sendMessage(msg.key.remoteJid, { text: reply }, { quoted: msg });
            return true;
        }
    }

    return false;
}

module.exports = { handleAutoReply, setAutoReply, getReplyMap };
