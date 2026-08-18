<?php
/**
 * Plugin Name: Chat Bot Dev
 * Description: يضيف بوت الذكاء الاصطناعي لموقعك بسطر واحد — الإعداد من الإعدادات → Chat Bot Dev
 * Version: 1.0
 * Author: Chat Bot Dev
 * Requires at least: 6.0
 * Text Domain: chat-bot-dev
 */

if (!defined('ABSPATH')) {
    exit;
}

add_action('wp_footer', function () {
    $url = trim((string) get_option('cbd_widget_url', ''));
    if ($url === '' || strpos($url, 'http') !== 0) {
        return;
    }
    echo '<!-- Chat Bot Dev --><script src="' . esc_url($url) . '" async defer></script><!-- /Chat Bot Dev -->' . "\n";
});

add_action('admin_menu', function () {
    add_options_page(
        'Chat Bot Dev',
        'Chat Bot Dev',
        'manage_options',
        'chat-bot-dev',
        'cbd_settings_page'
    );
});

function cbd_settings_page() {
    if (!current_user_can('manage_options')) {
        return;
    }
    if (isset($_POST['cbd_widget_url'])) {
        check_admin_referer('cbd_save');
        update_option('cbd_widget_url', sanitize_text_field(wp_unslash($_POST['cbd_widget_url'])));
        echo '<div class="notice notice-success is-dismissible"><p>تم حفظ إعدادات البوت ✅ — امسح كاش الموقع واختبر صفحة منتج.</p></div>';
    }
    $url = get_option('cbd_widget_url', '');
    ?>
    <div class="wrap" dir="rtl">
        <h1>🤖 Chat Bot Dev</h1>
        <p>الصق رابط الودجت من لوحة تحكم Chat Bot Dev (قسم العميل → مقتطف التضمين):</p>
        <form method="post">
            <?php wp_nonce_field('cbd_save'); ?>
            <input type="url" name="cbd_widget_url" value="<?php echo esc_attr($url); ?>"
                   placeholder="https://widget.chatbotdev.app/w.js?id=YOUR_CLIENT_ID"
                   style="width:100%;max-width:640px;direction:ltr" />
            <?php submit_button('حفظ'); ?>
        </form>
        <hr />
        <p style="color:#777">البوت يعمل بإطار معزول آمن ولا يمس بيانات موقعك — الإدارة الكاملة للبوت (الشخصية، المعرفة، الثيم) من لوحة Chat Bot Dev.</p>
    </div>
    <?php
}
