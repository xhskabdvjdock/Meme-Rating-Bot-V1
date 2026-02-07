/**
 * Video Downloader Module
 * تحميل الفيديوهات من YouTube, TikTok, Instagram
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');

// إعدادات
const TEMP_DIR = path.join(__dirname, '..', 'temp');
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB Discord limit
const MAX_CONCURRENT_DOWNLOADS = 3;

// أنماط الروابط المدعومة
const URL_PATTERNS = {
    youtube: /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)[\w-]+/gi,
    tiktok: /(?:https?:\/\/)?(?:www\.)?(?:vm\.)?tiktok\.com\/[@\w\/-]+/gi,
    instagram: /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:reel|p)\/[\w-]+/gi,
};

// Queue للتحميلات
const downloadQueue = [];
let activeDownloads = 0;

// إنشاء مجلد temp إذا لم يكن موجوداً
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * اكتشاف روابط الفيديو في النص
 * @param {string} content - محتوى الرسالة
 * @returns {Array<{platform: string, url: string}>}
 */
function detectVideoUrls(content) {
    const results = [];

    for (const [platform, pattern] of Object.entries(URL_PATTERNS)) {
        const matches = content.match(pattern);
        if (matches) {
            for (const url of matches) {
                // تأكد أن الرابط يبدأ بـ http
                const fullUrl = url.startsWith('http') ? url : `https://${url}`;
                results.push({ platform, url: fullUrl });
            }
        }
    }

    return results;
}

/**
 * الحصول على معلومات الفيديو باستخدام yt-dlp
 * @param {string} url - رابط الفيديو
 * @returns {Promise<object>}
 */
function getVideoInfo(url) {
    return new Promise((resolve, reject) => {
        const args = [
            '--dump-json',
            '--no-warnings',
            '--no-playlist',
            url,
        ];

        const process = spawn('yt-dlp', args);
        let stdout = '';
        let stderr = '';

        process.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        process.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        process.on('close', (code) => {
            if (code !== 0) {
                console.error(`[VideoDownloader] yt-dlp info error: ${stderr}`);
                reject(new Error('فشل في جلب معلومات الفيديو'));
                return;
            }

            try {
                const info = JSON.parse(stdout);
                resolve({
                    title: info.title || 'Unknown',
                    thumbnail: info.thumbnail || null,
                    duration: info.duration || 0,
                    author: info.uploader || info.channel || 'Unknown',
                    description: info.description?.substring(0, 200) || '',
                });
            } catch (e) {
                reject(new Error('فشل في تحليل معلومات الفيديو'));
            }
        });

        process.on('error', (err) => {
            console.error(`[VideoDownloader] yt-dlp spawn error:`, err);
            reject(new Error('yt-dlp غير مثبت أو غير موجود في PATH'));
        });
    });
}

/**
 * تحميل الفيديو
 * @param {string} url - رابط الفيديو
 * @param {string} format - 'mp4' أو 'mp3'
 * @param {string} quality - '720' أو '480' أو 'best'
 * @returns {Promise<string>} - مسار الملف
 */
function downloadVideo(url, format = 'mp4', quality = 'best') {
    return new Promise((resolve, reject) => {
        const filename = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const outputPath = path.join(TEMP_DIR, `${filename}.%(ext)s`);

        let args = [];

        if (format === 'mp3') {
            // تحميل الصوت فقط
            args = [
                '-x',
                '--audio-format', 'mp3',
                '--audio-quality', '192K',
                '-o', outputPath,
                '--no-warnings',
                '--no-playlist',
                url,
            ];
        } else {
            // تحميل الفيديو
            let formatSpec = 'best[ext=mp4]/best';
            if (quality === '720') {
                formatSpec = 'best[height<=720][ext=mp4]/best[height<=720]/best';
            } else if (quality === '480') {
                formatSpec = 'best[height<=480][ext=mp4]/best[height<=480]/best';
            }

            args = [
                '-f', formatSpec,
                '--merge-output-format', 'mp4',
                '-o', outputPath,
                '--no-warnings',
                '--no-playlist',
                url,
            ];
        }

        console.log(`[VideoDownloader] Starting download: ${url} (${format}, ${quality})`);

        const process = spawn('yt-dlp', args);
        let stderr = '';

        process.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        process.on('close', (code) => {
            if (code !== 0) {
                console.error(`[VideoDownloader] Download failed: ${stderr}`);
                reject(new Error('فشل في التحميل'));
                return;
            }

            // البحث عن الملف المحمّل
            const ext = format === 'mp3' ? 'mp3' : 'mp4';
            const expectedPath = path.join(TEMP_DIR, `${filename}.${ext}`);

            // yt-dlp قد يستخدم امتدادات مختلفة
            const files = fs.readdirSync(TEMP_DIR).filter(f => f.startsWith(filename));

            if (files.length === 0) {
                reject(new Error('لم يتم العثور على الملف المحمّل'));
                return;
            }

            const downloadedFile = path.join(TEMP_DIR, files[0]);
            console.log(`[VideoDownloader] Download complete: ${downloadedFile}`);
            resolve(downloadedFile);
        });

        process.on('error', (err) => {
            console.error(`[VideoDownloader] Spawn error:`, err);
            reject(new Error('yt-dlp غير مثبت'));
        });
    });
}

/**
 * تحويل الفيديو إلى mp3
 * @param {string} videoPath - مسار الفيديو
 * @returns {Promise<string>} - مسار الـ mp3
 */
function convertToMp3(videoPath) {
    return new Promise((resolve, reject) => {
        const outputPath = videoPath.replace(/\.[^.]+$/, '.mp3');

        console.log(`[VideoDownloader] Converting to MP3: ${videoPath}`);

        ffmpeg(videoPath)
            .toFormat('mp3')
            .audioBitrate('192k')
            .on('end', () => {
                console.log(`[VideoDownloader] Conversion complete: ${outputPath}`);
                // حذف الفيديو الأصلي
                fs.unlink(videoPath, () => { });
                resolve(outputPath);
            })
            .on('error', (err) => {
                console.error(`[VideoDownloader] Conversion error:`, err);
                reject(new Error('فشل في التحويل إلى MP3'));
            })
            .save(outputPath);
    });
}

/**
 * ضغط الفيديو لتصغير الحجم
 * @param {string} filePath - مسار الملف
 * @param {number} targetSize - الحجم المستهدف بالبايت
 * @returns {Promise<string>}
 */
function compressVideo(filePath, targetSize = MAX_FILE_SIZE) {
    return new Promise((resolve, reject) => {
        const stat = fs.statSync(filePath);

        // إذا الملف صغير كفاية، لا داعي للضغط
        if (stat.size <= targetSize) {
            resolve(filePath);
            return;
        }

        console.log(`[VideoDownloader] Compressing video (${(stat.size / 1024 / 1024).toFixed(2)}MB)`);

        const outputPath = filePath.replace(/\.mp4$/, '_compressed.mp4');

        // حساب bitrate تقريبي للوصول للحجم المطلوب
        // نستخدم probe للحصول على المدة
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) {
                reject(new Error('فشل في تحليل الفيديو'));
                return;
            }

            const duration = metadata.format.duration || 60;
            // الحجم المستهدف بالـ bits، مع هامش أمان 10%
            const targetBits = (targetSize * 8 * 0.9);
            const targetBitrate = Math.floor(targetBits / duration / 1000); // kbps

            // الحد الأدنى للجودة
            const finalBitrate = Math.max(500, Math.min(targetBitrate, 2000));

            ffmpeg(filePath)
                .videoBitrate(`${finalBitrate}k`)
                .audioBitrate('128k')
                .size('?x480') // تصغير الدقة
                .on('end', () => {
                    console.log(`[VideoDownloader] Compression complete: ${outputPath}`);
                    // حذف الملف الأصلي
                    fs.unlink(filePath, () => { });
                    resolve(outputPath);
                })
                .on('error', (err) => {
                    console.error(`[VideoDownloader] Compression error:`, err);
                    reject(new Error('فشل في ضغط الفيديو'));
                })
                .save(outputPath);
        });
    });
}

/**
 * التحقق من حجم الملف
 * @param {string} filePath 
 * @returns {number} - الحجم بالبايت
 */
function getFileSize(filePath) {
    try {
        return fs.statSync(filePath).size;
    } catch {
        return 0;
    }
}

/**
 * حذف ملف مؤقت
 * @param {string} filePath 
 */
function deleteFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`[VideoDownloader] Deleted temp file: ${filePath}`);
        }
    } catch (err) {
        console.error(`[VideoDownloader] Failed to delete file:`, err);
    }
}

/**
 * تنظيف جميع الملفات المؤقتة القديمة (أكثر من ساعة)
 */
function cleanupTempFiles() {
    try {
        const files = fs.readdirSync(TEMP_DIR);
        const oneHourAgo = Date.now() - 3600000;
        let cleaned = 0;

        for (const file of files) {
            const filePath = path.join(TEMP_DIR, file);
            const stat = fs.statSync(filePath);

            if (stat.mtimeMs < oneHourAgo) {
                fs.unlinkSync(filePath);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`[VideoDownloader] Cleaned up ${cleaned} temp files`);
        }
    } catch (err) {
        console.error(`[VideoDownloader] Cleanup error:`, err);
    }
}

/**
 * تنسيق المدة بشكل قابل للقراءة
 * @param {number} seconds 
 * @returns {string}
 */
function formatDuration(seconds) {
    if (!seconds || seconds === 0) return 'غير معروف';

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);

    if (mins === 0) return `${secs}ث`;
    return `${mins}د ${secs}ث`;
}

/**
 * الحصول على اسم المنصة بالعربي
 * @param {string} platform 
 * @returns {string}
 */
function getPlatformName(platform) {
    const names = {
        youtube: 'يوتيوب',
        tiktok: 'تيك توك',
        instagram: 'انستغرام',
    };
    return names[platform] || platform;
}

// تنظيف دوري كل 30 دقيقة
setInterval(cleanupTempFiles, 1800000);

module.exports = {
    detectVideoUrls,
    getVideoInfo,
    downloadVideo,
    convertToMp3,
    compressVideo,
    getFileSize,
    deleteFile,
    cleanupTempFiles,
    formatDuration,
    getPlatformName,
    MAX_FILE_SIZE,
    TEMP_DIR,
    URL_PATTERNS,
};
