package com.jabishop.banknotifier

import android.graphics.drawable.Drawable

/** 설치된 앱 하나를 선택 목록에 보여주기 위한 최소 정보. */
data class AppInfo(
    val packageName: String,
    val label: String,
    val icon: Drawable,
) {
    // ArrayAdapter의 기본 필터(Filter)는 toString()으로 검색어와 비교하므로,
    // 라벨(앱 이름) 기준으로 검색되게 하려면 이걸 라벨로 돌려줘야 한다.
    override fun toString(): String = label
}
