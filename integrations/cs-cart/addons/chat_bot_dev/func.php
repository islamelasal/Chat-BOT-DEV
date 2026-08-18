<?php
/**
 * Chat Bot Dev — إضافة CS-Cart 4.x (متوافقة مع 4.20.1 Multivendor Ultimate + Unitheme2)
 * ----------------------------------------------------------------------
 * تحقن سطر الودجت قبل </body> عبر خطاف القالب القياسي "index:scripts"
 * بدون أي تعديل على قوالب الثيم — أي تحديث للثيم لن يكسر الإضافة.
 *
 * التركيب: انسخ مجلد addons/chat_bot_dev إلى جذر CS-Cart ثم:
 *   Admin → Add-ons → Manage add-ons → فعّل "Chat Bot Dev"
 *   ثم امسح الكاش: الإدارة → إعدادات → كاش.
 *
 * الأمان: الرابط يُضبط من إعدادات الإضافة فقط ولا يُقبل أي إدخال من الزائر.
 */

use Tygh\Registry;

if (!defined('BOOTSTRAP')) { die('Access denied'); }

/**
 * نص توضيحي يظهر في صفحة إعدادات الإضافة
 */
function fn_chat_bot_dev_settings_note()
{
    return '<div class="alert alert-info">'
        . 'انسخ رابط الودجت من لوحة تحكم Chat Bot Dev (قسم العميل → مقتطف التضمين) والصقه في حقل Widget URL أعلاه، '
        . 'ثم امسح كاش المتجر. البوت سيعمل في كل الصفحات بهوية موقعك.'
        . '</div>';
}

/**
 * الخطاف القياسي قبل </body> في index.tpl — موجود في كل ثيمات CS-Cart الحديثة
 * (بما فيها Unitheme2) — التوقيع: ($params, &$content, $smarty)
 */
function fn_chat_bot_dev_index_scripts($params, &$content, $smarty)
{
    if (Registry::get('addons.chat_bot_dev.cbd_enabled') !== 'Y') {
        return;
    }

    $url = trim((string) Registry::get('addons.chat_bot_dev.cbd_widget_url'));
    if ($url === '' || strpos($url, 'http') !== 0) {
        return; // رابط غير مضبوط أو غير آمن — لا نحقن شيئاً
    }

    $safe_url = htmlspecialchars($url, ENT_QUOTES, 'UTF-8');
    $content .= "\n<!-- Chat Bot Dev -->\n"
        . '<script src="' . $safe_url . '" async defer></script>'
        . "\n<!-- /Chat Bot Dev -->\n";
}

/**
 * خطاف احتياطي للثيمات المخصصة التي تستخدم index:content أسفل المحتوى
 */
function fn_chat_bot_dev_index_content($params, &$content, $smarty)
{
    // يُغطى بالحالة الأساسية عبر index:scripts — هذا الخطاف يمنع التكرار فقط.
}
