/**
 * Download Job Store
 * إدارة حالة التحميلات وتخزين المعلومات المؤقتة
 */

// تخزين الـ jobs في الذاكرة
const jobs = new Map();

// تخزين rate limits
const userRateLimits = new Map();

// إعدادات Rate Limit
const RATE_LIMIT = {
  maxRequests: 5,       // عدد الطلبات المسموحة
  windowMs: 3600000,    // الفترة الزمنية (ساعة)
};

/**
 * إنشاء job جديد
 * @param {string} userId - معرف المستخدم
 * @param {string} url - رابط الفيديو
 * @param {string} platform - المنصة (youtube, tiktok, instagram)
 * @param {object} videoInfo - معلومات الفيديو
 * @returns {string} - معرف الـ job
 */
function createJob(userId, url, platform, videoInfo = {}) {
  const jobId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const job = {
    jobId,
    userId,
    url,
    platform,
    videoInfo,
    status: 'pending',
    createdAt: Date.now(),
    filePath: null,
    error: null,
  };
  
  jobs.set(jobId, job);
  console.log(`[DownloadStore] Created job ${jobId} for user ${userId}`);
  
  return jobId;
}

/**
 * الحصول على job بمعرفه
 * @param {string} jobId 
 * @returns {object|null}
 */
function getJob(jobId) {
  return jobs.get(jobId) || null;
}

/**
 * تحديث job
 * @param {string} jobId 
 * @param {object} updates 
 */
function updateJob(jobId, updates) {
  const job = jobs.get(jobId);
  if (job) {
    Object.assign(job, updates);
    jobs.set(jobId, job);
  }
}

/**
 * حذف job
 * @param {string} jobId 
 */
function deleteJob(jobId) {
  jobs.delete(jobId);
  console.log(`[DownloadStore] Deleted job ${jobId}`);
}

/**
 * تنظيف الـ jobs القديمة (أكثر من ساعة)
 */
function cleanupOldJobs() {
  const oneHourAgo = Date.now() - 3600000;
  let cleaned = 0;
  
  for (const [jobId, job] of jobs) {
    if (job.createdAt < oneHourAgo) {
      jobs.delete(jobId);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`[DownloadStore] Cleaned up ${cleaned} old jobs`);
  }
}

/**
 * التحقق من rate limit للمستخدم
 * @param {string} userId 
 * @returns {boolean} - true إذا مسموح، false إذا تجاوز الحد
 */
function checkRateLimit(userId) {
  const now = Date.now();
  let userLimit = userRateLimits.get(userId);
  
  // تنظيف القديم أو إنشاء جديد
  if (!userLimit || now - userLimit.windowStart > RATE_LIMIT.windowMs) {
    userLimit = {
      windowStart: now,
      count: 0,
    };
  }
  
  // التحقق من الحد
  if (userLimit.count >= RATE_LIMIT.maxRequests) {
    console.log(`[RateLimit] User ${userId} exceeded rate limit (${userLimit.count}/${RATE_LIMIT.maxRequests})`);
    return false;
  }
  
  // زيادة العداد
  userLimit.count++;
  userRateLimits.set(userId, userLimit);
  
  return true;
}

/**
 * الحصول على عدد الطلبات المتبقية للمستخدم
 * @param {string} userId 
 * @returns {number}
 */
function getRemainingRequests(userId) {
  const userLimit = userRateLimits.get(userId);
  if (!userLimit) return RATE_LIMIT.maxRequests;
  
  const now = Date.now();
  if (now - userLimit.windowStart > RATE_LIMIT.windowMs) {
    return RATE_LIMIT.maxRequests;
  }
  
  return Math.max(0, RATE_LIMIT.maxRequests - userLimit.count);
}

/**
 * الحصول على وقت إعادة تعيين الـ rate limit
 * @param {string} userId 
 * @returns {number} - الوقت بالملي ثانية
 */
function getRateLimitReset(userId) {
  const userLimit = userRateLimits.get(userId);
  if (!userLimit) return 0;
  
  const resetTime = userLimit.windowStart + RATE_LIMIT.windowMs;
  return Math.max(0, resetTime - Date.now());
}

// تنظيف دوري كل 10 دقائق
setInterval(cleanupOldJobs, 600000);

module.exports = {
  createJob,
  getJob,
  updateJob,
  deleteJob,
  cleanupOldJobs,
  checkRateLimit,
  getRemainingRequests,
  getRateLimitReset,
  RATE_LIMIT,
};
