require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');

// Web sunucusu ayarları
const app = require('./web.js');

// Telegram bot ayarları
const bot = new Telegraf(process.env.BOT_TOKEN);
require('./index.js')(bot);

// Port ayarı
const port = process.env.PORT || 3000;

// Web sunucusunu başlat
const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Sunucu http://0.0.0.0:${port} adresinde çalışıyor`);
    bot.launch()
        .then(() => {
            console.log('Telegram bot başlatıldı! 🚀');
        })
        .catch((err) => {
            console.error('Bot başlatılırken hata:', err);
        });
});

// Hata yönetimi
server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${port} zaten kullanımda. Başka bir port deneyin.`);
        process.exit(1);
    } else {
        console.error('Sunucu hatası:', error);
    }
}); 