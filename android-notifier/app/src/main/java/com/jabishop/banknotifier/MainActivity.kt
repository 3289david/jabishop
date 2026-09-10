package com.jabishop.banknotifier

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var settings: SettingsStore

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        settings = SettingsStore(applicationContext)

        val editWebhookUrl = findViewById<EditText>(R.id.edit_webhook_url)
        val editSecret = findViewById<EditText>(R.id.edit_secret)
        val editPackage = findViewById<EditText>(R.id.edit_package)
        val statusText = findViewById<TextView>(R.id.text_status)

        editWebhookUrl.setText(settings.webhookUrl)
        editSecret.setText(settings.secret)
        editPackage.setText(settings.bankPackageName)

        findViewById<Button>(R.id.btn_save).setOnClickListener {
            settings.webhookUrl = editWebhookUrl.text.toString().trim()
            settings.secret = editSecret.text.toString().trim()
            settings.bankPackageName = editPackage.text.toString().trim().ifBlank { SettingsStore.DEFAULT_PACKAGE }
            Toast.makeText(this, "저장되었습니다", Toast.LENGTH_SHORT).show()
            statusText.text = "저장됨. 알림 접근 권한이 켜져 있는지 확인해주세요."
        }

        findViewById<Button>(R.id.btn_open_notification_settings).setOnClickListener {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }

        findViewById<Button>(R.id.btn_test_send).setOnClickListener {
            if (!settings.isConfigured()) {
                Toast.makeText(this, "먼저 저장을 눌러주세요", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            statusText.text = "전송 중..."
            WebhookSender.send(
                webhookUrl = settings.webhookUrl,
                secret = settings.secret,
                amount = 1L,
                depositorName = "테스트",
                rawText = "[테스트 전송] 자비샵 입금알림 앱에서 보낸 연결 확인용 요청입니다.",
            ) { success, message ->
                runOnUiThread {
                    statusText.text = "테스트 결과: $message"
                    Toast.makeText(
                        this,
                        if (success) "서버 연결 성공" else "연결 실패 - URL/비밀키를 확인해주세요",
                        Toast.LENGTH_LONG,
                    ).show()
                }
            }
        }
    }
}
