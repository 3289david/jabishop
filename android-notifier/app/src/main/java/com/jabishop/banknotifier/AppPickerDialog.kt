package com.jabishop.banknotifier

import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.EditText
import android.widget.ImageView
import android.widget.ListView
import android.widget.TextView

/** 설치된(실행 가능한) 앱 목록을 가져온다 - 패키지명을 직접 몰라도 이름으로 찾아 고를 수 있게 하기 위함. */
fun queryInstalledApps(context: Context): List<AppInfo> {
    val pm = context.packageManager
    val intent = Intent(Intent.ACTION_MAIN, null).addCategory(Intent.CATEGORY_LAUNCHER)
    return pm.queryIntentActivities(intent, 0)
        .map { resolveInfo ->
            AppInfo(
                packageName = resolveInfo.activityInfo.packageName,
                label = resolveInfo.loadLabel(pm).toString(),
                icon = resolveInfo.loadIcon(pm),
            )
        }
        .distinctBy { it.packageName }
        .sortedBy { it.label.lowercase() }
}

private class AppListAdapter(context: Context, apps: List<AppInfo>) :
    ArrayAdapter<AppInfo>(context, 0, apps.toMutableList()) {

    override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
        val view = convertView ?: LayoutInflater.from(context).inflate(R.layout.list_item_app, parent, false)
        val app = getItem(position) ?: return view
        view.findViewById<ImageView>(R.id.image_app_icon).setImageDrawable(app.icon)
        view.findViewById<TextView>(R.id.text_app_label).text = app.label
        view.findViewById<TextView>(R.id.text_app_package).text = app.packageName
        return view
    }
}

/**
 * 설치된 앱 목록(검색 가능)을 다이얼로그로 보여주고, 하나를 고르면 onSelected로 알려준다.
 * "감지할 은행 앱"을 패키지명을 직접 입력하지 않고 목록에서 바로 선택하게 하기 위한 용도.
 */
fun showAppPickerDialog(context: Context, onSelected: (AppInfo) -> Unit) {
    val view = LayoutInflater.from(context).inflate(R.layout.dialog_app_picker, null)
    val searchBox = view.findViewById<EditText>(R.id.edit_app_search)
    val listView = view.findViewById<ListView>(R.id.list_apps)

    val apps = queryInstalledApps(context)
    val adapter = AppListAdapter(context, apps)
    listView.adapter = adapter

    val dialog = AlertDialog.Builder(context)
        .setTitle("알림 받을 앱 선택")
        .setView(view)
        .setNegativeButton("취소", null)
        .create()

    listView.setOnItemClickListener { _, _, position, _ ->
        val selected = adapter.getItem(position) ?: return@setOnItemClickListener
        onSelected(selected)
        dialog.dismiss()
    }

    searchBox.addTextChangedListener(object : TextWatcher {
        override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
        override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
            adapter.filter.filter(s)
        }
        override fun afterTextChanged(s: Editable?) {}
    })

    dialog.show()
}
