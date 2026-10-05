package com.jabishop.banknotifier

import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationManagerCompat

class MainActivity : AppCompatActivity() {

    private lateinit var settings: SettingsStore
    private lateinit var editWebhookUrl: EditText
    private lateinit var editSecret: EditText
    private lateinit var imageSelectedAppIcon: ImageView
    private lateinit var textSelectedAppLabel: TextView
    private lateinit var textSelectedAppPackage: TextView
    private lateinit var statusText: TextView
    private lateinit var statusBanner: LinearLayout
    private lateinit var statusBannerTitle: TextView
    private lateinit var statusBannerDetail: TextView

    private var selectedPackageName: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        settings = SettingsStore(applicationContext)

        editWebhookUrl = findViewById(R.id.edit_webhook_url)
        editSecret = findViewById(R.id.edit_secret)
        imageSelectedAppIcon = findViewById(R.id.image_selected_app_icon)
        textSelectedAppLabel = findViewById(R.id.text_selected_app_label)
        textSelectedAppPackage = findViewById(R.id.text_selected_app_package)
        statusText = findViewById(R.id.text_status)
        statusBanner = findViewById(R.id.layout_status_banner)
        statusBannerTitle = findViewById(R.id.text_status_banner)
        statusBannerDetail = findViewById(R.id.text_status_banner_detail)

        editWebhookUrl.setText(settings.webhookUrl)
        editSecret.setText(settings.secret)
        selectedPackageName = settings.bankPackageName
        updateSelectedAppDisplay(selectedPackageName)

        findViewById<Button>(R.id.btn_pick_app).setOnClickListener {
            showAppPickerDialog(this) { app ->
                selectedPackageName = app.packageName
                updateSelectedAppDisplay(selectedPackageName)
            }
        }

        findViewById<Button>(R.id.btn_save).setOnClickListener {
            settings.webhookUrl = editWebhookUrl.text.toString().trim()
            settings.secret = editSecret.text.toString().trim()
            settings.bankPackageName = selectedPackageName.ifBlank { SettingsStore.DEFAULT_PACKAGE }
            Toast.makeText(this, "저장되었습니다", Toast.LENGTH_SHORT).show()
            statusText.text = "저장됨. 알림 접근 권한이 켜져 있는지 확인해주세요."
            updateStatusBanner()
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
                rawText = "[테스트 전송] 입금알림 앱에서 보낸 연결 확인용 요청입니다.",
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

        updateStatusBanner()
    }

    override fun onResume() {
        super.onResume()
        // 알림 접근 권한은 시스템 설정 화면에서 바뀌고 돌아오므로, 화면이 다시 보일 때마다 갱신한다.
        updateStatusBanner()
    }

    private fun updateSelectedAppDisplay(packageName: String) {
        if (packageName.isBlank()) {
            imageSelectedAppIcon.setImageResource(android.R.drawable.sym_def_app_icon)
            textSelectedAppLabel.text = "선택된 앱 없음"
            textSelectedAppPackage.text = "위 버튼으로 은행 앱을 선택해주세요"
            return
        }
        try {
            val pm = packageManager
            val appInfo = pm.getApplicationInfo(packageName, 0)
            imageSelectedAppIcon.setImageDrawable(pm.getApplicationIcon(appInfo))
            textSelectedAppLabel.text = pm.getApplicationLabel(appInfo).toString()
        } catch (e: PackageManager.NameNotFoundException) {
            imageSelectedAppIcon.setImageResource(android.R.drawable.sym_def_app_icon)
            textSelectedAppLabel.text = "설치되지 않은 앱"
        }
        textSelectedAppPackage.text = packageName
    }

    private fun updateStatusBanner() {
        val configured = settings.isConfigured()
        val permissionGranted = NotificationManagerCompat.getEnabledListenerPackages(this).contains(packageName)

        if (configured && permissionGranted) {
            statusBanner.setBackgroundResource(R.drawable.bg_status_ok)
            statusBannerTitle.text = "✅ 설정 완료 - 입금 알림을 받을 준비가 되었습니다"
            statusBannerDetail.text = "아래 \"테스트 전송\" 버튼으로 서버 연결을 한 번 확인해보세요."
        } else {
            statusBanner.setBackgroundResource(R.drawable.bg_status_warn)
            val missing = mutableListOf<String>()
            if (!configured) missing.add("1~2번 입력 후 저장")
            if (!permissionGranted) missing.add("알림 접근 권한 허용")
            statusBannerTitle.text = "⚠️ 아직 설정이 끝나지 않았습니다"
            statusBannerDetail.text = "남은 단계: " + missing.joinToString(" · ")
        }
    }
}
