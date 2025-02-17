require('dotenv').config();
const { Telegraf } = require('telegraf');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Sabit değişkenler
const OWNER_ID = 1382528596;
const CHANNEL_ID = -1002279989696;
const BOOKS_PER_PAGE = 10;

// Ayarlar dosyası yolu
const settingsPath = path.join(__dirname, 'settings.json');

// İstatistik dosyası yolu
const statsPath = path.join(__dirname, 'stats.json');

// İstatistikleri yükle
let stats = {
    downloads: {},
    users: [],
    groups: [],
    totalDownloads: 0
};

// İlk yükleme
function loadStats() {
    try {
        if (fs.existsSync(statsPath)) {
            stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
        } else {
            saveStats();
        }
    } catch (error) {
        console.error('İstatistikler yüklenirken hata:', error);
    }
}

// İstatistikleri kaydet
function saveStats() {
    try {
        fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
    } catch (error) {
        console.error('İstatistikler kaydedilirken hata:', error);
    }
}

// İlk yükleme
loadStats();

// Kullanıcı takip fonksiyonu
function trackUser(ctx) {
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    
    if (!userId) return;

    // Kullanıcıyı takip et
    if (!stats.users.includes(userId)) {
        stats.users.push(userId);
    }

    // Grup ise ve daha önce eklenmemişse ekle
    if (chatId && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') && !stats.groups.includes(chatId)) {
        stats.groups.push(chatId);
    }

    saveStats();
}

// Books klasörünü kontrol et, yoksa oluştur
const booksDir = path.join(__dirname, 'books');
if (!fs.existsSync(booksDir)) {
    fs.mkdirSync(booksDir);
}

// Kitapları sayfalama fonksiyonu
function getBookPages(books) {
    const pages = [];
    for (let i = 0; i < books.length; i += BOOKS_PER_PAGE) {
        pages.push(books.slice(i, i + BOOKS_PER_PAGE));
    }
    return pages;
}

// Sayfa için klavye oluşturma
function createPaginationKeyboard(currentPage, totalPages, books) {
    const keyboard = [];
    let row = [];
    
    // Kitap indirme düğmeleri
    books.forEach((book, index) => {
        const buttonText = `${(currentPage * BOOKS_PER_PAGE) + index + 1}`;
        const bookId = book.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
        
        row.push({
            text: buttonText,
            callback_data: `d_${bookId}`
        });

        // Her 3 düğmede bir yeni satır
        if (row.length === 3 || index === books.length - 1) {
            keyboard.push([...row]);
            row = [];
        }
    });

    // Sayfalama düğmeleri
    const navigationButtons = [];
    if (currentPage > 0) {
        navigationButtons.push({ text: '⬅️', callback_data: `p_${currentPage - 1}` });
    }
    if (currentPage < totalPages - 1) {
        navigationButtons.push({ text: '➡️', callback_data: `p_${currentPage + 1}` });
    }

    if (navigationButtons.length > 0) {
        keyboard.push(navigationButtons);
    }

    return keyboard;
}

// Kitap arama için klavye oluşturma
function createBookSearchKeyboard(books) {
    const keyboard = [];
    let row = [];

    books.forEach((book, index) => {
        const bookName = path.parse(book).name;
        const buttonText = `${index + 1}`;
        const bookId = book.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
        
        row.push({
            text: buttonText,
            callback_data: `d_${bookId}`
        });

        // Her 3 düğmede bir yeni satır
        if (row.length === 3 || index === books.length - 1) {
            keyboard.push([...row]);
            row = [];
        }
    });

    return keyboard;
}

// İndirme istatistiğini güncelle
function updateDownloadStats(userId, userName) {
    if (!stats.downloads[userId]) {
        stats.downloads[userId] = {
            count: 0,
            name: userName
        };
    }
    stats.downloads[userId].count++;
    stats.totalDownloads++;
    saveStats();
}

// Top kullanıcıları sırala
function getTopUsers(type = 'downloads', limit = 10) {
    const data = stats.downloads;
    return Object.entries(data)
        .sort(([, a], [b]) => b.count - a.count)
        .slice(0, limit)
        .map(([userId, data], index) => {
            return `${index + 1}. ${data.name}: ${data.count} indirme`;
        });
}

// Start komutu
bot.command('start', (ctx) => {
    trackUser(ctx);
    ctx.replyWithHTML(`Salam ${ctx.from.first_name}
Kitab botumuza xoş gəldin burda kitab axtara və yükləyə bilərsiniz

Ətraflı məlumat üçün /help `,{
    reply_markup: {
        inline_keyboard: [[
            { text: 'Web', url: 'http://193.35.154.81:6579' }
        ]]
    }
});
});

// Help komutu
bot.command('help', (ctx) => {
    const isPrivate = ctx.chat.type === 'private';
    const helpText = `
📚 Kitap Botu Komutları:

/list - Kitabxanadakı kitablara bax
${ctx.chat.type === 'group' || ctx.chat.type === 'supergroup' ? 
'/b [kitab adı] - Kitab axtar' : 
'📖 bot özəlində sadəcə yazar və ya kitab adını yazaraq axtara bilərsiniz!'}
`;
    ctx.reply(helpText);
});

// Top komutu
bot.command('top', async (ctx) => {
    const topDownloaders = getTopUsers('downloads');
    
    await ctx.reply(
        `📊 En Çok İndirme Yapan Kullanıcılar:\n\n${topDownloaders.join('\n')}`
    );
});

// Stats komutu
bot.command('stats', async (ctx) => {
    if (ctx.chat.type !== 'private' || ctx.from.id !== OWNER_ID) {
        return;
    }

    const statsMessage = `📊 Bot İstatistikleri\n\n` +
        `👤 İstifadəçi: ${stats.users.length}\n` +
        `👥 Group: ${stats.groups.length}\n` +
        `📥 Yükləmə: ${stats.totalDownloads}`;

    ctx.reply(statsMessage);
});

// List komutu
bot.command('list', async (ctx) => {
    try {
        const files = fs.readdirSync(booksDir)
            .filter(file => file.endsWith('.pdf'));

        if (files.length === 0) {
            ctx.reply('Kitab tapılmadı.');
            return;
        }

        const pages = getBookPages(files);
        const message = pages[0].map((file, index) => 
            `${index + 1}. 📚 ${path.parse(file).name}`
        ).join('\n');

        ctx.reply(
            `📚 Kitab səhifələri (1/${pages.length}):\n\n${message}:`,
            {
                reply_markup: {
                    inline_keyboard: createPaginationKeyboard(0, pages.length, pages[0])
                }
            }
        );
    } catch (error) {
        ctx.reply('Xəta baş verdi');
        console.error(error);
    }
});

// /b komutu için de aynı mantığı uygula
bot.command('b', async (ctx) => {
    const searchTerm = ctx.message.text.replace('/b ', '').toLowerCase();
    
    if (!searchTerm) {
        ctx.reply('Zəhmət olmasa kitab adını yazın.');
        return;
    }

    try {
        const files = fs.readdirSync(booksDir);
        const matchingBooks = files.filter(file => 
            path.parse(file).name.toLowerCase().includes(searchTerm)
        );

        if (matchingBooks.length === 0) {
            ctx.reply('Kitab tapılmadı.');
            return;
        }

        // Tam eşleşme kontrolü
        const exactMatch = matchingBooks.find(file => 
            path.parse(file).name.toLowerCase() === searchTerm
        );

        // Eğer tam eşleşme varsa veya sadece bir sonuç varsa direkt gönder
        if (exactMatch || matchingBooks.length === 1) {
            const bookToSend = exactMatch || matchingBooks[0];
            await sendBook(ctx, bookToSend);
        } else {
            // Birden fazla sonuç varsa düğmelerle göster
            ctx.reply(
                `🔍 "${searchTerm}" apılan kitablar:`,
                {
                    reply_markup: {
                        inline_keyboard: createBookSearchKeyboard(matchingBooks)
                    }
                }
            );
        }
    } catch (error) {
        ctx.reply('Arama yapılırken bir hata oluştu.');
        console.error(error);
    }
});

// Metin mesajlarını işle
bot.on('text', async (ctx) => {
    // Komutları ve grup mesajlarını yoksay
    if (ctx.message.text.startsWith('/') || ctx.chat.type !== 'private') return;

    const searchTerm = ctx.message.text.toLowerCase();
    
    try {
        const files = fs.readdirSync(booksDir);
        const matchingBooks = files.filter(file => 
            path.parse(file).name.toLowerCase().includes(searchTerm)
        );

        if (matchingBooks.length === 0) {
            ctx.reply('Kitab tapılmadı.');
            return;
        }

        // Tam eşleşme kontrolü
        const exactMatch = matchingBooks.find(file => 
            path.parse(file).name.toLowerCase() === searchTerm
        );

        // Eğer tam eşleşme varsa veya sadece bir sonuç varsa direkt gönder
        if (exactMatch || matchingBooks.length === 1) {
            const bookToSend = exactMatch || matchingBooks[0];
            await sendBook(ctx, bookToSend);
        } else {
            // Birden fazla sonuç varsa düğmelerle göster
            ctx.reply(
                `🔍 "${searchTerm}" tapılan kitaplar:`,
                {
                    reply_markup: {
                        inline_keyboard: createBookSearchKeyboard(matchingBooks)
                    }
                }
            );
        }
    } catch (error) {
        ctx.reply('Arama yapılırken bir hata oluştu.');
        console.error(error);
    }
});

// Callback query handler
bot.on('callback_query', async (ctx) => {
    const query = ctx.callbackQuery;
    
    if (query.data.startsWith('p_')) {
        const page = parseInt(query.data.split('_')[1]);
        
        try {
            const files = fs.readdirSync(booksDir);
            const pages = getBookPages(files);
            const message = pages[page].map((file, index) => 
                `${page * BOOKS_PER_PAGE + index + 1}. 📚 ${path.parse(file).name}`
            ).join('\n');

            await ctx.editMessageText(
                `📚 Kitab səhifələri (${page + 1}/${pages.length}):\n\n${message}`,
                {
                    reply_markup: {
                        inline_keyboard: createPaginationKeyboard(page, pages.length, pages[page])
                    }
                }
            );
        } catch (error) {
            console.error(error);
        }
    } else if (query.data.startsWith('d_')) {
        const bookId = query.data.split('_')[1];
        const files = fs.readdirSync(booksDir);
        const fileName = files.find(file => 
            file.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20) === bookId
        );
        
        if (fileName) {
            try {
                await sendBook(ctx, fileName);
                await ctx.deleteMessage(ctx.callbackQuery.message.message_id);

                updateDownloadStats(
                    ctx.from.id,
                    ctx.from.username || `${ctx.from.first_name}${ctx.from.last_name ? ' ' + ctx.from.last_name : ''}`
                );
            } catch (error) {
                ctx.reply('Kitap gönderilirken bir hata oluştu. Lütfen tekrar deneyin.');
                console.error(error);
            }
        }
    }
    
    await ctx.answerCbQuery();
});

// Kitap gönderme fonksiyonu
async function sendBook(ctx, fileName) {
    const filePath = path.join(booksDir, fileName);
    try {
        await ctx.replyWithDocument({
            source: filePath,
            filename: fileName
        }, {
            caption: `📖 ${path.parse(fileName).name}`
        });
        return true;
    } catch (error) {
        ctx.reply('Kitap gönderilirken bir hata oluştu. Lütfen tekrar deneyin.');
        console.error(error);
        return false;
    }
}

// Grup olaylarını dinle
bot.on('my_chat_member', (ctx) => {
    const chat = ctx.chat;
    const newStatus = ctx.update.my_chat_member.new_chat_member.status;
    
    // Bot gruba eklendiğinde
    if ((chat.type === 'group' || chat.type === 'supergroup') && 
        (newStatus === 'member' || newStatus === 'administrator')) {
        trackUser(ctx);
    }
});

// Grup mesajlarını dinle
bot.on('message', (ctx) => {
    if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
        trackUser(ctx);
    }
});

// Hata yakalama
bot.catch((err) => {
    console.error('Bot error:', err);
});

// Botu başlat
bot.launch()
    .then(() => {
        console.log('Bot başlatıldı! 🚀');
    })
    .catch((err) => {
        console.error('Bot başlatılırken hata oluştu:', err);
    });

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// Form verilerini Telegram'a gönderme fonksiyonu
global.sendToTelegram = async (formData) => {
    try {
        const message = `📬 Yeni İletişim Formu\n\n` +
            `👤 Ad Soyad: ${formData.name}\n` +
            `📧 E-posta: ${formData.email}\n` +
            `📝 Konu: ${formData.subject}\n` +
            `💬 Mesaj: ${formData.message}\n` +
            `📅 Tarih: ${new Date(formData.date).toLocaleString('tr-TR')}`;

        await bot.telegram.sendMessage(CHANNEL_ID, message);
    } catch (error) {
        console.error('Telegram mesaj gönderme hatası:', error);
    }
};
