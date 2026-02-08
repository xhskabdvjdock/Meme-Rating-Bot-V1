/**
 * 🎨 وحدة تحويل الميديا إلى GIF
 * تحويل الصور والفيديوهات إلى GIF باستخدام ffmpeg و sharp
 */

const ffmpeg = require("fluent-ffmpeg");
const sharp = require("sharp");
const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const http = require("node:http");

// مجلد الملفات المؤقتة
const TEMP_DIR = path.join(__dirname, "..", "temp");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// إعدادات الجودة
const QUALITY_SETTINGS = {
    low: { fps: 10, scale: 0.5, colors: 128 },
    medium: { fps: 15, scale: 0.7, colors: 256 },
    high: { fps: 20, scale: 1.0, colors: 256 },
};

// الصيغ المدعومة
const SUPPORTED_IMAGE_FORMATS = [".png", ".jpg", ".jpeg", ".webp"];
const SUPPORTED_VIDEO_FORMATS = [".mp4", ".webm", ".mov", ".avi"];
const ALL_SUPPORTED_FORMATS = [...SUPPORTED_IMAGE_FORMATS, ...SUPPORTED_VIDEO_FORMATS];

// الحدود
const MAX_FILE_SIZE_MB = 50;
const MAX_OUTPUT_SIZE_MB = 8;
const MAX_VIDEO_DURATION = 15;

/**
 * تحميل ملف من URL
 */
function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith("https") ? https : http;
        const file = fs.createWriteStream(destPath);

        protocol.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                // Follow redirect
                downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
                return;
            }
            response.pipe(file);
            file.on("finish", () => {
                file.close();
                resolve(destPath);
            });
        }).on("error", (err) => {
            fs.unlink(destPath, () => { });
            reject(err);
        });
    });
}

/**
 * تحويل صورة إلى GIF
 */
async function imageToGif(inputPath, outputPath, quality = "medium") {
    const settings = QUALITY_SETTINGS[quality] || QUALITY_SETTINGS.medium;

    try {
        // قراءة الصورة
        let image = sharp(inputPath);
        const metadata = await image.metadata();

        // تغيير الحجم إذا لزم الأمر
        if (settings.scale < 1.0) {
            const newWidth = Math.floor(metadata.width * settings.scale);
            image = image.resize(newWidth);
        }

        // تحويل إلى GIF
        await image.gif().toFile(outputPath);

        console.log(` تم تحويل الصورة إلى GIF: ${path.basename(outputPath)}`);
        return true;
    } catch (err) {
        console.error(" خطأ في تحويل الصورة:", err.message);
        return false;
    }
}

/**
 * تحويل فيديو إلى GIF
 */
function videoToGif(inputPath, outputPath, options = {}) {
    const quality = options.quality || "medium";
    const duration = Math.min(options.duration || 5, MAX_VIDEO_DURATION);
    const settings = QUALITY_SETTINGS[quality] || QUALITY_SETTINGS.medium;

    return new Promise((resolve, reject) => {
        // الحصول على معلومات الفيديو أولاً
        ffmpeg.ffprobe(inputPath, (err, metadata) => {
            if (err) {
                console.error(" خطأ في قراءة معلومات الفيديو:", err.message);
                reject(err);
                return;
            }

            const videoStream = metadata.streams.find(s => s.codec_type === "video");
            if (!videoStream) {
                reject(new Error("لا يوجد مسار فيديو في الملف"));
                return;
            }

            // حساب الحجم الجديد
            const originalWidth = videoStream.width;
            const newWidth = Math.floor(originalWidth * settings.scale);
            // جعل العرض زوجي (مطلوب لـ ffmpeg)
            const finalWidth = newWidth % 2 === 0 ? newWidth : newWidth - 1;

            console.log(` جاري تحويل الفيديو (${duration}ث، ${settings.fps}fps، ${finalWidth}px)...`);

            ffmpeg(inputPath)
                .setStartTime(0)
                .setDuration(duration)
                .outputOptions([
                    `-vf`, `fps=${settings.fps},scale=${finalWidth}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=${settings.colors}[p];[s1][p]paletteuse=dither=bayer`,
                    `-loop`, `0`
                ])
                .output(outputPath)
                .on("start", (cmd) => {
                    console.log(` ffmpeg command: ${cmd.substring(0, 100)}...`);
                })
                .on("end", () => {
                    console.log(` تم تحويل الفيديو إلى GIF: ${path.basename(outputPath)}`);
                    resolve(true);
                })
                .on("error", (err) => {
                    console.error(" خطأ في تحويل الفيديو:", err.message);
                    reject(err);
                })
                .run();
        });
    });
}

/**
 * تنظيف الملفات المؤقتة
 */
function cleanupFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(` تم حذف الملف المؤقت: ${path.basename(filePath)}`);
        }
    } catch (err) {
        console.error(" خطأ في حذف الملف:", err.message);
    }
}

/**
 * تنظيف مجلد temp بالكامل - حذف الملفات القديمة
 */
function cleanupTempFolder(maxAgeMinutes = 30) {
    try {
        if (!fs.existsSync(TEMP_DIR)) return;

        const files = fs.readdirSync(TEMP_DIR);
        const now = Date.now();
        let deletedCount = 0;

        for (const file of files) {
            const filePath = path.join(TEMP_DIR, file);
            try {
                const stats = fs.statSync(filePath);
                const ageMinutes = (now - stats.mtimeMs) / (1000 * 60);

                if (ageMinutes > maxAgeMinutes) {
                    fs.unlinkSync(filePath);
                    deletedCount++;
                }
            } catch (err) {
                // تجاهل الأخطاء للملفات الفردية
            }
        }

        if (deletedCount > 0) {
            console.log(` تم حذف ${deletedCount} ملف(ات) قديمة من مجلد temp`);
        }
    } catch (err) {
        console.error(" خطأ في تنظيف مجلد temp:", err.message);
    }
}

/**
 * بدء التنظيف الدوري
 */
function startPeriodicCleanup(intervalMinutes = 60) {
    // تنظيف فوري عند البدء
    cleanupTempFolder();

    // جدولة التنظيف الدوري
    setInterval(() => cleanupTempFolder(), intervalMinutes * 60 * 1000);
    console.log(` تم جدولة التنظيف الدوري كل ${intervalMinutes} دقيقة`);
}

/**
 * الحصول على حجم الملف بالميجابايت
 */
function getFileSizeMB(filePath) {
    const stats = fs.statSync(filePath);
    return stats.size / (1024 * 1024);
}

/**
 * التحقق من صيغة الملف
 */
function isSupported(filename) {
    const ext = path.extname(filename).toLowerCase();
    return ALL_SUPPORTED_FORMATS.includes(ext);
}

function isImage(filename) {
    const ext = path.extname(filename).toLowerCase();
    return SUPPORTED_IMAGE_FORMATS.includes(ext);
}

function isVideo(filename) {
    const ext = path.extname(filename).toLowerCase();
    return SUPPORTED_VIDEO_FORMATS.includes(ext);
}

/**
 * تحويل مرفق إلى GIF
 */
async function convertAttachment(attachment, options = {}) {
    const { quality = "medium", duration = 5 } = options;
    const ext = path.extname(attachment.name).toLowerCase();

    if (!isSupported(attachment.name)) {
        throw new Error("صيغة الملف غير مدعومة");
    }

    // التحقق من الحجم
    if (attachment.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        throw new Error(`الملف كبير جداً (الحد الأقصى ${MAX_FILE_SIZE_MB}MB)`);
    }

    const inputPath = path.join(TEMP_DIR, `input_${Date.now()}${ext}`);
    const outputPath = path.join(TEMP_DIR, `output_${Date.now()}.gif`);

    try {
        // تحميل الملف
        console.log(` جاري تحميل الملف: ${attachment.name}`);
        await downloadFile(attachment.url, inputPath);

        // تحويل حسب النوع
        let success;
        if (isImage(attachment.name)) {
            success = await imageToGif(inputPath, outputPath, quality);
        } else if (isVideo(attachment.name)) {
            success = await videoToGif(inputPath, outputPath, { quality, duration });
        }

        if (!success) {
            throw new Error("فشل التحويل");
        }

        // التحقق من حجم الناتج
        const outputSize = getFileSizeMB(outputPath);
        if (outputSize > MAX_OUTPUT_SIZE_MB) {
            throw new Error(`حجم GIF كبير جداً (${outputSize.toFixed(2)}MB). جرب جودة أقل.`);
        }

        return { outputPath, inputPath, sizeMB: outputSize };
    } catch (err) {
        // تنظيف في حالة الفشل
        cleanupFile(inputPath);
        cleanupFile(outputPath);
        throw err;
    }
}

module.exports = {
    convertAttachment,
    imageToGif,
    videoToGif,
    downloadFile,
    cleanupFile,
    cleanupTempFolder,
    startPeriodicCleanup,
    getFileSizeMB,
    isSupported,
    isImage,
    isVideo,
    TEMP_DIR,
    QUALITY_SETTINGS,
    SUPPORTED_IMAGE_FORMATS,
    SUPPORTED_VIDEO_FORMATS,
    ALL_SUPPORTED_FORMATS,
    MAX_FILE_SIZE_MB,
    MAX_OUTPUT_SIZE_MB,
    MAX_VIDEO_DURATION,
};
