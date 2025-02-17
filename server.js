require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const app = express();

// Web sunucusu ayarları
require('./web.js');

// Telegram bot ayarları
const bot = new Telegraf(process.env.BOT_TOKEN);
require('./index.js')(bot);

// Port ayarı
const port = process.env.PORT || 3000;

// Web sunucusunu başlat
app.listen(port, '0.0.0.0', () => {
    console.log(`Sunucu http://0.0.0.0:${port} adresinde çalışıyor`);
    bot.launch()
        .then(() => {
            console.log('Telegram bot başlatıldı! 🚀');
        })
        .catch((err) => {
            console.error('Bot başlatılırken hata:', err);
        });
}); 