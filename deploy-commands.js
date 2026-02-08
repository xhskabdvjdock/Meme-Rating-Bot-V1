const { REST, Routes } = require('discord.js');
require('dotenv').config();

const CLIENT_ID = process.env.CLIENT_ID;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

if (!CLIENT_ID || !DISCORD_TOKEN) {
    console.error('❌ CLIENT_ID أو DISCORD_TOKEN غير موجودين في ملف .env');
    process.exit(1);
}

const commands = [
    {
        name: 'memerate',
        description: 'إدارة نظام تقييم الميمز',
        options: [
            {
                name: 'status',
                description: 'عرض الإعدادات الحالية',
                type: 1 // SUB_COMMAND
            },
            {
                name: 'setduration',
                description: 'ضبط مدة التصويت',
                type: 1,
                options: [{
                    name: 'minutes',
                    description: 'المدة بالدقائق',
                    type: 4, // INTEGER
                    required: true,
                    min_value: 1,
                    max_value: 1440
                }]
            },
            {
                name: 'setemojis',
                description: 'ضبط الإيموجيات',
                type: 1,
                options: [
                    {
                        name: 'positive',
                        description: 'إيموجي الموافقة',
                        type: 3, // STRING
                        required: true
                    },
                    {
                        name: 'negative',
                        description: 'إيموجي الرفض',
                        type: 3,
                        required: true
                    }
                ]
            },
            {
                name: 'addchannel',
                description: 'إضافة قناة للمراقبة',
                type: 1,
                options: [{
                    name: 'channel',
                    description: 'القناة المراد إضافتها',
                    type: 7, // CHANNEL
                    required: true
                }]
            },
            {
                name: 'removechannel',
                description: 'إزالة قناة من المراقبة',
                type: 1,
                options: [{
                    name: 'channel',
                    description: 'القناة المراد إزالتها',
                    type: 7,
                    required: true
                }]
            }
        ]
    },
    {
        name: 'download',
        description: 'إدارة ميزة تحميل الفيديوهات',
        options: [
            {
                name: 'status',
                description: 'عرض حالة التحميل',
                type: 1
            },
            {
                name: 'toggle',
                description: 'تفعيل/تعطيل التحميل',
                type: 1,
                options: [{
                    name: 'enabled',
                    description: 'تفعيل الميزة',
                    type: 5, // BOOLEAN
                    required: true
                }]
            },
            {
                name: 'addchannel',
                description: 'إضافة قناة للتحميل',
                type: 1,
                options: [{
                    name: 'channel',
                    description: 'القناة المراد إضافتها',
                    type: 7,
                    required: true
                }]
            },
            {
                name: 'removechannel',
                description: 'إزالة قناة من التحميل',
                type: 1,
                options: [{
                    name: 'channel',
                    description: 'القناة المراد إزالتها',
                    type: 7,
                    required: true
                }]
            },
            {
                name: 'setchannels',
                description: 'ضبط نمط القنوات',
                type: 1,
                options: [{
                    name: 'mode',
                    description: 'النمط',
                    type: 3,
                    required: true,
                    choices: [
                        { name: 'جميع القنوات', value: 'all' },
                        { name: 'قنوات محددة', value: 'specific' }
                    ]
                }]
            }
        ]
    }
];

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

(async () => {
    try {
        console.log('🔄 Started refreshing application (/) commands...');
        
        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands }
        );
        
        console.log('✅ Successfully reloaded application (/) commands.');
        console.log(`📝 Registered ${commands.length} commands:`);
        commands.forEach(cmd => {
            console.log(`   - /${cmd.name}`);
        });
    } catch (error) {
        console.error('❌ Error refreshing commands:', error);
    }
})();
