## Discord Meme Rate Bot

بوت يراقب قنوات الميمز، يضيف تفاعلات تقييم تلقائيًا، يبدأ مؤقّت، وبعد انتهاء المدة يحسب الأصوات ويحذف الميم إذا كان التقييم السلبي أعلى.

### المتطلبات
- Node.js 18+
- إنشاء تطبيق وبوت من بوابة ديسكورد (Developer Portal)
- تفعيل **MESSAGE CONTENT INTENT** من صفحة البوت (لأننا نراقب الرسائل)

### الإعداد
1) عدل القيم في .env:

- `DISCORD_TOKEN`: توكن البوت
- `CLIENT_ID`: Application / Client ID

2) ثبّت الحزم:

```bash
npm i
```

3) سجّل أوامر الـSlash:

```bash
npm run register
```

4) شغّل البوت:

```bash
npm run start
```

### أوامر الإدارة (Slash)
- `/memerate status`: عرض الإعدادات الحالية
- `/memerate setduration minutes:<number>`: تحديد مدة التصويت بالدقائق
- `/memerate setemojis positive:<emoji> negative:<emoji>`: تحديد إيموجيات التصويت
- `/memerate addchannel channel:<#channel>`: إضافة قناة للمراقبة
- `/memerate removechannel channel:<#channel>`: إزالة قناة من المراقبة

### منطق العمل المختصر
- عند إرسال رسالة تحتوي **مرفق صورة/فيديو** في قناة مفعّلة:
  - يضيف البوت تفاعلين (إيجابي/سلبي).
  - يبدأ مؤقّت حسب مدة الإعداد.
  - عند انتهاء المؤقّت: يجلب الرسالة ويحسب عدد التفاعلات لكل إيموجي (مع تجاهل تفاعل البوت نفسه).
  - إذا السلبي > الإيجابي: يحذف الرسالة.
  - غير ذلك: يتركها.


