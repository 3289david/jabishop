package com.jabishop.banknotifier

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log

/**
 * 설정된 은행 앱에서 온 알림을 감지해 서버로 전달한다.
 *
 * 주의: 은행 알림의 정확한 문구 형식은 은행/기기/버전마다 다르고, 입금자명은 개인정보 보호를
 * 위해 일부가 "*"로 마스킹되어 오는 경우가 많다. 아래 파싱 로직은 일반적인 형태
 * ("입금 50,000원 홍길동", "50,000원이 입금되었습니다 (홍*동)" 등)을 최대한 커버하려는
 * 추정치이며, 실제 폰에서 받아본 알림 문구를 보고 조정이 필요할 수 있다.
 * 파싱에 실패해도 원문(rawText)은 그대로 서버로 전달되어 관리자가 수동으로 확인할 수 있다.
 */
class BankNotificationListenerService : NotificationListenerService() {

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val settings = SettingsStore(applicationContext)
        if (!settings.isConfigured()) return
        if (sbn.packageName != settings.bankPackageName) return

        val extras = sbn.notification.extras
        val title = extras.getCharSequence("android.title")?.toString() ?: ""
        val text = extras.getCharSequence("android.text")?.toString() ?: ""
        val bigText = extras.getCharSequence("android.bigText")?.toString() ?: ""
        val fullText = listOf(title, text, bigText).filter { it.isNotBlank() }.joinToString(" / ")
        if (fullText.isBlank()) return

        // "입금"이 포함되지 않은 알림(출금, 광고, 로그인 안내 등)은 무시한다.
        if (!fullText.contains("입금")) return

        Log.i(TAG, "bank notification detected: $fullText")

        val amount = parseAmount(fullText)
        val depositorName = parseDepositorName(fullText)

        WebhookSender.send(
            webhookUrl = settings.webhookUrl,
            secret = settings.secret,
            amount = amount ?: 0L,
            depositorName = depositorName ?: "",
            rawText = fullText,
        ) { success, message ->
            Log.i(TAG, "webhook result success=$success message=$message")
        }
    }

    private fun parseAmount(text: String): Long? {
        // "50,000원" 형태에서 숫자만 추출
        val match = Regex("""([0-9][0-9,]*)\s*원""").find(text) ?: return null
        return match.groupValues[1].replace(",", "").toLongOrNull()
    }

    private fun parseDepositorName(text: String): String? {
        // 괄호 안에 있는 경우: "(홍길동)" 또는 "(홍*동)"
        Regex("""\(([가-힣*]{2,5})\)""").find(text)?.let { return it.groupValues[1] }
        // "원 홍길동" 처럼 금액 뒤에 바로 이어지는 한글 이름
        Regex("""원\s+([가-힣*]{2,5})""").find(text)?.let { return it.groupValues[1] }
        // "홍길동님" 처럼 "님" 앞의 이름
        Regex("""([가-힣*]{2,5})님""").find(text)?.let { return it.groupValues[1] }
        return null
    }

    companion object {
        private const val TAG = "BankNotifierService"
    }
}
