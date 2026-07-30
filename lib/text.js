// Shared helpers for reading text out of a Baileys message.
const LINK_REGEX = /(https?:\/\/|www\.|chat\.whatsapp\.com\/|t\.me\/)\S+/i;

function getMessageText(msg) {
    const m = msg?.message;
    if (!m) return '';
    return (
        m.conversation ||
        m.extendedTextMessage?.text ||
        m.imageMessage?.caption ||
        m.videoMessage?.caption ||
        ''
    );
}

function containsLink(text) {
    return !!text && LINK_REGEX.test(text);
}

module.exports = { getMessageText, containsLink };
