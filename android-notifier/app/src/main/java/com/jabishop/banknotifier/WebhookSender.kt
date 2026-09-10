package com.jabishop.banknotifier

import android.util.Log
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/** 서버 웹훅으로 입금 알림 정보를 서명(HMAC-SHA256)해서 전송한다. */
object WebhookSender {
    private const val TAG = "WebhookSender"

    fun send(
        webhookUrl: String,
        secret: String,
        amount: Long,
        depositorName: String,
        rawText: String,
        onResult: (success: Boolean, message: String) -> Unit = { _, _ -> },
    ) {
        Thread {
            try {
                val body = JSONObject()
                    .put("amount", amount)
                    .put("depositorName", depositorName)
                    .put("timestamp", System.currentTimeMillis())
                    .put("rawText", rawText)
                    .toString()

                val signature = hmacSha256Hex(secret, body)

                val connection = URL(webhookUrl).openConnection() as HttpURLConnection
                connection.requestMethod = "POST"
                connection.doOutput = true
                connection.connectTimeout = 15000
                connection.readTimeout = 15000
                connection.setRequestProperty("Content-Type", "application/json")
                connection.setRequestProperty("X-Signature", signature)
                connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }

                val status = connection.responseCode
                val responseText = (if (status in 200..299) connection.inputStream else connection.errorStream)
                    ?.bufferedReader()?.readText() ?: ""
                connection.disconnect()

                Log.i(TAG, "webhook status=$status body=$responseText")
                onResult(status in 200..299, "HTTP $status: $responseText")
            } catch (e: Exception) {
                Log.e(TAG, "webhook send failed", e)
                onResult(false, e.message ?: "전송 실패")
            }
        }.start()
    }

    private fun hmacSha256Hex(secret: String, message: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secret.toByteArray(Charsets.UTF_8), "HmacSHA256"))
        val bytes = mac.doFinal(message.toByteArray(Charsets.UTF_8))
        return bytes.joinToString("") { "%02x".format(it) }
    }
}
