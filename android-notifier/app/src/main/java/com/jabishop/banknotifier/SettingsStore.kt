package com.jabishop.banknotifier

import android.content.Context
import android.content.SharedPreferences

/** 서버 웹훅 URL / 비밀키 / 감지할 은행 앱 패키지명을 기기에 저장한다. */
class SettingsStore(context: Context) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences("bank_notifier_settings", Context.MODE_PRIVATE)

    var webhookUrl: String
        get() = prefs.getString(KEY_WEBHOOK_URL, "") ?: ""
        set(value) = prefs.edit().putString(KEY_WEBHOOK_URL, value).apply()

    var secret: String
        get() = prefs.getString(KEY_SECRET, "") ?: ""
        set(value) = prefs.edit().putString(KEY_SECRET, value).apply()

    var bankPackageName: String
        get() = prefs.getString(KEY_PACKAGE, DEFAULT_PACKAGE) ?: DEFAULT_PACKAGE
        set(value) = prefs.edit().putString(KEY_PACKAGE, value).apply()

    fun isConfigured(): Boolean = webhookUrl.isNotBlank() && secret.isNotBlank() && bankPackageName.isNotBlank()

    companion object {
        private const val KEY_WEBHOOK_URL = "webhook_url"
        private const val KEY_SECRET = "secret"
        private const val KEY_PACKAGE = "bank_package"

        // 실제 하나은행 앱 패키지명은 기기의 [설정 → 앱 → 하나은행]에서 직접 확인해서 바꿔주세요.
        // (안드로이드 버전/설치 경로에 따라 다를 수 있어 코드에서 100% 보장할 수 없습니다.)
        const val DEFAULT_PACKAGE = "com.kebhana.hnbank"
    }
}
