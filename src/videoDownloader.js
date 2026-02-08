/**
 * Video Downloader Module - Using yt-dlp-exec
 * تحميل الفيديوهات من YouTube, TikTok, Instagram وأكثر من 1000 موقع
 * 
 * Same technology used by professional Telegram bots!
 */

const ytdlp = require('yt-dlp-exec');
const path = require('path');
const fs = require('fs');

// إعدادات
const TEMP_DIR = path.join(__dirname, '..', 'temp');
const MAX_FILE_SIZE = 678 * 1024 * 1024; // 100MB limit for large files

// أنماط الروابط المدعومة
const URL_PATTERNS = {
    youtube: /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)[\w-]+/gi,
    tiktok: /(?:https?:\/\/)?(?:www\.)?(?:vm\.)?tiktok\.com\/[@\w\/-]+/gi,
    instagram: /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:reel|p)\/[\w-]+/gi,
    twitter: /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/\w+\/status\/\d+/gi,
};

// إنشاء مجلد temp إذا لم يكن موجوداً
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * تنسيق الوقت (ثواني -> HH:MM:SS)
 */
function formatDuration(duration) {
    if (!duration) return '00:00';
    const seconds = Math.floor(duration);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    const mDisplay = m < 10 ? `0${m}` : m;
    const sDisplay = s < 10 ? `0${s}` : s;

    if (h > 0) {
        return `${h}:${mDisplay}:${sDisplay}`;
    }
    return `${mDisplay}:${sDisplay}`;
}

/**
 * الحصول على اسم المنصة
 */
function getPlatformName(platform) {
    const names = {
        youtube: 'YouTube',
        tiktok: 'TikTok',
        instagram: 'Instagram',
        twitter: 'Twitter/X',
    };
    return names[platform] || platform;
}

/**
 * اكتشاف روابط الفيديو في النص
 */
function detectVideoUrls(content) {
    const results = [];

    for (const [platform, pattern] of Object.entries(URL_PATTERNS)) {
        const matches = content.match(pattern);
        if (matches) {
            for (const url of matches) {
                const fullUrl = url.startsWith('http') ? url : `https://${url}`;
                results.push({ platform, url: fullUrl });
            }
        }
    }

    return results;
}

/**
 * الحصول على معلومات الفيديو من yt-dlp
 */
async function getVideoInfo(url) {
    try {
        console.log(`[yt-dlp] Fetching info for: ${url}`);

        const info = await ytdlp(url, {
            dumpSingleJson: true,
            noWarnings: true,
            noCheckCertificate: true,
            preferFreeFormats: true,
            // Use Android client to bypass bot detection
            extractorArgs: 'youtube:player_client=android',
        });

        return {
            title: info.title || 'video',
            thumbnail: info.thumbnail || null,
            duration: info.duration || 0,
            author: info.uploader || info.channel || 'Unknown',
            url: url
        };
    } catch (error) {
        console.error(`[yt-dlp] Failed to get video info:`, error.message);

        // Return basic info if metadata fetch fails
        return {
            title: 'فيديو',
            thumbnail: null,
            duration: 0,
            author: 'غير معروف',
            url: url
        };
    }
}

/**
 * التحقق من حجم الملف قبل التحميل
 */
async function checkFileSize(url, format = 'mp4', quality = 'best') {
    try {
        console.log(`[yt-dlp] Checking file size: ${url} (${format}, ${quality})`);

        let formatFilter;

        // Audio-only mode
        if (format === 'mp3') {
            formatFilter = 'bestaudio';
        } else {
            // Video mode with quality selection
            if (quality === 'best') {
                formatFilter = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
            } else if (quality === '720') {
                formatFilter = `bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]`;
            } else if (quality === '480') {
                formatFilter = `bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best[height<=480]`;
            } else if (quality === '360') {
                formatFilter = `bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360][ext=mp4]/best[height<=360]`;
            }
        }

        const info = await ytdlp(url, {
            dumpSingleJson: true,
            format: formatFilter,
            noWarnings: true,
            noCheckCertificate: true,
            extractorArgs: 'youtube:player_client=android',
        });

        const filesize = info.filesize || info.filesize_approx || 0;
        console.log(`[yt-dlp] Estimated file size: ${(filesize / 1024 / 1024).toFixed(2)}MB`);

        return {
            filesize: filesize,
            title: info.title || 'video',
            duration: info.duration || 0,
            willExceedLimit: filesize > MAX_FILE_SIZE
        };

    } catch (error) {
        console.error(`[yt-dlp] Failed to check file size:`, error.message);
        return {
            filesize: 0,
            title: 'video',
            duration: 0,
            willExceedLimit: false
        };
    }
}

/**
 * تحميل الفيديو باستخدام yt-dlp
 */
async function downloadVideo(url, format = 'mp4', quality = 'best') {
    try {
        const filename = `download_${Date.now()}`;
        const outputTemplate = path.join(TEMP_DIR, `${filename}.%(ext)s`);

        console.log(`[yt-dlp] Downloading: ${url} (${format}, ${quality})`);

        let options = {
            output: outputTemplate,
            noWarnings: true,
            noCheckCertificate: true,
            preferFreeFormats: true,
            // Use Android client to bypass YouTube bot detection
            extractorArgs: 'youtube:player_client=android',
            addHeader: [
                'referer:youtube.com',
                'user-agent:Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36'
            ],
        };

        // Audio-only mode
        if (format === 'mp3') {
            options.extractAudio = true;
            options.audioFormat = 'mp3';
            options.audioQuality = '192K';
            options.ffmpegLocation = 'C:\\ffmpeg-8.0.1-essentials_build\\bin';
        } else {
            // Video mode with quality selection
            if (quality === 'best') {
                options.format = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
            } else if (quality === '720') {
                options.format = `bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]`;
            } else if (quality === '480') {
                options.format = `bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best[height<=480]`;
            } else if (quality === '360') {
                options.format = `bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360][ext=mp4]/best[height<=360]`;
            }

            // Merge to mp4
            options.mergeOutputFormat = 'mp4';
            options.remuxVideo = 'mp4';
            options.ffmpegLocation = 'C:\\ffmpeg-8.0.1-essentials_build\\bin';
        }

        await ytdlp(url, options);

        // Find the downloaded file
        const files = fs.readdirSync(TEMP_DIR);
        const downloadedFile = files.find(f => f.startsWith(filename));

        if (!downloadedFile) {
            throw new Error('لم يتم العثور على الملف المحمل');
        }

        const filepath = path.join(TEMP_DIR, downloadedFile);
        console.log(`[yt-dlp] Downloaded to: ${filepath}`);

        return filepath;

    } catch (error) {
        console.error(`[yt-dlp] Download failed:`, error.message);

        if (error.message.includes('Unsupported URL')) {
            throw new Error('الرابط غير مدعوم. جرب رابط من YouTube أو TikTok أو Instagram');
        }
        if (error.message.includes('Video unavailable')) {
            throw new Error('الفيديو غير متوفر أو محذوف');
        }
        if (error.message.includes('Private video')) {
            throw new Error('الفيديو خاص ولا يمكن تحميله');
        }

        throw new Error(error.message || 'فشل في التحميل');
    }
}

/**
 * الحصول على رابط تحميل مباشر (بدون تحميل الملف)
 * مفيد للملفات الكبيرة التي تتجاوز حد Discord
 */
async function getDirectDownloadUrl(url, format = 'mp4', quality = 'best') {
    try {
        console.log(`[yt-dlp] Getting direct download URL: ${url} (${format}, ${quality})`);

        let formatFilter;

        // Audio-only mode
        if (format === 'mp3') {
            formatFilter = 'bestaudio[ext=mp3]/bestaudio';
            console.log(`[yt-dlp] Requesting MP3 format with filter: ${formatFilter}`);
        } else {
            // Video mode with quality selection
            if (quality === 'best') {
                formatFilter = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
            } else if (quality === '720') {
                formatFilter = `bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]`;
            } else if (quality === '480') {
                formatFilter = `bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best[height<=480]`;
            } else if (quality === '360') {
                formatFilter = `bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360][ext=mp4]/best[height<=360]`;
            }
        }

        const info = await ytdlp(url, {
            dumpSingleJson: true,
            format: formatFilter,
            noWarnings: true,
            noCheckCertificate: true,
            // Use Android client to bypass bot detection
            extractorArgs: 'youtube:player_client=android',
        });

        // Get the direct URL - prioritize the format filter result
        let directUrl = null;

        // First try to get URL from the format we requested
        if (info.requested_formats && info.requested_formats.length > 0) {
            // Use the first requested format that matches our quality
            const requestedFormat = info.requested_formats.find(f => 
                f.ext === (format === 'mp3' ? 'mp3' : 'mp4')
            );
            if (requestedFormat) {
                directUrl = requestedFormat.url;
                const formatInfo = format === 'mp3' ? 
                    `${requestedFormat.abr || 'unknown'}kbps MP3` : 
                    `${requestedFormat.height || 'unknown'}p ${requestedFormat.ext}`;
                console.log(`[yt-dlp] Using requested format: ${formatInfo}`);
            }
        }

        // If no requested format, try to find matching format from all formats
        if (!directUrl) {
            if (format === 'mp3') {
                // Find best audio format
                const audioFormat = info.formats?.find(f => 
                    f.acodec !== 'none' && (f.ext === 'mp3' || f.ext === 'm4a')
                );
                if (audioFormat) {
                    directUrl = audioFormat.url;
                    console.log(`[yt-dlp] Found audio format: ${audioFormat.abr || 'unknown'}kbps ${audioFormat.ext}`);
                }
            } else if (info.formats && info.formats.length > 0) {
                // Find best format matching our criteria
                let targetFormat = null;
                
                if (quality === 'best') {
                    // Find best mp4 format
                    targetFormat = info.formats.find(f => 
                        f.ext === 'mp4' && f.vcodec !== 'none' && f.acodec !== 'none'
                    ) || info.formats.find(f => f.ext === 'mp4');
                } else if (quality === '720') {
                    targetFormat = info.formats.find(f => 
                        f.height <= 720 && f.ext === 'mp4' && f.vcodec !== 'none'
                    );
                } else if (quality === '480') {
                    targetFormat = info.formats.find(f => 
                        f.height <= 480 && f.ext === 'mp4' && f.vcodec !== 'none'
                    );
                } else if (quality === '360') {
                    targetFormat = info.formats.find(f => 
                        f.height <= 360 && f.ext === 'mp4' && f.vcodec !== 'none'
                    );
                }
                
                if (targetFormat) {
                    directUrl = targetFormat.url;
                    console.log(`[yt-dlp] Found matching format: ${targetFormat.height}p ${targetFormat.ext} (${targetFormat.vcodec})`);
                } else {
                    console.log(`[yt-dlp] No matching format found for quality ${quality}`);
                }
            }
        }

        // Fallback to default URL
        if (!directUrl) {
            directUrl = info.url;
            console.log(`[yt-dlp] Using fallback URL for quality ${quality}`);
        }

        console.log(`[yt-dlp] Got direct URL for ${quality} quality (expires in ~6 hours)`);

        return {
            url: directUrl,
            title: info.title || 'video',
            filesize: info.filesize || info.filesize_approx || 0,
            ext: info.ext || (format === 'mp3' ? 'mp3' : 'mp4')
        };

    } catch (error) {
        console.error(`[yt-dlp] Failed to get direct URL:`, error.message);
        throw new Error('فشل في الحصول على رابط التحميل');
    }
}

/**
 * تحويل فيديو إلى MP3 (not needed with yt-dlp, keeping for compatibility)
 */
async function convertToMp3(videoPath) {
    // yt-dlp handles this automatically
    return videoPath;
}

/**
 * ضغط الفيديو تلقائياً للملفات الكبيرة
 */
async function autoCompressVideo(filePath, targetSizeMB = 50) {
    try {
        const currentSize = getFileSize(filePath);
        const currentSizeMB = currentSize / 1024 / 1024;
        
        console.log(`[Compression] Current size: ${currentSizeMB.toFixed(2)}MB, Target: ${targetSizeMB}MB`);
        
        if (currentSizeMB <= targetSizeMB) {
            console.log('[Compression] File size is acceptable, no compression needed');
            return filePath;
        }

        const filename = `compressed_${Date.now()}.mp4`;
        const outputPath = path.join(TEMP_DIR, filename);
        
        // Use ffmpeg for compression (more reliable than yt-dlp for this task)
        const ffmpeg = require('fluent-ffmpeg');
        ffmpeg.setFfmpegPath('C:\\ffmpeg-8.0.1-essentials_build\\bin\\ffmpeg.exe');
        ffmpeg.setFfprobePath('C:\\ffmpeg-8.0.1-essentials_build\\bin\\ffprobe.exe');
        
        return new Promise((resolve, reject) => {
            ffmpeg(filePath)
                .output(outputPath)
                .videoCodec('libx264')
                .audioCodec('aac')
                .audioBitrate('128k')
                .videoBitrate('1000k') // Target 1Mbps
                .size('?x720') // Max height 720p
                .format('mp4')
                .on('end', () => {
                    console.log('[Compression] Compression completed');
                    const compressedSize = getFileSize(outputPath);
                    const compressedSizeMB = compressedSize / 1024 / 1024;
                    console.log(`[Compression] Compressed size: ${compressedSizeMB.toFixed(2)}MB`);
                    
                    // Delete original file
                    deleteFile(filePath);
                    resolve(outputPath);
                })
                .on('error', (err) => {
                    console.error('[Compression] Error:', err.message);
                    resolve(filePath); // Return original if compression fails
                })
                .run();
        });
        
    } catch (error) {
        console.error('[Compression] Error:', error.message);
        return filePath; // Return original if compression fails
    }
}

/**
 * ضغط الفيديو (not needed with quality selection, keeping for compatibility)
 */
async function compressVideo(videoPath) {
    console.log('[yt-dlp] Compression handled by quality selection');
    return videoPath;
}

/**
 * الحصول على حجم الملف
 */
function getFileSize(filePath) {
    try {
        const stats = fs.statSync(filePath);
        return stats.size;
    } catch (error) {
        console.error('[yt-dlp] Error getting file size:', error);
        return 0;
    }
}

/**
 * حذف ملف
 */
function deleteFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`[yt-dlp] Deleted: ${filePath}`);
        }
    } catch (error) {
        console.error(`[yt-dlp] Error deleting file:`, error);
    }
}

/**
 * تنظيف مجلد temp من الملفات القديمة
 */
function cleanupTempDir() {
    try {
        const files = fs.readdirSync(TEMP_DIR);
        const now = Date.now();
        const maxAge = 60 * 60 * 1000; // 1 hour

        for (const file of files) {
            const filePath = path.join(TEMP_DIR, file);
            const stats = fs.statSync(filePath);

            if (now - stats.mtimeMs > maxAge) {
                deleteFile(filePath);
            }
        }
    } catch (error) {
        console.error('[yt-dlp] Cleanup error:', error);
    }
}

// Auto-cleanup every 30 minutes
setInterval(cleanupTempDir, 30 * 60 * 1000);

module.exports = {
    detectVideoUrls,
    getVideoInfo,
    checkFileSize,
    downloadVideo,
    getDirectDownloadUrl,
    convertToMp3,
    compressVideo,
    autoCompressVideo,
    getFileSize,
    deleteFile,
    getPlatformName,
    formatDuration,
    MAX_FILE_SIZE,
    TEMP_DIR
};
