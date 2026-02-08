/**
 * Download Queue System
 * نظام صف للتحميلات لمنع التحميلات المتزامنة الكثيرة
 */

const MAX_CONCURRENT = 3; // الحد الأقصى للتحميلات المتزامنة

class DownloadQueue {
    constructor() {
        this.queue = [];
        this.active = 0;
    }

    /**
     * إضافة مهمة للصف
     * @param {Function} task - دالة async تنفذ التحميل
     * @returns {Promise}
     */
    async add(task) {
        return new Promise((resolve, reject) => {
            this.queue.push({ task, resolve, reject });
            this.process();
        });
    }

    /**
     * معالجة الصف
     */
    async process() {
        // إذا وصلنا للحد الأقصى أو الصف فارغ
        if (this.active >= MAX_CONCURRENT || this.queue.length === 0) {
            return;
        }

        // أخذ المهمة التالية
        const job = this.queue.shift();
        this.active++;

        console.log(`[DownloadQueue] Processing job (Active: ${this.active}/${MAX_CONCURRENT}, Queue: ${this.queue.length})`);

        try {
            const result = await job.task();
            job.resolve(result);
        } catch (err) {
            job.reject(err);
        } finally {
            this.active--;
            // معالجة المهمة التالية
            this.process();
        }
    }

    /**
     * الحصول على حالة الصف
     * @returns {object}
     */
    getStatus() {
        return {
            active: this.active,
            queued: this.queue.length,
            total: this.active + this.queue.length,
        };
    }
}

// إنشاء instance واحد للتطبيق كله
const downloadQueue = new DownloadQueue();

module.exports = downloadQueue;
