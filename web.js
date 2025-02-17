const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const session = require('express-session');
const { Telegraf } = require('telegraf');
const bcrypt = require('bcrypt');

const app = express();
const port = 3000;

// View engine ayarları
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Dil ve kategori dosyalarını yükle
const languages = JSON.parse(fs.readFileSync('languages.json', 'utf8'));
const categories = JSON.parse(fs.readFileSync('categories.json', 'utf8'));

// Middleware'leri doğru sırada tanımla
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware'i
app.use(session({
    secret: 'gizli-anahtar',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 gün
        secure: false
    }
}));

// Statik dosyaları servis et
app.use(express.static('public'));
app.use('/books', express.static('books'));
app.use('/covers', express.static('covers'));
app.use('/audio', express.static('audio'));

// Açık rotalar - giriş gerektirmeyen sayfalar
const publicRoutes = ['/login', '/register', '/css', '/images', '/audio'];

// Kullanıcı kontrolü middleware
const requireLogin = (req, res, next) => {
    // Eğer kullanıcı giriş yapmışsa devam et
    if (req.session.user) {
        return next();
    }

    // İstenen yol public bir rota mı kontrol et
    const isPublicRoute = publicRoutes.some(route => req.path.startsWith(route));
    if (isPublicRoute) {
        return next();
    }

    // Kullanıcı giriş yapmamış ve public olmayan bir rotaya erişmeye çalışıyorsa
    // Login sayfasına yönlendir
    res.redirect('/login');
};

// requireLogin middleware'i en son tanımlanmalı
app.use(requireLogin);

// Kullanıcıları yükle
function loadUsers() {
    try {
        const data = fs.readFileSync('users.json', 'utf8');
        return JSON.parse(data).users;
    } catch (error) {
        return [];
    }
}

// Kullanıcıları kaydet
function saveUsers(users) {
    fs.writeFileSync('users.json', JSON.stringify({ users }, null, 2));
}

// Login sayfası
app.get('/login', (req, res) => {
    if (req.session.user) {
        res.redirect('/');
    } else {
        res.render('login', { error: null });
    }
});

// Login işlemi
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const users = loadUsers();
    const user = users.find(u => u.username === username);

    if (user && await bcrypt.compare(password, user.password)) {
        req.session.user = { username: user.username, email: user.email };
        res.redirect('/');
    } else {
        res.render('login', { error: 'Yanlış istifadəçi adı və ya şifrə' });
    }
});

// Username validasyon fonksiyonu
function validateUsername(username) {
    // Sadece harf, rakam, nokta ve alt çizgi içerebilir
    const usernameRegex = /^[a-zA-Z0-9._]+$/;
    return usernameRegex.test(username);
}

// Register sayfası
app.get('/register', (req, res) => {
    if (req.session.user) {
        res.redirect('/');
    } else {
        res.render('register', { error: null });
    }
});

// Register işlemi
app.post('/register', async (req, res) => {
    try {
        const { username, email, password, confirmPassword } = req.body;

        // Boş alan kontrolü
        if (!username || !email || !password || !confirmPassword) {
            return res.render('register', { error: 'Bütün sahələri doldurun' });
        }

        // Username validasyonu
        if (!validateUsername(username)) {
            return res.render('register', { 
                error: 'İstifadəçi adı yalnız hərf, rəqəm, nöqtə və alt xətt içərə bilər' 
            });
        }

        // Minimum uzunluk kontrolü
        if (username.length < 3) {
            return res.render('register', { 
                error: 'İstifadəçi adı ən az 3 simvol olmalıdır' 
            });
        }

        if (password !== confirmPassword) {
            return res.render('register', { error: 'Şifrələr uyğun gəlmir' });
        }

        const users = loadUsers();

        // Username benzersizlik kontrolü
        if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
            return res.render('register', { error: 'Bu istifadəçi adı artıq mövcuddur' });
        }

        if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
            return res.render('register', { error: 'Bu e-poçt artıq istifadə olunur' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        users.push({
            username,
            email,
            password: hashedPassword,
            createdAt: new Date().toISOString()
        });

        saveUsers(users);
        res.redirect('/login');
    } catch (error) {
        console.error('Qeydiyyat xətası:', error);
        res.render('register', { error: 'Qeydiyyat zamanı xəta baş verdi' });
    }
});

// Çıkış işlemi
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// Dil middleware'i
app.use((req, res, next) => {
    req.lang = req.session.lang || 'az';
    req.translations = languages[req.lang];
    next();
});

// Dil değiştirme endpoint'i
app.get('/change-language/:lang', (req, res) => {
    const lang = req.params.lang;
    if (languages[lang]) {
        req.session.lang = lang;
    }
    res.redirect('back');
});

// Multer ayarları
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        if (file.fieldname === 'pdfFile') {
            cb(null, 'books/');
        } else if (file.fieldname === 'coverImage') {
            cb(null, 'covers/');
        } else if (file.fieldname === 'audio') {
            const audioDir = path.join(__dirname, 'public', 'audio');
            if (!fs.existsSync(audioDir)) {
                fs.mkdirSync(audioDir, { recursive: true });
            }
            cb(null, 'public/audio/');
        }
    },
    filename: function (req, file, cb) {
        if (file.fieldname === 'pdfFile') {
            cb(null, `${req.body.bookName}.pdf`);
        } else if (file.fieldname === 'coverImage') {
            cb(null, `${req.body.bookName}.jpg`);
        } else if (file.fieldname === 'audio') {
            cb(null, `${req.body.bookName}.mp3`);
        }
    }
});

const upload = multer({ storage: storage });

// Kullanıcı sayfaları için JSON dosyası
const userPagesPath = path.join(__dirname, 'user_pages.json');

// Kullanıcı sayfalarını yükle
function loadUserPages() {
    try {
        if (fs.existsSync(userPagesPath)) {
            const data = fs.readFileSync(userPagesPath, 'utf8');
            return JSON.parse(data);
        }
        return {};
    } catch (error) {
        console.error('İstifadəçi səhifələri yüklənərkən xəta:', error);
        return {};
    }
}

// Kullanıcı sayfalarını kaydet
function saveUserPages(pages) {
    try {
        const data = JSON.stringify(pages, null, 2);
        fs.writeFileSync(userPagesPath, data);
    } catch (error) {
        console.error('İstifadəçi səhifələri yadda saxlanılarkən xəta:', error);
        throw error;
    }
}

// Son sayfa kaydetme endpoint'i
app.post('/api/save-page', (req, res) => {
    try {
        const { bookName, page } = req.body;
        if (!bookName || !page) {
            return res.status(400).json({ error: 'Kitap adı və səhifə nömrəsi tələb olunur' });
        }

        const userPages = loadUserPages();
        userPages[bookName] = parseInt(page);
        saveUserPages(userPages);

        res.json({ success: true, message: 'Səhifə uğurla yadda saxlanıldı' });
    } catch (error) {
        console.error('Səhifə yadda saxlanılarkən xəta:', error);
        res.status(500).json({ error: 'Server xətası' });
    }
});

// Son sayfa getirme endpoint'i
app.get('/api/get-page/:bookName', (req, res) => {
    try {
        const { bookName } = req.params;
        if (!bookName) {
            return res.status(400).json({ error: 'Kitap adı tələb olunur' });
        }

        const userPages = loadUserPages();
        const page = userPages[bookName] || null;

        res.json({ success: true, page: page });
    } catch (error) {
        console.error('Səhifə alınarkən xəta:', error);
        res.status(500).json({ error: 'Server xətası' });
    }
});

// Stats dosyasını yükle
function loadStats() {
    try {
        const statsPath = path.join(__dirname, 'stats.json');
        if (fs.existsSync(statsPath)) {
            return JSON.parse(fs.readFileSync(statsPath, 'utf8'));
        }
    } catch (error) {
        console.error('Stats yüklenirken hata:', error);
    }
    return { users: [], groups: [], totalDownloads: 0, totalUploads: 0 };
}

// Kitap kapağı kontrolü ve oluşturma
function getBookCover(bookFile) {
    const bookName = path.parse(bookFile).name;
    const possibleExtensions = ['.jpg', '.jpeg', '.png'];
    
    for (const ext of possibleExtensions) {
        const coverName = bookName + ext;
        const coverPath = path.join(__dirname, 'covers', coverName);
        if (fs.existsSync(coverPath)) {
            return coverName;
        }
    }

    // Telegram bot'tan gelen kapak resmini kontrol et
    const telegramCoverPath = path.join(__dirname, 'books', bookName + '_cover.jpg');
    if (fs.existsSync(telegramCoverPath)) {
        const coverName = bookName + '.jpg';
        const newCoverPath = path.join(__dirname, 'covers', coverName);
        
        // Kapak resmini covers klasörüne taşı
        try {
            fs.copyFileSync(telegramCoverPath, newCoverPath);
            fs.unlinkSync(telegramCoverPath); // Orijinal dosyayı sil
            return coverName;
        } catch (error) {
            console.error('Kapak resmi taşıma hatası:', error);
        }
    }

    return null;
}

// Kitap bilgileri için JSON dosyası
const bookInfoPath = path.join(__dirname, 'book_info.json');

// Kitap bilgilerini yükle
function loadBookInfo() {
    try {
        if (fs.existsSync(bookInfoPath)) {
            return JSON.parse(fs.readFileSync(bookInfoPath, 'utf8'));
        }
        return {};
    } catch (error) {
        console.error('Kitab məlumatları yüklənərkən xəta:', error);
        return {};
    }
}

// Kitap bilgilerini kaydet
function saveBookInfo(info) {
    try {
        fs.writeFileSync(bookInfoPath, JSON.stringify(info, null, 2));
    } catch (error) {
        console.error('Kitab məlumatları yadda saxlanılarkən xəta:', error);
    }
}

// Aktivite kayıt fonksiyonu
function logActivity(userId, userName, action, details = null) {
    try {
        const activityLogPath = path.join(__dirname, 'activity_log.json');
        let activities = [];
        
        if (fs.existsSync(activityLogPath)) {
            activities = JSON.parse(fs.readFileSync(activityLogPath, 'utf8'));
        }
        
        activities.unshift({
            userId,
            userName,
            action,
            details,
            time: new Date().toISOString()
        });

        // Son 1000 aktiviteyi tut
        if (activities.length > 1000) {
            activities = activities.slice(0, 1000);
        }

        fs.writeFileSync(activityLogPath, JSON.stringify(activities, null, 2));
    } catch (error) {
        console.error('Aktivite kaydı hatası:', error);
    }
}

// Ana sayfa
app.get('/', (req, res) => {
    try {
        const booksDir = path.join(__dirname, 'books');
        const files = fs.readdirSync(booksDir)
            .filter(file => file.endsWith('.pdf'));
        const stats = loadStats();
        const bookInfo = loadBookInfo();
        
        const books = files.map(file => ({
            name: path.parse(file).name,
            file: file,
            cover: getBookCover(file),
            info: bookInfo[path.parse(file).name] || {}
        }));

        res.render('index', { 
            books, 
            stats, 
            categories: categories.categories,
            translations: req.translations,
            currentLang: req.lang,
            currentCategory: null,
            isAudioBooks: false
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Bir hata oluştu');
    }
});

// Kitap detay sayfası
app.get('/book/:bookName', (req, res) => {
    try {
        const bookName = req.params.bookName;
        const bookInfo = loadBookInfo();
        const bookData = bookInfo[bookName];

        if (!bookData) {
            return res.status(404).send('Kitap bulunamadı');
        }

        res.render('book-details', {
            book: {
                name: bookName,
                ...bookData,
                cover: getBookCover(bookName + '.pdf')
            },
            categories: categories.categories,
            translations: req.translations,
            currentLang: req.lang
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Bir hata oluştu');
    }
});

// Kategori filtreleme
app.get('/category/:categoryId', (req, res) => {
    try {
        const categoryId = req.params.categoryId;
        const bookInfo = loadBookInfo();
        const booksDir = path.join(__dirname, 'books');
        const files = fs.readdirSync(booksDir)
            .filter(file => file.endsWith('.pdf'));

        const books = files
            .map(file => ({
                name: path.parse(file).name,
                file: file,
                cover: getBookCover(file),
                info: bookInfo[path.parse(file).name] || {}
            }))
            .filter(book => book.info.categories && book.info.categories.includes(categoryId));

        res.render('index', {
            books,
            stats: loadStats(),
            categories: categories.categories,
            currentCategory: categoryId,
            translations: req.translations,
            currentLang: req.lang
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Bir hata oluştu');
    }
});

// Gelişmiş arama
app.get('/search', (req, res) => {
    try {
        const query = req.query.q.toLowerCase();
        const category = req.query.category;
        const author = req.query.author;
        const year = req.query.year;
        
        const booksDir = path.join(__dirname, 'books');
        const files = fs.readdirSync(booksDir)
            .filter(file => file.endsWith('.pdf'));
        const bookInfo = loadBookInfo();
        
        let books = files.map(file => ({
            name: path.parse(file).name,
            file: file,
            cover: getBookCover(file),
            info: bookInfo[path.parse(file).name] || {}
        }));

        // Filtreleme
        if (query) {
            books = books.filter(book => 
                book.name.toLowerCase().includes(query) ||
                (book.info.author && book.info.author.toLowerCase().includes(query)) ||
                (book.info.description && book.info.description.toLowerCase().includes(query))
            );
        }

        if (category) {
            books = books.filter(book => 
                book.info.categories && book.info.categories.includes(category)
            );
        }

        if (author) {
            books = books.filter(book => 
                book.info.author && book.info.author.toLowerCase().includes(author.toLowerCase())
            );
        }

        if (year) {
            books = books.filter(book => 
                book.info.publishYear && book.info.publishYear.toString() === year
            );
        }

        res.json(books);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Arama yapılırken bir hata oluştu' });
    }
});

// Paylaşım sayacını artır
app.post('/api/share/:bookName', (req, res) => {
    try {
        const bookName = req.params.bookName;
        const bookInfo = loadBookInfo();
        
        if (bookInfo[bookName]) {
            bookInfo[bookName].shareCount = (bookInfo[bookName].shareCount || 0) + 1;
            if (!bookInfo[bookName].shareDates) {
                bookInfo[bookName].shareDates = [];
            }
            bookInfo[bookName].shareDates.push(new Date().toISOString());
            
            logActivity('user', 'İstifadəçi', 'Kitabı paylaşdı', {
                bookName: bookName,
                author: bookInfo[bookName].author
            });

            saveBookInfo(bookInfo);
            res.json({ success: true, count: bookInfo[bookName].shareCount });
        } else {
            res.status(404).json({ error: 'Kitap bulunamadı' });
        }
    } catch (error) {
        res.status(500).json({ error: 'İşlem sırasında bir hata oluştu' });
    }
});

// İndirme sayacını artır
app.post('/api/download/:bookName', (req, res) => {
    try {
        const bookName = req.params.bookName;
        const bookInfo = loadBookInfo();
        
        if (bookInfo[bookName]) {
            bookInfo[bookName].downloadCount = (bookInfo[bookName].downloadCount || 0) + 1;
            if (!bookInfo[bookName].downloadDates) {
                bookInfo[bookName].downloadDates = [];
            }
            bookInfo[bookName].downloadDates.push(new Date().toISOString());
            
            logActivity('user', 'İstifadəçi', 'Kitabı yüklədi', {
                bookName: bookName,
                author: bookInfo[bookName].author
            });

            saveBookInfo(bookInfo);
            res.json({ success: true, count: bookInfo[bookName].downloadCount });
        } else {
            res.status(404).json({ error: 'Kitap bulunamadı' });
        }
    } catch (error) {
        res.status(500).json({ error: 'İşlem sırasında bir hata oluştu' });
    }
});

// Kitap okuma sayfası
app.get('/read/:book', (req, res) => {
    const bookFile = req.params.book;
    res.render('reader', { book: bookFile });
});

// Covers klasörünü kontrol et ve oluştur
const coversDir = path.join(__dirname, 'covers');
if (!fs.existsSync(coversDir)) {
    fs.mkdirSync(coversDir);
}

// Admin middleware
function requireAuth(req, res, next) {
    if (req.session.isAuthenticated) {
        next();
    } else {
        res.redirect('/admin');
    }
}

// Admin giriş sayfası
app.get('/admin', (req, res) => {
    res.render('admin-login', { error: null });
});

// Admin giriş işlemi
app.post('/admin/login', (req, res) => {
    const { username, password } = req.body;
    const adminData = JSON.parse(fs.readFileSync('admin.json', 'utf8'));

    const admin = adminData.admins.find(admin => 
        admin.username === username && admin.password === password
    );

    if (admin) {
        req.session.isAuthenticated = true;
        req.session.adminUsername = admin.username;
        logActivity(admin.username, admin.username, 'Admin girişi yaptı');
        res.redirect('/admin/panel');
    } else {
        res.render('admin-login', { error: 'İstifadəçi adı və ya şifrə yanlışdır' });
    }
});

// Admin panel
app.get('/admin/panel', requireAuth, async (req, res) => {
    try {
        const bookInfo = loadBookInfo();
        const stats = loadStats();
        const booksDir = path.join(__dirname, 'books');
        const files = fs.readdirSync(booksDir).filter(file => file.endsWith('.pdf'));

        // Son 7 günlük aktivite verilerini hazırla
        const today = new Date();
        const activityDates = [];
        const downloadData = [];
        const shareData = [];
        
        // Son 7 günün verilerini hazırla
        for (let i = 6; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = date.toLocaleDateString();
            activityDates.push(dateStr);

            // O güne ait indirme ve paylaşım sayılarını hesapla
            let dailyDownloads = 0;
            let dailyShares = 0;

            Object.values(bookInfo).forEach(book => {
                // İndirme ve paylaşım tarihlerini kontrol et ve say
                if (book.downloadDates) {
                    dailyDownloads += book.downloadDates.filter(d => 
                        new Date(d).toLocaleDateString() === dateStr
                    ).length;
                }
                if (book.shareDates) {
                    dailyShares += book.shareDates.filter(d => 
                        new Date(d).toLocaleDateString() === dateStr
                    ).length;
                }
            });

            downloadData.push(dailyDownloads);
            shareData.push(dailyShares);
        }

        // En çok indirilen kitapları hazırla
        const topBooks = Object.entries(bookInfo)
            .map(([name, info]) => ({
                name,
                downloads: info.downloadCount || 0
            }))
            .sort((a, b) => b.downloads - a.downloads)
            .slice(0, 5);

        // Kullanıcı verilerini hazırla
        const users = Object.entries(stats.downloads || {})
            .map(([id, info]) => ({
                name: info.name,
                downloads: info.count,
                lastActivity: new Date().toISOString() // Örnek veri
            }));

        // Son aktiviteleri hazırla
        const activities = [
            {
                user: "Samil",
                action: "Kitab yüklədi",
                time: new Date().toISOString()
            },
            {
                user: "Elvin",
                action: "Kitab paylaşdı",
                time: new Date(Date.now() - 3600000).toISOString()
            }
        ];

        // Kitap listesini hazırla
        const books = Object.entries(bookInfo).map(([name, info]) => ({
            name,
            author: info.author || 'Bilinmir',
            categories: Array.isArray(info.categories) ? info.categories : [info.categories],
            downloadCount: info.downloadCount || 0,
            addedAt: info.addedAt || new Date().toISOString()
        }));

        const activityLogPath = path.join(__dirname, 'activity_log.json');
        let activityLog = [];
        
        if (fs.existsSync(activityLogPath)) {
            activityLog = JSON.parse(fs.readFileSync(activityLogPath, 'utf8'));
        }

        res.render('admin-panel', {
            totalBooks: files.length,
            totalUsers: (stats.users || []).length,
            totalDownloads: stats.totalDownloads || 0,
            totalShares: Object.values(bookInfo).reduce((acc, book) => acc + (book.shareCount || 0), 0),
            activityDates: JSON.stringify(activityDates),
            downloadData: JSON.stringify(downloadData),
            shareData: JSON.stringify(shareData),
            topBooks,
            users,
            activities: activityLog.slice(0, 50), // Son 50 aktiviteyi göster
            books,
            categories: categories.categories,
            translations: req.translations,
            currentLang: req.lang
        });
    } catch (error) {
        console.error('Admin panel xətası:', error);
        res.status(500).send('Server xətası');
    }
});

// Kitap ekleme
app.post('/admin/add-book', requireAuth, upload.fields([
    { name: 'pdfFile', maxCount: 1 },
    { name: 'coverImage', maxCount: 1 },
    { name: 'audio', maxCount: 1 }
]), (req, res) => {
    try {
        const bookInfo = loadBookInfo();
        const bookName = req.body.bookName;
        
        bookInfo[bookName] = {
            addedBy: req.session.adminUsername,
            addedAt: new Date().toISOString(),
            author: req.body.author,
            categories: Array.isArray(req.body.categories) ? req.body.categories : [req.body.categories],
            pageCount: parseInt(req.body.pageCount) || null,
            publishYear: parseInt(req.body.publishYear) || null,
            language: req.body.language,
            description: req.body.description,
            isbn: req.body.isbn,
            publisher: req.body.publisher,
            shareCount: 0,
            downloadCount: 0,
            hasAudio: req.files && req.files.audio ? true : false
        };
        
        saveBookInfo(bookInfo);
        
        logActivity(req.session.adminUsername, req.session.adminUsername, 'Yeni kitab əlavə etdi', {
            bookName: bookName,
            author: req.body.author
        });

        res.json({ 
            success: true,
            message: 'Kitab uğurla əlavə edildi',
            bookInfo: bookInfo[bookName]
        });
    } catch (error) {
        console.error('Kitap ekleme hatası:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Kitap eklenirken bir hata oluştu'
        });
    }
});

// Kitap silme
app.delete('/admin/delete-book/:bookName', requireAuth, async (req, res) => {
    try {
        const bookName = req.params.bookName;
        const bookInfo = loadBookInfo();

        // Kitabın var olup olmadığını kontrol et
        if (!bookInfo[bookName]) {
            return res.status(404).json({ success: false, message: 'Kitab tapılmadı' });
        }

        // İlgili dosyaları sil
        const filesToDelete = [
            path.join(__dirname, 'books', `${bookName}.pdf`),
            path.join(__dirname, 'covers', `${bookName}.jpg`),
            path.join(__dirname, 'audio', `${bookName}.mp3`)
        ];

        for (const file of filesToDelete) {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        }

        // Kitap bilgilerini sil
        delete bookInfo[bookName];
        saveBookInfo(bookInfo);

        // Aktiviteyi kaydet
        logActivity(req.session.adminUsername, req.session.adminUsername, 'delete_book', bookName);

        res.json({ success: true, message: 'Kitab uğurla silindi' });
    } catch (error) {
        console.error('Kitap silme hatası:', error);
        res.status(500).json({ success: false, message: 'Kitab silinərkən xəta baş verdi' });
    }
});

// Kitap bilgilerini getirme endpoint'i
app.get('/admin/get-book/:bookName', requireAuth, (req, res) => {
    try {
        const bookName = req.params.bookName;
        const bookInfo = loadBookInfo();

        if (!bookInfo[bookName]) {
            return res.status(404).json({ success: false, message: 'Kitab tapılmadı' });
        }

        res.json({
            success: true,
            book: {
                name: bookName,
                ...bookInfo[bookName]
            }
        });
    } catch (error) {
        console.error('Kitap bilgileri alınırken hata:', error);
        res.status(500).json({ success: false, message: 'Kitab məlumatları alınarkən xəta baş verdi' });
    }
});

// Kitap düzenleme endpoint'i
app.post('/admin/edit-book', requireAuth, upload.fields([
    { name: 'cover', maxCount: 1 },
    { name: 'pdf', maxCount: 1 },
    { name: 'audio', maxCount: 1 }
]), async (req, res) => {
    try {
        const oldName = req.body.originalName;
        const newName = req.body.name || oldName;
        const bookInfo = loadBookInfo();

        if (!bookInfo[oldName]) {
            return res.status(404).json({ success: false, message: 'Kitab tapılmadı' });
        }

        // Mevcut kitap bilgilerini güncelle
        const updatedInfo = {
            ...bookInfo[oldName],
            name: newName,
            author: req.body.author || bookInfo[oldName].author,
            categories: req.body.categories ? (Array.isArray(req.body.categories) ? req.body.categories : [req.body.categories]) : bookInfo[oldName].categories,
            pageCount: parseInt(req.body.pageCount) || bookInfo[oldName].pageCount,
            publishYear: parseInt(req.body.publishYear) || bookInfo[oldName].publishYear,
            language: req.body.language || bookInfo[oldName].language,
            description: req.body.description || bookInfo[oldName].description,
            isbn: req.body.isbn || bookInfo[oldName].isbn,
            publisher: req.body.publisher || bookInfo[oldName].publisher,
            updatedAt: new Date().toISOString(),
            updatedBy: req.session.adminUsername,
            addedBy: bookInfo[oldName].addedBy,
            addedAt: bookInfo[oldName].addedAt,
            hasAudio: req.files && req.files.audio ? true : bookInfo[oldName].hasAudio
        };

        // Dosya işlemleri
        if (req.files) {
            // PDF dosyası
            if (req.files.pdf) {
                const oldPath = path.join(__dirname, 'books', `${oldName}.pdf`);
                const newPath = path.join(__dirname, 'books', `${newName}.pdf`);
                if (oldName !== newName && fs.existsSync(oldPath)) {
                    fs.renameSync(oldPath, newPath);
                }
            }

            // Kapak resmi
            if (req.files.cover) {
                const oldPath = path.join(__dirname, 'covers', `${oldName}.jpg`);
                const newPath = path.join(__dirname, 'covers', `${newName}.jpg`);
                if (oldName !== newName && fs.existsSync(oldPath)) {
                    fs.renameSync(oldPath, newPath);
                }
            }

            // Ses dosyası
            if (req.files.audio) {
                const oldPath = path.join(__dirname, 'public/audio', `${oldName}.mp3`);
                const newPath = path.join(__dirname, 'public/audio', `${newName}.mp3`);
                if (oldName !== newName && fs.existsSync(oldPath)) {
                    fs.renameSync(oldPath, newPath);
                }
                updatedInfo.hasAudio = true;
            }
        }

        // Kitap adı değiştiyse eski kaydı sil
        if (oldName !== newName) {
            delete bookInfo[oldName];
        }

        // Yeni bilgileri kaydet
        bookInfo[newName] = updatedInfo;
        saveBookInfo(bookInfo);

        // Aktiviteyi kaydet
        logActivity(req.session.adminUsername, req.session.adminUsername, 'edit_book', {
            oldName,
            newName,
            author: updatedInfo.author
        });

        res.json({ success: true, message: 'Kitab uğurla yeniləndi' });
    } catch (error) {
        console.error('Kitap düzenleme hatası:', error);
        res.status(500).json({ success: false, message: 'Kitab yenilənərkən xəta baş verdi' });
    }
});

// Admin çıkış
app.get('/admin/logout', (req, res) => {
    if (req.session.adminUsername) {
        logActivity(req.session.adminUsername, req.session.adminUsername, 'Admin çıxışı etdi');
    }
    req.session.destroy();
    res.redirect('/admin');
});

// Forum sayfası
app.get('/forum', (req, res) => {
    res.render('forum', {
        currentLang: req.session.lang || 'az',
        translations: req.translations
    });
});

const bot = new Telegraf("7612243919:AAHW1ElDKM9UA3229YYGbB_eoDbA8gftTwY");
const CHANNEL_ID = -1002279989696;

// Form verilerini Telegram'a gönderme fonksiyonu
async function sendToTelegram(formData) {
    try {
        const message = `📬 Yeni əlaqə formu\n\n` +
            `👤 Ad Soyad: ${formData.name}\n` +
            `📧 E-mail: ${formData.email}\n` +
            `📝 Mövzu: ${formData.subject}\n` +
            `💬 Mesaj: ${formData.message}\n` +
            `📅 Tarix: ${new Date(formData.date).toLocaleString('tr-TR')}`;

        await bot.telegram.sendMessage(CHANNEL_ID, message);
        return true;
    } catch (error) {
        console.error('Telegram mesaj gönderme hatası:', error);
        return false;
    }
}

// Forum gönderme endpoint'i
app.post('/forum/submit', async (req, res) => {
    try {
        const formData = {
            name: req.body.name,
            email: req.body.email,
            subject: req.body.subject,
            message: req.body.message,
            date: new Date()
        };

        const success = await sendToTelegram(formData);

        if (success) {
            res.json({ success: true, message: 'Mesaj başarıyla gönderildi' });
        } else {
            res.json({ success: false, message: 'Mesaj gönderilirken bir hata oluştu' });
        }
    } catch (error) {
        console.error('Form gönderme hatası:', error);
        res.json({ success: false, message: 'Bir hata oluştu' });
    }
});

// Sesli kitaplar sayfası
app.get('/audio-books', async (req, res) => {
    try {
        const booksDir = path.join(__dirname, 'books');
        const files = fs.readdirSync(booksDir)
            .filter(file => file.endsWith('.pdf'));
        const stats = loadStats();
        const bookInfo = loadBookInfo();
        
        const books = files
            .map(file => ({
                name: path.parse(file).name,
                file: file,
                cover: getBookCover(file),
                info: bookInfo[path.parse(file).name] || {}
            }))
            .filter(book => book.info.hasAudio === true);

        res.render('index', { 
            books, 
            stats, 
            categories: categories.categories,
            translations: req.translations || languages[req.session.lang || 'az'],
            currentLang: req.session.lang || 'az',
            currentCategory: null,
            isAudioBooks: true
        });
    } catch (error) {
        console.error('Error loading audio books:', error);
        res.status(500).send('Səsli kitabları yükləyərkən xəta baş verdi');
    }
});

// Sesli kitap yükleme endpoint'i
app.post('/admin/upload-audio/:bookName', upload.single('audio'), async (req, res) => {
    try {
        const { bookName } = req.params;
        const audioFile = req.file;

        if (!audioFile) {
            return res.status(400).json({ success: false, message: 'Ses dosyası bulunamadı' });
        }

        // Kitabı veritabanında güncelle
        await Book.findOneAndUpdate(
            { name: bookName },
            { 'info.hasAudio': true }
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Audio upload error:', error);
        res.status(500).json({ success: false, message: 'Ses dosyası yüklenemedi' });
    }
});

// Sesli kitap silme endpoint'i
app.delete('/admin/delete-audio/:bookName', requireAuth, async (req, res) => {
    try {
        const { bookName } = req.params;
        const bookInfo = loadBookInfo();

        if (!bookInfo[bookName]) {
            return res.status(404).json({ 
                success: false, 
                error: 'Kitap bulunamadı'
            });
        }

        // Ses dosyasını sil
        const audioPath = path.join(__dirname, 'public', 'audio', `${bookName}.mp3`);
        if (fs.existsSync(audioPath)) {
            fs.unlinkSync(audioPath);
        }

        // Kitap bilgilerini güncelle
        bookInfo[bookName].hasAudio = false;
        saveBookInfo(bookInfo);

        res.json({ success: true });
    } catch (error) {
        console.error('Ses dosyası silme hatası:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Ses dosyası silinirken bir hata oluştu'
        });
    }
});

// Admin kullanıcılar sayfası
app.get('/admin/users', requireAuth, (req, res) => {
    try {
        const users = loadUsers();
        res.render('admin-users', { users });
    } catch (error) {
        console.error('İstifadəçi siyahısı yüklənərkən xəta:', error);
        res.status(500).send('Server xətası');
    }
});

app.listen(port, 'localhost', () => {
    console.log(`Web sunucusu http://localhost:${port} adresinde çalışıyor`);
}); 